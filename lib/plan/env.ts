import type { CaseDocument, TargetVersion } from '@/lib/types/case';
import { effectiveValue, labelFor } from '@/lib/facts/domains';
import { dbFamily, evaluateRisks, type RiskFlag } from '@/lib/rules/risk';

/**
 * Everything the plan/runbook tailoring rules (PRD FR-22) key on, read once
 * from the case through `effectiveValue` so TSA corrections win over the
 * extracted value. Templates receive this object and nothing else.
 */

export type OsFamily = 'windows' | 'unix' | 'unknown';
export type DbFamily = ReturnType<typeof dbFamily>;
export type Component = 'em' | 'server';

/** Minimum free disk in GB per version-matrix.md. */
export const MIN_DISK_GB: Record<Component, number> = { em: 12, server: 12 };

export interface FactNote {
  key: string;
  label: string;
  value: string;
  source: string;
}

export interface AnswerNote {
  id: string;
  question: string;
  value: string;
}

export interface ComponentEnv {
  present: boolean;
  name: string;
  host: string | null;
  version: string | null;
  fixpack: string | null;
  osName: string | null;
  osVersion: string | null;
  osFamily: OsFamily;
  home: string | null;
  /** Free GB on the install drive when known, else the smallest drive; null when not collected. */
  diskFreeGb: number | null;
  diskDrive: string | null;
  diskOk: boolean | null;
  avTools: string[];
}

export interface PlanEnv {
  caseName: string;
  target: TargetVersion;
  em: ComponentEnv & {
    ha: boolean;
    distributed: boolean;
    javaHomeVersion: string | null;
    javaSystemVersion: string | null;
    ldap: string | null;
    sizeClass: string | null;
    dailyJobs: number | null;
    users: number | null;
    aiJobTypes: number;
  };
  server: ComponentEnv & {
    ha: boolean;
    sslEnabled: boolean;
    apigtwPort: string | null;
    gdForward: string | null;
    ctmldnrs: string | null;
    runningVersion: string | null;
    ajfPeak: number | null;
  };
  db: { family: DbFamily; type: string | null; version: string | null };
  /** true = co-hosted, false = separate hosts, null = unknown (one archive only). */
  sameHost: boolean | null;
  agents: { count: number; unavailable: string[]; sslCount: number; ka419757: string[] };
  risks: RiskFlag[];
  /** Trimmed gap answers by gap id. */
  answers: Record<string, string>;
  /** Provenance for a fact, or null when the fact is absent. */
  fact: (key: string) => FactNote | null;
  /** Provenance for a non-blank gap answer, or null. */
  answer: (id: string) => AnswerNote | null;
}

export function buildPlanEnv(doc: CaseDocument): PlanEnv {
  const str = (key: string): string | null => {
    const v = effectiveValue(doc, key);
    return typeof v === 'string' && v.trim() !== '' ? v : typeof v === 'number' ? String(v) : null;
  };
  const num = (key: string): number | null => {
    const v = effectiveValue(doc, key);
    return typeof v === 'number' ? v : null;
  };
  const list = (key: string): string[] => {
    const v = effectiveValue(doc, key);
    return Array.isArray(v) ? v.map(String) : [];
  };

  const answers: Record<string, string> = {};
  for (const [id, a] of Object.entries(doc.answers)) {
    if (a.value.trim() !== '') answers[id] = a.value.trim();
  }

  const component = (c: Component, name: string): ComponentEnv => {
    const osName = str(`${c}.os_name`);
    const home = str(`${c}.home`);
    const disk = diskFree(doc, c);
    return {
      present: doc.facts[`${c}.host`] !== undefined || doc.facts[`${c}.version`] !== undefined,
      name,
      host: str(`${c}.host`),
      version: str(`${c}.version`),
      fixpack: str(`${c}.fixpack`),
      osName,
      osVersion: str(`${c}.os_version`),
      osFamily: osFamilyOf(osName),
      home,
      diskFreeGb: disk?.free ?? null,
      diskDrive: disk?.drive ?? null,
      diskOk: disk ? disk.free >= MIN_DISK_GB[c] : null,
      avTools: list(`${c}.av_monitoring`),
    };
  };

  const same = str('topology.em_server_same_host');
  const agentsRaw = effectiveValue(doc, 'agents');
  const agentRows = Array.isArray(agentsRaw) ? (agentsRaw as Record<string, unknown>[]) : [];
  const ka = effectiveValue(doc, 'flags.ka_000419757') as { triggered?: boolean; agents?: string[] } | undefined;
  const aiJobTypes = effectiveValue(doc, 'em.ai_jobtypes');

  return {
    caseName: doc.case.name,
    target: doc.case.target_version,
    em: {
      ...component('em', 'Control-M/EM'),
      ha: /^yes/i.test(str('em.ha_or_distributed') ?? ''),
      distributed: /distributed/i.test(str('em.ha_or_distributed') ?? '') && /^yes/i.test(str('em.ha_or_distributed') ?? ''),
      javaHomeVersion: str('em.java_home_version'),
      javaSystemVersion: str('em.java_system_version'),
      ldap: str('em.ldap'),
      sizeClass: str('em.size_class'),
      dailyJobs: num('em.daily_jobs'),
      users: num('em.users'),
      aiJobTypes:
        aiJobTypes && typeof aiJobTypes === 'object' && !Array.isArray(aiJobTypes)
          ? Object.keys(aiJobTypes as object).length
          : 0,
    },
    server: {
      ...component('server', 'Control-M/Server'),
      ha: /^yes/i.test(str('server.ha') ?? ''),
      sslEnabled: (str('server.ssl_enabled') ?? '').toUpperCase() === 'Y',
      apigtwPort: str('server.apigtw_port'),
      gdForward: str('server.gd_forward'),
      ctmldnrs: str('server.ctmldnrs_in_use'),
      runningVersion: str('server.running_version'),
      ajfPeak: num('server.ajf_peak'),
    },
    db: { family: dbFamily(effectiveValue(doc, 'db.type')), type: str('db.type'), version: str('db.version') },
    sameHost: same === null ? null : /^yes/i.test(same),
    agents: {
      count: agentRows.length,
      unavailable: list('agents_unavailable'),
      sslCount: agentRows.filter((r) => String(r['SSL']).toUpperCase() === 'Y').length,
      ka419757: ka?.triggered ? (ka.agents ?? []) : [],
    },
    risks: evaluateRisks(doc),
    answers,
    fact: (key) => {
      const f = doc.facts[key];
      if (!f) return null;
      const value = effectiveValue(doc, key);
      return { key, label: labelFor(key), value: describe(value), source: f.source };
    },
    answer: (id) => {
      const value = answers[id];
      if (!value) return null;
      const gap = doc.gaps.find((g) => g.id === id);
      return { id, question: gap?.question ?? id, value };
    },
  };
}

