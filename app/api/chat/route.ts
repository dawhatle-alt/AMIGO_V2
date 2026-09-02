import Anthropic from '@anthropic-ai/sdk';
import type { CaseContext } from '@/lib/agent/context';
import { buildSystemPrompt } from '@/lib/agent/systemPrompt';

/**
 * POST /api/chat (PRD FR-15, §7.2).
 *
 * The only place the Anthropic key is read. Request:
 *   { messages: [{role, content}], case_context: CaseContext }
 * Response: { reply, model, truncated } or { error, retryable }.
 *
 * The client keeps the full history and sends it every call (FR-18); the
 * system prompt is assembled here from the case context (FR-16/17).
 */

export const runtime = 'nodejs';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;
const MAX_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 20_000;

export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  case_context: CaseContext;
}

export interface ChatReply {
  reply: string;
  model: string;
  /** True when the answer hit max_tokens and was cut off. */
  truncated: boolean;
}

export interface ChatError {
  error: string;
  retryable: boolean;
}

function fail(status: number, error: string, retryable: boolean): Response {
  return Response.json({ error, retryable } satisfies ChatError, { status });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Request body must be JSON.', false);
  }
  const parsed = validate(body);
  if ('error' in parsed) return fail(400, parsed.error, false);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(
      503,
      'Advisor not configured — add ANTHROPIC_API_KEY to .env.local and restart the dev server.',
      false,
    );
  }
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  // Identity-linked keys must name the workspace the request acts in.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

  const client = new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
  });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(parsed.case_context),
      messages: parsed.messages,
    });

    if (response.stop_reason === 'refusal') {
      return fail(200, 'The advisor declined to answer that request. Rephrase it, or contact BMC Support directly.', false);
    }
    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!reply) return fail(502, 'The advisor returned an empty reply.', true);

    return Response.json({
      reply,
      model: response.model,
      truncated: response.stop_reason === 'max_tokens',
    } satisfies ChatReply);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return fail(503, 'Advisor not configured — the ANTHROPIC_API_KEY in .env.local was rejected.', false);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail(429, 'The advisor is rate-limited right now — try again in a moment.', true);
    }
    if (error instanceof Anthropic.BadRequestError) {
      const message = apiMessage(error);
      if (/workspace/i.test(message)) {
        return fail(
          503,
          'Advisor not configured — this API key is identity-linked, so ANTHROPIC_WORKSPACE_ID must be set in .env.local (the workspace the key belongs to).',
          false,
        );
      }
      return fail(400, `The advisor rejected the request: ${message}`, false);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return fail(503, 'Could not reach the advisor service — check the network and retry.', true);
    }
    if (error instanceof Anthropic.APIError) {
      const status = typeof error.status === 'number' ? error.status : 502;
      return fail(status >= 500 ? 502 : status, `Advisor service error (${status}): ${apiMessage(error)}`, status >= 500);
    }
    return fail(500, 'Unexpected advisor error — retry.', true);
  }
}

/** The API's own message when the SDK wrapped a JSON error body, else the SDK message. */
function apiMessage(error: { error?: unknown; message: string }): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const inner = body?.error?.message;
  return typeof inner === 'string' && inner.trim() !== '' ? inner : error.message;
}

function validate(body: unknown): ChatRequest | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Request body must be an object.' };
  const b = body as Partial<ChatRequest>;

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { error: '"messages" must be a non-empty array.' };
  }
  if (b.messages.length > MAX_MESSAGES) {
    return { error: `"messages" is too long (max ${MAX_MESSAGES}).` };
  }
  const messages: ChatRequest['messages'] = [];
  for (const m of b.messages) {
    if (
      typeof m !== 'object' ||
      m === null ||
      (m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string' ||
      m.content.trim() === ''
    ) {
      return { error: 'Each message needs a role of user|assistant and non-empty string content.' };
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return { error: `A message exceeds ${MAX_MESSAGE_CHARS} characters.` };
    }
    messages.push({ role: m.role, content: m.content });
  }
  if (messages[0]?.role !== 'user') return { error: 'The first message must be from the user.' };
  if (messages[messages.length - 1]?.role !== 'user') {
    return { error: 'The last message must be from the user.' };
  }

  const c = b.case_context;
  if (
    typeof c !== 'object' ||
    c === null ||
    typeof c.facts_summary !== 'string' ||
    typeof c.screen !== 'string' ||
    typeof c.progress !== 'string' ||
    typeof c.case?.name !== 'string' ||
    typeof c.case?.target_version !== 'string'
  ) {
    return { error: '"case_context" is missing or malformed.' };
  }

  return { messages, case_context: c as CaseContext };
}
