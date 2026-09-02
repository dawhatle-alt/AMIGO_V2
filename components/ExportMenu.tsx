'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileCode2, FileJson2, Flag, Shield } from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { WIZARD_ANSWERS_FILE } from '@/lib/export/answers';

/**
 * One-click exports (PRD FR-24): standalone HTML Upgrade Plan, standalone
 * HTML Runbook, case.json, amigo-wizard-answers.json. `primary` puts the
 * screen's own document first in the list.
 */
export function ExportMenu({ primary }: { primary: 'plan' | 'runbook' }) {
  const doc = useCaseStore((s) => s.doc);
  const exportPlanHtml = useCaseStore((s) => s.exportPlanHtml);
  const exportRunbookHtml = useCaseStore((s) => s.exportRunbookHtml);
  const exportWizardAnswers = useCaseStore((s) => s.exportWizardAnswers);
  const saveCaseToFile = useCaseStore((s) => s.saveCaseToFile);

  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!doc) return null;

  const hasPlan = doc.plan.items.length > 0;
  const hasRunbook = doc.runbook.steps.length > 0;
  const answered = Object.keys(doc.confirmations).length + Object.keys(doc.answers).length;

  const plan = {
    key: 'plan',
    icon: <Shield size={14} className="text-primary" />,
    label: 'Upgrade Plan (HTML)',
    hint: hasPlan ? 'Standalone, interactive, opens offline' : 'Generate the plan first',
    enabled: hasPlan,
    run: exportPlanHtml,
  };
  const runbook = {
    key: 'runbook',
    icon: <Flag size={14} className="text-primary" />,
    label: 'Execution Runbook (HTML)',
    hint: hasRunbook ? 'Standalone, with clock and gates, opens offline' : 'Generate the plan first',
    enabled: hasRunbook,
    run: exportRunbookHtml,
  };
  const entries = [
    ...(primary === 'plan' ? [plan, runbook] : [runbook, plan]),
    {
      key: 'case',
      icon: <FileCode2 size={14} className="text-gray-500" />,
      label: 'Case file (case.json)',
      hint: 'Everything — facts, answers, plan, runbook, audit trail',
      enabled: true,
      run: saveCaseToFile,
    },
    {
      key: 'answers',
      icon: <FileJson2 size={14} className="text-gray-500" />,
      label: `Wizard answers (${WIZARD_ANSWERS_FILE})`,
      hint: answered > 0 ? 'Confirmations and gap answers only' : 'Nothing confirmed or answered yet',
      enabled: true,
      run: exportWizardAnswers,
    },
  ];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
      >
        <Download size={13} /> Export <ChevronDown size={12} className="text-gray-400" />
      </button>
      <p
        role="status"
        aria-live="polite"
        className={
          notice
            ? 'fixed bottom-16 left-5 z-40 max-w-xs rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 shadow-lg'
            : 'sr-only'
        }
      >
        {notice ?? ''}
      </p>
      {open && (
        <div
          role="menu"
          aria-label="Export"
          className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {entries.map((e) => (
            <button
              key={e.key}
              type="button"
              role="menuitem"
              disabled={!e.enabled}
              onClick={() => {
                e.run();
                setOpen(false);
                setNotice(`Download started: ${e.label}. Check the browser downloads.`);
              }}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
            >
              <span className="mt-0.5 shrink-0">{e.icon}</span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-gray-900">{e.label}</span>
                <span className="block text-[11px] text-gray-500">{e.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
