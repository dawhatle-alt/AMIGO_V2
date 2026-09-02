'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertOctagon,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Lock,
  Minus,
  RefreshCw,
  Shield,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { planGenerationBlockers } from '@/lib/rules/risk';
import { planStats, sectionTitle } from '@/lib/plan/generate';
import { SECTIONS } from '@/lib/plan/templates';
import { gapProgress } from '@/lib/gaps/walkthrough';
import { REF } from '@/lib/plan/refs';
import { RefLink } from '@/components/ui/RefLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { ExportMenu } from '@/components/ExportMenu';
import type { PlanItem, Risk } from '@/lib/types/case';

/**
 * S5 Upgrade Plan (PRD §6, FR-20). Generated from the case by
 * lib/plan/generate.ts; this component renders and records status changes.
 * Layout follows the approved prototype (reference/prototypes/amigo-plan-AZAMA79.jsx).
 */

type Filter = 'all' | 'todo' | 'blockers' | 'actions';

export function PlanScreen() {
  const router = useRouter();
  const doc = useCaseStore((s) => s.doc);
  const generate = useCaseStore((s) => s.generatePlan);
  const cycle = useCaseStore((s) => s.cyclePlanItemStatus);

  const [filter, setFilter] = useState<Filter>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ env: true, risks: true });
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const blockers = useMemo(() => (doc ? planGenerationBlockers(doc) : []), [doc]);
  const stats = useMemo(() => (doc ? planStats(doc.plan) : null), [doc]);
  const gaps = useMemo(() => (doc ? gapProgress(doc) : null), [doc]);

  if (!doc) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Upgrade Plan</h1>
        <p className="mt-2 text-[13px] text-gray-600">Create or open a case first.</p>
      </section>
    );
  }

  const hasFacts = Object.keys(doc.facts).length > 0;
  const hasPlan = doc.plan.items.length > 0;
  const ready = hasFacts && blockers.length === 0;

  if (!hasFacts) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Upgrade Plan</h1>
        <p className="mt-2 text-[13px] text-gray-600">
          No facts yet — parse an HCU archive on the Intake screen first. The plan is generated
          from the extracted facts, your confirmations and the gap answers.
        </p>
        <button
          type="button"
          onClick={() => router.push('/intake')}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          Go to Intake
        </button>
      </section>
    );
  }

  const filtered = hasPlan
    ? SECTIONS.map((section) => ({
        id: section.id,
        title: sectionTitle(section.id, doc),
        items: doc.plan.items.filter((i) => i.section === section.id).filter((i) => matches(i, filter)),
        all: doc.plan.items.filter((i) => i.section === section.id),
      })).filter((s) => s.all.length > 0 && (filter === 'all' || s.items.length > 0))
    : [];

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-gray-900">AMIGO Upgrade Plan — {doc.case.name}</h1>
              <p className="mt-0.5 text-[12px] text-gray-600">
                Target {doc.case.target_version}
                {hasPlan && ` · generated ${formatTs(doc.plan.generated_at)}`}
                {gaps && gaps.open > 0 && ` · ${gaps.open} gap${gaps.open === 1 ? '' : 's'} still open`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!ready}
              onClick={() => generate()}
              title={ready ? undefined : 'Resolve the blockers below first'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {hasPlan ? <RefreshCw size={13} /> : <Sparkles size={13} />}
              {hasPlan ? 'Regenerate plan' : 'Generate plan'}
            </button>
            <ExportMenu primary="plan" />
          </div>
        </div>

        {blockers.length > 0 ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            <p className="flex items-center gap-1.5 font-semibold">
              <Lock size={13} /> Plan generation blocked — {blockers.length} blocker
              {blockers.length === 1 ? '' : 's'} outstanding
            </p>
            <ul className="mt-1.5 space-y-1">
              {blockers.map((b) => (
                <li key={b.id} className="flex items-start gap-1.5">
                  <AlertOctagon size={12} className="mt-0.5 shrink-0" />
                  {b.title}
                </li>
              ))}
            </ul>
            <p className="mt-1.5">Resolve these on the Facts Review screen, then generate.</p>
          </div>
        ) : hasPlan && stats ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-700">Overall progress</span>
              <span className="font-mono text-2xl font-bold text-primary">{stats.pct}%</span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-3 rounded-full bg-primary transition-[width] duration-500" style={{ width: `${stats.pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
              <span className="text-gray-600">
                {stats.done}/{stats.applicable} items
              </span>
              {stats.openBlockers > 0 && (
                <span className="font-semibold text-risk-blocker">🔴 {stats.openBlockers} blockers</span>
              )}
              {stats.openWarnings > 0 && (
                <span className="font-semibold text-risk-warning">🟡 {stats.openWarnings} actions needed</span>
              )}
              <span className="text-gray-500">
                {doc.plan.items.filter((i) => i.autofilled_from !== null).length} auto-filled from the archive and gap answers
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
            No blockers outstanding. Generate the plan — it is tailored to this environment&rsquo;s
            OS, database and topology, and items the archive already answers are marked done with
            their provenance.
          </p>
        )}
      </section>

      {hasPlan && stats && (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { k: 'all', l: 'All' },
                { k: 'todo', l: 'To do' },
                { k: 'blockers', l: `Blockers (${stats.openBlockers})` },
                { k: 'actions', l: `Actions (${stats.openWarnings})` },
              ] as { k: Filter; l: string }[]
            ).map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  filter === f.k ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.map((section) => {
              const done = section.all.filter((i) => i.status === 'done').length;
              const applicable = section.all.filter((i) => i.status !== 'na').length;
              const open = openSections[section.id] ?? filter !== 'all';
              return (
                <section key={section.id} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections((p) => ({ ...p, [section.id]: !open }))}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50"
                  >
                    {open ? (
                      <ChevronDown size={16} className="shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-gray-400" />
                    )}
                    <span className="flex-1 text-[14px] font-semibold text-gray-900">{section.title}</span>
                    <span className="font-mono text-[12px] text-gray-500">
                      {done}/{applicable}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-gray-100">
                      {section.items.map((item) => (
                        <PlanRow
                          key={item.id}
                          item={item}
                          expanded={!!openItems[item.id]}
                          onToggle={() => setOpenItems((p) => ({ ...p, [item.id]: !p[item.id] }))}
                          onCycle={() => cycle(item.id)}
                        />
                      ))}
                      {section.items.length === 0 && (
                        <p className="px-4 py-3 text-[12px] text-gray-500">Nothing matches this filter.</p>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-800">
            <p className="font-semibold">🔒 BMC documentation note</p>
            <p className="mt-1">
              Links marked 🔒 require a BMC Support Central login — sign in at bmc.com/support first.
              Patch and bulletin links are public.
            </p>
          </section>
          <section className="rounded-xl border border-primary-border bg-primary-soft p-4 text-[12px] text-primary-dark">
            <p className="font-semibold">Quick reference</p>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {[REF.upgradeGuide, REF.pacTool, doc.case.target_version === '9.0.22' ? REF.patches9022 : REF.patches9021, REF.javaInstall].map(
                (r) => (
                  <RefLink key={r.url} refItem={r} />
                ),
              )}
            </div>
            <p className="mt-3 text-primary">Click a status circle to cycle: ⬜ To do → ✅ Done → ➖ N/A</p>
          </section>
        </>
      )}
    </div>
  );
}

