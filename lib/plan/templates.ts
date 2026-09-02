import type { PlanItemStatus, Ref, Risk } from '@/lib/types/case';
import type { Component, OsFamily, PlanEnv } from '@/lib/plan/env';
import { compareVersions, MIN_DISK_GB, releaseOf } from '@/lib/plan/env';
import { ka, REF, refs } from '@/lib/plan/refs';

/**
 * Upgrade Plan content — versioned data module (PRD FR-20, FR-22, FR-23).
 *
 * Ported from reference/skill-references/em-checklist-v22.md,
 * server-checklist-v22.md, upgrade-plan-em-v22.md, upgrade-plan-server-v22.md
 * and version-matrix.md, in the shape of the approved prototype
 * (reference/prototypes/amigo-plan-AZAMA79.jsx). Nothing here is rendered
 * directly: the generator evaluates each template against the PlanEnv.
 *
 * Tailoring rules (FR-22):
 *  - a template with `when` returning false is NOT generated (N/A items are
 *    suppressed, not shown);
 *  - commands are rendered per OS family (REM/setx/.bat/robocopy vs
 *    #/export/.sh/tar) and per database (T-SQL vs pg_dump vs Data Pump);
 *  - `autofill` marks an item Done/N/A from a fact or answer and records the
 *    provenance so the plan says where the answer came from.
 */

export const TEMPLATES_VERSION = 'v22';

export type SectionId =
  | 'env'
  | 'risks'
  | 'pre_em'
  | 'pre_server'
  | 'fallback'
  | 'sequence'
  | 'verify'
  | 'post';

export interface Section {
  id: SectionId;
  title: (e: PlanEnv) => string;
}

export const SECTIONS: readonly Section[] = [
  { id: 'env', title: (e) => `Environment Summary — ${e.caseName}` },
  { id: 'risks', title: () => 'Blockers & Risks' },
  { id: 'pre_em', title: () => 'Pre-Upgrade: Enterprise Manager' },
  { id: 'pre_server', title: () => 'Pre-Upgrade: Control-M/Server' },
  { id: 'fallback', title: () => 'Fallback / Back-Out Plan' },
  {
    id: 'sequence',
    title: (e) =>
      e.sameHost === true
        ? 'Upgrade Sequence (same host — EM first, then Server)'
        : 'Upgrade Sequence (EM first, then Server)',
  },
  { id: 'verify', title: () => 'Post-Upgrade Verification' },
  { id: 'post', title: () => 'Post-Upgrade Tasks' },
];

export interface Autofill {
  /** Fact key or gap id the value came from. */
  from: string;
  status: Extract<PlanItemStatus, 'done' | 'na'>;
  /** Human note appended to the detail: what was read and where from. */
  note: string;
}

type Str = string | ((e: PlanEnv) => string);

export interface ItemTemplate {
  id: string;
  section: SectionId;
  when?: (e: PlanEnv) => boolean;
  text: Str;
  detail?: Str;
  risk?: Risk | ((e: PlanEnv) => Risk);
  cmd?: (e: PlanEnv) => string | null;
  refs?: Ref[] | ((e: PlanEnv) => Ref[]);
  autofill?: (e: PlanEnv) => Autofill | null;
}

// ---------------------------------------------------------------------------
// Rendering helpers shared by templates
// ---------------------------------------------------------------------------

export const cmt = (os: OsFamily): string => (os === 'windows' ? 'REM' : '#');

/**
 * FR-22 never guesses an OS: when the archive did not record one, every
 * command block opens with this line and is rendered in UNIX form so the
 * reader knows to translate — or to correct the OS fact first.
 */
export const OS_UNKNOWN_NOTE =
  '# OS NOT DETECTED in the archive — confirm Windows vs UNIX (or correct the OS fact) before running; shown in UNIX form.';
export const osNote = (os: OsFamily): string => (os === 'unknown' ? `${OS_UNKNOWN_NOTE}\n` : '');
export const host = (e: PlanEnv, c: Component): string => e[c].host ?? `<${c}_host>`;
const quote = (s: string): string => `"${s}"`;

function fromFact(e: PlanEnv, key: string, status: Autofill['status'] = 'done'): Autofill | null {
  const f = e.fact(key);
  if (!f) return null;
  return { from: key, status, note: `${f.label} = ${f.value} (from ${f.source})` };
}

function fromAnswer(e: PlanEnv, id: string, status: Autofill['status'] = 'done'): Autofill | null {
  const a = e.answer(id);
  if (!a) return null;
  return { from: id, status, note: `gap “${a.question}” answered: ${a.value}` };
}

/** True when a pasted ctmsetown listing still contains NOTIMPL lines (ignoring "0 NOTIMPL"-style summaries). */
function hasNotimpl(output: string): boolean {
  return output
    .split(/\r?\n/)
    .some(
      (line) =>
        /NOTIMPL/i.test(line) &&
        !/\b(0|zero|no)\s+NOTIMPL/i.test(line) &&
        !/NOTIMPL\s*(lines?|entries)?\s*[:=]?\s*0\b/i.test(line),
    );
}

const yes = (v: string | undefined): boolean => /^\s*(y|yes|true|confirmed|done|in.place)/i.test(v ?? '');
const no = (v: string | undefined): boolean => /^\s*(n|no|none|false)\b/i.test(v ?? '');

export function backupCmd(e: PlanEnv, c: Component): string {
  const os = e[c].osFamily;
  const C = cmt(os);
  const db = `<${c}_database>`;
  const home = e[c].home ?? `<${c}_home>`;
  const lines: string[] = [];

  switch (e.db.family) {
    case 'mssql':
      lines.push(
        `${C} MS SQL — run in SQL Server Management Studio against the ${e[c].name} database:`,
        `BACKUP DATABASE [${db}]`,
        `  TO DISK = 'D:\\Backups\\${db}_pre_upgrade.bak'`,
        `  WITH FORMAT, INIT, COMPRESSION;`,
      );
      break;
    case 'postgres':
      lines.push(
        `${C} PostgreSQL — as the database owner:`,
        os === 'windows'
          ? `pg_dump.exe -U <db_user> -Fc ${db} > D:\\Backups\\${db}_pre_upgrade.dump`
          : `pg_dump -U <db_user> -Fc ${db} > /backup/${db}_pre_upgrade.dump`,
      );
      break;
    case 'oracle':
      lines.push(
        `${C} Oracle — with the DBA, Data Pump export of the ${e[c].name} schema:`,
        `expdp <schema>/<password> DIRECTORY=<dump_dir> DUMPFILE=${c}_pre_upgrade.dmp SCHEMAS=<schema>`,
        `${C} (or an RMAN backup per the DBA's standard)`,
      );
      break;
    default:
      lines.push(`${C} Database: full backup per the DBA's standard for the confirmed database type.`);
  }

  lines.push('');
  lines.push(`${C} ${e[c].name} installation directory on ${host(e, c)}:`);
  if (os === 'unknown') lines.unshift(OS_UNKNOWN_NOTE);
  if (os === 'windows') {
    lines.push(`robocopy ${quote(home)} "D:\\Backups\\${c}_home_pre_upgrade" /E /R:1 /W:1`);
  } else {
    lines.push(`tar -czf /backup/${c}_home_pre_upgrade.tgz ${quote(home)}`);
  }
  return lines.join('\n');
}

