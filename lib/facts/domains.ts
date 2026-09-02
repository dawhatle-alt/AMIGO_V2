import type { CaseDocument, Fact } from '@/lib/types/case';

/**
 * Fact presentation model (PRD FR-9): domain grouping and human labels.
 *
 * Content lives here as a data module, never inside a component (CLAUDE.md).
 * Adding an extractor means adding a label here — an unlabelled key still
 * renders, using its dotted key, so nothing is ever silently hidden.
 */

export const DOMAINS = ['EM', 'Server', 'Topology', 'DB', 'Agents', 'Environment'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Host-level facts belong to Environment regardless of which product reported them. */
const ENVIRONMENT_SUFFIXES = ['.os_name', '.os_version', '.disk_free', '.av_monitoring', '.fs_flag'];

export function domainFor(key: string): Domain {
  if (ENVIRONMENT_SUFFIXES.some((s) => key.endsWith(s))) return 'Environment';
  if (key.startsWith('topology.') || key === 'em.host' || key === 'server.host') return 'Topology';
  if (key.startsWith('db.')) return 'DB';
  // flags.* are all derived from the agent inventory today (X25).
  if (key === 'agents' || key === 'agents_unavailable' || key.startsWith('flags.')) return 'Agents';
  if (key.startsWith('em.')) return 'EM';
  if (key.startsWith('server.')) return 'Server';
  return 'Environment';
}

const LABELS: Record<string, string> = {
  'em.version': 'EM version',
  'em.home': 'EM home directory',
  'em.daily_jobs': 'Daily jobs',
  'em.size_class': 'Environment size class',
  'em.users': 'EM users',
  'em.host': 'EM host',
  'em.os_name': 'EM host OS',
  'em.os_version': 'EM host OS version',
  'em.ha_or_distributed': 'EM high availability / distributed',
  'em.disk_free': 'EM host free disk',
  'em.java_home': 'EM JAVA_HOME',
  'em.java_home_version': 'EM JAVA_HOME version',
  'em.java_system_version': 'System Java version (PATH)',
  'em.ldap': 'LDAP',
  'em.ai_jobtypes': 'Automation API job types',
  'em.av_monitoring': 'EM host AV / monitoring',
  'em.fs_flag': 'EM host filesystem type',
  'server.version': 'Server version',
  'server.fixpack': 'Server fix pack / patch',
  'server.patch_history': 'Server patch history',
  'server.running_version': 'Server running version',
  'server.host': 'Server host',
  'server.os_name': 'Server host OS',
  'server.os_version': 'Server host OS version',
  'server.ha': 'Server high availability (mirroring)',
  'server.ssl_enabled': 'Server SSL enabled',
  'server.ssl_policies': 'SSL policy files',
  'server.newday_time': 'New Day time',
  'server.ajf_peak': 'Peak Active Jobs File count',
  'server.disk_free': 'Server host free disk',
  'server.apigtw_port': 'Automation API gateway port',
  'server.gd_forward': 'GD_FORWARD',
  'server.ctmldnrs_in_use': 'ctmldnrs in use',
  'server.av_monitoring': 'Server host AV / monitoring',
  'server.fs_flag': 'Server host filesystem type',
  'db.type': 'Database type',
  'db.version': 'Database version',
  'agents': 'Agent inventory',
  'agents_unavailable': 'Unavailable agents',
  'topology.em_server_same_host': 'EM and Server co-located',
  'flags.ka_000419757': 'KA 000419757 — RHEL 8.5+ agents in SSL mode',
};

export function labelFor(key: string): string {
  return LABELS[key] ?? key;
}

export interface FactRow {
  key: string;
  label: string;
  fact: Fact;
  /** Corrected value when the TSA overrode the extracted one (FR-10). */
  correctedValue: unknown | null;
  confirmed: boolean;
  corrected: boolean;
}

export interface FactGroup {
  domain: Domain;
  rows: FactRow[];
}

/** Groups a case's facts for display, preserving extractor emission order within each domain. */
export function groupFacts(doc: CaseDocument): FactGroup[] {
  const groups = new Map<Domain, FactRow[]>();
  for (const domain of DOMAINS) groups.set(domain, []);

  for (const [key, fact] of Object.entries(doc.facts)) {
    const confirmation = doc.confirmations[key];
    groups.get(domainFor(key))?.push({
      key,
      label: labelFor(key),
      fact,
      correctedValue: confirmation?.corrected_value ?? null,
      confirmed: confirmation?.status === 'confirmed',
      corrected: confirmation?.status === 'corrected',
    });
  }

  return DOMAINS.map((domain) => ({ domain, rows: groups.get(domain) ?? [] })).filter(
    (g) => g.rows.length > 0,
  );
}

/**
 * The value downstream logic should use: the TSA's correction when there is
 * one, otherwise what the extractor found (FR-10).
 */
export function effectiveValue(doc: CaseDocument, key: string): unknown {
  const confirmation = doc.confirmations[key];
  if (confirmation?.status === 'corrected') return confirmation.corrected_value;
  return doc.facts[key]?.value;
}

/** INFERRED facts still awaiting Confirm/Correct — these block plan generation. */
export function pendingConfirmations(doc: CaseDocument): FactRow[] {
  return Object.entries(doc.facts)
    .filter(([key, fact]) => fact.confidence === 'INFERRED' && !doc.confirmations[key])
    .map(([key, fact]) => ({
      key,
      label: labelFor(key),
      fact,
      correctedValue: null,
      confirmed: false,
      corrected: false,
    }));
}
