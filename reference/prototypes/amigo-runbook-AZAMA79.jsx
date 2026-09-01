import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Circle, PlayCircle, AlertTriangle, Clock, Terminal, BookOpen, ExternalLink, ShieldAlert, Flag, RotateCcw, Minus } from "lucide-react";

// ---- Runbook: AZAMA79 | 9.0.21 FP3 -> 9.0.22 | Windows 2019 | MS SQL | EM+Server same host ----
const PHASES = [
  { id: "A", name: "Pre-flight (before outage)", est: 57 },
  { id: "B", name: "Shutdown", est: 20 },
  { id: "C", name: "EM upgrade", est: 80 },
  { id: "D", name: "Server upgrade", est: 57 },
  { id: "E", name: "Reconnect & agents", est: 30 },
  { id: "F", name: "Functional verification", est: 45 },
  { id: "G", name: "Wrap-up", est: 30 },
];

const STEPS = [
  { id: "gate0", type: "gate", phase: "A", title: "Readiness gate — blockers must be resolved", checks: [
    "Agents connect to ONE server only (dual-server issue resolved)",
    "Downtime window defined and communicated",
    "Fallback plan documented and MS SQL restore tested",
  ], note: "These were the 3 open blockers from the AMIGO review. Do not proceed until all are confirmed." },

  { id: "a1", phase: "A", title: "Verify backups are complete and current", est: 30, risk: "blocker",
    cmd: "-- SQL Server Management Studio or sqlcmd:\nBACKUP DATABASE [ControlM_EM]\nTO DISK = 'D:\\Backups\\ControlM_EM_pre_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nBACKUP DATABASE [ControlM_Server]\nTO DISK = 'D:\\Backups\\ControlM_Server_pre_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nREM Installation directories:\nrobocopy \"C:\\Program Files\\BMC Software\\Control-M EM\" \"D:\\Backups\\EM_Install\" /E /R:1\nrobocopy \"C:\\Program Files\\BMC Software\\Control-M Server\" \"D:\\Backups\\Server_Install\" /E /R:1",
    expect: "Backup completes with 'BACKUP DATABASE successfully processed' for both databases.",
    verify: "Check .bak file sizes are non-zero and timestamps are from today.",
    fail: "Do NOT proceed without verified backups. Resolve backup errors first — this is your only rollback path." },

  { id: "a2", phase: "A", title: "Run is_upgrade_ready on AZAMA79", est: 10, risk: "warning",
    cmd: "cd <install_media>\\UpgradeReady\\upgrade_ready\nis_upgrade_ready.bat",
    expect: "Summary shows all checks passed; report path displayed.",
    verify: "Open the report — zero failed checks.",
    fail: "Address each failed check before continuing. Common: disk space, OS patches, Java." },

  { id: "a3", phase: "A", title: "Run ctmsetown — confirm no NOTIMPL entries", est: 5, risk: "warning",
    cmd: "REM As EM admin, then as Server admin:\nctmsetown -action list",
    expect: "List of owners with no lines containing NOTIMPL.",
    verify: "Search output for 'NOTIMPL' — must be zero matches.",
    fail: "Resolve per KA 000354649 before proceeding.", ka: { l: "KA 000354649 — NOTIMPL resolution 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA8DCAU" } },

  { id: "a4", phase: "A", title: "Verify Java environment variable", est: 2, risk: "warning",
    cmd: "echo %BMC_JAVA_HOME%\n\"%BMC_JAVA_HOME%\\bin\\java\" -version",
    expect: "Path prints; java -version shows a supported version (Java 17 recommended).",
    verify: "Version matches KA 000401084 supported list.",
    fail: "Set with: setx BMC_JAVA_HOME \"C:\\Program Files\\Java\\jdk-17\" /M — then open a NEW cmd window.", ka: { l: "KA 000401084 — supported Java 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDVGCA2" } },

  { id: "a5", phase: "A", title: "Verify API gateway port variable", est: 1, risk: "warning",
    cmd: "echo %BMC_INST_CTM_APIGTW_PORT%",
    expect: "Outputs: 8393",
    verify: "Exact value 8393.",
    fail: "Set with: set BMC_INST_CTM_APIGTW_PORT=8393 in the SAME window you'll run setup from." },

  { id: "a6", phase: "A", title: "Verify install media staged on AZAMA79", est: 2, risk: "clear",
    cmd: "dir <install_media>\\setup.exe",
    expect: "setup.exe present, DROST.9.0.22.000 package complete.",
    verify: "File exists and size matches download.",
    fail: "Re-download from BMC EPD before the window." },

  { id: "a7", phase: "A", title: "Confirm change freeze in effect", est: 2, risk: "clear",
    cmd: "", expect: "No job definition, calendar, service, or workload policy changes since cutoff.",
    verify: "Confirm with scheduling team.", fail: "If changes occurred, re-sync and re-verify before shutdown." },

  { id: "a8", phase: "A", title: "Verify antivirus exclusions active", est: 5, risk: "warning",
    cmd: "", expect: "Control-M users, processes, ports, files, and directories excluded from AV scanning on AZAMA79.",
    verify: "Check AV console exclusion list.", fail: "Add exclusions before proceeding — AV interference can corrupt the upgrade." },

  { id: "gate1", type: "gate", phase: "B", title: "GO / NO-GO — begin outage", checks: [
    "All pre-flight steps green",
    "Downtime window is open NOW",
    "Team and escalation contacts ready",
    "Fallback plan printed / accessible offline",
  ], note: "Passing this gate starts the outage clock. The elapsed timer begins here." },

  { id: "b1", phase: "B", title: "Notify users and close all EM clients", est: 5, risk: "clear",
    cmd: "", expect: "All users notified; no active EM client sessions.",
    verify: "Check active sessions in CCM.", fail: "Force-disconnect remaining sessions." },

  { id: "b2", phase: "B", title: "Stop EM components", est: 10, risk: "clear",
    cmd: "REM As EM admin on AZAMA79:\nem_ctl stop\n\nREM Verify nothing is running:\nem_ctl status",
    expect: "All EM components report stopped.",
    verify: "em_ctl status shows all down; no EM processes in Task Manager.",
    fail: "Stop lingering services from Windows Services console; kill orphan processes." },

  { id: "b3", phase: "B", title: "Stop Control-M/Server", est: 5, risk: "clear",
    cmd: "REM As Server admin:\nshut_ctm\n\nREM Verify:\nctm_menu  (option: status)",
    expect: "Server and Configuration Agent stopped.",
    verify: "No ctm processes in Task Manager.",
    fail: "Use ctm_menu shutdown options; verify SQL connections closed." },

  { id: "ponr", type: "ponr", phase: "C", title: "POINT OF NO RETURN",
    note: "The next step modifies the EM database schema. From here, rollback = restore MS SQL databases + reinstall 9.0.21 FP3. Confirm backups one final time before continuing." },

  { id: "c1", phase: "C", title: "Upgrade Control-M/EM", est: 60, risk: "blocker",
    cmd: "REM From install media on AZAMA79:\nsetup.exe\nREM Select: Control-M/Enterprise Manager\nREM Follow wizard — accept in-place upgrade of 9.0.21 FP3 installation",
    expect: "Wizard completes with success message; no error dialogs.",
    verify: "Installation log shows no errors (check %TEMP% BMC install logs).",
    fail: "STOP. Capture the log, screenshot the error. If unrecoverable, open the Rollback panel and execute the fallback plan. Open a NEW SEV-1 case (not the AMIGO case)." },

  { id: "c2", phase: "C", title: "Verify EM services started", est: 10, risk: "warning",
    cmd: "em_ctl status",
    expect: "All components running, including EM Web Server.",
    verify: "Web server startup per KA 000286154 — check web server log for successful bind.",
    fail: "Review KA 000286154; check port conflicts; restart individual components.", ka: { l: "KA 000286154 — verify web server 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000H8URCA0" } },

  { id: "c3", phase: "C", title: "Launch CCM — verify components and gateways", est: 10, risk: "clear",
    cmd: "", expect: "All EM components show correct hostname (AZAMA79), ports, and definitions.",
    verify: "No red components in CCM.",
    fail: "Correct definitions in CCM; restart affected components." },

  { id: "d1", phase: "D", title: "Re-verify env vars in upgrade session", est: 2, risk: "warning",
    cmd: "echo %BMC_INST_CTM_APIGTW_PORT%\necho %BMC_JAVA_HOME%",
    expect: "8393 and your Java path.",
    verify: "Both print correctly in the SAME cmd window you'll run setup from.",
    fail: "set BMC_INST_CTM_APIGTW_PORT=8393 before launching setup." },

  { id: "d2", phase: "D", title: "Upgrade Control-M/Server", est: 45, risk: "blocker",
    cmd: "REM Same install media:\nsetup.exe\nREM Select: Control-M/Server\nREM Follow wizard",
    expect: "Wizard completes successfully.",
    verify: "Install log clean; services created.",
    fail: "STOP. Same protocol as EM failure — capture logs, assess, rollback if unrecoverable. NEW SEV-1 case." },

  { id: "d3", phase: "D", title: "Verify Server running", est: 10, risk: "warning",
    cmd: "ctm_menu   (status)\nctmgetcm -DISPLAY ALL",
    expect: "Server up; Configuration Agent up.",
    verify: "ctmgetcm returns component list without errors.",
    fail: "Check Server logs in <Server_home>\\proclog; verify MS SQL connectivity with 'sql' utility." },

  { id: "e1", phase: "E", title: "Verify EM gateway connects to Server", est: 5, risk: "warning",
    cmd: "", expect: "Gateway green in CCM; Server visible from EM.",
    verify: "CCM shows connected gateway to AZAMA79 Server.",
    fail: "Restart gateway; verify Server authorized-host settings.", ka: { l: "KA 000308365 — authorized server host 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000HDmyCAG" } },

  { id: "e2", phase: "E", title: "Upgrade Control-M/Agents", est: 20, risk: "clear",
    cmd: "REM Via CCM Agent Deployment, or manually per agent.\nREM Server is upgraded — agents can now follow.",
    expect: "Agents upgraded and reporting new version.",
    verify: "ctmgetcm -DISPLAY ALL shows agents available at new version.",
    fail: "Upgrade agents individually; check agent-server communication settings." },

  { id: "e3", phase: "E", title: "Verify all agents available", est: 5, risk: "clear",
    cmd: "ctmgetcm -DISPLAY ALL",
    expect: "All agents AVAILABLE.",
    verify: "No agents in DISABLED/UNAVAILABLE state.",
    fail: "Check firewall, agent services, authorized server host on each agent." },

  { id: "gate2", type: "gate", phase: "F", title: "GO / NO-GO — functional verification", checks: [
    "EM, Server, and agents all up at 9.0.22",
    "No unresolved errors from upgrade logs",
    "Within downtime window with margin for verification",
  ], note: "If NO-GO: assess whether to continue troubleshooting or execute rollback while still inside the window." },

  { id: "f1", phase: "F", title: "Order test jobs and verify execution", est: 10, risk: "clear",
    cmd: "", expect: "Test table ordered; jobs execute and complete.",
    verify: "Jobs reach ENDED OK in Monitoring domain.",
    fail: "Check agent status, job owner credentials (ctmsetown), Server logs." },

  { id: "f2", phase: "F", title: "AJF actions: hold, free, rerun", est: 5, risk: "clear",
    cmd: "", expect: "All actions succeed from EM client.",
    verify: "State changes reflect immediately.", fail: "Check gateway sync; restart GUI server." },

  { id: "f3", phase: "F", title: "View sysout and job logs", est: 5, risk: "clear",
    cmd: "", expect: "Sysout and logs retrievable for completed jobs.",
    verify: "Content displays in EM client.", fail: "Check agent file retrieval settings." },

  { id: "f4", phase: "F", title: "Verify add-ons: BIM, Forecast, Self Service, App Integrator, MFT", est: 15, risk: "warning",
    cmd: "", expect: "Each add-on loads and functions (run one MFT test job).",
    verify: "BIM services up; Forecast generates; Self Service portal loads; AI jobs deploy; MFT job completes.",
    fail: "Check component-specific logs; verify services started; note non-critical issues for post-window follow-up." },

  { id: "f5", phase: "F", title: "Verify AAPI and CTM CLI", est: 5, risk: "warning",
    cmd: "ctm session login -e https://AZAMA79:8443/automation-api -u <user> -p <pass>\nctm config servers::get",
    expect: "Login succeeds; server config returns.",
    verify: "No version-mismatch warnings — CLI must be updated to match.",
    fail: "Update CTM CLI to the 9.0.22-matching version.", ka: { l: "KA 000419428 — AAPI CLI support 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pCJgCAM" } },

  { id: "f6", phase: "F", title: "Verify security — view or add a user", est: 5, risk: "clear",
    cmd: "", expect: "User admin functions work.",
    verify: "Note: 9.0.22 moves authorizations to roles — flag the migration as a post-upgrade task.",
    fail: "Check authorization service logs." },

  { id: "g1", phase: "G", title: "Backup the upgraded environment", est: 20, risk: "warning",
    cmd: "BACKUP DATABASE [ControlM_EM]\nTO DISK = 'D:\\Backups\\ControlM_EM_post_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nBACKUP DATABASE [ControlM_Server]\nTO DISK = 'D:\\Backups\\ControlM_Server_post_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;",
    expect: "Post-upgrade backups complete.",
    verify: ".bak files present with today's timestamp.",
    fail: "Resolve and re-run — do not end the window without a post-upgrade backup." },

  { id: "g2", phase: "G", title: "Notify users — upgrade complete", est: 5, risk: "clear",
    cmd: "", expect: "Users informed; clients can reconnect (Compatibility Mode active until clients upgraded).",
    verify: "First users connect successfully.", fail: "Triage connection issues individually." },

  { id: "g3", phase: "G", title: "Log post-upgrade task list", est: 5, risk: "clear",
    cmd: "", expect: "Scheduled: EM patch 9.0.22.026, Server patch 9.0.22.025, client upgrades, authorization-to-roles migration, Compatibility Mode disable decision, Control Module migration case.",
    verify: "Tasks assigned with owners and dates.", fail: "" },
];

