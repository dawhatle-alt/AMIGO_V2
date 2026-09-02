import type { CaseDocument, Gap } from '@/lib/types/case';
import { effectiveValue, labelFor } from '@/lib/facts/domains';
import { dbFamily, evaluateRisks } from '@/lib/rules/risk';
import { pendingConfirmations } from '@/lib/facts/domains';
import { formatMinutes, gapProgress } from '@/lib/gaps/walkthrough';

/**
 * Case context sent with every advisor call (PRD §7.2). Built on the client
 * from live case state; the server turns it into the system prompt (FR-16).
 * Everything here is plain data — strings the prompt can quote verbatim.
 */

export type OsFamily = 'windows' | 'unix' | 'mixed' | 'unknown';
export type DbFamily = ReturnType<typeof dbFamily>;

export interface FocusedItem {
  kind: 'gap' | 'runbook-step';
  label: string;
  /** Command / console path / failure guidance the item carries. */
  detail: string;
}

export interface CaseContext {
  case: { name: string; target_version: string };
  /** Multi-line environment summary: hosts, versions, OS, DB, topology, add-ons. */
  facts_summary: string;
  os_family: OsFamily;
  db_family: DbFamily;
  screen: string;
  focused_item: FocusedItem | null;
  /** One line: confirmations pending, gaps answered, risks outstanding. */
  progress: string;
  /** "1:23 elapsed of 4:00 window" while the runbook clock runs, else null. */
  elapsed: string | null;
}

const SCREEN_LABELS: Record<string, string> = {
  '/': 'Home',
  '/intake': 'Intake (archive parsing)',
  '/facts': 'Facts Review (extracted facts, risk banners, confirmations)',
  '/gaps': 'Gap Walkthrough (collecting what the archive could not answer)',
  '/plan': 'Upgrade Plan',
  '/runbook': 'Execution Runbook',
};

export function screenLabel(pathname: string): string {
  return SCREEN_LABELS[pathname] ?? pathname;
}

/** Facts worth putting in front of the advisor, in reading order. */
const SUMMARY_KEYS = [
  'em.host',
  'em.version',
  'em.os_name',
  'em.os_version',
  'em.ha_or_distributed',
  'em.size_class',
  'em.daily_jobs',
  'em.java_home_version',
  'em.ldap',
  'em.av_monitoring',
  'server.host',
  'server.version',
  'server.running_version',
  'server.fixpack',
  'server.os_name',
  'server.os_version',
  'server.ha',
  'server.ssl_enabled',
  'server.newday_time',
  'server.apigtw_port',
  'server.ctmldnrs_in_use',
  'server.av_monitoring',
  'db.type',
  'db.version',
  'topology.em_server_same_host',
] as const;

export function osFamilyOf(doc: CaseDocument): OsFamily {
  const names = ['em.os_name', 'server.os_name']
    .map((k) => effectiveValue(doc, k))
    .filter((v): v is string => typeof v === 'string');
  if (names.length === 0) return 'unknown';
  const win = names.some((n) => /windows/i.test(n));
  const unix = names.some((n) => /linux|aix|solaris|hp-ux|unix|red hat|rhel|suse|ubuntu/i.test(n));
  if (win && unix) return 'mixed';
  if (win) return 'windows';
  if (unix) return 'unix';
  return 'unknown';
}

