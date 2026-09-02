import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArchives } from '@/lib/parser';
import { createEmptyCase } from '@/lib/case/emptyCase';
import { useCaseStore } from '@/lib/store/caseStore';
import { buildCaseContext, elapsedLine, factsSummary, gapFocus, osFamilyOf, type CaseContext } from '@/lib/agent/context';
import { buildSystemPrompt } from '@/lib/agent/systemPrompt';
import { KA_TABLE, kaTableText } from '@/lib/agent/kaTable';
import type { CaseDocument } from '@/lib/types/case';

/**
 * M4 gate (PRD §10): the advisor's context reflects the fixture environment
 * (Windows / MS SQL syntax), and a missing key degrades gracefully.
 *
 * The Anthropic SDK is mocked so the route's wiring — system prompt, model,
 * max_tokens, history, error mapping — is proven without network access.
 * A live-model exchange needs a real key in .env.local and is checked in
 * the browser, not here.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const read = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

const PARSED = parseArchives([
  { fileName: 'hcu_SBCMEM31W.zip', bytes: read('hcu_SBCMEM31W.zip') },
  { fileName: 'hcu_SBCMSR01W.zip', bytes: read('hcu_SBCMSR01W.zip') },
]);

function fixtureCase(): CaseDocument {
  const doc = createEmptyCase({ name: 'AZAMA79 upgrade review', target_version: '9.0.22' });
  doc.archives = PARSED.meta.archives;
  doc.facts = PARSED.facts;
  doc.gaps = PARSED.gaps;
  return doc;
}

// ---------------------------------------------------------------------------
// Context assembly (FR-16)
// ---------------------------------------------------------------------------

describe('case context (FR-16)', () => {
  it('summarises hosts, versions, OS, DB and topology from the fixture', () => {
    const summary = factsSummary(fixtureCase());
    expect(summary).toContain('SBCMEM31W');
    expect(summary).toContain('SBCMSR01W');
    expect(summary).toMatch(/EM version: 9\.0\.2/);
    expect(summary).toMatch(/Server version: 9\.0\.2/);
    expect(summary).toMatch(/Windows/);
    expect(summary).toContain('MS SQL');
    expect(summary).toContain('inferred — not yet confirmed');
    expect(summary).toMatch(/Agents: \d+ \(versions/);
    expect(summary).toContain('UNAVAILABLE: dbsrv01');
    expect(summary).toContain('KA 000419757 applies');
  });

  it('drops the "not yet confirmed" marker once the TSA confirms', () => {
    const doc = fixtureCase();
    doc.confirmations['db.type'] = { status: 'confirmed', corrected_value: null, ts: '2026-09-01T00:00:00Z' };
    const summary = factsSummary(doc);
    expect(summary).toContain('MS SQL');
    expect(summary.match(/not yet confirmed/g)?.length ?? 0).toBeLessThan(
      factsSummary(fixtureCase()).match(/not yet confirmed/g)?.length ?? 0,
    );
  });

  it('uses the corrected value when a fact was corrected', () => {
    const doc = fixtureCase();
    doc.confirmations['db.type'] = { status: 'corrected', corrected_value: 'Oracle 19c', ts: '2026-09-01T00:00:00Z' };
    expect(factsSummary(doc)).toContain('Oracle 19c');
    expect(buildCaseContext(doc, '/facts', null).db_family).toBe('oracle');
  });

  it('classifies the fixture as Windows + MS SQL', () => {
    const ctx = buildCaseContext(fixtureCase(), '/gaps', null);
    expect(ctx.os_family).toBe('windows');
    expect(ctx.db_family).toBe('mssql');
    expect(ctx.screen).toContain('Gap Walkthrough');
    expect(ctx.progress).toMatch(/Gaps: 0\/15 answered/);
    expect(ctx.progress).toMatch(/inferred value\(s\) awaiting confirmation/);
    expect(ctx.elapsed).toBeNull();
  });

  it('detects UNIX and mixed estates', () => {
    const doc = fixtureCase();
    doc.confirmations['server.os_name'] = { status: 'corrected', corrected_value: 'Red Hat Enterprise Linux 8.8', ts: 't' };
    expect(osFamilyOf(doc)).toBe('mixed');
    doc.confirmations['em.os_name'] = { status: 'corrected', corrected_value: 'Linux', ts: 't' };
    expect(osFamilyOf(doc)).toBe('unix');
    expect(osFamilyOf(createEmptyCase({ name: 'empty', target_version: '9.0.22' }))).toBe('unknown');
  });

  it('reports the outage clock once the runbook starts', () => {
    const doc = fixtureCase();
    doc.runbook.outage_started_at = '2026-11-14T22:00:00Z';
    doc.runbook.window_minutes = 240;
    expect(elapsedLine(doc, new Date('2026-11-14T23:23:00Z'))).toBe('1 h 23 min elapsed of a 4 h outage window');
    doc.runbook.window_minutes = null;
    expect(elapsedLine(doc, new Date('2026-11-14T22:05:00Z'))).toBe('5 min elapsed (no window budget recorded)');
  });

  it('gap focus carries the command and why', () => {
    const gap = fixtureCase().gaps[0];
    if (!gap) throw new Error('no gaps');
    const focus = gapFocus(gap, 1);
    expect(focus.label).toBe(`Gap 01 · ${gap.question}`);
    expect(focus.detail).toContain('ctmsetown -action list');
    expect(focus.detail).toContain(gap.why);
  });
});

// ---------------------------------------------------------------------------
// System prompt (FR-16 / FR-17)
// ---------------------------------------------------------------------------

describe('system prompt guardrails (FR-17)', () => {
  const ctx = buildCaseContext(fixtureCase(), '/gaps', gapFocus(fixtureCase().gaps[0]!, 1));
  const prompt = buildSystemPrompt(ctx);

  it('locks syntax to the fixture environment: Windows and MS SQL only', () => {
    expect(prompt).toMatch(/Windows \(cmd \/ PowerShell\) commands and paths ONLY/);
    expect(prompt).toMatch(/never UNIX\/Linux syntax/);
    expect(prompt).toMatch(/MS SQL Server — use T-SQL/);
    expect(prompt).toMatch(/never PostgreSQL or Oracle/);
  });

  it('carries the environment, screen, focused gap and progress', () => {
    expect(prompt).toContain('AZAMA79 upgrade review');
    expect(prompt).toContain('target version 9.0.22');
    expect(prompt).toContain('SBCMEM31W');
    expect(prompt).toContain('Screen: Gap Walkthrough');
    expect(prompt).toContain('Gap 01 ·');
    expect(prompt).toContain('ctmsetown -action list');
    expect(prompt).toMatch(/Progress: Facts: \d+ extracted/);
    expect(prompt).toContain('the outage has not started');
  });

  it('states every non-negotiable rule', () => {
    expect(prompt).toMatch(/exact error text or log snippet before diagnosing/);
    expect(prompt).toMatch(/NEW Severity 1 case/);
    expect(prompt).toMatch(/never raise the severity of the AMIGO case/);
    expect(prompt).toMatch(/say so and point to the relevant documentation or KA rather than guessing/);
    expect(prompt).toMatch(/Never invent BMC behaviour, KA numbers, patch numbers or URLs/);
    expect(prompt).toMatch(/Keep answers short/);
    expect(prompt).toMatch(/rollback panel/);
  });

  it('includes the KA reference table', () => {
    expect(prompt).toContain(kaTableText());
    for (const ka of KA_TABLE) expect(prompt).toContain(ka.id);
    expect(prompt).toContain('KA 000354649 — NOTIMPL');
  });

  it('switches syntax rules for a UNIX + PostgreSQL estate', () => {
    const unix: CaseContext = { ...ctx, os_family: 'unix', db_family: 'postgres', focused_item: null };
    const p = buildSystemPrompt(unix);
    expect(p).toMatch(/UNIX\/Linux\. Give shell commands and paths ONLY — never Windows syntax/);
    expect(p).toMatch(/PostgreSQL syntax and tooling only/);
    expect(p).toContain('No specific item is focused.');
  });

  it('asks before assuming when OS or DB are unknown', () => {
    const p = buildSystemPrompt({ ...ctx, os_family: 'unknown', db_family: 'unknown' });
    expect(p).toMatch(/Ask which OS before giving any command/);
    expect(p).toMatch(/ask before giving any database-specific command/);
  });
});

// ---------------------------------------------------------------------------
// /api/chat route (FR-15 / FR-19) — SDK mocked
// ---------------------------------------------------------------------------

const create = vi.fn();
const ctor = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number | undefined;
    error: unknown;
    constructor(status: number | undefined, message: string, body?: unknown) {
      super(message);
      this.status = status;
      this.error = body;
    }
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class BadRequestError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    static BadRequestError = BadRequestError;
    static APIConnectionError = APIConnectionError;
    messages = { create };
    constructor(public opts: { apiKey: string; defaultHeaders?: Record<string, string> }) {
      ctor(opts);
    }
  }
  return { default: Anthropic };
});

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import('@/app/api/chat/route');
  const res = await POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function goodRequest(overrides: Partial<{ messages: unknown; case_context: unknown }> = {}) {
  return {
    messages: [{ role: 'user', content: 'How do I check the EM version?' }],
    case_context: buildCaseContext(fixtureCase(), '/facts', null),
    ...overrides,
  };
}

const okMessage = (text: string, stop = 'end_turn') => ({
  model: 'claude-sonnet-4-6',
  stop_reason: stop,
  content: [{ type: 'text', text }],
});

describe('/api/chat', () => {
  const env = { ...process.env };
  beforeEach(() => {
    create.mockReset();
    ctor.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.ANTHROPIC_WORKSPACE_ID;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('degrades gracefully when the key is absent (M4 gate)', async () => {
    const r = await post(goodRequest());
    expect(r.status).toBe(503);
    expect(r.json).toEqual({
      error: expect.stringContaining('ANTHROPIC_API_KEY'),
      retryable: false,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects malformed requests before touching the API', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect((await post('not json')).status).toBe(400);
    expect((await post(goodRequest({ messages: [] }))).status).toBe(400);
    expect((await post(goodRequest({ messages: [{ role: 'assistant', content: 'hi' }] }))).status).toBe(400);
    expect((await post(goodRequest({ messages: [{ role: 'user', content: '   ' }] }))).status).toBe(400);
    expect((await post(goodRequest({ case_context: { screen: 'x' } }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the assembled system prompt, full history, model and max_tokens', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    create.mockResolvedValue(okMessage('Run emdef -v from the EM home.'));
    const history = [
      { role: 'user', content: 'Which host is EM on?' },
      { role: 'assistant', content: 'SBCMEM31W.' },
      { role: 'user', content: 'How do I check the EM version?' },
    ];
    const r = await post(goodRequest({ messages: history }));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ reply: 'Run emdef -v from the EM home.', model: 'claude-sonnet-4-6', truncated: false });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0] as {
      model: string;
      max_tokens: number;
      system: string;
      messages: unknown[];
    };
    expect(params.model).toBe('claude-sonnet-4-6');
    expect(params.max_tokens).toBe(1000);
    expect(params.messages).toEqual(history);
    expect(params.system).toMatch(/Windows \(cmd \/ PowerShell\) commands and paths ONLY/);
    expect(params.system).toContain('SBCMSR01W');
    expect(params.system).toContain('KA 000419757');
  });

  it('honours ANTHROPIC_MODEL', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.ANTHROPIC_MODEL = 'claude-opus-5';
    create.mockResolvedValue(okMessage('ok'));
    await post(goodRequest());
    expect((create.mock.calls[0]?.[0] as { model: string }).model).toBe('claude-opus-5');
  });

  it('flags answers cut off at max_tokens', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    create.mockResolvedValue(okMessage('Step 1…', 'max_tokens'));
    const r = await post(goodRequest());
    expect(r.json['truncated']).toBe(true);
  });

  it('maps SDK failures to retryable / non-retryable errors (FR-19)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-bad';
    const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as {
      AuthenticationError: new (s: number, m: string) => Error;
      RateLimitError: new (s: number, m: string) => Error;
      BadRequestError: new (s: number, m: string) => Error;
      APIConnectionError: new (s: undefined, m: string) => Error;
      APIError: new (s: number, m: string) => Error;
    };

    create.mockRejectedValueOnce(new Anthropic.AuthenticationError(401, 'invalid x-api-key'));
    let r = await post(goodRequest());
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: expect.stringContaining('rejected'), retryable: false });

    create.mockRejectedValueOnce(new Anthropic.RateLimitError(429, 'slow down'));
    r = await post(goodRequest());
    expect(r.status).toBe(429);
    expect(r.json['retryable']).toBe(true);

    create.mockRejectedValueOnce(new Anthropic.APIConnectionError(undefined, 'ECONNRESET'));
    r = await post(goodRequest());
    expect(r.status).toBe(503);
    expect(r.json['retryable']).toBe(true);

    create.mockRejectedValueOnce(new Anthropic.APIError(529, 'overloaded'));
    r = await post(goodRequest());
    expect(r.status).toBe(502);
    expect(r.json['retryable']).toBe(true);

    create.mockRejectedValueOnce(new Anthropic.BadRequestError(400, 'model not found'));
    r = await post(goodRequest());
    expect(r.status).toBe(400);
    expect(r.json['retryable']).toBe(false);
  });

  it('shows the API message, not the wrapped JSON, and names the workspace fix for identity-linked keys', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-linked';
    const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as {
      BadRequestError: new (s: number, m: string, body?: unknown) => Error;
    };
    const body = (message: string) => ({ type: 'error', error: { type: 'invalid_request_error', message } });

    create.mockRejectedValueOnce(new Anthropic.BadRequestError(400, '400 {"type":"error"}', body('model: not found')));
    let r = await post(goodRequest());
    expect(r.status).toBe(400);
    expect(r.json['error']).toBe('The advisor rejected the request: model: not found');

    create.mockRejectedValueOnce(
      new Anthropic.BadRequestError(400, '400 {...}', body('anthropic-workspace-id is required when authenticating with an identity-linked API key')),
    );
    r = await post(goodRequest());
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: expect.stringContaining('ANTHROPIC_WORKSPACE_ID'), retryable: false });
  });

  it('sends the workspace header only when ANTHROPIC_WORKSPACE_ID is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    create.mockResolvedValue(okMessage('ok'));
    await post(goodRequest());
    expect(ctor.mock.calls[0]?.[0]).toEqual({ apiKey: 'sk-test' });

    process.env.ANTHROPIC_WORKSPACE_ID = ' wrkspc_123 ';
    await post(goodRequest());
    expect(ctor.mock.calls[1]?.[0]).toEqual({ apiKey: 'sk-test', defaultHeaders: { 'anthropic-workspace-id': 'wrkspc_123' } });
  });

  it('surfaces a refusal as a non-retryable message, not a reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    create.mockResolvedValue({ model: 'm', stop_reason: 'refusal', content: [] });
    const r = await post(goodRequest());
    expect(r.json).toEqual({ error: expect.stringContaining('declined'), retryable: false });
  });
});

// ---------------------------------------------------------------------------
// History lives in the case (FR-18)
// ---------------------------------------------------------------------------

describe('chat history in the case document (FR-18)', () => {
  it('appends exchanges, logs them, and clears', () => {
    const store = useCaseStore.getState();
    store.closeCase();
    store.newCase({ name: 'chat', target_version: '9.0.22' });
    store.appendChat([{ role: 'user', content: 'Which host is EM on?', ts: '2026-09-01T00:00:00Z' }]);
    store.appendChat([{ role: 'assistant', content: 'SBCMEM31W.', ts: '2026-09-01T00:00:01Z' }]);
    const doc = useCaseStore.getState().doc!;
    expect(doc.chat_history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(doc.activity_log.map((e) => e.action)).toEqual(
      expect.arrayContaining(['agent.user', 'agent.assistant']),
    );
    store.clearChat();
    expect(useCaseStore.getState().doc!.chat_history).toEqual([]);
    expect(useCaseStore.getState().doc!.activity_log.at(-1)?.action).toBe('agent.cleared');
  });
});
