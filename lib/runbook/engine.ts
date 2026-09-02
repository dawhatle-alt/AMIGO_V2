import type { CaseDocument, Ref, Risk, Runbook, RunbookStep } from '@/lib/types/case';
import { buildPlanEnv, type PlanEnv } from '@/lib/plan/env';
import { PHASES, rollbackSteps, STEP_TEMPLATES, type StepTemplate } from '@/lib/runbook/templates';

/**
 * Execution Runbook engine (PRD FR-21): generation, sequential locking,
 * the outage clock and the over-budget rule. Pure functions over the case
 * document; the store applies the transitions.
 */

export function generateRunbook(doc: CaseDocument): Runbook {
  const env = buildPlanEnv(doc);
  const steps: RunbookStep[] = [];
  for (const t of STEP_TEMPLATES) {
    if (t.when && !t.when(env)) continue;
    steps.push({
      id: t.id,
      phase: t.phase,
      type: t.type,
      title: str(t.title, env),
      est_min: t.type === 'step' ? (t.est_min ?? 0) : 0,
      status: 'pending',
      started_at: null,
      completed_at: null,
    });
  }
  return {
    steps,
    outage_started_at: doc.runbook.outage_started_at,
    window_minutes: doc.runbook.window_minutes,
  };
}

/** Regenerate while keeping execution progress for steps that still exist. */
export function mergeRunbook(previous: Runbook, fresh: Runbook): Runbook {
  const prior = new Map(previous.steps.map((s) => [s.id, s]));
  return {
    ...fresh,
    outage_started_at: previous.outage_started_at,
    steps: fresh.steps.map((s) => {
      const old = prior.get(s.id);
      return old ? { ...s, status: old.status, started_at: old.started_at, completed_at: old.completed_at } : s;
    }),
  };
}

const finished = (s: RunbookStep): boolean => s.status === 'done' || s.status === 'na';

/** The first step (gate, PONR or work step) that is not yet done / N/A. */
export function currentStepId(runbook: Runbook): string | null {
  return runbook.steps.find((s) => !finished(s))?.id ?? null;
}

/** Sequential locking: only the current step can be acted on. */
export function canActOn(runbook: Runbook, id: string): boolean {
  return currentStepId(runbook) === id;
}

export interface RunbookStats {
  /** Work steps (gates and PONR excluded). */
  total: number;
  done: number;
  pct: number;
  /** Estimated minutes for work steps not yet done / N/A. */
  estRemainingMin: number;
  /** Sum of est_min for all work steps. */
  estTotalMin: number;
  complete: boolean;
}

export function runbookStats(runbook: Runbook): RunbookStats {
  const work = runbook.steps.filter((s) => s.type === 'step');
  const done = work.filter(finished);
  const remaining = work.filter((s) => !finished(s)).reduce((a, s) => a + s.est_min, 0);
  return {
    total: work.length,
    done: done.length,
    pct: work.length === 0 ? 0 : Math.round((done.length / work.length) * 100),
    estRemainingMin: remaining,
    estTotalMin: work.reduce((a, s) => a + s.est_min, 0),
    complete: runbook.steps.length > 0 && runbook.steps.every(finished),
  };
}

export interface ClockState {
  running: boolean;
  elapsedMin: number;
  /** null when no window budget is recorded. */
  windowMin: number | null;
  /** Minutes left in the window (may be negative once exceeded); null without a budget or before Gate 1. */
  remainingMin: number | null;
  /** FR-21: remaining window is less than the estimated remaining work. */
  overBudget: boolean;
  /** Window fully used up. */
  exceeded: boolean;
}

export function clockState(runbook: Runbook, now: Date = new Date()): ClockState {
  const stats = runbookStats(runbook);
  const started = runbook.outage_started_at ? new Date(runbook.outage_started_at).getTime() : NaN;
  const running = !Number.isNaN(started);
  const elapsedMin = running ? Math.max(0, Math.floor((now.getTime() - started) / 60000)) : 0;
  const windowMin = runbook.window_minutes;
  const remainingMin = running && windowMin !== null ? windowMin - elapsedMin : null;
  return {
    running,
    elapsedMin,
    windowMin,
    remainingMin,
    overBudget: remainingMin !== null && !stats.complete && remainingMin < stats.estRemainingMin,
    exceeded: remainingMin !== null && remainingMin <= 0,
  };
}