function matches(item: PlanItem, filter: Filter): boolean {
  switch (filter) {
    case 'todo':
      return item.status === 'todo';
    case 'blockers':
      return item.risk === 'blocker' && item.status === 'todo';
    case 'actions':
      return item.risk !== 'clear' && item.status === 'todo';
    default:
      return true;
  }
}

const RISK_STYLE: Record<Risk, { box: string; badge: string; label: string }> = {
  blocker: { box: 'border-red-300 bg-red-50', badge: 'bg-red-100 text-red-800', label: 'Blocker' },
  warning: { box: 'border-amber-300 bg-amber-50', badge: 'bg-amber-100 text-amber-800', label: 'Action needed' },
  clear: { box: 'border-emerald-200 bg-emerald-50', badge: 'bg-emerald-100 text-emerald-800', label: '' },
};

function PlanRow({
  item,
  expanded,
  onToggle,
  onCycle,
}: {
  item: PlanItem;
  expanded: boolean;
  onToggle: () => void;
  onCycle: () => void;
}) {
  const rs = RISK_STYLE[item.risk];
  const hasDetail = item.detail !== '' || item.cmd !== '' || item.refs.length > 0;
  const done = item.status === 'done';
  const na = item.status === 'na';

  return (
    <div className={`border-b border-gray-50 last:border-b-0 ${done || na ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onCycle}
          aria-label={`Status: ${item.status}. Click to change.`}
          className="mt-0.5 shrink-0 hover:opacity-70"
        >
          {done ? (
            <CheckCircle2 size={20} className="text-risk-clear" />
          ) : na ? (
            <Minus size={20} className="text-gray-400" />
          ) : (
            <Circle size={20} className="text-gray-300" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <span className={`text-[13px] leading-relaxed ${done ? 'text-gray-400 line-through' : na ? 'text-gray-400' : 'text-gray-800'}`}>
              {item.text}
            </span>
            {item.risk !== 'clear' && item.status === 'todo' && (
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${rs.badge}`}>{rs.label}</span>
            )}
            {item.autofilled_from && (
              <span
                title={`Auto-filled from ${item.autofilled_from}`}
                className="whitespace-nowrap rounded-full border border-primary-border bg-primary-soft px-2 py-0.5 font-mono text-[10px] text-primary-dark"
              >
                auto · {item.autofilled_from}
              </span>
            )}
          </div>
          {hasDetail && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary-dark"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? 'Hide details' : 'Details, commands & references'}
            </button>
          )}
          {expanded && hasDetail && (
            <div className={`mt-2 space-y-3 rounded-lg border p-3 ${rs.box}`}>
              {item.detail && <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-700">{item.detail}</p>}
              {item.cmd && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Terminal size={12} className="text-gray-500" />
                    <span className="text-[12px] font-semibold text-gray-600">Command syntax</span>
                  </div>
                  <div className="relative">
                    <pre className="terminal pr-20">{item.cmd}</pre>
                    <CopyButton text={item.cmd} />
                  </div>
                </div>
              )}
              {item.refs.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <BookOpen size={12} className="text-gray-500" />
                    <span className="text-[12px] font-semibold text-gray-600">References</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {item.refs.map((r) => (
                      <RefLink key={r.url + r.label} refItem={r} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
