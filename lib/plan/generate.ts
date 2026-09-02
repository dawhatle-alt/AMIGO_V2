import type { CaseDocument, Plan, PlanItem, PlanItemStatus, Ref, Risk } from '@/lib/types/case';
import { buildPlanEnv, type PlanEnv } from '@/lib/plan/env';
import { SECTIONS, TEMPLATES, type SectionId } from '@/lib/plan/templates';

/**
 * Upgrade Plan generator (PRD FR-20, FR-22). Deterministic: the same case
 * document always yields the same items, in the same order. Content comes
 * from lib/plan/templates.ts; risk flags from lib/rules/risk.ts are pinned
 * into the Blockers & Risks section.
 */

const SECTION_ORDER: SectionId[] = SECTIONS.map((s) => s.id);

export function generatePlan(doc: CaseDocument, now: Date = new Date()): Plan {
  const env = buildPlanEnv(doc);
  const items: PlanItem[] = [];

  for (const t of TEMPLATES) {
    if (t.when && !t.when(env)) continue;
    const auto = t.autofill?.(env) ?? null;
    const detail = str(t.detail, env);
    items.push({
      id: t.id,
      section: t.section,
      text: str(t.text, env),
      status: auto?.status ?? 'todo',
      risk: typeof t.risk === 'function' ? t.risk(env) : (t.risk ?? 'clear'),
      detail: auto ? `${detail}${detail ? '\n\n' : ''}Auto-filled: ${auto.note}` : detail,
      cmd: t.cmd?.(env) ?? '',
      refs: (typeof t.refs === 'function' ? t.refs(env) : (t.refs ?? [])).map((r) => ({ ...r })),
      autofilled_from: auto?.from ?? null,
    });
  }

  // Risk flags pin to the Blockers & Risks section (FR-20), after the decision-gap items.
  for (const flag of env.risks) {
    items.push({
      id: `risk_${flag.id}`,
      section: 'risks',
      text: `${flag.risk === 'blocker' ? 'BLOCKER: ' : ''}${flag.title}`,
      status: 'todo',
      risk: flag.risk,
      detail: flag.evidence.length > 0 ? `${flag.detail}\n\nEvidence: ${flag.evidence.join(', ')}` : flag.detail,
      cmd: '',
      refs: flag.refs.map((r: Ref) => ({ ...r })),
      autofilled_from: flag.evidence[0] ?? null,
    });
  }

  items.sort((a, b) => SECTION_ORDER.indexOf(a.section as SectionId) - SECTION_ORDER.indexOf(b.section as SectionId));

  return { generated_at: now.toISOString(), items };
}

/**
 * Regenerate while keeping the TSA's progress: an item the TSA marked done or
 * N/A stays that way when the fresh generation would only have said "todo".
 * Auto-filled statuses always win, because they reflect new evidence.
 */
export function mergePlan(previous: Plan, fresh: Plan): Plan {
  const prior = new Map(previous.items.map((i) => [i.id, i]));
  return {
    ...fresh,
    items: fresh.items.map((item) => {
      const old = prior.get(item.id);
      if (!old || item.autofilled_from !== null || old.status === 'todo') return item;
      return { ...item, status: old.status };
    }),
  };
}

export function sectionTitle(id: string, doc: CaseDocument): string {
  const section = SECTIONS.find((s) => s.id === id);
  return section ? section.title(buildPlanEnv(doc)) : id;
}

export interface PlanStats {
  total: number;
  /** Items that are not N/A. */
  applicable: number;
  done: number;
  pct: number;
  openBlockers: number;
  openWarnings: number;
}

export function planStats(plan: Plan): PlanStats {
  const applicable = plan.items.filter((i) => i.status !== 'na');
  const done = plan.items.filter((i) => i.status === 'done');
  return {
    total: plan.items.length,
    applicable: applicable.length,
    done: done.length,
    pct: applicable.length === 0 ? 0 : Math.round((done.length / applicable.length) * 100),
    openBlockers: plan.items.filter((i) => i.risk === 'blocker' && i.status === 'todo').length,
    openWarnings: plan.items.filter((i) => i.risk === 'warning' && i.status === 'todo').length,
  };
}

export const STATUS_CYCLE: Record<PlanItemStatus, PlanItemStatus> = { todo: 'done', done: 'na', na: 'todo' };

export type { Risk };

function str(value: string | ((e: PlanEnv) => string) | undefined, env: PlanEnv): string {
  if (value === undefined) return '';
  return typeof value === 'function' ? value(env) : value;
}