/** "1:05" from minutes. */
export function fmtClock(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes a step actually took, once complete. */
export function actualMinutes(step: RunbookStep): number | null {
  if (!step.started_at || !step.completed_at) return null;
  const ms = new Date(step.completed_at).getTime() - new Date(step.started_at).getTime();
  return Number.isNaN(ms) ? null : Math.max(1, Math.round(ms / 60000));
}

export interface StepContent {
  risk: Risk;
  cmd: string;
  expect: string;
  verify: string;
  fail: string;
  refs: Ref[];
  checks: string[];
  note: string;
}

/** Rendered content for a stored step, from the template keyed by its id. */
export function stepContent(step: RunbookStep, doc: CaseDocument, env: PlanEnv = buildPlanEnv(doc)): StepContent {
  const t = STEP_TEMPLATES.find((x) => x.id === step.id);
  if (!t) return { risk: 'clear', cmd: '', expect: '', verify: '', fail: '', refs: [], checks: [], note: '' };
  return {
    risk: t.risk ?? 'clear',
    cmd: t.cmd?.(env) ?? '',
    expect: str(t.expect, env),
    verify: str(t.verify, env),
    fail: str(t.fail, env),
    refs: (typeof t.refs === 'function' ? t.refs(env) : (t.refs ?? [])).map((r) => ({ ...r })),
    checks: t.checks?.(env) ?? [],
    note: str(t.note, env),
  };
}

export function phaseName(id: string): string {
  return PHASES.find((p) => p.id === id)?.name ?? id;
}

/** Estimated minutes per phase, from the stored steps. */
export function phaseEstimate(runbook: Runbook, phase: string): number {
  return runbook.steps.filter((s) => s.phase === phase && s.type === 'step').reduce((a, s) => a + s.est_min, 0);
}

export function rollbackProcedure(doc: CaseDocument): string[] {
  return rollbackSteps(buildPlanEnv(doc));
}

/** 1-based number of a work step, gates and PONR excluded. */
export function stepNumber(runbook: Runbook, id: string): number {
  return runbook.steps.filter((s) => s.type === 'step').findIndex((s) => s.id === id) + 1;
}

/** FR-18: advisor prefill for "Ask" and "Report error" on a step. */
export function askAboutStepPrompt(runbook: Runbook, step: RunbookStep, content: StepContent, mode: 'ask' | 'error'): string {
  const n = String(stepNumber(runbook, step.id)).padStart(2, '0');
  const head =
    mode === 'error'
      ? `I hit an error on step ${n} (${step.title}). Here's the exact error text I'm seeing:\n\n`
      : `I'm on step ${n} (${step.title}). `;
  const ctx = [content.cmd ? `Command:\n${content.cmd}` : null, content.fail ? `Failure guidance: ${content.fail}` : null]
    .filter(Boolean)
    .join('\n\n');
  return mode === 'error' ? head : `${head}\n\n${ctx}`.trimEnd() + '\n\nMy question: ';
}

/** Focus detail sent in the case context (FR-16). */
export function stepFocusDetail(step: RunbookStep, content: StepContent): string {
  return [
    step.type === 'gate' ? `Gate: ${step.title}` : step.type === 'ponr' ? 'POINT OF NO RETURN confirmation' : `Step: ${step.title} (est ${step.est_min} min, status ${step.status})`,
    content.cmd ? `Command:\n${content.cmd}` : null,
    content.expect ? `Expect: ${content.expect}` : null,
    content.fail ? `If it fails: ${content.fail}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export { STEP_TEMPLATES as RUNBOOK_TEMPLATES };
export type { StepTemplate };

function str(value: string | ((e: PlanEnv) => string) | undefined, env: PlanEnv): string {
  if (value === undefined) return '';
  return typeof value === 'function' ? value(env) : value;
}
