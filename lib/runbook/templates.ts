import type { Ref, Risk, RunbookPhase, RunbookStepType } from '@/lib/types/case';
import type { Component, PlanEnv } from '@/lib/plan/env';
import { releaseOf } from '@/lib/plan/env';
import {
  backupCmd,
  cmt,
  host,
  installerCmd,
  latestPatch,
  osNote,
  stopCmd,
  upgradeReadyCmd,
} from '@/lib/plan/templates';
import { ka, REF, refs } from '@/lib/plan/refs';

/**
 * Execution Runbook content — versioned data module (PRD FR-21, FR-22, FR-23).
 *
 * Ported from reference/prototypes/amigo-runbook-AZAMA79-v2.jsx and the
 * upgrade-plan templates. The case document stores only the schema fields
 * (id, phase, type, title, est_min, status, timestamps); everything else
 * here is rendered at view time from the template keyed by step id, so the
 * schema never changes when the wording does.
 */

export const RUNBOOK_VERSION = 'v22';

export interface Phase {
  id: RunbookPhase;
  name: string;
}

export const PHASES: readonly Phase[] = [
  { id: 'A', name: 'Pre-flight (before outage)' },
  { id: 'B', name: 'Shutdown' },
  { id: 'C', name: 'EM upgrade' },
  { id: 'D', name: 'Server upgrade' },
  { id: 'E', name: 'Reconnect & agents' },
  { id: 'F', name: 'Functional verification' },
  { id: 'G', name: 'Wrap-up' },
];

type Str = string | ((e: PlanEnv) => string);

export interface StepTemplate {
  id: string;
  phase: RunbookPhase;
  type: RunbookStepType;
  when?: (e: PlanEnv) => boolean;
  title: Str;
  /** Work steps only. */
  est_min?: number;
  risk?: Risk;
  cmd?: (e: PlanEnv) => string | null;
  expect?: Str;
  verify?: Str;
  /** Failure guidance — also handed to the advisor as focus detail (FR-16). */
  fail?: Str;
  refs?: Ref[] | ((e: PlanEnv) => Ref[]);
  /** Gates: checklist the operator confirms before GO. PONR/gates: note. */
  checks?: (e: PlanEnv) => string[];
  note?: Str;
}

const echoVar = (e: PlanEnv, c: Component, name: string): string =>
  e[c].osFamily === 'windows' ? `echo %${name}%` : `${osNote(e[c].osFamily)}echo $${name}`;

const dbName = (e: PlanEnv): string =>
  e.db.family === 'mssql' ? 'MS SQL' : e.db.family === 'postgres' ? 'PostgreSQL' : e.db.family === 'oracle' ? 'Oracle' : 'the database';

const sourceVersions = (e: PlanEnv): string =>
  [e.em.present ? `EM ${e.em.version ?? '?'}` : null, e.server.present ? `Server ${e.server.version ?? '?'}` : null]
    .filter(Boolean)
    .join(' / ');