export function restoreTestCmd(e: PlanEnv): string | null {
  const os = e.em.osFamily === 'unknown' ? e.server.osFamily : e.em.osFamily;
  const C = cmt(os);
  switch (e.db.family) {
    case 'mssql':
      return [
        `${C} Prove the backup restores — into a TEST database name, never over production:`,
        `RESTORE DATABASE [<em_database>_restore_test]`,
        `  FROM DISK = 'D:\\Backups\\<em_database>_pre_upgrade.bak'`,
        `  WITH MOVE '<data_file>' TO 'D:\\Backups\\restore_test.mdf',`,
        `       MOVE '<log_file>'  TO 'D:\\Backups\\restore_test.ldf',`,
        `       REPLACE, RECOVERY;`,
      ].join('\n');
    case 'postgres':
      return [
        `${C} Prove the dump restores — into a TEST database, never over production:`,
        `createdb -U <db_user> <em_database>_restore_test`,
        `pg_restore -U <db_user> -d <em_database>_restore_test /backup/<em_database>_pre_upgrade.dump`,
      ].join('\n');
    case 'oracle':
      return [
        `${C} Prove the export imports — into a TEST schema, never over production:`,
        `impdp <schema>/<password> DIRECTORY=<dump_dir> DUMPFILE=em_pre_upgrade.dmp REMAP_SCHEMA=<schema>:<schema>_restore_test`,
      ].join('\n');
    default:
      return null;
  }
}

export function checkReqCmd(e: PlanEnv, c: Component): string {
  const os = e[c].osFamily;
  return os === 'windows'
    ? `REM From the ${e[c].name} installation media on ${host(e, c)}:\ncd <install_media>\\CheckReq\ncheckReqRun.bat\nREM Lists any OS requirement or patch that is missing.`
    : `${osNote(os)}# From the ${e[c].name} installation media on ${host(e, c)}, as the ${c === 'em' ? 'EM' : 'Server'} owner:\ncd <install_media>/CheckReq\n./check_req.sh\n# Lists any OS requirement, kernel parameter or package that is missing.`;
}

export function ctmsetownCmd(e: PlanEnv, c: Component): string {
  const os = e[c].osFamily;
  const C = cmt(os);
  const who = os === 'windows' ? `command prompt as the ${e[c].name} administrator` : `${e[c].name} owner account`;
  return `${osNote(os)}${C} On ${host(e, c)}, ${who}:\nctmsetown -action list\n${C} Zero NOTIMPL lines required — resolve any per KA 000354649 before the upgrade.`;
}

export function upgradeReadyCmd(e: PlanEnv, c: Component): string {
  const os = e[c].osFamily;
  const p = c === 'em' ? 'em' : 'ctm';
  return os === 'windows'
    ? `REM From the ${e.target} installation media on ${host(e, c)}:\ncd <install_media>\\UpgradeReady\\upgrade_ready\nis_upgrade_ready.bat -p ${p}`
    : `${osNote(os)}# From the ${e.target} installation media on ${host(e, c)}:\ncd <install_media>/UpgradeReady/upgrade_ready\n./is_upgrade_ready.sh -p ${p}`;
}

export function javaCmd(e: PlanEnv, c: Component): string {
  const os = e[c].osFamily;
  return os === 'windows'
    ? `REM Machine-wide on ${host(e, c)}; open a NEW command window afterwards:\nsetx BMC_JAVA_HOME "C:\\Program Files\\Java\\jdk-17" /M\n"%BMC_JAVA_HOME%\\bin\\java" -version`
    : `${osNote(os)}# In the ${e[c].name} owner's profile on ${host(e, c)} (.profile / .bash_profile):\nexport BMC_JAVA_HOME=/usr/java/jdk-17\n$BMC_JAVA_HOME/bin/java -version`;
}

export function stopCmd(e: PlanEnv): string {
  const lines: string[] = [];
  if (e.em.present) {
    const C = cmt(e.em.osFamily);
    lines.push(`${C} 1. Stop Control-M/EM on ${host(e, 'em')}:`);
    lines.push(
      e.em.osFamily === 'windows'
        ? `${C}    CCM → Components → stop each EM component, then stop the Control-M/EM Windows services.`
        : `stop_all`,
    );
  }
  if (e.server.present) {
    const C = cmt(e.server.osFamily);
    lines.push(`${C} 2. Stop Control-M/Server on ${host(e, 'server')}:`);
    lines.push(
      e.server.osFamily === 'windows'
        ? `${C}    ctm_menu → Control-M Manager → Shutdown Control-M, then stop the Control-M/Server + Configuration Agent Windows services.`
        : `shut_ctm\nshut_ca`,
    );
  }
  return lines.join('\n');
}

export function installerCmd(e: PlanEnv, c: Component): string {
  const os = e[c].osFamily;
  const which = c === 'em' ? 'Control-M/Enterprise Manager' : 'Control-M/Server';
  const extra = c === 'server' ? `\n${cmt(os)} Confirm BMC_INST_CTM_APIGTW_PORT=8393 is set in THIS session before launching.` : '';
  return os === 'windows'
    ? `REM From the ${e.target} installation media on ${host(e, c)}, as Administrator:${extra}\nsetup.exe\nREM Choose "${which}" and follow the wizard.`
    : `${osNote(os)}# From the ${e.target} installation media on ${host(e, c)}, as the ${c === 'em' ? 'EM' : 'Server'} owner:${extra}\n./setup.sh\n# Choose "${which}" and follow the prompts.`;
}

export function patchRefs(e: PlanEnv, c: Component): Ref[] {
  if (e.target === '9.0.22') {
    return c === 'em' ? [REF.emPatch9022, REF.patches9022] : [REF.serverPatch9022, REF.patches9022];
  }
  return [REF.patches9021];
}