export function osFamilyOf(osName: string | null): OsFamily {
  if (!osName) return 'unknown';
  if (/windows/i.test(osName)) return 'windows';
  if (/linux|aix|solaris|hp-ux|unix|red hat|rhel|suse|ubuntu|centos/i.test(osName)) return 'unix';
  return 'unknown';
}

/** Free space on the component's install drive (or the smallest drive when the home is unknown). */
function diskFree(doc: CaseDocument, c: Component): { drive: string; free: number } | null {
  const drives = effectiveValue(doc, `${c}.disk_free`);
  if (!Array.isArray(drives)) return null;
  const parsed = (drives as { drive?: unknown; free_gb?: unknown }[])
    .filter((d) => typeof d.drive === 'string' && typeof d.free_gb === 'number')
    .map((d) => ({ drive: d.drive as string, free: d.free_gb as number }));
  if (parsed.length === 0) return null;
  const home = effectiveValue(doc, `${c}.home`);
  const homeDrive = typeof home === 'string' ? /^([A-Za-z]:)/.exec(home)?.[1] : undefined;
  const target = homeDrive
    ? parsed.find((d) => d.drive.toUpperCase() === homeDrive.toUpperCase())
    : undefined;
  return target ?? parsed.reduce((min, d) => (d.free < min.free ? d : min));
}

/** Numeric comparison of dotted versions; unparseable → null. */
export function compareVersions(a: string | null, b: string | null): number | null {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function parse(v: string | null): number[] | null {
  if (!v) return null;
  const m = /(\d+(?:\.\d+)*)/.exec(v);
  return m?.[1] ? m[1].split('.').map(Number) : null;
}

/** "9.0.21.300" → "9.0.21"; null when not a version. */
export function releaseOf(version: string | null): string | null {
  const m = version ? /(\d+\.\d+\.\d+)/.exec(version) : null;
  return m?.[1] ?? null;
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  return JSON.stringify(value);
}

/** One-line environment summary for headers and exports, e.g. "EM 9.0.21.300 + Server 9.0.21.302 → 9.0.22 | same host | Windows Server 2019 | MS SQL". */
export function envSummaryLine(e: PlanEnv): string {
  return [
    [e.em.present ? `EM ${e.em.version ?? '?'}` : null, e.server.present ? `Server ${e.server.version ?? '?'}` : null]
      .filter(Boolean)
      .join(' + ') + ` → ${e.target}`,
    e.sameHost === true ? 'same host' : e.sameHost === false ? 'separate hosts' : null,
    e.em.osName ?? e.server.osName ?? 'OS not detected',
    e.db.type?.split('(')[0]?.trim() ?? null,
  ]
    .filter(Boolean)
    .join(' | ');
}