const ROLLBACK = [
  "1. STOP all further upgrade actions. Note the exact failed step and capture logs/screenshots.",
  "2. Open a NEW SEV-1 case (production) — do NOT raise the AMIGO case severity.",
  "3. Decision: troubleshoot within window vs. execute rollback. If < 2 hrs remain in window, roll back.",
  "4. Uninstall the 9.0.22 components (uninstall reverts to previous version where supported).",
  "5. Restore MS SQL databases:\n   RESTORE DATABASE [ControlM_EM] FROM DISK = 'D:\\Backups\\ControlM_EM_pre_upgrade.bak' WITH REPLACE, RECOVERY;\n   RESTORE DATABASE [ControlM_Server] FROM DISK = 'D:\\Backups\\ControlM_Server_pre_upgrade.bak' WITH REPLACE, RECOVERY;",
  "6. If needed, restore installation directories from D:\\Backups.",
  "7. Start EM and Server at 9.0.21 FP3; re-run the Phase F functional verification steps.",
  "8. Notify users of restored service; schedule upgrade retry after root cause is understood.",
];

const riskBadge = { blocker: "bg-red-100 text-red-800", warning: "bg-amber-100 text-amber-800", clear: "bg-emerald-100 text-emerald-800" };

function fmt(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; }

export default function Runbook() {
  const [status, setStatus] = useState({});
  const [gates, setGates] = useState({});
  const [ponrConfirmed, setPonrConfirmed] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showRollback, setShowRollback] = useState(false);
  const [outageStart, setOutageStart] = useState(null);
  const [now, setNow] = useState(Date.now());
  const WINDOW_MIN = 480;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const seq = STEPS;
  const firstIncomplete = useMemo(() => {
    for (const s of seq) {
      if (s.type === "gate") { if (!gates[s.id]?.passed) return s.id; continue; }
      if (s.type === "ponr") { if (!ponrConfirmed) return s.id; continue; }
      const st = status[s.id]?.state;
      if (st !== "done" && st !== "na") return s.id;
    }
    return null;
  }, [status, gates, ponrConfirmed]);

  const stats = useMemo(() => {
    const work = seq.filter(s => !s.type);
    const done = work.filter(s => status[s.id]?.state === "done" || status[s.id]?.state === "na").length;
    const estRemaining = work.filter(s => status[s.id]?.state !== "done" && status[s.id]?.state !== "na").reduce((a, s) => a + (s.est || 0), 0);
    return { total: work.length, done, pct: Math.round((done / work.length) * 100), estRemaining };
  }, [status]);

  const elapsed = outageStart ? now - outageStart : 0;
  const windowRemaining = outageStart ? WINDOW_MIN * 60000 - elapsed : null;
  const overBudget = windowRemaining !== null && windowRemaining < stats.estRemaining * 60000;

  const startStep = (id) => setStatus(p => ({ ...p, [id]: { state: "active", startedAt: Date.now() } }));
  const completeStep = (id) => setStatus(p => ({ ...p, [id]: { ...p[id], state: "done", completedAt: Date.now() } }));
  const naStep = (id) => setStatus(p => ({ ...p, [id]: { state: "na", completedAt: Date.now() } }));
  const toggleGateCheck = (gid, idx, total) => setGates(p => {
    const cur = p[gid]?.checks || Array(total).fill(false);
    const next = [...cur]; next[idx] = !next[idx];
    return { ...p, [gid]: { ...p[gid], checks: next } };
  });
  const passGate = (gid) => {
    setGates(p => ({ ...p, [gid]: { ...p[gid], passed: true, passedAt: Date.now() } }));
    if (gid === "gate1" && !outageStart) setOutageStart(Date.now());
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif" }} className="max-w-3xl mx-auto p-4">
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center"><Flag size={20} className="text-white" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Execution Runbook — AZAMA79</h1>
          <p className="text-sm text-gray-500">9.0.21 FP3 → 9.0.22 | EM + Server (same host) | Windows 2019 | MS SQL</p>
        </div>
        <button onClick={() => setShowRollback(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
          <RotateCcw size={14} /> Rollback plan
        </button>
      </div>

      {showRollback && (
        <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-xl">
          <p className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2"><ShieldAlert size={16} /> Rollback / fallback procedure</p>
          {ROLLBACK.map((r, i) => <p key={i} className="text-xs text-red-900 mb-1.5 whitespace-pre-wrap leading-relaxed">{r}</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">Progress</p>
          <p className="text-xl font-bold text-blue-600" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{stats.done}/{stats.total}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">Outage elapsed</p>
          <p className="text-xl font-bold text-gray-800" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{outageStart ? fmt(elapsed) : "—"}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">Window left (of 8h)</p>
          <p className={`text-xl font-bold ${overBudget ? "text-red-600" : "text-gray-800"}`} style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{windowRemaining !== null ? fmt(Math.max(0, windowRemaining)) : "—"}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-1">Est. work left</p>
          <p className="text-xl font-bold text-gray-800" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{Math.floor(stats.estRemaining / 60)}:{String(stats.estRemaining % 60).padStart(2, "0")}</p>
        </div>
      </div>

      {overBudget && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-xl flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-800 font-medium">Estimated remaining work exceeds the remaining window. Consider the rollback decision point now, not later.</p>
        </div>
      )}

      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
        <div className="h-2.5 rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${stats.pct}%` }} />
      </div>

      {PHASES.map(phase => {
        const phaseSteps = seq.filter(s => s.phase === phase.id);
        if (!phaseSteps.length) return null;
        return (
          <div key={phase.id} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Phase {phase.id}</span>
              <span className="text-sm font-semibold text-gray-800">{phase.name}</span>
              <span className="text-xs text-gray-400 ml-auto" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>~{phase.est} min</span>
            </div>

            <div className="space-y-2">
              {phaseSteps.map(step => {
                if (step.type === "gate") {
                  const g = gates[step.id] || {};
                  const checks = g.checks || Array(step.checks.length).fill(false);
                  const allChecked = checks.every(Boolean);
                  const isCurrent = firstIncomplete === step.id;
                  return (
                    <div key={step.id} className={`rounded-xl border-2 p-4 ${g.passed ? "border-emerald-300 bg-emerald-50" : isCurrent ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
                        <Flag size={16} className={g.passed ? "text-emerald-600" : "text-amber-600"} /> {step.title}
                        {g.passed && <span className="text-xs font-medium text-emerald-700 ml-auto">GO · {fmtTime(g.passedAt)}</span>}
                      </p>
                      <p className="text-xs text-gray-600 mb-3">{step.note}</p>
                      {!g.passed && step.checks.map((c, i) => (
                        <label key={i} className="flex items-start gap-2 text-xs text-gray-800 mb-1.5 cursor-pointer">
                          <input type="checkbox" checked={checks[i]} onChange={() => toggleGateCheck(step.id, i, step.checks.length)} className="mt-0.5" disabled={!isCurrent} />
                          {c}
                        </label>
                      ))}
                      {!g.passed && (
                        <button onClick={() => passGate(step.id)} disabled={!allChecked || !isCurrent}
                          className={`mt-2 px-4 py-2 rounded-lg text-xs font-bold ${allChecked && isCurrent ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                          Confirm GO
                        </button>
                      )}
                    </div>
                  );
                }
                if (step.type === "ponr") {
                  const isCurrent = firstIncomplete === step.id;
                  return (
                    <div key={step.id} className={`rounded-xl border-2 p-4 ${ponrConfirmed ? "border-red-200 bg-red-50 opacity-70" : isCurrent ? "border-red-500 bg-red-50" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                      <p className="text-sm font-bold text-red-800 flex items-center gap-2 mb-1"><ShieldAlert size={18} /> {step.title}</p>
                      <p className="text-xs text-red-900 mb-3">{step.note}</p>
                      {!ponrConfirmed ? (
                        <button onClick={() => setPonrConfirmed(true)} disabled={!isCurrent}
                          className={`px-4 py-2 rounded-lg text-xs font-bold ${isCurrent ? "bg-red-600 text-white hover:bg-red-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                          Backups verified — proceed past point of no return
                        </button>
                      ) : <p className="text-xs font-semibold text-red-700">Confirmed — proceeding</p>}
                    </div>
                  );
                }
                const st = status[step.id] || {};
                const isDone = st.state === "done", isNa = st.state === "na", isActive = st.state === "active";
                const isCurrent = firstIncomplete === step.id;
                const isExp = expanded[step.id] ?? (isCurrent || isActive);
                const num = seq.filter(s => !s.type).indexOf(step) + 1;
                return (
                  <div key={step.id} className={`rounded-xl border ${isCurrent || isActive ? "border-blue-400 bg-white shadow-sm" : "border-gray-200 bg-white " + (isDone || isNa ? "opacity-60" : "opacity-80")}`}>
                    <div className="flex items-start gap-3 p-3.5">
                      <div className="pt-0.5">
                        {isDone ? <CheckCircle2 size={20} className="text-emerald-600" /> : isNa ? <Minus size={20} className="text-gray-400" /> : isActive ? <PlayCircle size={20} className="text-blue-600" /> : <Circle size={20} className="text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-400" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{String(num).padStart(2, "0")}</span>
                          <span className={`text-sm font-medium ${isDone ? "line-through text-gray-400" : "text-gray-900"}`}>{step.title}</span>
                          {step.risk !== "clear" && !isDone && !isNa && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskBadge[step.risk]}`}>{step.risk === "blocker" ? "Critical" : "Caution"}</span>}
                          <span className="text-xs text-gray-400 ml-auto flex items-center gap-1"><Clock size={11} />{step.est}m</span>
                        </div>
                        {(st.startedAt || st.completedAt) && (
                          <p className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
                            {st.startedAt && `started ${fmtTime(st.startedAt)}`}{st.completedAt && ` · done ${fmtTime(st.completedAt)}`}
                            {st.startedAt && st.completedAt && ` · took ${Math.max(1, Math.round((st.completedAt - st.startedAt) / 60000))}m`}
                          </p>
                        )}
                        <button onClick={() => setExpanded(p => ({ ...p, [step.id]: !isExp }))} className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1 font-medium">
                          {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{isExp ? "Hide" : "Show"} details
                        </button>
                        {isExp && (
                          <div className="mt-2 space-y-2.5">
                            {step.cmd && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1"><Terminal size={11} /> Run</p>
                                <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{step.cmd}</pre>
                              </div>
                            )}
                            {step.expect && <p className="text-xs text-gray-700"><span className="font-semibold text-gray-500">Expect:</span> {step.expect}</p>}
                            {step.verify && <p className="text-xs text-gray-700"><span className="font-semibold text-gray-500">Verify:</span> {step.verify}</p>}
                            {step.fail && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2"><span className="font-semibold">If it fails:</span> {step.fail}</p>}
                            {step.ka && <a href={step.ka.u} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:underline flex items-center gap-1"><BookOpen size={11} />{step.ka.l}<ExternalLink size={10} /></a>}
                            <div className="flex gap-2 pt-1">
                              {!isActive && !isDone && !isNa && <button onClick={() => startStep(step.id)} disabled={!isCurrent} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isCurrent ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>Start step</button>}
                              {isActive && <button onClick={() => completeStep(step.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">Mark complete</button>}
                              {!isDone && !isNa && <button onClick={() => naStep(step.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200">N/A</button>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <p className="font-semibold mb-1">During the upgrade window</p>
        <p>If a problem occurs in production, open a NEW Severity 1 case — do not raise the AMIGO case severity. Steps unlock in sequence; gates require explicit GO confirmation. Timestamps are recorded for the case audit trail.</p>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">Generated by AMIGO Concierge Upgrade Advisor · Execution Runbook · Customer: AZAMA79</p>
    </div>
  );
}
