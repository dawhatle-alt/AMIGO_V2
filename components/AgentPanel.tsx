'use client';

import { ChevronRight, Send, Sparkles, X } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';

/**
 * Agent panel — persistent collapsible right rail on every screen (PRD §6).
 *
 * STUB until M4: chrome, collapse behaviour and the FR-14/FR-18 entry points
 * only. "Ask advisor about this gap" opens the rail and pre-fills the input
 * with the gap's context; sending, /api/chat and the system prompt land at M4.
 */
export function AgentPanel() {
  const open = useCaseStore((s) => s.agentOpen);
  const setOpen = useCaseStore((s) => s.setAgentOpen);
  const focus = useCaseStore((s) => s.agentFocus);
  const clearFocus = useCaseStore((s) => s.clearAgentFocus);
  const doc = useCaseStore((s) => s.doc);

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
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Collapse advisor panel"
          className="text-violet-200 hover:text-white"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800">
          <strong className="block font-semibold">Not wired yet — M4</strong>
          Chat, case-context assembly and the server-side{' '}
          <code className="font-mono">/api/chat</code> route land at milestone M4 (PRD FR-15..19).
        </div>

        {focus && (
          <div className="mt-4 rounded-lg border border-violet-200 bg-agent-soft p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-agent">
                Focused item
              </p>
              <button
                type="button"
                onClick={clearFocus}
                aria-label="Clear focused item"
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-1 text-[12px] font-medium text-gray-900">{focus.label}</p>
            <p className="mt-1 text-[11px] text-gray-500">
              This context travels with your question once the advisor is live.
            </p>
          </div>
        )}

        <div className="mt-4 text-[12px] leading-relaxed text-gray-500">
          <p className="mb-1 font-semibold text-gray-700">Context it will carry</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>Environment summary from confirmed facts</li>
            <li>Current screen and focused gap or runbook step</li>
            <li>Progress stats and elapsed outage time</li>
            <li>KA reference table</li>
          </ul>
          <p className="mt-3">
            {doc
              ? `Active case: ${doc.case.name} (target ${doc.case.target_version}).`
              : 'No case open.'}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <textarea
            rows={focus ? 6 : 1}
            readOnly
            value={focus?.prompt ?? ''}
            placeholder="Available at M4…"
            aria-label="Advisor question"
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 font-mono text-[11px] leading-snug text-gray-700 placeholder:text-gray-400"
          />
          <button
            type="button"
            disabled
            aria-label="Send"
            className="rounded-lg bg-gray-100 px-3 text-gray-300"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-gray-400">
          Production failures go to a NEW Severity 1 case — never raise the AMIGO
          case severity.
        </p>
      </div>
    </aside>
  );
}
