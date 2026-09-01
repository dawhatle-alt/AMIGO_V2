import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Circle, PlayCircle, AlertTriangle, Clock, Terminal, BookOpen, ExternalLink, ShieldAlert, Flag, RotateCcw, Minus, MessageCircle, Send, X, Sparkles } from "lucide-react";

// ---- Runbook: AZAMA79 | 9.0.21 FP3 -> 9.0.22 | Windows 2019 | MS SQL | EM+Server same host ----
const ENV_CONTEXT = `Host: AZAMA79 (single host — EM and Server co-located)
Products: Control-M/EM 9.0.21 FP3 -> 9.0.22.000, Control-M/Server 9.0.21 FP3 -> 9.0.22.000
OS: Windows Server 2019 | Database: MS SQL (NOT PostgreSQL)
Topology: Standalone (no HA, no Distributed)
Add-ons: BIM, Forecast, AAPI, Self Service, Application Integrator, MFT
Compatibility Mode: ACTIVE at 9.0.21.100
Known blockers from AMIGO review: (1) agents were connected to two servers, (2) downtime window was undefined, (3) fallback plan was missing
Downtime window: 8 hours assumed`;

const KA_LIST = `KA 000354649 NOTIMPL entries in ctmsetown | KA 000286154 verify EM web server startup | KA 000401084 supported Java versions | KA 000401828 Compatibility Mode FAQ | KA 000415171 post-upgrade considerations | KA 000419428 AAPI CLI OS support | KA 000308365 authorized server host on agents | KA 000358019 Server exe dir not in PATH | KA 000406529 multiple servers same box | KA 000404872 EM+Server different Windows drives | KA 000277312 AMIGO program`;

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
    cmd: "BACKUP DATABASE [ControlM_EM]\nTO DISK = 'D:\\Backups\\ControlM_EM_pre_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nBACKUP DATABASE [ControlM_Server]\nTO DISK = 'D:\\Backups\\ControlM_Server_pre_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nrobocopy \"C:\\Program Files\\BMC Software\\Control-M EM\" \"D:\\Backups\\EM_Install\" /E /R:1\nrobocopy \"C:\\Program Files\\BMC Software\\Control-M Server\" \"D:\\Backups\\Server_Install\" /E /R:1",
    expect: "'BACKUP DATABASE successfully processed' for both databases.",
    verify: ".bak files non-zero, timestamps today.",
    fail: "Do NOT proceed without verified backups — this is your only rollback path." },
  { id: "a2", phase: "A", title: "Run is_upgrade_ready on AZAMA79", est: 10, risk: "warning",
    cmd: "cd <install_media>\\UpgradeReady\\upgrade_ready\nis_upgrade_ready.bat",
    expect: "All checks passed; report path displayed.",
    verify: "Report shows zero failed checks.",
    fail: "Address each failed check. Common: disk space, OS patches, Java." },
  { id: "a3", phase: "A", title: "Run ctmsetown — confirm no NOTIMPL entries", est: 5, risk: "warning",
    cmd: "ctmsetown -action list",
    expect: "Owner list with no NOTIMPL lines.",
    verify: "Zero NOTIMPL matches.",
    fail: "Resolve per KA 000354649 before proceeding.", ka: { l: "KA 000354649 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA8DCAU" } },
  { id: "a4", phase: "A", title: "Verify Java environment variable", est: 2, risk: "warning",
    cmd: "echo %BMC_JAVA_HOME%\n\"%BMC_JAVA_HOME%\\bin\\java\" -version",
    expect: "Path prints; supported Java version (17 recommended).",
    verify: "Version on KA 000401084 supported list.",
    fail: "setx BMC_JAVA_HOME \"C:\\Program Files\\Java\\jdk-17\" /M — then open NEW cmd window.", ka: { l: "KA 000401084 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDVGCA2" } },
  { id: "a5", phase: "A", title: "Verify API gateway port variable", est: 1, risk: "warning",
    cmd: "echo %BMC_INST_CTM_APIGTW_PORT%",
    expect: "Outputs: 8393", verify: "Exact value 8393.",
    fail: "set BMC_INST_CTM_APIGTW_PORT=8393 in the SAME window you'll run setup from." },
  { id: "a6", phase: "A", title: "Verify install media staged on AZAMA79", est: 2, risk: "clear",
    cmd: "dir <install_media>\\setup.exe",
    expect: "setup.exe present, DROST.9.0.22.000 complete.",
    verify: "File exists, size matches download.", fail: "Re-download from BMC EPD." },
  { id: "a7", phase: "A", title: "Confirm change freeze in effect", est: 2, risk: "clear",
    cmd: "", expect: "No definition/calendar/service changes since cutoff.",
    verify: "Confirm with scheduling team.", fail: "Re-sync and re-verify before shutdown." },
  { id: "a8", phase: "A", title: "Verify antivirus exclusions active", est: 5, risk: "warning",
    cmd: "", expect: "Control-M users, processes, ports, files, directories excluded from AV.",
    verify: "Check AV console exclusion list.", fail: "Add exclusions — AV interference can corrupt the upgrade." },
  { id: "gate1", type: "gate", phase: "B", title: "GO / NO-GO — begin outage", checks: [
    "All pre-flight steps green", "Downtime window is open NOW",
    "Team and escalation contacts ready", "Fallback plan accessible offline",
  ], note: "Passing this gate starts the outage clock." },
  { id: "b1", phase: "B", title: "Notify users and close all EM clients", est: 5, risk: "clear",
    cmd: "", expect: "No active EM client sessions.", verify: "Check sessions in CCM.", fail: "Force-disconnect remaining sessions." },
  { id: "b2", phase: "B", title: "Stop EM components", est: 10, risk: "clear",
    cmd: "em_ctl stop\nem_ctl status",
    expect: "All EM components stopped.", verify: "No EM processes in Task Manager.",
    fail: "Stop lingering services from Windows Services console." },
  { id: "b3", phase: "B", title: "Stop Control-M/Server", est: 5, risk: "clear",
    cmd: "shut_ctm\nctm_menu  (status)",
    expect: "Server and Configuration Agent stopped.", verify: "No ctm processes running.",
    fail: "Use ctm_menu shutdown options; verify SQL connections closed." },
  { id: "ponr", type: "ponr", phase: "C", title: "POINT OF NO RETURN",
    note: "The next step modifies the EM database schema. From here, rollback = restore MS SQL databases + reinstall 9.0.21 FP3. Confirm backups one final time." },
  { id: "c1", phase: "C", title: "Upgrade Control-M/EM", est: 60, risk: "blocker",
    cmd: "setup.exe\nREM Select: Control-M/Enterprise Manager\nREM Follow wizard — in-place upgrade",
    expect: "Wizard completes; no error dialogs.",
    verify: "Install log clean (%TEMP% BMC logs).",
    fail: "STOP. Capture log + screenshot. If unrecoverable, open Rollback panel and execute fallback. Open a NEW SEV-1 case (not the AMIGO case)." },
  { id: "c2", phase: "C", title: "Verify EM services started", est: 10, risk: "warning",
    cmd: "em_ctl status",
    expect: "All components running incl. EM Web Server.",
    verify: "Web server log shows successful bind (KA 000286154).",
    fail: "Review KA 000286154; check port conflicts.", ka: { l: "KA 000286154 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000H8URCA0" } },
  { id: "c3", phase: "C", title: "Launch CCM — verify components and gateways", est: 10, risk: "clear",
    cmd: "", expect: "All components show correct hostname (AZAMA79), ports, definitions.",
    verify: "No red components in CCM.", fail: "Correct definitions; restart affected components." },
  { id: "d1", phase: "D", title: "Re-verify env vars in upgrade session", est: 2, risk: "warning",
    cmd: "echo %BMC_INST_CTM_APIGTW_PORT%\necho %BMC_JAVA_HOME%",
    expect: "8393 and Java path.", verify: "Both print in the SAME cmd window running setup.",
    fail: "set BMC_INST_CTM_APIGTW_PORT=8393 before launching setup." },
  { id: "d2", phase: "D", title: "Upgrade Control-M/Server", est: 45, risk: "blocker",
    cmd: "setup.exe\nREM Select: Control-M/Server",
    expect: "Wizard completes successfully.", verify: "Install log clean; services created.",
    fail: "STOP. Same protocol as EM failure. NEW SEV-1 case." },
  { id: "d3", phase: "D", title: "Verify Server running", est: 10, risk: "warning",
    cmd: "ctm_menu   (status)\nctmgetcm -DISPLAY ALL",
    expect: "Server up; Configuration Agent up.", verify: "ctmgetcm returns component list.",
    fail: "Check <Server_home>\\proclog; verify MS SQL connectivity with 'sql' utility." },
  { id: "e1", phase: "E", title: "Verify EM gateway connects to Server", est: 5, risk: "warning",
    cmd: "", expect: "Gateway green in CCM.", verify: "Connected gateway to AZAMA79 Server.",
    fail: "Restart gateway; verify authorized-host settings.", ka: { l: "KA 000308365 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000HDmyCAG" } },
  { id: "e2", phase: "E", title: "Upgrade Control-M/Agents", est: 20, risk: "clear",
    cmd: "REM Via CCM Agent Deployment, or manually per agent.",
    expect: "Agents at new version.", verify: "ctmgetcm shows agents available at new version.",
    fail: "Upgrade individually; check agent-server communication." },
  { id: "e3", phase: "E", title: "Verify all agents available", est: 5, risk: "clear",
    cmd: "ctmgetcm -DISPLAY ALL",
    expect: "All agents AVAILABLE.", verify: "None DISABLED/UNAVAILABLE.",
    fail: "Check firewall, agent services, authorized server host." },
  { id: "gate2", type: "gate", phase: "F", title: "GO / NO-GO — functional verification", checks: [
    "EM, Server, agents all up at 9.0.22", "No unresolved errors in upgrade logs",
    "Within window with margin for verification",
  ], note: "If NO-GO: continue troubleshooting or execute rollback while still inside the window." },
  { id: "f1", phase: "F", title: "Order test jobs and verify execution", est: 10, risk: "clear",
    cmd: "", expect: "Jobs execute and complete.", verify: "ENDED OK in Monitoring.",
    fail: "Check agent status, ctmsetown credentials, Server logs." },
  { id: "f2", phase: "F", title: "AJF actions: hold, free, rerun", est: 5, risk: "clear",
    cmd: "", expect: "All actions succeed.", verify: "State changes reflect immediately.", fail: "Check gateway sync." },
  { id: "f3", phase: "F", title: "View sysout and job logs", est: 5, risk: "clear",
    cmd: "", expect: "Sysout/logs retrievable.", verify: "Content displays in client.", fail: "Check agent file retrieval settings." },
  { id: "f4", phase: "F", title: "Verify add-ons: BIM, Forecast, Self Service, App Integrator, MFT", est: 15, risk: "warning",
    cmd: "", expect: "Each add-on functions (run one MFT test job).",
    verify: "BIM up; Forecast generates; portals load; MFT job completes.",
    fail: "Check component logs; note non-critical issues for follow-up." },
  { id: "f5", phase: "F", title: "Verify AAPI and CTM CLI", est: 5, risk: "warning",
    cmd: "ctm session login -e https://AZAMA79:8443/automation-api -u <user> -p <pass>\nctm config servers::get",
    expect: "Login succeeds; config returns.", verify: "No version-mismatch warnings.",
    fail: "Update CTM CLI to 9.0.22-matching version.", ka: { l: "KA 000419428 🔒", u: "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pCJgCAM" } },
  { id: "f6", phase: "F", title: "Verify security — view or add a user", est: 5, risk: "clear",
    cmd: "", expect: "User admin works.", verify: "Flag authorization-to-roles migration as post-upgrade task.",
    fail: "Check authorization service logs." },
  { id: "g1", phase: "G", title: "Backup the upgraded environment", est: 20, risk: "warning",
    cmd: "BACKUP DATABASE [ControlM_EM]\nTO DISK = 'D:\\Backups\\ControlM_EM_post_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nBACKUP DATABASE [ControlM_Server]\nTO DISK = 'D:\\Backups\\ControlM_Server_post_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;",
    expect: "Post-upgrade backups complete.", verify: ".bak files with today's timestamp.",
    fail: "Do not end the window without a post-upgrade backup." },
  { id: "g2", phase: "G", title: "Notify users — upgrade complete", est: 5, risk: "clear",
    cmd: "", expect: "Clients reconnect (Compatibility Mode active until clients upgraded).",
    verify: "First users connect successfully.", fail: "Triage connection issues individually." },
  { id: "g3", phase: "G", title: "Log post-upgrade task list", est: 5, risk: "clear",
    cmd: "", expect: "Scheduled: patches 9.0.22.026/025, client upgrades, roles migration, Compatibility Mode decision, CM migration case.",
    verify: "Tasks assigned with owners and dates.", fail: "" },
];

