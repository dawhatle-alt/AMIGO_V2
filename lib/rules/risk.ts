import type { CaseDocument, Ref, Risk, TargetVersion } from '@/lib/types/case';
import { effectiveValue, pendingConfirmations } from '@/lib/facts/domains';

/**
 * Risk-flag rules (PRD FR-11).
 *
 * Every rule is deterministic and reads only facts already extracted (through
 * `effectiveValue`, so a TSA correction re-evaluates the rules). Rule content —
 * wording, severity, reference links — is ported from
 * reference/skill-references/version-matrix.md and url-reference.md and lives
 * here as a versioned data module, never inside a component (CLAUDE.md).
 *
 * URL rules (url-reference.md): 🔒 marks a link that needs a BMC Support
 * Central login; the dead Control-M_EM_Upgrade.htm / Control-M_Server_Upgrade.htm
 * pages are never linked — the main Control-M_upgrade.htm page is used instead.
 */

export const RULES_VERSION = 'v22';

export interface RiskFlag {
  id: string;
  risk: Risk;
  title: string;
  detail: string;
  /** Fact keys the rule read, so the banner can point at its evidence. */
  evidence: string[];
  refs: Ref[];
}

const UPGRADE_GUIDE: Ref = {
  label: 'Control-M Upgrade Guide 🔒',
  url: 'https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm',
};
const COMPAT_FAQ: Ref = {
  label: 'KA 000401828 — Compatibility Mode FAQ 🔒',
  url: 'https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDZpCAM',
};
const SERVER_AGENT_COMMS: Ref = {
  label: 'Server-Agent Communication 🔒',
  url: 'https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Server-Agent_Communication.htm',
};
const PG_BULLETIN: Ref = {
  label: 'BMC PostgreSQL Database Server Upgrade',
  url: 'https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/Announcements/BMC-PostgreSQL-Database-Server-Upgrade/',
};
const AIX_EOS: Ref = {
  label: 'AIX End of Support (end of 2026)',
  url: 'https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/Announcements/Control-M-EM-and-Control-M-Server-on-AIX-End-of-Support-Planned-for-the-End-of-2026/',
};
const PAC_TOOL: Ref = {
  label: 'PAC Compatibility Tool',
  url: 'https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/',
};

/** Minimum free disk, in GB, per version-matrix.md. */
const MIN_DISK_GB = { em: 12, server: 12 } as const;

/** Lowest source release that can upgrade directly, per version-matrix.md. */
const MIN_DIRECT_SOURCE: Record<TargetVersion, string> = {
  '9.0.22': '9.0.19',
  '9.0.21': '9.0.18',
};

export function evaluateRisks(doc: CaseDocument): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const target = doc.case.target_version;

  for (const component of ['em', 'server'] as const) {
    const flag = versionPathRule(doc, component, target);
    if (flag) flags.push(flag);
  }

  const compat = compatibilityModeRule(doc, target);
  if (compat) flags.push(compat);

  const unavailable = unavailableAgentsRule(doc);
  if (unavailable) flags.push(unavailable);

  const ka = ka000419757Rule(doc);
  if (ka) flags.push(ka);

  const postgres = postgresRule(doc, target);
  if (postgres) flags.push(postgres);

  for (const component of ['em', 'server'] as const) {
    const disk = diskSpaceRule(doc, component);
    if (disk) flags.push(disk);
  }

  for (const component of ['em', 'server'] as const) {
    const aix = aixRule(doc, component);
    if (aix) flags.push(aix);
  }

  const confirms = confirmationGateRule(doc);
  if (confirms) flags.push(confirms);

  return flags;
}