function postBackupCmd(e: PlanEnv): string {
  const parts: string[] = [];
  for (const c of ['em', 'server'] as const) {
    if (!e[c].present) continue;
    parts.push(backupCmd(e, c).replace(/pre_upgrade/g, 'post_upgrade'));
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const STEP_TEMPLATES: readonly StepTemplate[] = [
  // ---- A: Pre-flight ---------------------------------------------------------
  {
    id: 'gate0',
    phase: 'A',
    type: 'gate',
    title: 'Readiness gate — blockers must be resolved',
    note: 'Open blockers from the AMIGO review are listed here. Do not proceed until every one is confirmed resolved.',
    checks: (e) => {
      const open = e.risks.filter((r) => r.risk === 'blocker').map((r) => r.title);
      const decisions: string[] = [];
      if (!e.answers['downtime_window']) decisions.push('Downtime window defined and communicated');
      if (!/^\s*(y|yes|true|confirmed|done)/i.test(e.answers['fallback_plan'] ?? '')) {
        decisions.push(`Fallback plan documented and ${dbName(e)} restore tested`);
      }
      const all = [...open, ...decisions];
      return all.length > 0 ? all : ['No open blockers in the Upgrade Plan — readiness confirmed'];
    },
  },
  {
    id: 'a1',
    phase: 'A',
    type: 'step',
    title: 'Verify backups are complete and current',
    est_min: 30,
    risk: 'blocker',
    cmd: (e) =>
      (['em', 'server'] as const)
        .filter((c) => e[c].present)
        .map((c) => backupCmd(e, c))
        .join('\n\n'),
    expect: (e) => `${dbName(e)} backup completes for every Control-M database; installation directory copy completes.`,
    verify: 'Backup files are non-zero and carry today\'s timestamp.',
    fail: 'Do NOT proceed without verified backups — this is the only rollback path.',
  },
  {
    id: 'a2',
    phase: 'A',
    type: 'step',
    title: (e) => `Run is_upgrade_ready on ${[e.em.host, e.server.host].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' and ') || 'each host'}`,
    est_min: 10,
    risk: 'warning',
    cmd: (e) =>
      (['em', 'server'] as const)
        .filter((c) => e[c].present)
        .map((c) => upgradeReadyCmd(e, c))
        .join('\n\n'),
    expect: 'All checks passed; report path displayed.',
    verify: 'Report shows zero failed checks.',
    fail: 'Address each failed check. Common: disk space, OS patches, Java.',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'a3',
    phase: 'A',
    type: 'step',
    title: 'Run ctmsetown — confirm no NOTIMPL entries',
    est_min: 5,
    risk: 'warning',
    cmd: () => 'ctmsetown -action list',
    expect: 'Owner list with no NOTIMPL lines (run as EM admin and as Server admin).',
    verify: 'Zero NOTIMPL matches.',
    fail: 'Resolve per KA 000354649 before proceeding.',
    refs: () => refs(ka('KA 000354649')),
  },
  {
    id: 'a4',
    phase: 'A',
    type: 'step',
    title: 'Verify the external Java environment variable',
    est_min: 2,
    risk: 'warning',
    cmd: (e) => {
      const c: Component = e.em.present ? 'em' : 'server';
      return e[c].osFamily === 'windows'
        ? `echo %BMC_JAVA_HOME%\n"%BMC_JAVA_HOME%\\bin\\java" -version`
        : `${osNote(e[c].osFamily)}echo $BMC_JAVA_HOME\n$BMC_JAVA_HOME/bin/java -version`;
    },
    expect: (e) => `Path prints; a supported Java version (17 recommended)${e.em.javaHomeVersion ? ` — the archive reported ${e.em.javaHomeVersion}` : ''}.`,
    verify: 'Version is on the KA 000401084 supported list.',
    fail: (e) =>
      (e.em.present ? e.em.osFamily : e.server.osFamily) === 'windows'
        ? 'setx BMC_JAVA_HOME "C:\\Program Files\\Java\\jdk-17" /M — then open a NEW command window.'
        : 'export BMC_JAVA_HOME=/usr/java/jdk-17 in the owner profile, then re-login.',
    refs: () => refs(ka('KA 000401084'), REF.javaInstall),
  },
  {
    id: 'a5',
    phase: 'A',
    type: 'step',
    when: (e) => e.server.present,
    title: 'Verify the API gateway port variable',
    est_min: 1,
    risk: 'warning',
    cmd: (e) => echoVar(e, 'server', 'BMC_INST_CTM_APIGTW_PORT'),
    expect: 'Outputs: 8393',
    verify: 'Exact value 8393.',
    fail: (e) =>
      e.server.osFamily === 'windows'
        ? 'set BMC_INST_CTM_APIGTW_PORT=8393 in the SAME window you will run setup from.'
        : 'export BMC_INST_CTM_APIGTW_PORT=8393 in the SAME session you will run setup from.',
  },
  {
    id: 'a6',
    phase: 'A',
    type: 'step',
    title: (e) => `Verify the ${e.target} install media is staged`,
    est_min: 2,
    risk: 'clear',
    cmd: (e) => {
      const c: Component = e.em.present ? 'em' : 'server';
      return e[c].osFamily === 'windows'
        ? `dir <install_media>\\setup.exe`
        : `${osNote(e[c].osFamily)}ls -l <install_media>/setup.sh`;
    },
    expect: (e) => `Installer present on ${[e.em.host, e.server.host].filter(Boolean).join(' and ')}; package complete.`,
    verify: 'File exists and its size matches the download.',
    fail: 'Re-download from BMC EPD.',
    refs: [REF.installIntro],
  },
  {
    id: 'a7',
    phase: 'A',
    type: 'step',
    title: 'Confirm the change freeze is in effect',
    est_min: 2,
    risk: 'clear',
    expect: (e) => `No definition / calendar / service changes since the cutoff${e.answers['change_freeze'] ? ` (${e.answers['change_freeze']})` : ''}.`,
    verify: 'Confirm with the scheduling team.',
    fail: 'Re-sync and re-verify before shutdown.',
  },
  {
    id: 'a8',
    phase: 'A',
    type: 'step',
    title: 'Verify antivirus / monitoring exclusions are active',
    est_min: 5,
    risk: 'warning',
    expect: (e) => {
      const tools = [...e.em.avTools, ...e.server.avTools];
      return `Control-M users, processes, ports, files and directories excluded${tools.length > 0 ? ` in ${[...new Set(tools)].join(', ')}` : ''}.`;
    },
    verify: 'Check the AV / monitoring console exclusion list.',
    fail: 'Add the exclusions — scanning interference can corrupt the upgrade.',
  },

  // ---- B: Shutdown -----------------------------------------------------------
  {
    id: 'gate1',
    phase: 'B',
    type: 'gate',
    title: 'GO / NO-GO — begin outage',
    note: 'Passing this gate starts the outage clock.',
    checks: (e) => [
      'All pre-flight steps green',
      `Downtime window is open NOW${e.answers['downtime_window'] ? ` (${e.answers['downtime_window']})` : ''}`,
      'Team and escalation contacts ready',
      'Fallback plan accessible offline',
    ],
  },
  {
    id: 'b1',
    phase: 'B',
    type: 'step',
    when: (e) => e.em.present,
    title: 'Notify users and close all EM clients',
    est_min: 5,
    risk: 'clear',
    expect: 'No active EM client sessions.',
    verify: 'Check sessions in CCM.',
    fail: 'Force-disconnect the remaining sessions.',
  },
  {
    id: 'b2',
    phase: 'B',
    type: 'step',
    when: (e) => e.em.present && e.em.ha,
    title: 'HA/Distributed: stop the EM Configuration Agent on the Secondary (and EM on any Distributed node)',
    est_min: 5,
    risk: 'warning',
    expect: 'Secondary / Distributed EM processes down.',
    verify: 'No EM processes on the Secondary / Distributed hosts.',
    fail: 'Stop them from the host directly before touching the Primary.',
    refs: [REF.haInstall],
  },
  {
    id: 'b3',
    phase: 'B',
    type: 'step',
    title: (e) => (e.sameHost === true ? `Stop all Control-M components on ${host(e, 'em')}` : 'Stop Control-M/EM, then Control-M/Server'),
    est_min: 15,
    risk: 'clear',
    cmd: (e) => stopCmd(e),
    expect: 'All EM components stopped; Server and Configuration Agent stopped.',
    verify: (e) => (e.em.osFamily === 'windows' || e.server.osFamily === 'windows' ? 'No EM / ctm processes in Task Manager; services stopped.' : 'No EM / ctm processes in ps output.'),
    fail: (e) =>
      e.server.osFamily === 'windows'
        ? 'Stop lingering services from the Windows Services console; verify database connections are closed.'
        : 'Use ctm_menu shutdown options; verify database connections are closed.',
  },
  {
    id: 'b4',
    phase: 'B',
    type: 'step',
    when: (e) => e.server.present && e.server.ha,
    title: 'HA: stop the Server Configuration Agent on the Secondary node',
    est_min: 5,
    risk: 'warning',
    expect: 'Secondary Configuration Agent stopped.',
    verify: 'No CA process on the Secondary.',
    fail: 'Stop it from the Secondary host directly.',
    refs: [REF.haInstall],
  },

  // ---- C: EM upgrade ---------------------------------------------------------
  {
    id: 'ponr',
    phase: 'C',
    type: 'ponr',
    when: (e) => e.em.present,
    title: 'POINT OF NO RETURN',
    note: (e) =>
      `The next step modifies the EM database schema. From here, rollback = restore the ${dbName(e)} databases + reinstall ${sourceVersions(e)}. Confirm backups one final time.`,
  },
  {
    id: 'c1',
    phase: 'C',
    type: 'step',
    when: (e) => e.em.present,
    title: (e) => `Upgrade Control-M/EM${e.em.ha ? ' (Primary)' : ''} on ${host(e, 'em')}`,
    est_min: 60,
    risk: 'blocker',
    cmd: (e) => installerCmd(e, 'em'),
    expect: 'Wizard completes; no error dialogs.',
    verify: (e) => (e.em.osFamily === 'windows' ? 'Install log clean (%TEMP% BMC logs).' : 'Install log clean (installer log under the EM home).'),
    fail: 'STOP. Capture the log and a screenshot. If unrecoverable, open the Rollback panel and execute the fallback. Open a NEW SEV-1 case (not the AMIGO case).',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'c1pg',
    phase: 'C',
    type: 'step',
    when: (e) => e.em.present && e.db.family === 'postgres',
    title: 'Upgrade the dedicated EM PostgreSQL database server (if BMC-supplied)',
    est_min: 30,
    risk: 'warning',
    expect: 'PostgreSQL upgraded per the Upgrade Guide procedure.',
    verify: 'EM connects to the upgraded database.',
    fail: 'Follow the PostgreSQL bulletin; do not continue with a mismatched database.',
    refs: [REF.pgUpgrade, REF.pgBulletin],
  },
  {
    id: 'c1ha',
    phase: 'C',
    type: 'step',
    when: (e) => e.em.present && e.em.ha,
    title: 'HA/Distributed: upgrade the Distributed node(s), then the Secondary EM',
    est_min: 60,
    risk: 'warning',
    expect: 'Each node upgraded in order (Primary → Distributed → Secondary).',
    verify: 'Every node at the target version.',
    fail: 'STOP on the failing node; do not start the Secondary until resolved.',
    refs: [REF.haInstall],
  },
  {
    id: 'c2',
    phase: 'C',
    type: 'step',
    when: (e) => e.em.present,
    title: 'Verify EM services started',
    est_min: 10,
    risk: 'warning',
    cmd: (e) => (e.em.osFamily === 'windows' ? `${cmt('windows')} CCM → Components: every EM component "Up".` : `${osNote(e.em.osFamily)}start_all\n# then CCM → Components: every EM component "Up".`),
    expect: 'All components running, including the EM Web Server.',
    verify: 'Web server log shows a successful bind (KA 000286154).',
    fail: 'Review KA 000286154; check for port conflicts.',
    refs: () => refs(ka('KA 000286154')),
  },
  {
    id: 'c3',
    phase: 'C',
    type: 'step',
    when: (e) => e.em.present,
    title: 'Launch CCM — verify components and gateways',
    est_min: 10,
    risk: 'clear',
    expect: (e) => `All components show the correct hostname (${host(e, 'em')}), ports and definitions.`,
    verify: 'No red components in CCM.',
    fail: 'Correct the definitions; restart the affected components.',
    refs: [REF.emSysParams],
  },
  {
    id: 'c4ha',
    phase: 'C',
    type: 'step',
    when: (e) => e.em.present && e.em.ha,
    title: 'HA: start the Secondary Configuration Agent (and Distributed EM) and verify HA is connected',
    est_min: 10,
    risk: 'warning',
    expect: 'Secondary / Distributed nodes started and connected to the Primary.',
    verify: 'CCM shows HA connected.',
    fail: 'Check network and configuration-agent logs on the Secondary.',
    refs: [REF.haInstall],
  },

  // ---- D: Server upgrade -----------------------------------------------------
  {
    id: 'd1',
    phase: 'D',
    type: 'step',
    when: (e) => e.server.present,
    title: 'Re-verify environment variables in the upgrade session',
    est_min: 2,
    risk: 'warning',
    cmd: (e) => `${echoVar(e, 'server', 'BMC_INST_CTM_APIGTW_PORT')}\n${echoVar(e, 'server', 'BMC_JAVA_HOME').replace(/^# OS NOT DETECTED[^\n]*\n/, '')}`,
    expect: '8393 and the Java path.',
    verify: 'Both print in the SAME session that will run setup.',
    fail: (e) => (e.server.osFamily === 'windows' ? 'set BMC_INST_CTM_APIGTW_PORT=8393 before launching setup.' : 'export BMC_INST_CTM_APIGTW_PORT=8393 before launching setup.'),
  },
  {
    id: 'd2',
    phase: 'D',
    type: 'step',
    when: (e) => e.server.present,
    title: (e) => `Upgrade Control-M/Server${e.server.ha ? ' (Primary)' : ''} on ${host(e, 'server')}`,
    est_min: 45,
    risk: 'blocker',
    cmd: (e) => installerCmd(e, 'server'),
    expect: 'Wizard completes successfully.',
    verify: 'Install log clean; services / processes created.',
    fail: 'STOP. Same protocol as an EM failure: capture logs, decide troubleshoot vs rollback, NEW SEV-1 case.',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'd2pg',
    phase: 'D',
    type: 'step',
    when: (e) => e.server.present && e.db.family === 'postgres',
    title: 'Upgrade the dedicated Server PostgreSQL database server (if BMC-supplied)',
    est_min: 30,
    risk: 'warning',
    expect: (e) => `PostgreSQL upgraded per the Upgrade Guide.${e.server.ha ? ' Full replication re-done to the Secondary.' : ''}`,
    verify: 'Server connects to the upgraded database.',
    fail: 'Follow the PostgreSQL bulletin; do not continue with a mismatched database.',
    refs: [REF.pgUpgrade, REF.pgBulletin],
  },
  {
    id: 'd2ha',
    phase: 'D',
    type: 'step',
    when: (e) => e.server.present && e.server.ha,
    title: 'HA: upgrade the Secondary Server, start its Configuration Agent, verify HA connected',
    est_min: 45,
    risk: 'warning',
    expect: 'Secondary at the target version; HA connected.',
    verify: 'CCM shows the Server HA pair connected.',
    fail: 'Do not fail over until the Secondary is verified.',
    refs: [REF.haInstall],
  },
  {
    id: 'd3',
    phase: 'D',
    type: 'step',
    when: (e) => e.server.present,
    title: 'Verify the Server is running',
    est_min: 10,
    risk: 'warning',
    cmd: (e) => `${osNote(e.server.osFamily)}ctm_menu\n${cmt(e.server.osFamily)} → Control-M Manager → Check Control-M status`,
    expect: 'Server up; Configuration Agent up.',
    verify: 'Status shows the Server processes running.',
    fail: (e) => `Check <Server_home>${e.server.osFamily === 'windows' ? '\\' : '/'}proclog; verify ${dbName(e)} connectivity with the sql utility.`,
    refs: [REF.serverUtils],
  },

  // ---- E: Reconnect & agents -------------------------------------------------
  {
    id: 'e1',
    phase: 'E',
    type: 'step',
    when: (e) => e.em.present && e.server.present,
    title: 'Verify the EM gateway connects to the Server',
    est_min: 5,
    risk: 'warning',
    expect: 'Gateway green in CCM.',
    verify: (e) => `Gateway connected to the ${host(e, 'server')} Server.`,
    fail: 'Restart the gateway; verify the authorized-host settings (KA 000308365).',
    refs: () => refs(ka('KA 000308365')),
  },
  {
    id: 'e2',
    phase: 'E',
    type: 'step',
    when: (e) => e.server.present && e.agents.count > 0,
    title: (e) => `Upgrade Control-M/Agents (${e.agents.count})`,
    est_min: 20,
    risk: 'clear',
    cmd: (e) => `${cmt(e.server.osFamily === 'unknown' ? 'unix' : e.server.osFamily)} Via CCM Agent Deployment, or manually per agent — AFTER the Server.`,
    expect: 'Agents at the new version.',
    verify: 'CCM shows the agents Available at the new version.',
    fail: 'Upgrade individually; check agent–server communication.',
    refs: [REF.upgradeGuide],
  },
  {
    id: 'e3',
    phase: 'E',
    type: 'step',
    when: (e) => e.server.present && e.agents.count > 0,
    title: 'Verify all agents are available',
    est_min: 5,
    risk: 'clear',
    cmd: (e) => `${osNote(e.server.osFamily)}ctmping -NODEID <agent_nodeid>\n${cmt(e.server.osFamily === 'unknown' ? 'unix' : e.server.osFamily)} CCM → Agents: every agent Available.`,
    expect: (e) => `All agents AVAILABLE${e.agents.unavailable.length > 0 ? ` (unavailable at collection: ${e.agents.unavailable.join(', ')} — expected state decided at Gate 0)` : ''}.`,
    verify: 'None DISABLED / UNAVAILABLE.',
    fail: 'Check firewall, agent services, authorized server host.',
    refs: [REF.serverAgentComms],
  },

  // ---- F: Functional verification -------------------------------------------
  {
    id: 'gate2',
    phase: 'F',
    type: 'gate',
    title: 'GO / NO-GO — functional verification',
    note: 'If NO-GO: continue troubleshooting or execute the rollback while still inside the window.',
    checks: (e) => [
      `${[e.em.present ? 'EM' : null, e.server.present ? 'Server' : null, e.agents.count > 0 ? 'agents' : null].filter(Boolean).join(', ')} all up at ${e.target}`,
      'No unresolved errors in the upgrade logs',
      'Within the window with margin for verification',
    ],
  },
  {
    id: 'f1',
    phase: 'F',
    type: 'step',
    title: 'Order test jobs and verify execution',
    est_min: 10,
    risk: 'clear',
    expect: 'Jobs execute and complete.',
    verify: 'ENDED OK in Monitoring.',
    fail: 'Check agent status, ctmsetown credentials, Server logs.',
  },
  {
    id: 'f2',
    phase: 'F',
    type: 'step',
    when: (e) => e.em.present,
    title: 'AJF actions: hold, free, rerun',
    est_min: 5,
    risk: 'clear',
    expect: 'All actions succeed.',
    verify: 'State changes reflect immediately.',
    fail: 'Check gateway sync.',
  },
  {
    id: 'f3',
    phase: 'F',
    type: 'step',
    when: (e) => e.em.present,
    title: 'View sysout and job logs',
    est_min: 5,
    risk: 'clear',
    expect: 'Sysout / logs retrievable.',
    verify: 'Content displays in the client.',
    fail: 'Check agent file-retrieval settings.',
  },
  {
    id: 'f4',
    phase: 'F',
    type: 'step',
    when: (e) => e.em.present,
    title: (e) =>
      e.em.aiJobTypes > 0
        ? `Verify add-ons: Application Integrator (${e.em.aiJobTypes} job type${e.em.aiJobTypes === 1 ? '' : 's'})${e.em.ldap ? ', LDAP login' : ''} and any others confirmed with the customer`
        : `Verify add-ons${e.em.ldap ? ': LDAP login' : ''} confirmed with the customer (BIM, Forecast, Self Service, MFT…)`,
    est_min: 15,
    risk: 'warning',
    expect: 'Each add-on functions (run one job of each AI job type; log in with a directory user).',
    verify: 'Portals load; jobs complete; directory login works.',
    fail: 'Check component logs; note non-critical issues for follow-up.',
  },
  {
    id: 'f5',
    phase: 'F',
    type: 'step',
    when: (e) => e.em.present,
    title: 'Verify Automation API and the CTM CLI',
    est_min: 5,
    risk: 'warning',
    cmd: (e) => `ctm session login -e https://${host(e, 'em')}:8443/automation-api -u <user> -p <password>\nctm config servers::get`,
    expect: 'Login succeeds; config returns.',
    verify: 'No version-mismatch warnings.',
    fail: (e) => `Update the CTM CLI to the ${e.target}-matching version.`,
    refs: () => refs(ka('KA 000419428'), REF.aapiDocs),
  },
  {
    id: 'f6',
    phase: 'F',
    type: 'step',
    when: (e) => e.em.present,
    title: 'Verify security — view or add a user',
    est_min: 5,
    risk: 'clear',
    expect: 'User administration works.',
    verify: (e) => (e.target === '9.0.22' ? 'Flag the authorization-to-roles migration as a post-upgrade task.' : 'Existing authorizations intact.'),
    fail: 'Check the authorization service logs.',
  },
  {
    id: 'f7',
    phase: 'F',
    type: 'step',
    when: (e) => !!e.answers['test_plan'],
    title: 'Run the agreed functional test plan',
    est_min: 15,
    risk: 'clear',
    expect: (e) => `Agreed plan: ${e.answers['test_plan']}`,
    verify: 'Every agreed test passes.',
    fail: 'Record the failing test; decide with the customer whether it blocks sign-off.',
  },

  // ---- G: Wrap-up ------------------------------------------------------------
  {
    id: 'g1',
    phase: 'G',
    type: 'step',
    title: 'Backup the upgraded environment',
    est_min: 20,
    risk: 'warning',
    cmd: (e) => postBackupCmd(e),
    expect: 'Post-upgrade backups complete.',
    verify: 'Backup files with today\'s timestamp.',
    fail: 'Do not end the window without a post-upgrade backup.',
  },
  {
    id: 'g2',
    phase: 'G',
    type: 'step',
    title: 'Notify users — upgrade complete',
    est_min: 5,
    risk: 'clear',
    expect: (e) => (e.em.present ? 'Clients reconnect (Compatibility Mode active until clients are upgraded).' : 'Users informed; Server back in service.'),
    verify: 'First users connect successfully.',
    fail: 'Triage connection issues individually.',
  },
  {
    id: 'g3',
    phase: 'G',
    type: 'step',
    title: 'Log the post-upgrade task list',
    est_min: 5,
    risk: 'clear',
    expect: (e) => {
      const tasks = [
        e.em.present ? `EM patch ${latestPatch(e, 'em')}` : null,
        e.server.present ? `Server patch ${latestPatch(e, 'server')}` : null,
        e.em.present ? 'client upgrades' : null,
        e.em.present && e.target === '9.0.22' ? 'authorizations-to-roles migration' : null,
        e.em.present ? 'Compatibility Mode decision' : null,
        e.db.family === 'postgres' && e.target === '9.0.22' ? 'PostgreSQL 11.5 → 15.3' : null,
        e.answers['cm_inventory'] && !/^\s*(n|no|none)\b/i.test(e.answers['cm_inventory']) ? 'Control Module migration case' : null,
      ].filter(Boolean);
      return `Scheduled: ${tasks.join(', ')}.`;
    },
    verify: 'Tasks assigned with owners and dates.',
  },
];

// ---------------------------------------------------------------------------
// Rollback panel (FR-21: always visible, DB-correct restore syntax)
// ---------------------------------------------------------------------------

export function rollbackSteps(e: PlanEnv): string[] {
  const restore = (['em', 'server'] as const).filter((c) => e[c].present).map((c) => restoreCmd(e, c)).join('\n');
  const fs = (['em', 'server'] as const)
    .filter((c) => e[c].present)
    .map((c) =>
      e[c].osFamily === 'windows'
        ? `robocopy "D:\\Backups\\${c}_home_pre_upgrade" "${e[c].home ?? `<${c}_home>`}" /E /R:1 /W:1`
        : `tar -xzf /backup/${c}_home_pre_upgrade.tgz -C /`,
    )
    .join('\n');
  const start = [
    e.em.present ? (e.em.osFamily === 'windows' ? 'start the Control-M/EM services (or CCM)' : 'start_all') : null,
    e.server.present ? (e.server.osFamily === 'windows' ? 'start the Control-M/Server services' : 'start_ctm; start_ca') : null,
  ]
    .filter(Boolean)
    .join('; ');

  return [
    '1. STOP all further upgrade actions. Note the failed step; capture logs and screenshots.',
    '2. Open a NEW SEV-1 case (production) — do NOT raise the AMIGO case severity.',
    '3. Decision: troubleshoot within the window vs. roll back. If less than 2 hours remain, roll back.',
    `4. Uninstall the ${e.target} components (uninstall reverts to the previous version where supported).`,
    `5. Restore the ${dbName(e)} database(s):\n${restore}`,
    `6. If needed, restore the installation directories from the pre-upgrade backup:\n${fs}`,
    `7. Start ${sourceVersions(e) || 'the previous versions'} — ${start}; re-run the Phase F verification.`,
    '8. Notify users; schedule the retry after the root cause is understood.',
  ];
}

/** Production restore (as opposed to the plan's restore-into-test rehearsal). */
export function restoreCmd(e: PlanEnv, c: Component): string {
  const db = `<${c}_database>`;
  switch (e.db.family) {
    case 'mssql':
      return `RESTORE DATABASE [${db}] FROM DISK = 'D:\\Backups\\${db}_pre_upgrade.bak' WITH REPLACE, RECOVERY;`;
    case 'postgres':
      return `pg_restore -U <db_user> -d ${db} --clean --if-exists /backup/${db}_pre_upgrade.dump`;
    case 'oracle':
      return `impdp <schema>/<password> DIRECTORY=<dump_dir> DUMPFILE=${c}_pre_upgrade.dmp SCHEMAS=<schema> TABLE_EXISTS_ACTION=REPLACE`;
    default:
      return `restore the ${e[c].name} database from the pre-upgrade backup per the DBA's standard`;
  }
}

/** Source release the rollback returns to, for the panel heading. */
export function rollbackTarget(e: PlanEnv): string {
  const rel = releaseOf(e.em.version ?? e.server.version);
  return rel ?? 'the previous version';
}