export function latestPatch(e: PlanEnv, c: Component): string {
  if (e.target === '9.0.22') return c === 'em' ? '9.0.22.026' : '9.0.22.025';
  return `the latest ${e.target} patch`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const TEMPLATES: readonly ItemTemplate[] = [
  // ---- Environment Summary --------------------------------------------------
  {
    id: 'env_em',
    section: 'env',
    when: (e) => e.em.present,
    text: (e) =>
      `Control-M/EM: ${e.em.version ?? '?'} → ${e.target} | ${e.em.osName ?? 'OS unknown'} | ${e.db.type?.split('(')[0]?.trim() ?? 'DB unknown'} | ${e.em.ha ? 'HA / Distributed' : 'Standalone'}`,
    detail: (e) =>
      `Host: ${host(e, 'em')}. ${e.em.home ? `EM home ${e.em.home}. ` : ''}${
        e.sameHost === true
          ? 'EM and Server are co-located on the same machine and share one outage.'
          : e.sameHost === false
            ? 'EM and Server are on separate hosts — upgrade EM first, then Server.'
            : 'Only one archive was parsed; confirm where the Server runs.'
      }`,
    risk: 'clear',
    refs: [REF.upgradeGuide, REF.pacTool],
    autofill: (e) => fromFact(e, 'em.version'),
  },
  {
    id: 'env_server',
    section: 'env',
    when: (e) => e.server.present,
    text: (e) =>
      `Control-M/Server: ${e.server.version ?? '?'} → ${e.target} | ${e.server.osName ?? 'OS unknown'} | ${e.server.ha ? 'HA (mirror)' : 'Standalone'}`,
    detail: (e) =>
      `Host: ${host(e, 'server')}. ${e.server.fixpack ? `Latest installed package ${e.server.fixpack}. ` : ''}${
        e.server.runningVersion && e.server.runningVersion !== e.server.version
          ? `SYSPRM reports running version ${e.server.runningVersion} — cross-check against the installed-versions table. `
          : ''
      }${e.server.sslEnabled ? 'Server↔Agent SSL is enabled.' : 'Server↔Agent SSL is not enabled.'}`,
    risk: 'clear',
    refs: [REF.upgradeGuide],
    autofill: (e) => fromFact(e, 'server.version'),
  },
  {
    id: 'env_db',
    section: 'env',
    when: (e) => e.db.type !== null,
    text: (e) =>
      e.db.family === 'postgres'
        ? `Database: PostgreSQL ${e.db.version ?? ''} — bundled database is NOT upgraded in place; a PostgreSQL upgrade section is included`
        : `Database: ${e.db.type?.split('(')[0]?.trim() ?? ''} (external) — the bundled-database upgrade steps do not apply`,
    detail: (e) =>
      e.db.family === 'postgres'
        ? 'PostgreSQL 11 or higher is required for 9.0.22, and BMC-supplied PostgreSQL 11.5 should be upgraded to 15.3 soon after the Control-M upgrade.'
        : 'After upgrading, verify external database compatibility with the target version via the PAC tool.',
    risk: 'clear',
    refs: (e) => (e.db.family === 'postgres' ? [REF.pgUpgrade, REF.pgBulletin] : [REF.pacTool, REF.upgradeGuide]),
    autofill: (e) => fromFact(e, 'db.type'),
  },
  {
    id: 'env_sizing',
    section: 'env',
    when: (e) => e.em.dailyJobs !== null || e.em.sizeClass !== null,
    text: (e) =>
      `Sizing: ${e.em.sizeClass ?? 'unknown class'} environment — ${e.em.dailyJobs?.toLocaleString() ?? '?'} daily jobs${e.em.users ? `, ${e.em.users} users` : ''}${e.server.ajfPeak ? `, AJF peak ${e.server.ajfPeak.toLocaleString()}` : ''}`,
    detail: (e) =>
      /medium|large/i.test(e.em.sizeClass ?? '')
        ? 'Medium/large environment — review the PSR sizing document (KA 000308729) against the current hardware before the upgrade.'
        : 'Measured from check_config production_size. Review minimum sizing in the installation guide.',
    risk: (e) => (/medium|large/i.test(e.em.sizeClass ?? '') ? 'warning' : 'clear'),
    refs: [REF.sysReqs],
    autofill: (e) => fromFact(e, 'em.daily_jobs') ?? fromFact(e, 'em.size_class'),
  },
  {
    id: 'env_agents',
    section: 'env',
    when: (e) => e.agents.count > 0,
    text: (e) =>
      `Agents: ${e.agents.count} registered, ${e.agents.sslCount} in SSL mode${e.agents.unavailable.length > 0 ? `, ${e.agents.unavailable.length} UNAVAILABLE` : ''}`,
    detail: (e) =>
      e.agents.unavailable.length > 0
        ? `Unavailable at collection time: ${e.agents.unavailable.join(', ')}. Decide before the window whether each is decommissioned or must be reachable for verification.`
        : 'All registered agents were available at collection time. Upgrade agents only AFTER the Server.',
    risk: (e) => (e.agents.unavailable.length > 0 ? 'warning' : 'clear'),
    refs: [REF.serverAgentComms],
    autofill: (e) => fromFact(e, 'agents'),
  },
  {
    id: 'env_addons',
    section: 'env',
    when: (e) => e.em.present,
    text: (e) =>
      e.em.aiJobTypes > 0
        ? `Add-ons detected: Application Integrator (${e.em.aiJobTypes} deployed job type${e.em.aiJobTypes === 1 ? '' : 's'}), Automation API${e.em.ldap ? `, LDAP (${e.em.ldap.replace(/^Configured\s*/i, '')})` : ''}`
        : `Add-ons detected: Automation API${e.em.ldap ? `, LDAP (${e.em.ldap.replace(/^Configured\s*/i, '')})` : ''} — no Application Integrator job types`,
    detail:
      'Only detected add-ons get verification steps. BIM, Forecast, Self Service, WCM, MFT, Workload Archiving and Workflow Insights are not visible in the archive — confirm with the customer whether any are installed.',
    risk: 'clear',
    refs: (e) => refs(ka('KA 000419428')),
    autofill: (e) => fromFact(e, 'em.ai_jobtypes'),
  },
  {
    id: 'env_dates',
    section: 'env',
    text: (e) =>
      `Upgrade date: ${e.answers['upgrade_date'] ?? 'NOT SET'} | Downtime window: ${e.answers['downtime_window'] ?? 'NOT SET'}`,
    detail: (e) =>
      e.answers['upgrade_date'] && e.answers['downtime_window']
        ? `${e.sameHost === true ? 'EM and Server share the outage. ' : ''}AMIGO Review requires the case at least 2 weeks before the cutover date.`
        : 'Both must be agreed before the plan is final: the AMIGO Review needs 2 weeks lead time and the runbook clock is built from the window. Answer them in the Gap Walkthrough.',
    risk: (e) => (e.answers['upgrade_date'] && e.answers['downtime_window'] ? 'clear' : 'blocker'),
    refs: [REF.amigoOverview],
    autofill: (e) => (e.answers['upgrade_date'] && e.answers['downtime_window'] ? fromAnswer(e, 'downtime_window') : null),
  },
  {
    id: 'env_compat',
    section: 'env',
    when: (e) => e.target === '9.0.22',
    text: (e) => `Compatibility Mode: ${e.answers['compat_mode'] ?? 'NOT YET VERIFIED'}`,
    detail:
      'Cannot upgrade to 9.0.22 if the Compatibility Mode version is 9.0.19 or lower. Once turned off it CANNOT be re-enabled. EM stays in Compatibility Mode until every EM client is upgraded.',
    risk: (e) => (e.answers['compat_mode'] ? 'warning' : 'blocker'),
    refs: (e) => refs(REF.compatMode, ka('KA 000401828')),
    autofill: (e) => fromAnswer(e, 'compat_mode'),
  },

  // ---- Blockers & Risks (decision gaps; rule flags are added by the generator) ----
  {
    id: 'risk_downtime',
    section: 'risks',
    when: (e) => !e.answers['downtime_window'],
    text: 'BLOCKER: Downtime window not specified',
    detail: (e) =>
      `${e.sameHost === true ? 'EM and Server are on the same host, so both are offline together. ' : ''}Define the window and validate it covers upgrade + verification; the runbook clock budget comes from it.`,
    risk: 'blocker',
  },
  {
    id: 'risk_fallback',
    section: 'risks',
    when: (e) => !yes(e.answers['fallback_plan']),
    text: (e) =>
      e.answers['fallback_plan'] ? 'BLOCKER: Fallback plan not confirmed as documented and tested' : 'BLOCKER: Fallback plan not created or verified',
    detail: (e) =>
      `A documented rollback is required before cutover — ${e.db.family === 'mssql' ? 'MS SQL backup/restore' : e.db.family === 'postgres' ? 'pg_dump/pg_restore' : e.db.family === 'oracle' ? 'Data Pump / RMAN' : 'database'} procedure, installation rollback, validation checks and a communication plan.${e.answers['fallback_plan'] ? ` Current answer: ${e.answers['fallback_plan']}` : ''}`,
    risk: 'blocker',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'risk_change_freeze',
    section: 'risks',
    when: (e) => !e.answers['change_freeze'],
    text: 'Change cutoff for job definitions / calendars / services not defined',
    detail: 'Without a freeze, EM and Server definitions drift during the upgrade. Agree a cutoff time and communicate it.',
    risk: 'warning',
  },
  {
    id: 'risk_em_clients',
    section: 'risks',
    when: (e) => e.em.present && !e.answers['em_clients'],
    text: 'EM client inventory / upgrade plan not defined',
    detail: 'EM stays in Compatibility Mode until ALL clients are upgraded. Count the clients and set the client upgrade timeline.',
    risk: 'warning',
    refs: [REF.compatMode],
  },
  {
    id: 'risk_cms',
    section: 'risks',
    when: (e) => !!e.answers['cm_inventory'] && !no(e.answers['cm_inventory']),
    text: 'Control Modules on the local agent require a separate migration case',
    detail: (e) =>
      `Control Modules are NOT upgraded in place. Answer recorded: ${e.answers['cm_inventory']}. Open a separate case to migrate CM accounts to the new agent.`,
    risk: 'warning',
  },
  {
    id: 'risk_test_plan',
    section: 'risks',
    when: (e) => !e.answers['test_plan'],
    text: 'Post-upgrade functional test plan not defined',
    detail: 'The verification phase of the runbook is built from it — define the smoke tests before the window.',
    risk: 'warning',
  },
  {
    id: 'risk_migration',
    section: 'risks',
    when: (e) => !!e.answers['same_machine'] && no(e.answers['same_machine']),
    text: 'BLOCKER: Migration to a different machine is not covered under AMIGO',
    detail: (e) => `Answer recorded: ${e.answers['same_machine']}. Open a regular case to plan the migration; AMIGO covers in-place upgrades only.`,
    risk: 'blocker',
  },
  {
    id: 'risk_cloud',
    section: 'risks',
    when: (e) => yes(e.answers['cloud']),
    text: 'Cloud-hosted environment — KA 000223209 applies',
    detail: (e) => `Answer recorded: ${e.answers['cloud']}. Review KA 000223209 (Control-M in cloud environments) before the upgrade.`,
    risk: 'warning',
  },

  // ---- Pre-Upgrade: EM -------------------------------------------------------
  {
    id: 'pe_pac',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => `Verify OS & DB compatibility with ${e.target} via the PAC tool`,
    detail: (e) => `${e.em.osName ?? 'OS'} ${e.em.osVersion ?? ''} + ${e.db.type?.split('(')[0]?.trim() ?? 'database'} — confirm both are supported with Control-M ${e.target}.`,
    risk: 'warning',
    refs: [REF.pacTool, REF.compat9022],
  },
  {
    id: 'pe_checkreq',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => `Run check_req on ${host(e, 'em')}`,
    detail: 'Verifies OS level, kernel parameters and patches meet the target requirements. Customer responsibility: the machine must meet minimum requirements.',
    risk: 'warning',
    cmd: (e) => checkReqCmd(e, 'em'),
    refs: (e) => (e.em.osFamily === 'unix' ? [REF.preInstallUnix, REF.emSysReqs] : [REF.emSysReqs, REF.installIntro]),
  },
  {
    id: 'pe_ctmsetown',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'Run ctmsetown -action list on EM — zero NOTIMPL entries',
    detail: (e) =>
      e.answers['ctmsetown']
        ? hasNotimpl(e.answers['ctmsetown'])
          ? 'The recorded output contains NOTIMPL entries — they BLOCK the upgrade and must be resolved per KA 000354649 first.'
          : 'Output recorded in the gap walkthrough with no NOTIMPL entries.'
        : 'Not yet run. NOTIMPL entries block the upgrade and must be resolved first (KA 000354649).',
    risk: (e) => (e.answers['ctmsetown'] ? (hasNotimpl(e.answers['ctmsetown']) ? 'blocker' : 'clear') : 'warning'),
    cmd: (e) => ctmsetownCmd(e, 'em'),
    refs: (e) => refs(REF.ctmsetown, ka('KA 000354649')),
    autofill: (e) => (e.answers['ctmsetown'] && !hasNotimpl(e.answers['ctmsetown']) ? fromAnswer(e, 'ctmsetown') : null),
  },
  {
    id: 'pe_upgrade_ready',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'Run is_upgrade_ready for EM near the window',
    detail: (e) =>
      `Point-in-time readiness check from the ${e.target} install media (OS, disk, DB, Java). Re-run close to the cutover date.`,
    risk: 'warning',
    cmd: (e) => upgradeReadyCmd(e, 'em'),
    refs: [REF.upgradeGuide],
    autofill: (e) => fromAnswer(e, 'is_upgrade_ready'),
  },
  {
    id: 'pe_fixpack',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => `Latest fix pack installed on the existing EM (${releaseOf(e.em.version) ?? 'current release'})`,
    detail: (e) =>
      `Current EM version ${e.em.version ?? 'unknown'}. Install the latest fix pack for ${releaseOf(e.em.version) ?? 'the current release'} before upgrading.`,
    risk: 'clear',
    refs: (e) => (releaseOf(e.em.version) === '9.0.21' ? [REF.patches9021] : [REF.patches9022]),
  },
  {
    id: 'pe_disk',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => `${MIN_DISK_GB.em} GB+ free disk space on ${host(e, 'em')}`,
    detail: (e) =>
      e.em.diskFreeGb === null
        ? 'Free space was not collected — verify before the window.'
        : `${e.em.diskFreeGb} GB free on ${e.em.diskDrive}${e.em.home ? ` (EM home drive)` : ''} at collection time. Re-check immediately before the window.`,
    risk: (e) => (e.em.diskOk === false ? 'blocker' : 'clear'),
    refs: [REF.sysReqs],
    autofill: (e) => (e.em.diskOk ? fromFact(e, 'em.disk_free') : null),
  },
  {
    id: 'pe_java',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'External Java environment variable set for EM',
    detail: (e) =>
      `${e.target} requires external Java (no longer bundled). ${
        e.em.javaHomeVersion
          ? `EM JAVA_HOME reports ${e.em.javaHomeVersion}${e.em.javaSystemVersion ? `; system Java is ${e.em.javaSystemVersion}` : ''}. Confirm the version is on the KA 000401084 supported list.`
          : 'No Java version was read from the archive — set BMC_JAVA_HOME before the upgrade.'
      } Java 11 end of support has been announced; Java 17 is recommended.`,
    risk: (e) => (e.em.javaHomeVersion ? 'clear' : 'warning'),
    cmd: (e) => javaCmd(e, 'em'),
    refs: (e) => refs(REF.javaInstall, ka('KA 000401084'), REF.java11Eos),
    autofill: (e) => (e.em.javaHomeVersion ? fromFact(e, 'em.java_home_version') : null),
  },
  {
    id: 'pe_av',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'Antivirus / monitoring exclusions configured for Control-M',
    detail: (e) =>
      `${e.em.avTools.length > 0 ? `Detected on ${host(e, 'em')}: ${e.em.avTools.join(', ')}. ` : ''}${
        e.server.avTools.length > 0 ? `Detected on ${host(e, 'server')}: ${e.server.avTools.join(', ')}. ` : ''
      }Control-M users, processes, ports, files and directories must be excluded from scanning before the upgrade.`,
    risk: 'warning',
    refs: [REF.firewall],
    autofill: (e) => fromAnswer(e, 'av_exclusions'),
  },
  {
    id: 'pe_firewall',
    section: 'pre_em',
    when: (e) => e.em.present || e.server.present,
    text: 'Firewall rules verified (EM ↔ Server, Server ↔ Agents)',
    detail: (e) =>
      e.sameHost === true
        ? 'EM and Server share the host, so inter-component rules may not apply — Server ↔ Agent rules must still be verified for the new version.'
        : 'Verify EM ↔ Server and Server ↔ Agent ports for the new version before the window.',
    risk: 'warning',
    refs: [REF.firewall],
    autofill: (e) => fromAnswer(e, 'firewall'),
  },
  {
    id: 'pe_patch_after',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => `Plan EM patch ${latestPatch(e, 'em')} for after the upgrade`,
    detail: (e) => `Install after upgrading to ${e.target}. Stage the patch with the install media.`,
    risk: 'clear',
    refs: (e) => patchRefs(e, 'em'),
  },
  {
    id: 'pe_client_reqs',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'EM client requirements verified (Chrome 78+ / Edge 80+, .NET 4.7.2, Java 1.8+ 64-bit)',
    detail: (e) =>
      e.answers['em_clients']
        ? `Clients recorded: ${e.answers['em_clients']}. Verify each machine meets the requirements before upgrading clients.`
        : 'Verify client machines meet the requirements before upgrading clients.',
    risk: 'clear',
    refs: (e) => refs(REF.upgradeGuide, ka('KA 000401084')),
  },
  {
    id: 'pe_ldap',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => (e.em.ldap ? `LDAP / IdP configured — leave in place through the upgrade` : 'LDAP / IdP / SSL — no new configuration until after the upgrade'),
    detail: (e) =>
      e.em.ldap
        ? `${e.em.ldap}. Existing LDAP/IdP/SSL does not need to be disabled before the upgrade unless the upgrade doc says so; any NEW configuration waits until after.`
        : 'Any LDAP, IdP or SSL configuration should be implemented after the upgrade completes.',
    risk: 'clear',
    refs: [REF.upgradeReqs],
    autofill: (e) => (e.em.ldap ? fromFact(e, 'em.ldap') : null),
  },
  {
    id: 'pe_same_machine',
    section: 'pre_em',
    when: (e) => !e.answers['same_machine'] || yes(e.answers['same_machine']),
    text: 'In-place upgrade on the same machine (not a migration)',
    detail: 'Migration to a different machine is not covered under AMIGO — it needs a regular case.',
    risk: 'clear',
    autofill: (e) => (yes(e.answers['same_machine']) ? fromAnswer(e, 'same_machine') : null),
  },
  {
    id: 'pe_zos',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'No Control-M for z/OS in scope (otherwise a separate AMIGO case with the mainframe team)',
    detail: 'z/OS upgrades run under a separate AMIGO case with Mainframe support — KA 000318316.',
    risk: 'clear',
  },
  {
    id: 'pe_stopstart',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'EM components stop/start verified — web server starts cleanly',
    detail: 'Confirm all EM components can be stopped and started, and the EM web server binds its port (KA 000286154).',
    risk: 'clear',
    refs: (e) => refs(ka('KA 000286154')),
  },
  {
    id: 'pe_media',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: (e) => `Copy the EM ${e.target} installation media to ${host(e, 'em')}`,
    detail: 'Download and stage before the window.',
    risk: 'clear',
    refs: [REF.installIntro],
  },
  {
    id: 'pe_backup',
    section: 'pre_em',
    when: (e) => e.em.present,
    text: 'Backup the existing EM environment',
    detail: (e) =>
      `CRITICAL: full backup of the EM installation directory, configuration and the EM database before starting.${e.sameHost === true ? ' EM and Server share the host — one comprehensive backup window covers both.' : ''}`,
    risk: 'blocker',
    cmd: (e) => backupCmd(e, 'em'),
    refs: [REF.upgradeGuide],
  },
  {
    id: 'pe_ha',
    section: 'pre_em',
    when: (e) => e.em.present && e.em.ha,
    text: 'EM High Availability / Distributed — review KA 000386814 upgrade steps',
    detail: 'HA Secondary and Distributed nodes are upgraded in a fixed order in the same outage window. Confirm the Secondary/Distributed hosts and their access.',
    risk: 'warning',
    refs: [REF.haInstall],
  },
  {
    id: 'pe_pg_version',
    section: 'pre_em',
    when: (e) => e.db.family === 'postgres',
    text: (e) => `PostgreSQL ${e.db.version ?? ''} is 11 or higher (required for ${e.target})`,
    detail: (e) =>
      compareVersions(e.db.version, '11') !== null && compareVersions(e.db.version, '11')! < 0
        ? `PostgreSQL ${e.db.version} is below 11 — it must be upgraded BEFORE the Control-M upgrade.`
        : 'PostgreSQL is NOT upgraded in place. Plan the 11.5 → 15.3 upgrade for soon after the Control-M upgrade.',
    risk: (e) => (compareVersions(e.db.version, '11') !== null && compareVersions(e.db.version, '11')! < 0 ? 'blocker' : 'warning'),
    refs: [REF.pgUpgrade, REF.pgBulletin],
    autofill: (e) => (compareVersions(e.db.version, '11') !== null && compareVersions(e.db.version, '11')! >= 0 ? fromFact(e, 'db.version') : null),
  },
  {
    id: 'pe_aix',
    section: 'pre_em',
    when: (e) => /\baix\b/i.test(e.em.osName ?? ''),
    text: 'EM on AIX — end of support planned for the end of 2026',
    detail: 'Factor the platform migration into the plan rather than treating this as a version-only upgrade.',
    risk: 'warning',
    refs: [REF.aixEos],
  },

  // ---- Pre-Upgrade: Server ---------------------------------------------------
  {
    id: 'ps_ctmsetown',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'Run ctmsetown -action list on the Server — zero NOTIMPL entries',
    detail: (e) =>
      e.answers['ctmsetown'] ? 'Output recorded in the gap walkthrough (run once as EM admin, once as Server admin).' : 'Not yet run. NOTIMPL entries block the upgrade (KA 000354649).',
    risk: (e) => (e.answers['ctmsetown'] ? (hasNotimpl(e.answers['ctmsetown']) ? 'blocker' : 'clear') : 'warning'),
    cmd: (e) => ctmsetownCmd(e, 'server'),
    refs: (e) => refs(REF.ctmsetown, ka('KA 000354649')),
    autofill: (e) => (e.answers['ctmsetown'] && !hasNotimpl(e.answers['ctmsetown']) ? fromAnswer(e, 'ctmsetown') : null),
  },
  {
    id: 'ps_checkreq',
    section: 'pre_server',
    when: (e) => e.server.present && e.sameHost !== true,
    text: (e) => `Run check_req on ${host(e, 'server')}`,
    detail: 'Server host must meet the target OS, kernel and patch requirements.',
    risk: 'warning',
    cmd: (e) => checkReqCmd(e, 'server'),
    refs: [REF.fullInstall, REF.sysReqs],
  },
  {
    id: 'ps_upgrade_ready',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'Run is_upgrade_ready for the Server near the window',
    detail: 'Verify Upgrade Readiness from the target install media, close to the cutover date.',
    risk: 'warning',
    cmd: (e) => upgradeReadyCmd(e, 'server'),
    refs: [REF.upgradeGuide],
    autofill: (e) => fromAnswer(e, 'is_upgrade_ready'),
  },
  {
    id: 'ps_disk',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: (e) => `${MIN_DISK_GB.server} GB+ free disk space on ${host(e, 'server')}`,
    detail: (e) =>
      e.server.diskFreeGb === null
        ? 'Free space was not collected — verify before the window.'
        : `${e.server.diskFreeGb} GB free on ${e.server.diskDrive} at collection time. Re-check immediately before the window.`,
    risk: (e) => (e.server.diskOk === false ? 'blocker' : 'clear'),
    refs: [REF.sysReqs],
    autofill: (e) => (e.server.diskOk ? fromFact(e, 'server.disk_free') : null),
  },
  {
    id: 'ps_fixpack',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: (e) => `Latest fix pack installed on the existing Server (${releaseOf(e.server.version) ?? 'current release'})`,
    detail: (e) => `Installed: ${e.server.fixpack ?? e.server.version ?? 'unknown'}. Install the latest fix pack for the current release before upgrading.`,
    risk: 'clear',
    refs: (e) => (releaseOf(e.server.version) === '9.0.21' ? [REF.patches9021] : [REF.patches9022]),
  },
  {
    id: 'ps_path',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'Server exe/script directory in the system PATH; Server admin can run SQL',
    detail: 'The Server administrator must be able to run the sql utility against the database (KA 000358019).',
    risk: 'warning',
    cmd: (e) =>
      e.server.osFamily === 'windows'
        ? `REM On ${host(e, 'server')}:\necho %PATH% | find /I "Control-M"\nREM Test database access as the Server administrator:\nsql`
        : `# On ${host(e, 'server')}, as the Server owner:\necho $PATH | tr ':' '\\n' | grep -i ctm_server\n# Test database access:\nsql`,
    refs: (e) => refs(ka('KA 000358019'), REF.serverUtils),
  },
  {
    id: 'ps_apigtw',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'BMC_INST_CTM_APIGTW_PORT=8393 set before the Server upgrade',
    detail: (e) =>
      e.server.apigtwPort === '8393'
        ? `The API gateway port is already 8393 on ${host(e, 'server')}. Set the variable in the upgrade session anyway.`
        : e.server.apigtwPort
          ? `Current API gateway port is ${e.server.apigtwPort} — required value is 8393 before the upgrade.`
          : 'Required BEFORE the Server upgrade to 9.0.22.',
    risk: (e) => (e.server.apigtwPort === '8393' ? 'clear' : 'warning'),
    cmd: (e) =>
      e.server.osFamily === 'windows'
        ? `REM In the session that launches the upgrade:\nset BMC_INST_CTM_APIGTW_PORT=8393\necho %BMC_INST_CTM_APIGTW_PORT%`
        : `# In the session that launches the upgrade:\nexport BMC_INST_CTM_APIGTW_PORT=8393\necho $BMC_INST_CTM_APIGTW_PORT`,
    refs: [REF.upgradeGuide],
    autofill: (e) => (e.server.apigtwPort === '8393' ? fromFact(e, 'server.apigtw_port') : null),
  },
  {
    id: 'ps_java',
    section: 'pre_server',
    when: (e) => e.server.present && e.sameHost !== true,
    text: 'External Java environment variable set for the Server',
    detail: 'Same requirement as EM — Java 17 recommended (KA 000401084 for the supported list).',
    risk: 'warning',
    cmd: (e) => javaCmd(e, 'server'),
    refs: (e) => refs(REF.javaInstall, ka('KA 000401084')),
  },
  {
    id: 'ps_change_freeze',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'Change cutoff implemented — no more job / calendar / service / workload-policy changes',
    detail: (e) => (e.answers['change_freeze'] ? `Cutoff: ${e.answers['change_freeze']}.` : 'Agree and communicate the cutoff before the window.'),
    risk: (e) => (e.answers['change_freeze'] ? 'clear' : 'warning'),
    autofill: (e) => fromAnswer(e, 'change_freeze'),
  },
  {
    id: 'ps_em_version',
    section: 'pre_server',
    when: (e) => e.em.present && e.server.present,
    text: 'EM is the same or higher version than the Server',
    detail: (e) => {
      const c = compareVersions(e.em.version, e.server.version);
      return c === null
        ? 'Versions could not be compared — verify manually.'
        : c >= 0
          ? `EM ${e.em.version} ≥ Server ${e.server.version}. EM is upgraded first, so it stays ≥ Server throughout.`
          : `EM ${e.em.version} is LOWER than Server ${e.server.version} — the Server would run in Compatibility Mode with new features disabled. Upgrade EM first.`;
    },
    risk: (e) => {
      const c = compareVersions(e.em.version, e.server.version);
      return c === null ? 'warning' : c >= 0 ? 'clear' : 'warning';
    },
    autofill: (e) => {
      const c = compareVersions(e.em.version, e.server.version);
      return c !== null && c >= 0 ? fromFact(e, 'em.version') : null;
    },
  },
  {
    id: 'ps_patch_after',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: (e) => `Plan Server patch ${latestPatch(e, 'server')} for after the upgrade`,
    detail: (e) => `Install after upgrading to ${e.target}.`,
    risk: 'clear',
    refs: (e) => patchRefs(e, 'server'),
  },
  {
    id: 'ps_nfs',
    section: 'pre_server',
    when: (e) => e.server.present && e.server.osFamily === 'unix',
    text: 'Server not installed on NFS / VXFS (Control Modules unsupported there for the local agent)',
    detail: 'Check the file system type of the Server home; NFS/VXFS is not supported for Control Modules on the local agent.',
    risk: 'clear',
  },
  {
    id: 'ps_hostname',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'No Server hostname change (otherwise update Authorized Server Host on every agent)',
    detail: 'If the hostname changes, answer "Y" to add the new Server as an authorized server on the agents — KA 000308365.',
    risk: 'clear',
    refs: (e) => refs(ka('KA 000308365')),
  },
  {
    id: 'ps_dcname',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'No Data Center name change (otherwise follow the renaming procedure)',
    detail: 'Review the Upgrade Guide renaming procedure if the Data Center is renamed.',
    risk: 'clear',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'ps_gd_forward',
    section: 'pre_server',
    when: (e) => e.server.present && !!e.server.gdForward && !/not set|default/i.test(e.server.gdForward),
    text: (e) => `CTM_GD_FORWARD is set (${e.server.gdForward}) — timezone jobs need review`,
    detail: 'From 9.0.21, forward ordering cannot be disabled when a Folder Timezone is specified. If GD_FORWARD=N was relied on, remove the timezone selection from those job definitions.',
    risk: 'warning',
  },
  {
    id: 'ps_ctmldnrs',
    section: 'pre_server',
    when: (e) => e.server.present && !!e.server.ctmldnrs && !/^no\b/i.test(e.server.ctmldnrs),
    text: 'ctmldnrs.dat in use — files move to <Server_home>/data on upgrade',
    detail: (e) => `${e.server.ctmldnrs}. On upgrade to 9.0.21.100+ the ctmldnrs.dat files move to <Server_home>/data.`,
    risk: 'warning',
    refs: [REF.ctmldnrs, REF.ctmldnrsBulletin],
  },
  {
    id: 'ps_ka419757',
    section: 'pre_server',
    when: (e) => e.agents.ka419757.length > 0,
    text: (e) => `KA 000419757: agent(s) ${e.agents.ka419757.join(', ')} run RHEL 8.5+ in SSL mode`,
    detail: 'Review KA 000419757 before upgrading the Server — SSL agents on RHEL 8.5+ need the documented steps.',
    risk: 'warning',
    refs: [REF.serverAgentComms],
  },
  {
    id: 'ps_same_unix_users',
    section: 'pre_server',
    when: (e) => e.sameHost === true && e.server.osFamily === 'unix',
    text: 'EM and Server on the same UNIX host — Kafka / zookeeper ports must differ (KA 000374213)',
    detail: 'With separate EM and Server user accounts on one UNIX host, CTM-5074 applies: Kafka services fail on failover unless the ports differ.',
    risk: 'warning',
  },
  {
    id: 'ps_ha',
    section: 'pre_server',
    when: (e) => e.server.present && e.server.ha,
    text: 'Server High Availability — review KA 000386814 steps for the Secondary',
    detail: (e) => `Primary → Secondary order applies.${e.db.family === 'postgres' ? ' If PostgreSQL is upgraded on the Primary, re-do the full replication to the Secondary.' : ''}`,
    risk: 'warning',
    refs: [REF.haInstall],
  },
  {
    id: 'ps_agents_after',
    section: 'pre_server',
    when: (e) => e.server.present && e.agents.count > 0,
    text: 'Agents upgraded AFTER the Server, never concurrently',
    detail: (e) => `${e.agents.count} agents registered. Upgrade the Server first, then agents.`,
    risk: 'clear',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'ps_aix',
    section: 'pre_server',
    when: (e) => /\baix\b/i.test(e.server.osName ?? ''),
    text: 'Server on AIX — end of support planned for the end of 2026',
    detail: 'Factor the platform migration into the plan.',
    risk: 'warning',
    refs: [REF.aixEos],
  },
  {
    id: 'ps_backup',
    section: 'pre_server',
    when: (e) => e.server.present,
    text: 'Backup the existing Server environment',
    detail: 'CRITICAL: full backup of the Server installation and the Server database before starting.',
    risk: 'blocker',
    cmd: (e) => backupCmd(e, 'server'),
    refs: [REF.upgradeGuide],
  },

  // ---- Fallback --------------------------------------------------------------
  {
    id: 'fb_plan',
    section: 'fallback',
    text: 'Documented fallback plan',
    detail: (e) =>
      `Must include: ${e.db.family === 'mssql' ? 'MS SQL RESTORE DATABASE' : e.db.family === 'postgres' ? 'pg_restore' : e.db.family === 'oracle' ? 'Data Pump import / RMAN restore' : 'database restore'} procedure, EM and Server installation rollback, validation checks and a communication plan.${e.answers['fallback_plan'] ? ` Recorded: ${e.answers['fallback_plan']}` : ''}`,
    risk: (e) => (yes(e.answers['fallback_plan']) ? 'clear' : 'blocker'),
    refs: [REF.upgradeGuide],
    autofill: (e) => (yes(e.answers['fallback_plan']) ? fromAnswer(e, 'fallback_plan') : null),
  },
  {
    id: 'fb_test',
    section: 'fallback',
    text: 'Fallback procedure tested before upgrade day',
    detail: 'Prove the database restore and the application rollback in a test environment where possible.',
    risk: 'warning',
    cmd: (e) => restoreTestCmd(e),
    autofill: (e) => (/tested|restore tested|verified/i.test(e.answers['fallback_plan'] ?? '') ? fromAnswer(e, 'fallback_plan') : null),
  },
  {
    id: 'fb_test_plan',
    section: 'fallback',
    text: 'Post-upgrade functional test plan agreed',
    detail: (e) => (e.answers['test_plan'] ? `Recorded: ${e.answers['test_plan']}` : 'Define the smoke tests the verification phase will run.'),
    risk: (e) => (e.answers['test_plan'] ? 'clear' : 'warning'),
    autofill: (e) => fromAnswer(e, 'test_plan'),
  },

  // ---- Upgrade Sequence ------------------------------------------------------
  {
    id: 'seq_sync',
    section: 'sequence',
    when: (e) => e.em.present && e.server.present,
    text: 'Verify scheduling tables are in sync between EM and Server',
    detail: 'Confirm via CCM before stopping anything.',
    risk: 'warning',
    refs: [REF.emSysParams],
  },
  {
    id: 'seq_stop_all',
    section: 'sequence',
    when: (e) => e.sameHost === true,
    text: (e) => `Stop all Control-M components on ${host(e, 'em')} (single outage)`,
    detail: 'EM and Server share the host: stop everything before upgrading. EM first, then Server.',
    risk: 'clear',
    cmd: (e) => stopCmd(e),
  },
  {
    id: 'seq_stop_em',
    section: 'sequence',
    when: (e) => e.sameHost !== true && e.em.present,
    text: (e) => `Stop Control-M/EM on ${host(e, 'em')}`,
    detail: 'Stop all EM components before running the installer.',
    risk: 'clear',
    cmd: (e) => {
      const C = cmt(e.em.osFamily);
      return e.em.osFamily === 'windows'
        ? `${C} CCM → Components → stop each EM component, then stop the Control-M/EM Windows services on ${host(e, 'em')}.`
        : `${C} As the EM owner on ${host(e, 'em')}:\nstop_all`;
    },
  },
  {
    id: 'seq_em_ha_stop',
    section: 'sequence',
    when: (e) => e.em.present && e.em.ha,
    text: 'HA/Distributed: stop the EM Configuration Agent on the Secondary (and EM on any Distributed node)',
    detail: 'KA 000386814 order — Secondary/Distributed nodes are quiesced before the Primary is upgraded.',
    risk: 'warning',
    refs: [REF.haInstall],
  },
  {
    id: 'seq_em_upgrade',
    section: 'sequence',
    when: (e) => e.em.present,
    text: (e) => `Step 1: Upgrade Control-M/EM${e.em.ha ? ' (Primary)' : ''} on ${host(e, 'em')}`,
    detail: (e) => `Run the ${e.target} installer from the media and follow the wizard.`,
    risk: 'clear',
    cmd: (e) => installerCmd(e, 'em'),
    refs: [REF.upgradeGuide],
  },
  {
    id: 'seq_em_pg',
    section: 'sequence',
    when: (e) => e.em.present && e.db.family === 'postgres',
    text: 'Upgrade the dedicated EM PostgreSQL database server (if BMC-supplied)',
    detail: 'PostgreSQL is not upgraded by the Control-M installer. Follow the Upgrade Guide procedure for the bundled database.',
    risk: 'warning',
    refs: [REF.pgUpgrade, REF.pgBulletin],
  },
  {
    id: 'seq_em_ha_upgrade',
    section: 'sequence',
    when: (e) => e.em.present && e.em.ha,
    text: 'HA/Distributed: upgrade the Distributed node(s), then the Secondary EM',
    detail: 'Primary → Distributed → Secondary. Then verify EM on the Primary, start the Distributed node, start the Secondary Configuration Agent and verify HA is connected.',
    risk: 'warning',
    refs: [REF.haInstall],
  },
  {
    id: 'seq_em_verify',
    section: 'sequence',
    when: (e) => e.em.present,
    text: 'Verify EM is running after the upgrade',
    detail: 'All EM components started; the web server bound its port (KA 000286154). Then launch CCM and verify hostnames, ports and definitions.',
    risk: 'clear',
    cmd: (e) =>
      e.em.osFamily === 'windows'
        ? `REM CCM → Components: every EM component "Up". Check the EM web server log for a successful bind.`
        : `# As the EM owner:\nstart_all\n# then CCM → Components: every EM component "Up".`,
    refs: (e) => refs(ka('KA 000286154'), REF.emSysParams),
  },
  {
    id: 'seq_server_stop',
    section: 'sequence',
    when: (e) => e.sameHost !== true && e.server.present,
    text: (e) => `Stop Control-M/Server on ${host(e, 'server')}`,
    detail: 'Shut down the Server and its Configuration Agent before running the installer.',
    risk: 'clear',
    cmd: (e) => {
      const C = cmt(e.server.osFamily);
      return e.server.osFamily === 'windows'
        ? `${C} ctm_menu → Control-M Manager → Shutdown Control-M, then stop the Control-M/Server and Configuration Agent Windows services on ${host(e, 'server')}.`
        : `${C} As the Server owner on ${host(e, 'server')}:\nshut_ctm\nshut_ca`;
    },
  },
  {
    id: 'seq_server_ha_stop',
    section: 'sequence',
    when: (e) => e.server.present && e.server.ha,
    text: 'HA: stop the Server Configuration Agent on the Secondary node',
    detail: 'KA 000386814 — Primary → Secondary order.',
    risk: 'warning',
    refs: [REF.haInstall],
  },
  {
    id: 'seq_server_upgrade',
    section: 'sequence',
    when: (e) => e.server.present,
    text: (e) => `Step 2: Upgrade Control-M/Server${e.server.ha ? ' (Primary)' : ''} on ${host(e, 'server')}`,
    detail: 'BMC_INST_CTM_APIGTW_PORT=8393 must be set in the launching session.',
    risk: 'clear',
    cmd: (e) => installerCmd(e, 'server'),
    refs: [REF.upgradeGuide],
  },
  {
    id: 'seq_server_pg',
    section: 'sequence',
    when: (e) => e.server.present && e.db.family === 'postgres',
    text: 'Upgrade the dedicated Server PostgreSQL database server (if BMC-supplied)',
    detail: (e) => `Not done by the installer.${e.server.ha ? ' Re-do the full replication to the Secondary afterwards.' : ''}`,
    risk: 'warning',
    refs: [REF.pgUpgrade, REF.pgBulletin],
  },
  {
    id: 'seq_server_ha_upgrade',
    section: 'sequence',
    when: (e) => e.server.present && e.server.ha,
    text: 'HA: upgrade the Secondary Server, verify the Primary, start the Secondary Configuration Agent, verify HA connected',
    detail: 'KA 000386814 order.',
    risk: 'warning',
    refs: [REF.haInstall],
  },
  {
    id: 'seq_server_verify',
    section: 'sequence',
    when: (e) => e.server.present,
    text: 'Verify the Server is running after the upgrade',
    detail: 'Server processes up, agents reachable.',
    risk: 'clear',
    cmd: (e) =>
      `${cmt(e.server.osFamily)} As the Server ${e.server.osFamily === 'windows' ? 'administrator' : 'owner'} on ${host(e, 'server')}:\nctm_menu\n${cmt(e.server.osFamily)} → Control-M Manager → Check Control-M status\nctmping -NODEID <agent_nodeid>`,
    refs: [REF.serverUtils],
  },
  {
    id: 'seq_agents',
    section: 'sequence',
    when: (e) => e.server.present && e.agents.count > 0,
    text: (e) => `Step 3: Upgrade Control-M/Agents (${e.agents.count}) — AFTER the Server`,
    detail: (e) =>
      `Server first, then agents.${e.agents.unavailable.length > 0 ? ` Unavailable at collection time: ${e.agents.unavailable.join(', ')}.` : ''}`,
    risk: 'clear',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'seq_clients',
    section: 'sequence',
    when: (e) => e.em.present,
    text: 'Upgrade EM clients',
    detail: (e) =>
      `Full Installation Package, Client Installation Package, or the Control-M Welcome Page. EM stays in Compatibility Mode until ALL clients are upgraded.${e.answers['em_clients'] ? ` Clients: ${e.answers['em_clients']}` : ''}`,
    risk: 'clear',
    refs: [REF.upgradeGuide],
  },

  // ---- Post-Upgrade Verification ---------------------------------------------
  { id: 'v_em_components', section: 'verify', when: (e) => e.em.present, text: 'All EM components and gateways running', risk: 'clear', detail: 'CCM → Components; EM Gateway connected to the Server.' },
  { id: 'v_gui', section: 'verify', when: (e) => e.em.present, text: 'EM client — jobs visible in Planning and Monitoring', risk: 'clear' },
  { id: 'v_order', section: 'verify', when: (e) => e.em.present, text: 'Order a new test table / jobs', risk: 'clear' },
  { id: 'v_defs', section: 'verify', when: (e) => e.em.present, text: 'View job definitions in the EM client', risk: 'clear' },
  { id: 'v_viewpoints', section: 'verify', when: (e) => e.em.present, text: 'Viewpoints load correctly', risk: 'clear' },
  { id: 'v_resources', section: 'verify', when: (e) => e.em.present, text: 'Resources refreshed; add and delete a resource', risk: 'clear' },
  { id: 'v_sysout', section: 'verify', when: (e) => e.em.present, text: 'Access sysout and log files for a job', risk: 'clear' },
  { id: 'v_ajf', section: 'verify', when: (e) => e.em.present, text: 'AJF actions: hold, update, free, rerun', risk: 'clear' },
  { id: 'v_security', section: 'verify', when: (e) => e.em.present, text: 'Security: view or add a user', risk: 'clear' },
  {
    id: 'v_server_jobs',
    section: 'verify',
    when: (e) => e.server.present,
    text: 'Server: jobs running, all agents connected, agents visible in CCM',
    risk: 'clear',
    cmd: (e) => `${cmt(e.server.osFamily)} On ${host(e, 'server')}:\nctmping -NODEID <agent_nodeid>\n${cmt(e.server.osFamily)} CCM → Agents: every agent Available.`,
    refs: [REF.serverUtils],
  },
  {
    id: 'v_ldap',
    section: 'verify',
    when: (e) => !!e.em.ldap,
    text: 'LDAP / IdP login works after the upgrade',
    detail: (e) => `${e.em.ldap} — log in with a directory user.`,
    risk: 'clear',
  },
  {
    id: 'v_ai',
    section: 'verify',
    when: (e) => e.em.aiJobTypes > 0,
    text: (e) => `Application Integrator: ${e.em.aiJobTypes} deployed job type${e.em.aiJobTypes === 1 ? '' : 's'} still run`,
    detail: 'Run one job of each deployed AI job type.',
    risk: 'clear',
  },
  {
    id: 'v_aapi',
    section: 'verify',
    when: (e) => e.em.present,
    text: 'Automation API + CTM CLI functioning',
    detail: 'The CTM CLI must be updated to match the upgraded AAPI. AAPI CLI is no longer supported on Amazon Linux 2, SUSE 12, RHEL 7, Oracle Linux 7, CentOS 7 (Node.js 18+ required — KA 000419428).',
    risk: 'clear',
    cmd: (e) => `ctm session login -e https://${host(e, 'em')}:8443/automation-api -u <user> -p <password>`,
    refs: (e) => refs(REF.aapiDocs, ka('KA 000419428')),
  },
  {
    id: 'v_other_addons',
    section: 'verify',
    when: (e) => e.em.present,
    text: 'Any other add-ons confirmed with the customer (BIM, Forecast, Self Service, WCM, MFT, Archiving, Workflow Insights) — run their checks',
    detail: 'Not visible in the archive. If none are installed, mark N/A.',
    risk: 'clear',
  },
  {
    id: 'v_test_plan',
    section: 'verify',
    when: (e) => !!e.answers['test_plan'],
    text: 'Run the agreed functional test plan',
    detail: (e) => `Recorded: ${e.answers['test_plan']}`,
    risk: 'clear',
  },

  // ---- Post-Upgrade Tasks ----------------------------------------------------
  { id: 'pt_backup', section: 'post', text: 'Backup the new EM + Server environment', detail: 'Full backup after the successful upgrade.', risk: 'clear' },
  {
    id: 'pt_roles',
    section: 'post',
    when: (e) => e.em.present && e.target === '9.0.22',
    text: 'Assign user authorizations to roles (new in 9.0.22)',
    detail: 'In 9.0.22 authorizations are assigned to roles only; user access is set when a user is associated to a role. Migrate the existing authorization model.',
    risk: 'warning',
    refs: [REF.upgradeReqs],
  },
  {
    id: 'pt_em_patch',
    section: 'post',
    when: (e) => e.em.present,
    text: (e) => `Install EM patch ${latestPatch(e, 'em')}`,
    risk: 'clear',
    refs: (e) => patchRefs(e, 'em'),
  },
  {
    id: 'pt_server_patch',
    section: 'post',
    when: (e) => e.server.present,
    text: (e) => `Install Server patch ${latestPatch(e, 'server')}`,
    risk: 'clear',
    refs: (e) => patchRefs(e, 'server'),
  },
  {
    id: 'pt_compat_off',
    section: 'post',
    when: (e) => e.em.present,
    text: 'Disable Compatibility Mode — ONLY after ALL EM clients are upgraded',
    detail: (e) =>
      `IRREVERSIBLE — cannot be re-enabled once off.${e.answers['compat_mode'] ? ` Current: ${e.answers['compat_mode']}.` : ''} CCM → Manage → Compatibility Mode → "I have read and understand" → Turn Off.`,
    risk: 'blocker',
    refs: (e) => refs(REF.compatMode, ka('KA 000401828')),
  },
  {
    id: 'pt_pg_153',
    section: 'post',
    when: (e) => e.db.family === 'postgres' && e.target === '9.0.22',
    text: 'Upgrade PostgreSQL 11.5 → 15.3 (BMC-supplied PostgreSQL)',
    detail: 'PostgreSQL 11.5 may not be supported on 9.0.22.100 — upgrade soon after the Control-M upgrade.',
    risk: 'warning',
    refs: [REF.pgUpgrade, REF.pgBulletin],
  },
  {
    id: 'pt_cms',
    section: 'post',
    when: (e) => !!e.answers['cm_inventory'] && !no(e.answers['cm_inventory']),
    text: 'Open a separate case for Control Module migration',
    detail: (e) => `Recorded: ${e.answers['cm_inventory']}. CMs on the local agent are not upgraded in place.`,
    risk: 'warning',
  },
  {
    id: 'pt_considerations',
    section: 'post',
    text: 'Review post-upgrade considerations (KA 000415171)',
    risk: 'clear',
    refs: (e) => refs(ka('KA 000415171')),
  },
];
