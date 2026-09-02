'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ChevronRight, Loader2, RefreshCw, Send, Sparkles, Trash2, WifiOff, X } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { buildCaseContext } from '@/lib/agent/context';
import type { ChatMessage } from '@/lib/types/case';

/**
 * Upgrade Advisor — persistent collapsible right rail on every screen
 * (PRD §6, FR-15..FR-19).
 *
 * History lives in the case document and is sent in full on every call; the
 * server assembles the system prompt from the case context built here. A
 * failed call keeps the user's message, shows why, and offers Retry — the app
 * never depends on the advisor being up.
 */

interface AgentError {
  message: string;
  retryable: boolean;
}

export function AgentPanel() {
  const pathname = usePathname();
  const open = useCaseStore((s) => s.agentOpen);
  const setOpen = useCaseStore((s) => s.setAgentOpen);
  const focus = useCaseStore((s) => s.agentFocus);
  const clearFocus = useCaseStore((s) => s.clearAgentFocus);
  const doc = useCaseStore((s) => s.doc);
  const appendChat = useCaseStore((s) => s.appendChat);
  const clearChat = useCaseStore((s) => s.clearChat);

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<AgentError | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const history = doc?.chat_history ?? [];

  // FR-14: an "Ask" entry point pre-fills the input with the item's context.
  useEffect(() => {
    if (focus) {
      setInput(focus.prompt);
      inputRef.current?.focus();
    }
  }, [focus]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history.length, thinking, open]);

  async function callAdvisor(messages: ChatMessage[]): Promise<void> {
    if (!doc) return;
    setThinking(true);
    setError(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          case_context: buildCaseContext(
            doc,
            pathname,
            focus ? { kind: focus.kind, label: focus.label, detail: focus.detail } : null,
          ),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { reply: string; truncated: boolean }
        | { error: string; retryable: boolean }
        | null;
      if (!data) {
        setError({ message: `Advisor service returned ${res.status} with no body.`, retryable: true });
        return;
      }
      if ('error' in data) {
        setError({ message: data.error, retryable: data.retryable });
        return;
      }
      appendChat([
        {
          role: 'assistant',
          content: data.truncated
            ? `${data.reply}\n\n[answer cut off at the length limit — ask to continue]`
            : data.reply,
          ts: new Date().toISOString(),
        },
      ]);
    } catch {
      setError({
        message: 'Could not reach the advisor service — check the connection and retry.',
        retryable: true,
      });
    } finally {
      setThinking(false);
    }
  }

  function send() {
    const content = input.trim();
    if (!content || thinking || !doc) return;
    const message: ChatMessage = { role: 'user', content, ts: new Date().toISOString() };
    appendChat([message]);
    setInput('');
    void callAdvisor([...history, message]);
  }

  function retry() {
    if (history.length === 0 || history[history.length - 1]?.role !== 'user') return;
    void callAdvisor(history);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-agent px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-agent-hover"
      >
        <Sparkles size={16} /> Upgrade Advisor
      </button>
    );
  }

  const canSend = !!doc && !thinking && input.trim() !== '';
  const lastIsUser = history[history.length - 1]?.role === 'user';

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[calc(100vw-1rem)] flex-col border-l border-gray-200 bg-white shadow-xl lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:shadow-none"
      aria-label="Upgrade Advisor"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 bg-agent px-3 py-3">
        <Sparkles size={16} className="text-white" />
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Upgrade Advisor</p>
          <p className="text-[11px] text-violet-200">Knows your environment &amp; current step</p>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            title="Clear conversation"
            aria-label="Clear conversation"
            className="text-violet-200 hover:text-white"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Collapse advisor panel"
          className="text-violet-200 hover:text-white"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {!doc && (
          <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-600">
            Open or create a case first — the advisor answers from the case&rsquo;s facts, gaps and
            progress, and the conversation is saved in the case file.
          </p>
        )}

        {doc && history.length === 0 && !thinking && (
          <div className="rounded-lg border border-violet-200 bg-agent-soft p-3 text-[12px] leading-relaxed text-gray-700">
            <p className="font-semibold text-gray-900">Ask about this upgrade.</p>
            <p className="mt-1">
              I can see the extracted environment, the open gaps and risks, and whatever you focus
              with an &ldquo;Ask advisor&rdquo; button. Commands come back in this
              environment&rsquo;s own OS and database syntax.
            </p>
          </div>
        )}

        {history.map((m, i) => (
          <Bubble key={`${m.ts}-${i}`} message={m} />
        ))}

        {thinking && (
          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            <Loader2 size={13} className="animate-spin" /> Thinking…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className={`rounded-lg border p-3 text-[12px] ${
              error.retryable
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <p className="flex items-start gap-1.5">
              {error.retryable ? (
                <AlertTriangle size={13} className="mt-px shrink-0" />
              ) : (
                <WifiOff size={13} className="mt-px shrink-0" />
              )}
              <span>{error.message}</span>
            </p>
            <p className="mt-1.5 text-[11px] opacity-80">
              The rest of AMIGO Concierge keeps working without the advisor.
            </p>
            {error.retryable && lastIsUser && (
              <button
                type="button"
                onClick={retry}
                disabled={thinking}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-100"
              >
                <RefreshCw size={11} /> Retry
              </button>
            )}
          </div>
        )}
      </div>

      {focus && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-violet-200 bg-agent-soft px-2.5 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-gray-700">
            <span className="font-semibold text-agent">Focused:</span> {focus.label}
          </p>
          <button
            type="button"
            onClick={clearFocus}
            aria-label="Clear focused item"
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            rows={input.includes('\n') ? 5 : 2}
            value={input}
            disabled={!doc || thinking}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              doc ? 'Ask the advisor… (Enter to send, Shift+Enter for a new line)' : 'Open a case to chat'
            }
            aria-label="Advisor question"
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-[12px] leading-snug text-gray-900 placeholder:text-gray-400 focus:border-agent focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className="rounded-lg bg-agent px-3 text-white hover:bg-agent-hover disabled:bg-gray-100 disabled:text-gray-300"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-gray-400">
          Production failures go to a NEW Severity 1 case — never raise the AMIGO case severity.
        </p>
      </div>
    </aside>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const user = message.role === 'user';
  return (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
          user ? 'bg-primary text-white' : 'border border-gray-200 bg-gray-50 text-gray-800'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