const ROLLBACK = [
  "1. STOP all further upgrade actions. Note the failed step; capture logs/screenshots.",
  "2. Open a NEW SEV-1 case (production) — do NOT raise the AMIGO case severity.",
  "3. Decision: troubleshoot within window vs. roll back. If < 2 hrs remain, roll back.",
  "4. Uninstall the 9.0.22 components (uninstall reverts to previous version where supported).",
  "5. Restore MS SQL databases:\n   RESTORE DATABASE [ControlM_EM] FROM DISK = 'D:\\Backups\\ControlM_EM_pre_upgrade.bak' WITH REPLACE, RECOVERY;\n   RESTORE DATABASE [ControlM_Server] FROM DISK = 'D:\\Backups\\ControlM_Server_pre_upgrade.bak' WITH REPLACE, RECOVERY;",
  "6. If needed, restore installation directories from D:\\Backups.",
  "7. Start EM and Server at 9.0.21 FP3; re-run Phase F verification.",
  "8. Notify users; schedule retry after root cause is understood.",
];

const riskBadge = { blocker: "bg-red-100 text-red-800", warning: "bg-amber-100 text-amber-800", clear: "bg-emerald-100 text-emerald-800" };
function fmt(ms) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, "0")}`; }
function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; }

export default function Runbook() {
  const [status, setStatus] = useState({});
  const [gates, setGates] = useState({});
  const [ponrConfirmed, setPonrConfirmed] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showRollback, setShowRollback] = useState(false);
  const [outageStart, setOutageStart] = useState(null);
  const [now, setNow] = useState(Date.now());
  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef(null);
  const WINDOW_MIN = 480;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);

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

  // ---- AI Advisor Chat ----
  const buildSystemPrompt = () => {
    const cur = seq.find(s => s.id === firstIncomplete);
    const curDesc = cur
      ? cur.type === "gate" ? `At gate: "${cur.title}" (not yet passed)`
      : cur.type === "ponr" ? `At the POINT OF NO RETURN confirmation (before EM upgrade)`
      : `On step: "${cur.title}" (phase ${cur.phase})${cur.cmd ? `. Step command:\n${cur.cmd}` : ""}${cur.fail ? `\nStep failure guidance: ${cur.fail}` : ""}`
      : "All steps complete.";
    return `You are the AMIGO Upgrade Advisor — an embedded assistant inside a live Control-M upgrade runbook. The user is a customer actively performing this upgrade, possibly mid-outage. Be concise, practical, and calm.