/** Parses "9.0.21.300" into comparable parts; null when unrecognised. */
function parseVersion(value: unknown): number[] | null {
  if (typeof value !== 'string') return null;
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Version-path violation: source below the minimum direct-upgrade release. */
function versionPathRule(
  doc: CaseDocument,
  component: 'em' | 'server',
  target: TargetVersion,
): RiskFlag | null {
  const key = `${component}.version`;
  const raw = effectiveValue(doc, key);
  const source = parseVersion(raw);
  const minimum = parseVersion(MIN_DIRECT_SOURCE[target]);
  if (!source || !minimum) return null;
  if (compare(source, minimum) >= 0) return null;

  const name = component === 'em' ? 'Control-M/EM' : 'Control-M/Server';
  return {
    id: `version_path_${component}`,
    risk: 'blocker',
    title: `${name} ${String(raw)} cannot upgrade directly to ${target}`,
    detail:
      `Direct upgrade to ${target} requires ${MIN_DIRECT_SOURCE[target]} or higher. ` +
      `This environment must step through an intermediate version first — plan the ` +
      `intermediate upgrade before the ${target} window.`,
    evidence: [key],
    refs: [UPGRADE_GUIDE, PAC_TOOL],
  };
}

/**
 * Compatibility Mode is a hard gate for 9.0.22 (cannot upgrade if the
 * compatibility version is 9.0.19 or lower) and is irreversible once turned
 * off. The collector does not capture it (spec X19 is unresolved), so this
 * stays a warning until the `compat_mode` gap is answered.
 */
function compatibilityModeRule(doc: CaseDocument, target: TargetVersion): RiskFlag | null {
  if (target !== '9.0.22') return null;
  const answer = doc.answers['compat_mode'];
  if (answer && answer.value.trim() !== '') return null;

  return {
    id: 'compat_mode_gate',
    risk: 'warning',
    title: 'Compatibility Mode status not yet verified',
    detail:
      'Upgrade to 9.0.22 is blocked if the Compatibility Mode version is 9.0.19 or lower, ' +
      'and Compatibility Mode cannot be re-enabled once turned off. The HCU archive does not ' +
      'capture this — record it from CCM → Manage → Compatibility Mode in the gap walkthrough.',
    evidence: [],
    refs: [COMPAT_FAQ, UPGRADE_GUIDE],
  };
}

function unavailableAgentsRule(doc: CaseDocument): RiskFlag | null {
  const value = effectiveValue(doc, 'agents_unavailable');
  if (!Array.isArray(value) || value.length === 0) return null;
  const names = value.map(String);

  return {
    id: 'agents_unavailable',
    risk: 'warning',
    title: `${names.length} agent${names.length === 1 ? '' : 's'} unavailable at collection time`,
    detail:
      `${names.join(', ')} — an agent that is down at collection may also be down on upgrade ` +
      'night. Confirm whether each is decommissioned or genuinely offline before the window, ' +
      'so post-upgrade verification has a known-good expected state.',
    evidence: ['agents_unavailable', 'agents'],
    refs: [SERVER_AGENT_COMMS],
  };
}

function ka000419757Rule(doc: CaseDocument): RiskFlag | null {
  const value = effectiveValue(doc, 'flags.ka_000419757');
  if (typeof value !== 'object' || value === null) return null;
  const flag = value as { triggered?: unknown; agents?: unknown };
  if (flag.triggered !== true) return null;
  const agents = Array.isArray(flag.agents) ? flag.agents.map(String) : [];

  return {
    id: 'ka_000419757',
    risk: 'warning',
    title: 'KA 000419757 applies — RHEL 8.5+ agents running in SSL mode',
    detail:
      (agents.length > 0 ? `${agents.join(', ')}: ` : '') +
      'these agents run Red Hat 8.5 or newer with SSL enabled, the condition KA 000419757 ' +
      'describes. Review the article and apply its guidance before the agent upgrade phase.',
    evidence: ['flags.ka_000419757', 'agents'],
    refs: [
      {
        label: 'KA 000419757 🔒',
        url: 'https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pCJgCAM',
      },
    ],
  };
}

/**
 * The database family, taken from the IDENTIFYING part of `db.type` only.
 *
 * X05's by-elimination value is "MS SQL (by elimination — no PostgreSQL/Oracle
 * sections in archive)" — the parenthetical names the databases that were RULED
 * OUT, so a substring search over the whole string reports PostgreSQL for an
 * MS SQL environment. Only the text before the parenthetical identifies the DB.
 */
export function dbFamily(value: unknown): 'postgres' | 'oracle' | 'mssql' | 'unknown' {
  if (typeof value !== 'string') return 'unknown';
  const identifier = value.split('(')[0] ?? '';
  if (/postgre/i.test(identifier)) return 'postgres';
  if (/oracle/i.test(identifier)) return 'oracle';
  if (/ms\s*sql|sql\s*server|mssql/i.test(identifier)) return 'mssql';
  return 'unknown';
}

/** PostgreSQL is not upgraded in place; 11.5 must move to 15.3 after the upgrade. */
function postgresRule(doc: CaseDocument, target: TargetVersion): RiskFlag | null {
  if (dbFamily(effectiveValue(doc, 'db.type')) !== 'postgres') return null;
  if (target !== '9.0.22') return null;

  return {
    id: 'postgres_upgrade',
    risk: 'warning',
    title: 'PostgreSQL upgrade required separately after the Control-M upgrade',
    detail:
      'PostgreSQL is NOT upgraded during an in-place Control-M upgrade. The bundled 11.5 must be ' +
      'upgraded to 15.3 as a separate task after moving to 9.0.22, and the source must already be ' +
      'PostgreSQL 11 or higher.',
    evidence: ['db.type', 'db.version'],
    refs: [PG_BULLETIN],
  };
}

function diskSpaceRule(doc: CaseDocument, component: 'em' | 'server'): RiskFlag | null {
  const key = `${component}.disk_free`;
  const drives = effectiveValue(doc, key);
  if (!Array.isArray(drives) || drives.length === 0) return null;

  const minimum = MIN_DISK_GB[component];
  // Prefer the drive the product is actually installed on, when it is known.
  const home = effectiveValue(doc, `${component}.home`);
  const homeDrive = typeof home === 'string' ? /^([A-Za-z]:)/.exec(home)?.[1] : undefined;

  const parsed = (drives as { drive?: unknown; free_gb?: unknown }[])
    .filter((d) => typeof d.drive === 'string' && typeof d.free_gb === 'number')
    .map((d) => ({ drive: d.drive as string, free: d.free_gb as number }));
  if (parsed.length === 0) return null;

  const target = homeDrive
    ? parsed.find((d) => d.drive.toUpperCase() === homeDrive.toUpperCase())
    : undefined;
  // Without a known install drive, only flag when EVERY drive is short — never invent
  // a shortage on a data volume that has nothing to do with the install.
  const short = target ? (target.free < minimum ? target : undefined) : parsed.every((d) => d.free < minimum) ? parsed[0] : undefined;
  if (!short) return null;

  const name = component === 'em' ? 'Control-M/EM' : 'Control-M/Server';
  return {
    id: `disk_space_${component}`,
    risk: 'warning',
    title: `${name} host has ${short.free} GB free on ${short.drive} — below the ${minimum} GB minimum`,
    detail:
      `The upgrade needs at least ${minimum} GB free. This is a snapshot taken when the HCU ran, ` +
      'so re-check free space immediately before the window.',
    evidence: [key, `${component}.home`],
    refs: [UPGRADE_GUIDE],
  };
}

function aixRule(doc: CaseDocument, component: 'em' | 'server'): RiskFlag | null {
  const key = `${component}.os_name`;
  const value = effectiveValue(doc, key);
  if (typeof value !== 'string' || !/\baix\b/i.test(value)) return null;

  const name = component === 'em' ? 'Control-M/EM' : 'Control-M/Server';
  return {
    id: `aix_eos_${component}`,
    risk: 'warning',
    title: `${name} runs on AIX — end of support planned for the end of 2026`,
    detail:
      'BMC has announced end of support for Control-M/EM and Control-M/Server on AIX. Factor the ' +
      'platform migration into the upgrade plan rather than treating this as a version-only change.',
    evidence: [key],
    refs: [AIX_EOS],
  };
}

/** FR-10: plan generation is blocked while any INFERRED value is unresolved. */
function confirmationGateRule(doc: CaseDocument): RiskFlag | null {
  const pending = pendingConfirmations(doc);
  if (pending.length === 0) return null;

  return {
    id: 'confirmations_pending',
    risk: 'blocker',
    title: `${pending.length} inferred value${pending.length === 1 ? ' awaits' : 's await'} confirmation`,
    detail:
      `${pending.map((p) => p.label).join(', ')} — these were inferred, not read directly from the ` +
      'archive. Confirm or correct each one before generating the plan, so the plan is not built ' +
      'on a guess.',
    evidence: pending.map((p) => p.key),
    refs: [],
  };
}

/** FR-10 / PRD §10 M2: the plan cannot be generated while confirmations are open. */
export function planGenerationBlockers(doc: CaseDocument): RiskFlag[] {
  return evaluateRisks(doc).filter((f) => f.risk === 'blocker');
}

export function canGeneratePlan(doc: CaseDocument): boolean {
  return planGenerationBlockers(doc).length === 0;
}
