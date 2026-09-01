'use client';

import { useState } from 'react';
import { ChevronRight, Send, Sparkles } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';

/**
 * Agent panel — persistent collapsible right rail on every screen (PRD §6).
 *
 * M0 STUB: chrome and collapse behaviour only. No /api/chat route, no context
 * assembly, no message sending — that is M4 scope (PRD FR-15..19).
 */
export function AgentPanel() {
  const [open, setOpen] = useState(false);
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
          The advisor is scaffolded at M0. Chat, case-context assembly and the
          server-side <code className="font-mono">/api/chat</code> route land at
          milestone M4 (PRD FR-15..19).
        </div>

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
            rows={1}
            disabled
            placeholder="Available at M4…"
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-400 placeholder:text-gray-400"
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
