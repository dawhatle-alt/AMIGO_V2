'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Flag,
  Minus,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import { buildPlanEnv, envSummaryLine } from '@/lib/plan/env';
import { PHASES, rollbackTarget } from '@/lib/runbook/templates';
import {
  actualMinutes,
  askAboutStepPrompt,
  clockState,
  currentStepId,
  fmtClock,
  phaseEstimate,
  rollbackProcedure,
  runbookStats,
  stepContent,
  stepFocusDetail,
  stepNumber,
  type StepContent,
} from '@/lib/runbook/engine';
import { RefLink } from '@/components/ui/RefLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { ExportMenu } from '@/components/ExportMenu';
import type { Risk, RunbookStep } from '@/lib/types/case';

/**
 * S6 Execution Runbook (PRD §6, FR-21). Live execution mode: gates, the
 * outage clock, sequentially locked steps, and an always-present rollback
 * panel. Layout follows reference/prototypes/amigo-runbook-AZAMA79-v2.jsx.
 */
export function RunbookScreen() {
  const router = useRouter();
  const doc = useCaseStore((s) => s.doc);
  const startStep = useCaseStore((s) => s.startStep);
  const completeStep = useCaseStore((s) => s.completeStep);
  const skipStep = useCaseStore((s) => s.skipStep);
  const passGate = useCaseStore((s) => s.passGate);
  const askAgent = useCaseStore((s) => s.askAgent);

  const [now, setNow] = useState(() => new Date());
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [gateChecks, setGateChecks] = useState<Record<string, boolean[]>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const env = useMemo(() => (doc ? buildPlanEnv(doc) : null), [doc]);
  const stats = useMemo(() => (doc ? runbookStats(doc.runbook) : null), [doc]);
  const clock = useMemo(() => (doc ? clockState(doc.runbook, now) : null), [doc, now]);
  const current = doc ? currentStepId(doc.runbook) : null;
  const rollback = useMemo(() => (doc ? rollbackProcedure(doc) : []), [doc]);

  if (!doc || !env || !stats || !clock) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Execution Runbook</h1>
        <p className="mt-2 text-[13px] text-gray-600">Create or open a case first.</p>
      </section>
    );
  }

  if (doc.runbook.steps.length === 0) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Execution Runbook</h1>
        <p className="mt-2 text-[13px] text-gray-600">
          The runbook is generated together with the Upgrade Plan. Generate the plan first — the
          runbook takes its sequence, syntax and outage window from the same case.
        </p>
        <button
          type="button"
          onClick={() => router.push('/plan')}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          Go to Upgrade Plan
        </button>
      </section>
    );
  }

  const envLine = envSummaryLine(env);

  function ask(step: RunbookStep, content: StepContent, mode: 'ask' | 'error') {
    if (!doc) return;
    askAgent({
      kind: 'runbook-step',
      id: step.id,
      label: `${step.type === 'step' ? `Step ${String(stepNumber(doc.runbook, step.id)).padStart(2, '0')}` : step.type === 'gate' ? 'Gate' : 'PONR'} · ${step.title}`,
      prompt: askAboutStepPrompt(doc.runbook, step, content, mode),
      detail: stepFocusDetail(step, content),
    });
  }

  return (
    <div className="space-y-4 pb-8">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Flag size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-gray-900">Execution Runbook — {doc.case.name}</h1>
              <p className="mt-0.5 text-[12px] text-gray-600">{envLine}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <ExportMenu primary="runbook" />
          <button
            type="button"
            onClick={() => setRollbackOpen((v) => !v)}
            aria-expanded={rollbackOpen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-100"
          >
            <RotateCcw size={14} /> {rollbackOpen ? 'Hide rollback' : 'Rollback'}
          </button>
          </div>
        </div>

        {/* FR-21: the rollback panel is always present; the full procedure expands. */}
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-red-800">
            <ShieldAlert size={15} /> Rollback / fallback — back to {rollbackTarget(env)}
          </p>
          {rollbackOpen ? (
            <div className="mt-2 space-y-1.5">
              {rollback.map((line, i) => (
                <p key={i} className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-red-900">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-red-900">
              {rollback[0]} {rollback[1]} Open the panel for the {env.db.family === 'mssql' ? 'RESTORE DATABASE' : env.db.family === 'postgres' ? 'pg_restore' : env.db.family === 'oracle' ? 'Data Pump' : 'restore'} syntax and the full procedure.
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Progress" value={`${stats.done}/${stats.total}`} accent="text-primary" />
          <Tile label="Outage elapsed" value={clock.running ? fmtClock(clock.elapsedMin) : '—'} />
          <Tile
            label={clock.windowMin !== null ? `Window left (of ${fmtClock(clock.windowMin)})` : 'Window left'}
            value={clock.remainingMin !== null ? fmtClock(clock.remainingMin) : '—'}
            accent={clock.overBudget || clock.exceeded ? 'text-risk-blocker' : undefined}
          />
          <Tile label="Est. work left" value={fmtClock(stats.estRemainingMin)} />
        </div>

        {clock.windowMin === null && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <Clock size={13} className="mt-px shrink-0" />
            <span>
              No outage window budget — answer the downtime window gap (with a duration) so the clock can
              count down.{' '}
              <button type="button" onClick={() => router.push('/gaps')} className="font-semibold underline">
                Gap Walkthrough
              </button>
            </span>
          </p>
        )}

        {clock.overBudget && (
          <div
            role="alert"
            className="mt-3 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-[12px] font-medium text-red-800"
          >
            <AlertTriangle size={16} className="shrink-0 text-risk-blocker" />
            {clock.exceeded
              ? `The outage window has been used up — ${fmtClock(stats.estRemainingMin)} of estimated work remains. Decide on rollback now.`
              : `Estimated remaining work (${fmtClock(stats.estRemainingMin)}) exceeds the remaining window (${fmtClock(clock.remainingMin ?? 0)}). Consider the rollback decision now, not later.`}
          </div>
        )}

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className={`h-2.5 rounded-full transition-[width] duration-500 ${stats.complete ? 'bg-risk-clear' : 'bg-primary'}`} style={{ width: `${stats.pct}%` }} />
        </div>
      </section>

      {PHASES.map((phase) => {
        const steps = doc.runbook.steps.filter((s) => s.phase === phase.id);
        if (steps.length === 0) return null;
        return (
          <section key={phase.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Phase {phase.id}</span>
              <span className="text-[13px] font-semibold text-gray-800">{phase.name}</span>
              <span className="ml-auto font-mono text-[11px] text-gray-500">~{phaseEstimate(doc.runbook, phase.id)} min</span>
            </div>
            <div className="space-y-2">
              {steps.map((step) => {
                const content = stepContent(step, doc, env);
                const isCurrent = current === step.id;
                if (step.type === 'gate' || step.type === 'ponr') {
                  return (
                    <GateCard
                      key={step.id}
                      step={step}
                      content={content}
                      isCurrent={isCurrent}
                      checks={gateChecks[step.id] ?? content.checks.map(() => false)}
                      onToggle={(i) =>
                        setGateChecks((p) => {
                          const cur = p[step.id] ?? content.checks.map(() => false);
                          const next = [...cur];
                          next[i] = !next[i];
                          return { ...p, [step.id]: next };
                        })
                      }
                      onPass={() => passGate(step.id)}
                      onAsk={() => ask(step, content, 'ask')}
                    />
                  );
                }
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    number={stepNumber(doc.runbook, step.id)}
                    content={content}
                    isCurrent={isCurrent}
                    expanded={expanded[step.id] ?? (isCurrent || step.status === 'active')}
                    onToggle={() => setExpanded((p) => ({ ...p, [step.id]: !(p[step.id] ?? (isCurrent || step.status === 'active')) }))}
                    onStart={() => startStep(step.id)}
                    onComplete={() => completeStep(step.id)}
                    onSkip={() => skipStep(step.id)}
                    onAsk={() => ask(step, content, 'ask')}
                    onReport={() => ask(step, content, 'error')}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="rounded-xl border border-primary-border bg-primary-soft p-4 text-[12px] text-primary-dark">
        <p className="font-semibold">During the upgrade window</p>
        <p className="mt-1">
          If a problem occurs in production, open a NEW Severity 1 case — do not raise the AMIGO case
          severity. The advisor can help troubleshoot, but it does not replace BMC Support for
          production emergencies.
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`mt-0.5 font-mono text-xl font-bold ${accent ?? 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

function GateCard({
  step,
  content,
  isCurrent,
  checks,
  onToggle,
  onPass,
  onAsk,
}: {
  step: RunbookStep;
  content: StepContent;
  isCurrent: boolean;
  checks: boolean[];
  onToggle: (i: number) => void;
  onPass: () => void;
  onAsk: () => void;
}) {
  const passed = step.status === 'done';
  const ponr = step.type === 'ponr';
  const allChecked = content.checks.every((_, i) => checks[i]);
  const frame = passed
    ? ponr
      ? 'border-red-200 bg-red-50 opacity-70'
      : 'border-emerald-300 bg-emerald-50'
    : isCurrent
      ? ponr
        ? 'border-red-500 bg-red-50'
        : 'border-amber-400 bg-amber-50'
      : 'border-gray-200 bg-gray-50 opacity-60';

  return (
    <div className={`rounded-xl border-2 p-4 ${frame}`} aria-current={isCurrent ? 'step' : undefined}>
      <p className={`flex items-center gap-2 text-[13px] font-bold ${ponr ? 'text-red-800' : 'text-gray-900'}`}>
        {ponr ? <ShieldAlert size={17} /> : <Flag size={16} className={passed ? 'text-risk-clear' : 'text-risk-warning'} />}
        {step.title}
        {passed && (
          <span className={`ml-auto text-[11px] font-medium ${ponr ? 'text-red-700' : 'text-emerald-700'}`}>
            {ponr ? 'Confirmed' : 'GO'} · {fmtTime(step.completed_at)}
          </span>
        )}
      </p>
      {content.note && <p className={`mt-1 text-[12px] ${ponr ? 'text-red-900' : 'text-gray-600'}`}>{content.note}</p>}
      {!passed && !ponr && (
        <div className="mt-3 space-y-1.5">
          {content.checks.map((c, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-2 text-[12px] text-gray-800">
              <input type="checkbox" checked={!!checks[i]} onChange={() => onToggle(i)} disabled={!isCurrent} className="mt-0.5 accent-primary" />
              {c}
            </label>
          ))}
        </div>
      )}
      {!passed && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPass}
            disabled={!isCurrent || (!ponr && !allChecked)}
            className={`rounded-lg px-4 py-2 text-[12px] font-bold ${
              isCurrent && (ponr || allChecked)
                ? ponr
                  ? 'bg-risk-blocker text-white hover:bg-red-700'
                  : 'bg-risk-clear text-white hover:bg-emerald-700'
                : 'cursor-not-allowed bg-gray-200 text-gray-400'
            }`}
          >
            {ponr ? 'Backups verified — proceed past the point of no return' : 'Confirm GO'}
          </button>
          <button
            type="button"
            onClick={onAsk}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-agent-soft px-3 py-1.5 text-[12px] font-medium text-agent hover:bg-violet-100"
          >
            <Sparkles size={11} /> Ask advisor
          </button>
        </div>
      )}
    </div>
  );
}

const RISK_BADGE: Record<Risk, string> = {
  blocker: 'bg-red-100 text-red-800',
  warning: 'bg-amber-100 text-amber-800',
  clear: '',
};

function StepCard({
  step,
  number,
  content,
  isCurrent,
  expanded,
  onToggle,
  onStart,
  onComplete,
  onSkip,
  onAsk,
  onReport,
}: {
  step: RunbookStep;
  number: number;
  content: StepContent;
  isCurrent: boolean;
  expanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onAsk: () => void;
  onReport: () => void;
}) {
  const done = step.status === 'done';
  const na = step.status === 'na';
  const active = step.status === 'active';
  const took = actualMinutes(step);
  const over = took !== null && step.est_min > 0 && took > step.est_min;

  return (
    <div
      className={`rounded-xl border bg-white ${isCurrent || active ? 'border-primary shadow-sm' : `border-gray-200 ${done || na ? 'opacity-60' : 'opacity-80'}`}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="pt-0.5">
          {done ? (
            <CheckCircle2 size={20} className="text-risk-clear" />
          ) : na ? (
            <Minus size={20} className="text-gray-400" />
          ) : active ? (
            <PlayCircle size={20} className="text-primary" />
          ) : (
            <Circle size={20} className="text-gray-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-gray-500">{String(number).padStart(2, '0')}</span>
            <span className={`text-[13px] font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</span>
            {content.risk !== 'clear' && !done && !na && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_BADGE[content.risk]}`}>
                {content.risk === 'blocker' ? 'Critical' : 'Caution'}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-500">
              <Clock size={11} /> {step.est_min}m
            </span>
          </div>
          {(step.started_at || step.completed_at) && (
            <p className="mt-0.5 font-mono text-[11px] text-gray-500">
              {step.started_at && `started ${fmtTime(step.started_at)}`}
              {step.completed_at && ` · ${na ? 'skipped' : 'done'} ${fmtTime(step.completed_at)}`}
              {took !== null && (
                <span className={over ? ' text-risk-warning' : ''}>
                  {` · took ${took}m vs est ${step.est_min}m`}
                </span>
              )}
            </p>
          )}
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="mt-1 flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary-dark">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide' : 'Show'} details
          </button>
          {expanded && (
            <div className="mt-2 space-y-2.5">
              {content.cmd && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                    <Terminal size={11} /> Run
                  </p>
                  <div className="relative">
                    <pre className="terminal pr-20">{content.cmd}</pre>
                    <CopyButton text={content.cmd} />
                  </div>
                </div>
              )}
              {content.expect && (
                <p className="text-[12px] text-gray-700">
                  <span className="font-semibold text-gray-500">Expect:</span> {content.expect}
                </p>
              )}
              {content.verify && (
                <p className="text-[12px] text-gray-700">
                  <span className="font-semibold text-gray-500">Verify:</span> {content.verify}
                </p>
              )}
              {content.fail && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-[12px] text-red-700">
                  <span className="font-semibold">If it fails:</span> {content.fail}
                </p>
              )}
              {content.refs.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {content.refs.map((r) => (
                    <span key={r.url + r.label} className="inline-flex items-center gap-1">
                      <BookOpen size={11} className="text-gray-400" />
                      <RefLink refItem={r} />
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {step.status === 'pending' && (
                  <button
                    type="button"
                    onClick={onStart}
                    disabled={!isCurrent}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${isCurrent ? 'bg-primary text-white hover:bg-primary-hover' : 'cursor-not-allowed bg-gray-100 text-gray-400'}`}
                  >
                    Start step
                  </button>
                )}
                {active && (
                  <button type="button" onClick={onComplete} className="rounded-lg bg-risk-clear px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700">
                    Mark complete
                  </button>
                )}
                {!done && !na && (
                  <button
                    type="button"
                    onClick={onSkip}
                    disabled={!isCurrent}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-300"
                  >
                    N/A
                  </button>
                )}
                <button
                  type="button"
                  onClick={onAsk}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-agent-soft px-3 py-1.5 text-[12px] font-medium text-agent hover:bg-violet-100"
                >
                  <Sparkles size={11} /> Ask advisor
                </button>
                {(active || isCurrent) && (
                  <button
                    type="button"
                    onClick={onReport}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-100"
                  >
                    <AlertTriangle size={11} /> Report error
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