CUSTOMER ENVIRONMENT:
${ENV_CONTEXT}

CURRENT RUNBOOK STATE:
Progress: ${stats.done}/${stats.total} steps complete. ${outageStart ? `Outage elapsed: ${fmt(elapsed)} of 8:00 window.` : "Outage has not started yet."}
${curDesc}

RELEVANT BMC KNOWLEDGE ARTICLES (cite by number when applicable):
${KA_LIST}

RULES:
1. Give Windows commands and MS SQL syntax ONLY (this customer is not on UNIX or PostgreSQL).
2. When troubleshooting an error, ask for the exact error text/log snippet if not provided.
3. If the issue is a production failure that blocks the upgrade, remind them: open a NEW Severity 1 case with BMC Support — never raise the AMIGO case severity.
4. If they are past the point of no return and considering rollback, walk them through the rollback decision (time remaining vs. troubleshooting) and reference the runbook's rollback panel.
5. If you are not certain about a BMC-specific behavior, say so and point them to the relevant documentation or KA rather than guessing.
6. Keep answers short — a few sentences or a short numbered list. They are working, not reading.`;
  };

  const sendMessage = async (text) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    const newMsgs = [...messages, { role: "user", content }];
    setMessages(newMsgs);
    setInput("");
    setThinking(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: buildSystemPrompt(),
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const reply = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") || "(no response)";
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: "Sorry — I couldn't reach the advisor service. Try again, and if this persists during a production issue, contact BMC Support directly (new SEV-1 case)." }]);
    } finally {
      setThinking(false);
    }
  };

  const askAboutStep = (step) => {
    setChatOpen(true);
    const num = seq.filter(s => !s.type).indexOf(step) + 1;
    setInput(`I'm on step ${String(num).padStart(2, "0")} (${step.title}). `);
  };
  const reportError = (step) => {
    setChatOpen(true);
    const num = seq.filter(s => !s.type).indexOf(step) + 1;
    setInput(`I hit an error on step ${String(num).padStart(2, "0")} (${step.title}). Here's what I'm seeing: `);
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif" }} className="max-w-3xl mx-auto p-4 pb-24">
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center"><Flag size={20} className="text-white" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Execution Runbook — AZAMA79</h1>
          <p className="text-sm text-gray-500">9.0.21 FP3 → 9.0.22 | EM + Server (same host) | Windows 2019 | MS SQL</p>
        </div>
        <button onClick={() => setShowRollback(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
          <RotateCcw size={14} /> Rollback
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
          <p className="text-xs text-red-800 font-medium">Estimated remaining work exceeds the remaining window. Consider the rollback decision now, not later.</p>
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
                            <div className="flex gap-2 pt-1 flex-wrap">
                              {!isActive && !isDone && !isNa && <button onClick={() => startStep(step.id)} disabled={!isCurrent} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isCurrent ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>Start step</button>}
                              {isActive && <button onClick={() => completeStep(step.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">Mark complete</button>}
                              {!isDone && !isNa && <button onClick={() => naStep(step.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200">N/A</button>}
                              <button onClick={() => askAboutStep(step)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 flex items-center gap-1"><Sparkles size={11} /> Ask AI</button>
                              {(isActive || isCurrent) && <button onClick={() => reportError(step)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1"><AlertTriangle size={11} /> Report error</button>}
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
        <p>If a problem occurs in production, open a NEW Severity 1 case — do not raise the AMIGO case severity. The AI advisor can help troubleshoot, but it does not replace BMC Support for production emergencies.</p>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">Generated by AMIGO Concierge Upgrade Advisor · Execution Runbook · Customer: AZAMA79</p>

      {/* ---- Floating chat button ---- */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 flex items-center gap-2 px-4 py-3 rounded-full bg-violet-600 text-white text-sm font-semibold shadow-lg hover:bg-violet-700 z-40">
          <MessageCircle size={18} /> Upgrade Advisor
        </button>
      )}

      {/* ---- Chat panel ---- */}
      {chatOpen && (
        <div className="fixed bottom-5 right-5 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-300 rounded-2xl shadow-2xl z-50 flex flex-col" style={{ height: "480px" }}>
          <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-violet-600 rounded-t-2xl">
            <Sparkles size={16} className="text-white" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Upgrade Advisor</p>
              <p className="text-xs text-violet-200">Knows your environment & current step</p>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-violet-200 hover:text-white"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-xs text-gray-500 mb-3">Ask anything about your upgrade. I know you're on AZAMA79 (Windows, MS SQL) and where you are in the runbook.</p>
                <div className="space-y-1.5">
                  {["What should I double-check before starting the outage?", "The EM installer is stuck — what do I do?", "How long should the EM upgrade take?"].map((q, i) => (
                    <button key={i} onClick={() => sendMessage(q)} className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 text-gray-700 hover:bg-violet-50 hover:text-violet-700 border border-gray-200">{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-violet-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-gray-100 text-gray-400 text-xs rounded-bl-sm">Thinking…</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-gray-200 flex gap-2">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about your upgrade…" rows={1}
              className="flex-1 resize-none text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" />
            <button onClick={() => sendMessage()} disabled={thinking || !input.trim()}
              className={`px-3 rounded-lg ${thinking || !input.trim() ? "bg-gray-100 text-gray-300" : "bg-violet-600 text-white hover:bg-violet-700"}`}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
