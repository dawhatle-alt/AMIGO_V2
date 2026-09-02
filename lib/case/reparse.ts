import type { CaseDocument } from '@/lib/types/case';

/**
 * What a re-parse would throw away (PRD FR-1 / FR-2). `applyParseResult`
 * replaces facts and gaps and resets confirmations, answers, plan and
 * runbook — the audit trail keeps the history, but the TSA must not lose an
 * afternoon's confirmations to an accidental second drop.
 */
export interface ReparseImpact {
  /** Human-readable list of what would be reset; empty when nothing would. */
  items: string[];
  /** Confirmation prompt, or '' when a re-parse is harmless. */
  message: string;
}

export function reparseImpact(doc: CaseDocument): ReparseImpact {
  const items: string[] = [];
  const confirmations = Object.keys(doc.confirmations).length;
  if (confirmations > 0) items.push(`${confirmations} confirmation${confirmations === 1 ? '' : 's'}`);
  const answers = Object.keys(doc.answers).length;
  if (answers > 0) items.push(`${answers} gap answer${answers === 1 ? '' : 's'}`);
  if (doc.plan.items.length > 0) items.push(`the generated plan (${doc.plan.items.length} items)`);
  const progressed = doc.runbook.steps.filter((s) => s.status !== 'pending').length;
  if (progressed > 0) items.push(`runbook progress (${progressed} step${progressed === 1 ? '' : 's'} started or done)`);
  if (doc.runbook.outage_started_at) items.push('the outage clock');

  const message =
    items.length === 0
      ? ''
      : `Parsing again replaces the facts and gaps and resets ${list(items)}. The audit trail keeps the history. Continue?`;
  return { items, message };
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
