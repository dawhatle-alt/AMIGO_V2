'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Lock,
  MessageSquare,
  Monitor,
  RotateCcw,
  Sparkles,
  Terminal,
  Timer,
  Users,
} from 'lucide-react';
import { useCaseStore } from '@/lib/store/caseStore';
import {
  askAgentPrompt,
  DECISION_GAPS,
  DOWNTIME_GAP_ID,
  formatMinutes,
  gapProgress,
  isAnswered,
  KIND_LABELS,
  windowMinutesFromAnswer,
} from '@/lib/gaps/walkthrough';
import { RefLink } from '@/components/ui/RefLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { gapFocus } from '@/lib/agent/context';
import type { Answer, Gap, GapState } from '@/lib/types/case';

/**
 * S4 Gap Walkthrough (PRD §6, FR-12..FR-14).
 *
 * Ordered cards, one per parser gap: the question, why it matters, then the
 * exact command / console path / references that produce the answer. Answers
 * are saved per card; progress is always visible; every card can hand its
 * context to the advisor.
 */
export function GapsScreen() {
  const router = useRouter();
  const doc = useCaseStore((s) => s.doc);
  const [openOnly, setOpenOnly] = useState(false);

  const progress = useMemo(() => (doc ? gapProgress(doc) : null), [doc]);

  if (!doc || !progress) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Gap Walkthrough</h1>
        <p className="mt-2 text-[13px] text-gray-600">Create or open a case first.</p>
      </section>
    );
  }

  if (doc.gaps.length === 0) {
    return (
      <section className="card p-6">
        <h1 className="text-[17px] font-bold text-gray-900">Gap Walkthrough</h1>
        <p className="mt-2 text-[13px] text-gray-600">
          No gaps yet — parse an HCU archive on the Intake screen first. The gap list is built
          from what the archive cannot answer.
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

  const visible = openOnly ? doc.gaps.filter((g) => !isAnswered(doc, g.id)) : doc.gaps;
  const windowAnswer = doc.answers[DOWNTIME_GAP_ID];
  const windowMinutes = doc.runbook.window_minutes;

  return (
    <div className="space-y-4 pb-16">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-bold text-gray-900">Gap Walkthrough</h1>
            <p className="mt-1 text-[13px] text-gray-600">
              {progress.answered} of {progress.total} answered · {progress.open} open · target{' '}
              {doc.case.target_version}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-gray-600">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Show open only
          </label>
        </div>

        <ProgressBar pct={progress.pct} complete={progress.complete} />

        <div
          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
            windowMinutes !== null
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : windowAnswer
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          <Timer size={15} className="mt-px shrink-0" />
          <p>
            <span className="font-semibold">Runbook clock budget:</span>{' '}
            {windowMinutes !== null
              ? `${formatMinutes(windowMinutes)} — from the downtime window answer.`
              : windowAnswer
                ? 'no duration recognised in the downtime window answer. Include one like "4 hours" or "22:00–02:00" so the runbook clock can use it.'
                : 'not set — answer the downtime window gap below.'}
          </p>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-amber-800">
          <Lock size={12} className="mt-px shrink-0" />
          Links marked 🔒 require a BMC Support Central login — sign in at bmc.com/support first.
        </p>
      </section>

      {visible.length === 0 ? (
        <section className="card border-l-4 border-l-risk-clear bg-emerald-50/40 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-risk-clear" />
            <p className="text-[13px] text-gray-800">
              <span className="font-semibold text-gray-900">All gaps answered.</span> Untick
              &ldquo;Show open only&rdquo; to review or change an answer.
            </p>
          </div>
        </section>
      ) : (
        visible.map((gap) => (
          <GapCard
            key={gap.id}
            index={doc.gaps.indexOf(gap) + 1}
            gap={gap}
            answer={doc.answers[gap.id]}
          />
        ))
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ProgressBar pct={progress.pct} complete={progress.complete} compact />
          </div>
          <span className="whitespace-nowrap font-mono text-[12px] text-gray-600">
            {progress.answered} / {progress.total}
          </span>
          <button
            type="button"
            onClick={() => router.push('/plan')}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
              progress.complete
                ? 'bg-primary text-white hover:bg-primary-hover'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {progress.complete ? 'Continue to Upgrade Plan' : `Continue with ${progress.open} open`}
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  pct,
  complete,
  compact = false,
}: {
  pct: number;
  complete: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`${compact ? '' : 'mt-3'} h-2 w-full overflow-hidden rounded-full bg-gray-200`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${
          complete ? 'bg-risk-clear' : 'bg-primary'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const KIND_ICON: Record<GapState, typeof Terminal> = {
  'run-command': Terminal,
  console: Monitor,
  interview: Users,
};

function GapCard({ index, gap, answer }: { index: number; gap: Gap; answer: Answer | undefined }) {
  const saveAnswer = useCaseStore((s) => s.saveAnswer);
  const clearAnswer = useCaseStore((s) => s.clearAnswer);
  const askAgent = useCaseStore((s) => s.askAgent);

  const saved = answer?.value ?? '';
  const [draft, setDraft] = useState(saved);
  // Keep the textarea in step with the store when the answer changes
  // elsewhere (clear, case reopen) without clobbering in-progress edits.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const answered = saved !== '';
  const dirty = draft.trim() !== saved;
  const canSave = dirty && draft.trim() !== '';
  const kind = KIND_LABELS[gap.state];
  const KindIcon = KIND_ICON[gap.state];
  const feeds = DECISION_GAPS[gap.id];
  const isWindow = gap.id === DOWNTIME_GAP_ID;
  const draftMinutes = isWindow && draft.trim() !== '' ? windowMinutesFromAnswer(draft) : null;

  function save() {
    if (!canSave) return;
    saveAnswer(gap.id, draft);
  }

  return (
    <section
      id={`gap-${gap.id}`}
      className={`card p-5 ${answered ? 'border-emerald-200' : ''}`}
      aria-label={`Gap ${index}: ${gap.question}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold ${
            answered ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {answered ? <Check size={14} /> : String(index).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold text-gray-900">{gap.question}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
              <KindIcon size={11} /> {kind.label}
            </span>
            {feeds && (
              <span
                title={`This answer feeds: ${feeds}`}
                className="rounded-full border border-primary-border bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary-dark"
              >
                Feeds plan · {feeds}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{gap.why}</p>

          {gap.command && (
            <div className="relative mt-3">
              <pre className="terminal pr-20">{gap.command}</pre>
              <CopyButton text={gap.command} />
            </div>
          )}

          {gap.console && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary-border bg-primary-soft px-3 py-2 text-[12px] text-primary-dark">
              <Monitor size={14} className="mt-px shrink-0" />
              <p className="font-mono leading-relaxed">{gap.console}</p>
            </div>
          )}

          {gap.refs && gap.refs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {gap.refs.map((ref) => (
                <RefLink key={ref.url} refItem={ref} />
              ))}
            </div>
          )}

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold text-gray-700">
              Answer <span className="font-normal text-gray-500">— {kind.hint}</span>
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
              rows={gap.state === 'run-command' ? 5 : 3}
              placeholder={
                gap.state === 'run-command'
                  ? 'Paste the full command output here…'
                  : gap.state === 'console'
                    ? 'What the console shows…'
                    : 'Agreed answer…'
              }
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none ${
                gap.state === 'run-command' ? 'font-mono text-[12px]' : ''
              }`}
            />
          </label>

          {isWindow && draft.trim() !== '' && (
            <p
              className={`mt-1 flex items-center gap-1 text-[11px] ${
                draftMinutes !== null ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <Timer size={12} />
              {draftMinutes !== null
                ? `Runbook clock budget will be ${formatMinutes(draftMinutes)}.`
                : 'No duration recognised — add one like "4 hours" or "22:00–02:00".'}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Check size={13} /> {answered ? 'Save change' : 'Save answer'}
            </button>
            {answered && (
              <button
                type="button"
                onClick={() => clearAnswer(gap.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw size={13} /> Clear
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                askAgent({
                  kind: 'gap',
                  id: gap.id,
                  label: gapFocus(gap, index).label,
                  prompt: askAgentPrompt(gap),
                  detail: gapFocus(gap, index).detail,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-agent-soft px-3 py-1.5 text-[12px] font-medium text-agent hover:bg-violet-100"
            >
              <Sparkles size={13} /> Ask advisor about this gap
            </button>
            {answer && (
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-gray-500">
                <MessageSquare size={11} /> saved {formatTs(answer.ts)}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