export function factsSummary(doc: CaseDocument): string {
  const lines: string[] = [];
  for (const key of SUMMARY_KEYS) {
    const fact = doc.facts[key];
    if (!fact) continue;
    const value = effectiveValue(doc, key);
    if (value === null || value === undefined || value === '') continue;
    const unconfirmed = fact.confidence === 'INFERRED' && !doc.confirmations[key];
    lines.push(
      `- ${labelFor(key)}: ${describe(value)}${unconfirmed ? ' (inferred — not yet confirmed by the TSA)' : ''}`,
    );
  }

  const agents = effectiveValue(doc, 'agents');
  if (Array.isArray(agents) && agents.length > 0) {
    const rows = agents as Record<string, unknown>[];
    const versions = distinct(rows.map((r) => r['VERSION']));
    const oses = distinct(rows.map((r) => r['OS']));
    const ssl = rows.filter((r) => String(r['SSL']).toUpperCase() === 'Y').length;
    lines.push(
      `- Agents: ${rows.length} (versions ${versions.join(', ') || 'unknown'}; OS ${oses.join(', ') || 'unknown'}; ${ssl} in SSL mode)`,
    );
  }
  const unavailable = effectiveValue(doc, 'agents_unavailable');
  if (Array.isArray(unavailable) && unavailable.length > 0) {
    lines.push(`- Agents currently UNAVAILABLE: ${unavailable.map(String).join(', ')}`);
  }
  const ka = effectiveValue(doc, 'flags.ka_000419757') as { triggered?: boolean; agents?: string[] } | undefined;
  if (ka?.triggered) {
    lines.push(`- KA 000419757 applies: agent(s) ${(ka.agents ?? []).join(', ')} run RHEL 8.5+ in SSL mode`);
  }
  const jobtypes = effectiveValue(doc, 'em.ai_jobtypes');
  if (jobtypes && typeof jobtypes === 'object' && !Array.isArray(jobtypes)) {
    const n = Object.keys(jobtypes as object).length;
    if (n > 0) lines.push(`- Application Integrator job types deployed: ${n}`);
  }

  return lines.length > 0 ? lines.join('\n') : '(no facts extracted yet — no archive parsed)';
}

export function progressLine(doc: CaseDocument): string {
  const pending = pendingConfirmations(doc).length;
  const gaps = gapProgress(doc);
  const risks = evaluateRisks(doc);
  const blockers = risks.filter((r) => r.risk === 'blocker').length;
  const warnings = risks.filter((r) => r.risk === 'warning').length;
  return (
    `Facts: ${Object.keys(doc.facts).length} extracted, ${pending} inferred value(s) awaiting confirmation. ` +
    `Gaps: ${gaps.answered}/${gaps.total} answered. ` +
    `Risks: ${blockers} blocker(s), ${warnings} warning(s).`
  );
}

export function elapsedLine(doc: CaseDocument, now: Date = new Date()): string | null {
  const started = doc.runbook.outage_started_at;
  if (!started) return null;
  const startMs = new Date(started).getTime();
  if (Number.isNaN(startMs)) return null;
  const elapsedMin = Math.max(0, Math.floor((now.getTime() - startMs) / 60000));
  const window = doc.runbook.window_minutes;
  return window
    ? `${formatMinutes(elapsedMin)} elapsed of a ${formatMinutes(window)} outage window`
    : `${formatMinutes(elapsedMin)} elapsed (no window budget recorded)`;
}

/** Focus payload for a gap (FR-14/FR-18). */
export function gapFocus(gap: Gap, index: number): FocusedItem {
  const parts = [];
  if (gap.command) parts.push(`Command:\n${gap.command}`);
  if (gap.console) parts.push(`Console path: ${gap.console}`);
  parts.push(`Why it matters: ${gap.why}`);
  return {
    kind: 'gap',
    label: `Gap ${String(index).padStart(2, '0')} · ${gap.question}`,
    detail: parts.join('\n'),
  };
}

export function buildCaseContext(
  doc: CaseDocument,
  pathname: string,
  focused: FocusedItem | null,
): CaseContext {
  return {
    case: { name: doc.case.name, target_version: doc.case.target_version },
    facts_summary: factsSummary(doc),
    os_family: osFamilyOf(doc),
    db_family: dbFamily(effectiveValue(doc, 'db.type')),
    screen: screenLabel(pathname),
    focused_item: focused,
    progress: progressLine(doc),
    elapsed: elapsedLine(doc),
  };
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function distinct(values: unknown[]): string[] {
  return [...new Set(values.filter((v) => v !== undefined && v !== null && v !== '').map(String))];
}
