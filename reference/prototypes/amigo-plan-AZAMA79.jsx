import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, ExternalLink, CheckCircle2, Circle, Minus, Download, Shield, Database, Server, Monitor, Clock, FileText, Terminal, BookOpen, AlertTriangle } from "lucide-react";

const S = { TODO: "todo", DONE: "done", NA: "na" };

const initialSections = [
  { id:"env", title:"Environment Summary — AZAMA79", icon:"Monitor", items:[
    {id:"e1",text:"Control-M/EM: 9.0.21 FP3 → 9.0.22.000 | Windows Server 2019 | MS SQL | Standalone",status:S.DONE,risk:"clear",detail:"Host: AZAMA79. EM and Server co-located on same Windows machine, same drive.",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"},{l:"PAC Compatibility Tool",u:"https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/"}]},
    {id:"e2",text:"Control-M/Server: 9.0.21 FP3 → 9.0.22.000 | Windows Server 2019 | MS SQL | Standalone",status:S.DONE,risk:"clear",detail:"Same host as EM (AZAMA79). Upgrade EM first, then Server.",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"e3",text:"Add-on Components: BIM, Forecast, AAPI, Self Service, App Integrator, MFT",status:S.DONE,risk:"warning",detail:"6 add-on components identified. Each needs post-upgrade verification. AAPI requires CTM CLI update.",refs:[{l:"KA 000419428 — AAPI CLI OS Support 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pCJgCAM"}]},
    {id:"e4",text:"Daily jobs: EM 0-500K | Server 0-150K",status:S.DONE,risk:"clear",detail:"Medium environment. Review PSR sizing if performance concerns arise.",refs:[{l:"KA 000308729 — PSR Sizing 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000HBdGCAW"}]},
    {id:"e5",text:"Upgrade date: April 1st | Downtime window: NOT SPECIFIED",status:S.TODO,risk:"blocker",detail:"⚠️ Customer has not specified the downtime window. This must be defined before the upgrade. Both EM and Server are on the same host so they share the same outage window.",refs:[{l:"KA 000277312 — AMIGO Program 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000d5lTCAQ"}]},
    {id:"e6",text:"Database: MS SQL (not PostgreSQL) — PostgreSQL upgrade path does NOT apply",status:S.DONE,risk:"clear",detail:"Customer uses MS SQL. The PostgreSQL 11.5→15.3 upgrade steps are not applicable. After upgrading, verify MSSQL external database compatibility.",refs:[{l:"Upgrading External Oracle or MSSQL Database 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"e7",text:"Compatibility Mode: ACTIVE at version 9.0.21.100",status:S.DONE,risk:"warning",detail:"EM is currently running in Compatibility Mode with version 9.0.21.100. This is above the 9.0.19 threshold so upgrade to 9.0.22 is allowed. Customer must plan when to upgrade EM clients and disable Compatibility Mode after upgrade. Remember: once turned off, it CANNOT be re-enabled.",refs:[{l:"Compatibility Mode Documentation 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#CompatibilityMode"},{l:"KA 000401828 — FAQ Compatibility Mode 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDZpCAM"}]},
  ]},
  { id:"risk", title:"🔴 Blockers & Critical Risks", icon:"AlertTriangle", items:[
    {id:"r1",text:"BLOCKER: Agents connected to TWO Servers simultaneously",status:S.TODO,risk:"blocker",detail:"Customer answered 'No' to 'Are agents only connected to one active Server at any one time?' This configuration is explicitly NOT SUPPORTED by BMC. Must be resolved before upgrade. Discuss the architecture — why are agents connected to two servers? Is there a decommission plan for the old server?",refs:[{l:"Server-Agent Communication 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Server-Agent_Communication.htm"}]},
    {id:"r2",text:"BLOCKER: Downtime window not specified",status:S.TODO,risk:"blocker",detail:"Customer has not provided the planned downtime window. Since EM and Server are on the same host, both will be offline simultaneously. Must define the window and validate it's sufficient for the upgrade + verification steps.",refs:[]},
    {id:"r3",text:"BLOCKER: Fallback plan not created or verified",status:S.TODO,risk:"blocker",detail:"Customer has not confirmed a back-out plan. Must create a documented rollback procedure including MS SQL database backup/restore steps before proceeding.",refs:[{l:"Control-M Upgrade Guide — Downgrade 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"r4",text:"Control Modules require separate migration",status:S.TODO,risk:"warning",detail:"Customer confirmed Control Modules exist on the Server's local agent. These are NOT upgraded during in-place upgrade. Customer must open a separate case to migrate Control Module accounts to the new agent.",refs:[]},
    {id:"r5",text:"EM client upgrade plan — not defined",status:S.TODO,risk:"warning",detail:"Customer hasn't confirmed whether EM clients will be upgraded. EM will stay in Compatibility Mode (9.0.21.100) until all clients are upgraded. Must define the client upgrade timeline.",refs:[{l:"Compatibility Mode 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#CompatibilityMode"}]},
    {id:"r6",text:"Customer has NOT reviewed upgrade documentation",status:S.TODO,risk:"warning",detail:"Questions 6-10 on the questionnaire were all answered 'No'. Customer has not reviewed the Upgrade Guide, PAC Tool, or sample upgrade plans. Strongly recommend reviewing these before the upgrade.",refs:[{l:"Control-M 9.0.22 Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"},{l:"PAC Compatibility Tool",u:"https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/"}]},
  ]},
  { id:"pre-em", title:"Pre-Upgrade: Enterprise Manager", icon:"Shield", items:[
    {id:"pe1",text:"Verify OS & DB compatibility via PAC Tool",status:S.TODO,risk:"warning",detail:"Windows Server 2019 + MS SQL — verify both are supported with Control-M 9.0.22 using the PAC tool.",refs:[{l:"PAC Compatibility Tool",u:"https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/"},{l:"9.0.22 Compatibility",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Control-M-9-0-22-Release-Notes/Control-M-Compatibility/"}]},
    {id:"pe2",text:"Run check_req script on AZAMA79",status:S.TODO,risk:"warning",detail:"Verifies OS level and patches meet Control-M 9.0.22 requirements.",cmd:"REM Windows — run from EM installation media:\ncd <install_media>\\CheckReq\ncheckReqRun.bat\n\nREM Outputs whether OS and patches meet requirements.\nREM If issues found, a list of missing requirements appears.",refs:[{l:"Pre-Installation Procedures 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_pre-installation_procedures_on_UNIX.htm"},{l:"EM System Requirements 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Enterprise_Manager_installation.htm#ControlMEMSystemRequirements"}]},
    {id:"pe3",text:"Run ctmsetown -action list — check for NOTIMPL entries",status:S.TODO,risk:"warning",detail:"Customer left this unanswered ('Select one'). Must run before upgrade to check for NOTIMPL entries.",cmd:"REM Run from Windows command prompt as EM Administrator:\nctmsetown -action list\n\nREM Check output for NOTIMPL entries. Example problem:\nREM &ctmagent@FIELD  &bh3jbolpv05@FIELD  &P@FIELD  &NOTIMPL@LINE\nREM\nREM If NOTIMPL found → resolve per KA 000354649",refs:[{l:"ctmsetown Utility 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Utilities/ctmsetown.htm"},{l:"KA 000354649 — NOTIMPL Resolution 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA8DCAU"}]},
    {id:"pe4",text:"Run is_upgrade_ready script",status:S.TODO,risk:"warning",detail:"Customer hasn't run this yet. Available on DROST.9.0.22.000 install file. Verifies OS, disk, DB, Java requirements.",cmd:"REM Windows — from install media:\ncd <install_media>\\UpgradeReady\\upgrade_ready\nis_upgrade_ready.bat\n\nREM Summary of results + path to full report appears.",refs:[{l:"Control-M Upgrade — Verifying Readiness 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"pe5",text:"Latest EM fix pack installed (FP3)",status:S.DONE,risk:"clear",detail:"Customer confirmed FP3 is installed — this is the latest for 9.0.21. ✓",refs:[{l:"9.0.21 Patches",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9021/Patches/"}]},
    {id:"pe6",text:"12 GB+ free disk space on AZAMA79",status:S.DONE,risk:"clear",detail:"Customer confirmed sufficient disk space. ✓",refs:[{l:"System Requirements 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_full_installation_system_requirements.htm"}]},
    {id:"pe7",text:"Set External Java Environment Variable",status:S.TODO,risk:"warning",detail:"Control-M 9.0.22 requires external Java (no longer bundled). Java 17 is recommended — Java 11 end of support has been announced. Must be set BEFORE starting the upgrade.",cmd:"REM Windows — set system environment variable:\nsetx BMC_JAVA_HOME \"C:\\Program Files\\Java\\jdk-17\" /M\n\nREM Verify:\n\"%BMC_JAVA_HOME%\\bin\\java\" -version",refs:[{l:"External Java Installation 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Java_Installation.htm"},{l:"KA 000401084 — Supported Java Versions 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDVGCA2"},{l:"Java 11 End of Support",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9021/Technical-Bulletins/Announcements/Deprecation-and-End-of-Support/Java-11-LTS-on-Control-M-EM-Control-M-Server-Control-M-Agent-Control-M-Plug-ins-and-Control-M-Automation-API-End-of-Support/"}]},
    {id:"pe8",text:"Antivirus / monitoring software exclusions",status:S.TODO,risk:"warning",detail:"Customer left this unanswered. If antivirus or monitoring software is running on AZAMA79, Control-M users, processes, ports, files, and directories must be excluded from scanning before upgrade.",refs:[{l:"Firewall & Security Config 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Firewall.htm"}]},
    {id:"pe9",text:"Firewall rules verified (EM ↔ Server, Server ↔ Agents)",status:S.TODO,risk:"warning",detail:"Customer left this unanswered. Since EM and Server are on the same host, inter-component firewall rules may not apply — but Server↔Agent rules must be verified for the new version.",refs:[{l:"Firewall Configuration 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Firewall.htm"}]},
    {id:"pe10",text:"Latest EM patch 9.0.22.026 — install after upgrade",status:S.TODO,risk:"clear",detail:"Customer was not aware of the latest patch. Plan to install after upgrading to 9.0.22.000.",refs:[{l:"EM Patch 9.0.22.026",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-EM-PANFT-9-0-22-026/"},{l:"All 9.0.22 Patches",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/"}]},
    {id:"pe11",text:"EM client requirements verified (Chrome 78+, Edge 80+, .NET 4.7.2, Java 1.8+)",status:S.TODO,risk:"clear",detail:"Customer answered 'No'. Must verify client machines meet requirements before upgrading clients.",refs:[{l:"EM Upgrade — Client Requirements 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"pe12",text:"LDAP / IdP / SSL — customer did not answer",status:S.TODO,risk:"clear",detail:"If LDAP/IdP/SSL is configured, no need to disable before upgrade. Any new configuration should wait until after upgrade.",refs:[{l:"Upgrade Requirements 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradeRequirementsandConsiderations"}]},
    {id:"pe13",text:"Not upgrading to different machine (in-place confirmed)",status:S.DONE,risk:"clear",detail:"Customer confirmed: same machine upgrade. ✓ (Migration would not be covered under AMIGO.)",refs:[]},
    {id:"pe14",text:"Not upgrading z/OS",status:S.DONE,risk:"clear",detail:"Customer confirmed: No z/OS. ✓",refs:[]},
    {id:"pe15",text:"EM components stop/start verified",status:S.DONE,risk:"clear",detail:"Customer marked this as Done. ✓",refs:[{l:"KA 000286154 — Verify EM Web Server 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000H8URCA0"}]},
    {id:"pe16",text:"Copy EM 9.0.22 installation binary to AZAMA79",status:S.TODO,risk:"clear",detail:"Download and stage before the upgrade window.",refs:[{l:"Obtaining Installation Files 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Introduction_to_Control-M_Installation.htm"}]},
    {id:"pe17",text:"Backup existing EM environment",status:S.TODO,risk:"blocker",detail:"CRITICAL: Full backup of EM installation directory, config files, and MS SQL database before starting. Since EM and Server share the host, consider a single comprehensive backup.",cmd:"REM MS SQL backup (run in SQL Server Management Studio):\nBACKUP DATABASE [ControlM_EM]\nTO DISK = 'D:\\Backups\\ControlM_EM_pre_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nREM Also backup EM installation directory:\nrobocopy \"C:\\Program Files\\BMC Software\\Control-M EM\" \"D:\\Backups\\EM_Install\" /E /R:1",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
  ]},
  { id:"pre-srv", title:"Pre-Upgrade: Control-M/Server", icon:"Server", items:[
    {id:"ps1",text:"Run ctmsetown -action list on Server",status:S.TODO,risk:"warning",detail:"Customer left this unanswered. Must run before upgrade.",cmd:"REM Run from Windows command prompt as Server Administrator:\nctmsetown -action list\n\nREM If NOTIMPL found → resolve per KA 000354649",refs:[{l:"ctmsetown Utility 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Utilities/ctmsetown.htm"},{l:"KA 000354649 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA8DCAU"}]},
    {id:"ps2",text:"Server machine meets minimum requirements",status:S.DONE,risk:"clear",detail:"Customer confirmed. ✓ (Same host as EM.)",refs:[]},
    {id:"ps3",text:"12 GB+ free disk space (Server)",status:S.DONE,risk:"clear",detail:"Customer confirmed. ✓",refs:[]},
    {id:"ps4",text:"Latest Server fix pack installed (FP3)",status:S.DONE,risk:"clear",detail:"Customer confirmed FP3. ✓",refs:[]},
    {id:"ps5",text:"Verify Server exe directory is in system PATH",status:S.TODO,risk:"warning",detail:"Customer left unanswered. Server admin must be able to run SQL to access the database.",cmd:"REM Windows — verify PATH includes Server exe directory:\necho %PATH% | find /I \"Control-M Server\"\n\nREM Test database access:\nsql\n\nREM If 'sql' not found, add exe dir to PATH via System Properties > Environment Variables",refs:[{l:"KA 000358019 — Server exe Not in PATH 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA97CAE"}]},
    {id:"ps6",text:"Set BMC_INST_CTM_APIGTW_PORT=8393",status:S.TODO,risk:"warning",detail:"Required BEFORE Server upgrade to 9.0.22.",cmd:"REM Windows:\nset BMC_INST_CTM_APIGTW_PORT=8393\n\nREM Set BEFORE starting the upgrade procedure.",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"ps7",text:"Set External Java Environment Variable (Server)",status:S.TODO,risk:"warning",detail:"Same requirement as EM — Java 17 recommended.",cmd:"REM Same BMC_JAVA_HOME as EM (shared host):\nsetx BMC_JAVA_HOME \"C:\\Program Files\\Java\\jdk-17\" /M",refs:[{l:"External Java Installation 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Java_Installation.htm"}]},
    {id:"ps8",text:"Change cutoff implemented — no more job/calendar/service changes",status:S.DONE,risk:"clear",detail:"Customer confirmed Done. ✓",refs:[]},
    {id:"ps9",text:"EM is same or higher version than Server",status:S.DONE,risk:"clear",detail:"Both are 9.0.21 FP3 currently. EM will be upgraded first to 9.0.22, ensuring it's always ≥ Server version. ✓",refs:[]},
    {id:"ps10",text:"Latest Server patch 9.0.22.025 — install after upgrade",status:S.TODO,risk:"clear",detail:"Customer was not aware. Plan to install after upgrade.",refs:[{l:"Server Patch 9.0.22.025",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-Server-PACTV-9-0-22-025/"},{l:"All 9.0.22 Patches",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/"}]},
    {id:"ps11",text:"NFS/VXFS file system?",status:S.NA,risk:"clear",detail:"Not applicable — Windows environment.",refs:[]},
    {id:"ps12",text:"Server hostname change?",status:S.DONE,risk:"clear",detail:"Customer confirmed: No hostname change. ✓",refs:[]},
    {id:"ps13",text:"Data Center Name change?",status:S.DONE,risk:"clear",detail:"Customer confirmed: No rename. ✓",refs:[]},
    {id:"ps14",text:"Multiple Servers on same box?",status:S.DONE,risk:"clear",detail:"Customer confirmed: No. Only one Server. ✓",refs:[]},
    {id:"ps15",text:"Server HA configuration?",status:S.NA,risk:"clear",detail:"Customer confirmed: Not Applicable. Standalone Server. ✓",refs:[]},
    {id:"ps16",text:"Agent upgrade planned concurrently",status:S.DONE,risk:"warning",detail:"Customer answered Yes. IMPORTANT: Upgrade the Server FIRST, then agents. Do not upgrade both simultaneously.",refs:[]},
    {id:"ps17",text:"Backup existing Server environment",status:S.TODO,risk:"blocker",detail:"CRITICAL: Full backup of Server installation and MS SQL database.",cmd:"REM MS SQL backup:\nBACKUP DATABASE [ControlM_Server]\nTO DISK = 'D:\\Backups\\ControlM_Server_pre_upgrade.bak'\nWITH FORMAT, INIT, COMPRESSION;\n\nREM Server installation backup:\nrobocopy \"C:\\Program Files\\BMC Software\\Control-M Server\" \"D:\\Backups\\Server_Install\" /E /R:1",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
  ]},
  { id:"fb", title:"Fallback / Back-Out Plan", icon:"Shield", items:[
    {id:"fb1",text:"Create documented fallback plan",status:S.TODO,risk:"blocker",detail:"Customer has not confirmed a back-out plan. Must include: MS SQL database restore procedure, EM and Server installation rollback (uninstall reverts to previous version), validation checks, and communication plan.",refs:[{l:"Control-M Upgrade — Downgrade 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"fb2",text:"Test fallback procedures before upgrade day",status:S.TODO,risk:"warning",detail:"Verify MS SQL restore and application rollback in a test environment if possible.",cmd:"REM Test MS SQL restore:\nRESTORE DATABASE [ControlM_EM_TEST]\nFROM DISK = 'D:\\Backups\\ControlM_EM_pre_upgrade.bak'\nWITH REPLACE, RECOVERY;",refs:[]},
    {id:"fb3",text:"Verify post-upgrade testing plan",status:S.TODO,risk:"warning",detail:"Customer hasn't confirmed a post-upgrade validation plan. Must define functional tests to run after upgrade.",refs:[]},
  ]},
  { id:"upgrade", title:"Upgrade Sequence (Same Host — EM First, Then Server)", icon:"Database", items:[
    {id:"u1",text:"Verify scheduling tables in sync between EM and Server",status:S.TODO,risk:"warning",detail:"Must confirm before starting. Check via CCM.",refs:[{l:"EM System Parameters 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Configuring_Control-M_EM_System_Parameters.htm"}]},
    {id:"u2",text:"Stop all Control-M components on AZAMA79",status:S.TODO,risk:"clear",detail:"Since EM and Server are on the same host, stop everything before upgrading. Shut down EM first, then Server.",cmd:"REM Stop EM components:\nem_ctl stop\n\nREM Stop Server:\nctmsys -action SHUT_AGENT\nshut_ctm\n\nREM Verify all processes stopped",refs:[]},
    {id:"u3",text:"Step 1: Upgrade Control-M/EM on Windows",status:S.TODO,risk:"clear",detail:"Run the upgrade from the installation media. Follow the on-screen wizard.",cmd:"REM From install media directory:\nsetup.exe\nREM Select Control-M/Enterprise Manager option\nREM Follow on-screen instructions",refs:[{l:"Control-M Upgrade Guide — EM on Windows 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"u4",text:"Verify EM is running after upgrade",status:S.TODO,risk:"clear",detail:"Confirm all EM components started successfully.",cmd:"em_ctl status",refs:[{l:"KA 000286154 — Verify EM Web Server 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000H8URCA0"}]},
    {id:"u5",text:"Launch CCM — verify EM components, hostnames, ports",status:S.TODO,risk:"clear",detail:"Open Control-M Configuration Manager and verify all definitions are correct.",refs:[{l:"EM System Parameters 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Configuring_Control-M_EM_System_Parameters.htm"}]},
    {id:"u6",text:"Step 2: Upgrade Control-M/Server on Windows",status:S.TODO,risk:"clear",detail:"Ensure BMC_INST_CTM_APIGTW_PORT=8393 is set before starting.",cmd:"REM Verify env var:\necho %BMC_INST_CTM_APIGTW_PORT%\nREM Should output: 8393\n\nREM From install media:\nsetup.exe\nREM Select Control-M/Server option",refs:[{l:"Control-M Upgrade Guide — Server on Windows 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"u7",text:"Verify Server is running after upgrade",status:S.TODO,risk:"clear",detail:"",cmd:"ctm_menu\nREM Or:\nctmgetcm -DISPLAY ALL",refs:[{l:"Server Utilities 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Server_Utils.htm"}]},
    {id:"u8",text:"Step 3: Upgrade Control-M/Agents (AFTER Server)",status:S.TODO,risk:"clear",detail:"Customer confirmed agents will be upgraded concurrently. IMPORTANT: Server must complete first, then agents.",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
    {id:"u9",text:"Upgrade EM Clients",status:S.TODO,risk:"clear",detail:"Options: Full Installation Package, Client Installation Package, or Welcome Page. Until all clients upgraded, EM stays in Compatibility Mode (9.0.21.100).",refs:[{l:"Control-M Upgrade Guide 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]},
  ]},
  { id:"verify", title:"Post-Upgrade Verification", icon:"CheckCircle2", items:[
    {id:"v1",text:"Verify all EM Components and Gateways running",status:S.TODO,risk:"clear",detail:"",cmd:"em_ctl status",refs:[]},
    {id:"v2",text:"EM GUI — verify jobs in Planning & Monitoring",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v3",text:"Order new test jobs",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v4",text:"View job definitions in EM GUI",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v5",text:"Verify viewpoints load correctly",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v6",text:"Test adding/deleting resources",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v7",text:"Access sysout and log files for a job",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v8",text:"AJF actions: hold, update, free, rerun",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v9",text:"Verify security: view or add a user",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v10",text:"Server: jobs running, agents connected",status:S.TODO,risk:"clear",detail:"",cmd:"ctmgetcm -DISPLAY ALL",refs:[]},
    {id:"v11",text:"Verify BIM is functioning",status:S.TODO,risk:"clear",detail:"Batch Impact Manager — test after upgrade.",refs:[]},
    {id:"v12",text:"Verify Forecast is functioning",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v13",text:"Verify AAPI + CTM CLI functioning",status:S.TODO,risk:"clear",detail:"CTM CLI must be updated along with AAPI upgrade.",cmd:"ctm session login -e https://AZAMA79:8443/automation-api -u <user> -p <pass>",refs:[{l:"Automation API Docs 🔒",u:"https://documents.bmc.com/supportu/API/Monthly/en-US/Documentation/home.htm"}]},
    {id:"v14",text:"Verify Self Service functioning",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v15",text:"Verify Application Integrator functioning",status:S.TODO,risk:"clear",detail:"",refs:[]},
    {id:"v16",text:"Verify MFT functioning",status:S.TODO,risk:"clear",detail:"Run a test MFT job.",refs:[]},
    {id:"v17",text:"Verify EM Gateway status to Server",status:S.TODO,risk:"clear",detail:"Check in CCM that the gateway is connected.",refs:[]},
  ]},
  { id:"post", title:"Post-Upgrade Tasks", icon:"FileText", items:[
    {id:"pt1",text:"Backup new EM + Server environment",status:S.TODO,risk:"clear",detail:"Full backup after successful upgrade.",refs:[]},
    {id:"pt2",text:"Assign user authorizations to roles (new in 9.0.22)",status:S.TODO,risk:"warning",detail:"In 9.0.22, authorizations are assigned to roles only. User access is set when user is associated to a role. Must migrate existing authorization model.",refs:[{l:"Upgrade Requirements — Authorizations 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradeRequirementsandConsiderations"}]},
    {id:"pt3",text:"Install EM patch 9.0.22.026",status:S.TODO,risk:"clear",detail:"",refs:[{l:"EM Patch 9.0.22.026",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-EM-PANFT-9-0-22-026/"}]},
    {id:"pt4",text:"Install Server patch 9.0.22.025",status:S.TODO,risk:"clear",detail:"",refs:[{l:"Server Patch 9.0.22.025",u:"https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-Server-PACTV-9-0-22-025/"}]},
    {id:"pt5",text:"Disable Compatibility Mode (ONLY after ALL clients upgraded)",status:S.TODO,risk:"blocker",detail:"⚠️ IRREVERSIBLE — cannot re-enable once off. Currently at 9.0.21.100. Only turn off after ALL EM clients are on 9.0.22. From CCM → Manage → Compatibility Mode → 'I have read and understand' → Turn Off.",refs:[{l:"Compatibility Mode 🔒",u:"https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#CompatibilityMode"},{l:"KA 000401828 — FAQ 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDZpCAM"}]},
    {id:"pt6",text:"Open separate case for Control Module migration",status:S.TODO,risk:"warning",detail:"Control Modules on the local agent are not upgraded during in-place upgrade. Must open a separate case to migrate.",refs:[]},
    {id:"pt7",text:"Resolve dual-Server agent connectivity issue",status:S.TODO,risk:"blocker",detail:"Agents currently connected to two Servers. This must be resolved — unsupported configuration. Discuss decommission plan.",refs:[]},
    {id:"pt8",text:"Review post-upgrade considerations (KA 000415171)",status:S.TODO,risk:"clear",detail:"",refs:[{l:"KA 000415171 — Post-Upgrade 🔒",u:"https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pCSvCAM"}]},
  ]},
];

const riskColors = {
  blocker:{bg:"bg-red-50",border:"border-red-300",badge:"bg-red-100 text-red-800"},
  warning:{bg:"bg-amber-50",border:"border-amber-300",badge:"bg-amber-100 text-amber-800"},
  clear:{bg:"bg-emerald-50",border:"border-emerald-200",badge:"bg-emerald-100 text-emerald-800"},
};
const iconMap = {Monitor,Shield,Server,Database,FileText,CheckCircle2,AlertTriangle};

function StatusBtn({status,onClick}){
  const icon = status===S.DONE?<CheckCircle2 size={20} className="text-emerald-600"/>:status===S.NA?<Minus size={20} className="text-gray-400"/>:<Circle size={20} className="text-gray-300"/>;
  return <button onClick={onClick} className="flex-shrink-0 hover:opacity-70 transition-opacity">{icon}</button>;
}

export default function Plan(){
  const [sections,setSections]=useState(initialSections);
  const [expanded,setExpanded]=useState({env:true,risk:true});
  const [expandedItems,setExpandedItems]=useState({});
  const [filter,setFilter]=useState("all");

  const toggle=(id)=>setExpanded(p=>({...p,[id]:!p[id]}));
  const toggleItem=(id)=>setExpandedItems(p=>({...p,[id]:!p[id]}));
  const cycle=(sId,iId)=>setSections(p=>p.map(s=>s.id===sId?{...s,items:s.items.map(i=>i.id===iId?{...i,status:i.status===S.TODO?S.DONE:i.status===S.DONE?S.NA:S.TODO}:i)}:s));

  const stats=useMemo(()=>{
    const all=sections.flatMap(s=>s.items);
    const app=all.filter(i=>i.status!==S.NA);
    const done=all.filter(i=>i.status===S.DONE);
    const bl=all.filter(i=>i.risk==="blocker"&&i.status===S.TODO);
    const wa=all.filter(i=>i.risk==="warning"&&i.status===S.TODO);
    return{total:all.length,app:app.length,done:done.length,bl:bl.length,wa:wa.length,pct:app.length?Math.round(done.length/app.length*100):0};
  },[sections]);

  const filtered=useMemo(()=>{
    if(filter==="all")return sections;
    return sections.map(s=>({...s,items:s.items.filter(i=>{
      if(filter==="todo")return i.status===S.TODO;
      if(filter==="blockers")return i.risk==="blocker"&&i.status===S.TODO;
      if(filter==="warnings")return(i.risk==="warning"||i.risk==="blocker")&&i.status===S.TODO;
      return true;
    })})).filter(s=>s.items.length>0);
  },[sections,filter]);

  const exportPlan=()=>{
    let t=`AMIGO UPGRADE PLAN — AZAMA79\nGenerated: ${new Date().toLocaleString()}\nProgress: ${stats.pct}% (${stats.done}/${stats.app})\nBlockers: ${stats.bl} | Actions: ${stats.wa}\n\n🔒 Links marked 🔒 require BMC Support Central login: https://www.bmc.com/support\n\n`;
    sections.forEach(s=>{t+=`${"=".repeat(60)}\n${s.title}\n${"=".repeat(60)}\n`;
      s.items.forEach(i=>{const m=i.status===S.DONE?"✅":i.status===S.NA?"➖":"⬜";const r=i.risk==="blocker"?" 🔴 BLOCKER":i.risk==="warning"?" 🟡 ACTION":"";
        t+=`\n${m}${r} ${i.text}\n`;if(i.detail)t+=`   ${i.detail}\n`;if(i.cmd)t+=`   Command:\n${i.cmd.split("\n").map(l=>"      "+l).join("\n")}\n`;
        if(i.refs?.length){t+=`   References:\n`;i.refs.forEach(r=>t+=`      • ${r.l}: ${r.u}\n`);}});t+="\n";});
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([t],{type:"text/plain"}));a.download="amigo-upgrade-plan-AZAMA79.txt";a.click();
  };

  return(
    <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif"}} className="max-w-3xl mx-auto p-4">
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div className="mb-6"><div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center"><Shield size={20} className="text-white"/></div>
        <div><h1 className="text-xl font-bold text-gray-900">AMIGO Upgrade Plan — AZAMA79</h1>
        <p className="text-sm text-gray-500">Control-M 9.0.21 FP3 → 9.0.22 | EM + Server | Windows 2019 | MS SQL | April 1st</p></div></div></div>

      <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-200">
        <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold text-gray-700">Overall Progress</span>
        <span className="text-2xl font-bold text-blue-600" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{stats.pct}%</span></div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-3"><div className="h-3 rounded-full transition-all duration-500 bg-blue-600" style={{width:`${stats.pct}%`}}/></div>
        <div className="flex gap-4 text-xs flex-wrap"><span className="text-gray-600">{stats.done}/{stats.app} items</span>
        {stats.bl>0&&<span className="text-red-600 font-semibold">🔴 {stats.bl} blockers</span>}
        {stats.wa>0&&<span className="text-amber-600 font-semibold">🟡 {stats.wa} actions needed</span>}</div></div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[{k:"all",l:"All"},{k:"todo",l:"To Do"},{k:"blockers",l:`Blockers (${stats.bl})`},{k:"warnings",l:`Actions (${stats.wa})`}].map(f=>
          <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter===f.k?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{f.l}</button>)}
        <button onClick={exportPlan} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1"><Download size={12}/> Export</button></div>

      <div className="space-y-3">{filtered.map(section=>{
        const Icon=iconMap[section.icon]||FileText;
        const done=section.items.filter(i=>i.status===S.DONE).length;
        const total=section.items.filter(i=>i.status!==S.NA).length;
        const isOpen=expanded[section.id];
        return(<div key={section.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <button onClick={()=>toggle(section.id)} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
            {isOpen?<ChevronDown size={16} className="text-gray-400 flex-shrink-0"/>:<ChevronRight size={16} className="text-gray-400 flex-shrink-0"/>}
            <Icon size={18} className="text-blue-600 flex-shrink-0"/><span className="font-semibold text-sm text-gray-900 flex-1">{section.title}</span>
            <span className="text-xs text-gray-400" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{done}/{total}</span></button>
          {isOpen&&<div className="border-t border-gray-100">{section.items.map(item=>{
            const rc=riskColors[item.risk];const isExp=expandedItems[item.id];
            const hasDetail=item.detail||item.cmd||(item.refs&&item.refs.length>0);
            return(<div key={item.id} className={`border-b border-gray-50 last:border-b-0 ${item.status===S.DONE?"opacity-55":""}`}>
              <div className="flex items-start gap-3 px-4 py-3"><div className="pt-0.5"><StatusBtn status={item.status} onClick={()=>cycle(section.id,item.id)}/></div>
              <div className="flex-1 min-w-0"><div className="flex items-start gap-2 flex-wrap">
                <span className={`text-sm leading-relaxed ${item.status===S.DONE?"line-through text-gray-400":"text-gray-800"}`}>{item.text}</span>
                {item.risk!=="clear"&&item.status===S.TODO&&<span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${rc.badge}`}>{item.risk==="blocker"?"Blocker":"Action Needed"}</span>}</div>
                {hasDetail&&<button onClick={()=>toggleItem(item.id)} className="text-xs text-blue-600 hover:text-blue-800 mt-1.5 flex items-center gap-1 font-medium">
                  {isExp?<ChevronDown size={12}/>:<ChevronRight size={12}/>}{isExp?"Hide details":"Details, commands & references"}</button>}
                {isExp&&hasDetail&&<div className={`mt-2 p-3 rounded-lg ${rc.bg} ${rc.border} border space-y-3`}>
                  {item.detail&&<p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{item.detail}</p>}
                  {item.cmd&&<div><div className="flex items-center gap-1.5 mb-1.5"><Terminal size={12} className="text-gray-500"/><span className="text-xs font-semibold text-gray-600">Command syntax</span></div>
                    <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{item.cmd}</pre></div>}
                  {item.refs&&item.refs.length>0&&<div><div className="flex items-center gap-1.5 mb-1.5"><BookOpen size={12} className="text-gray-500"/><span className="text-xs font-semibold text-gray-600">References</span></div>
                    <div className="space-y-1">{item.refs.map((ref,idx)=><a key={idx} href={ref.u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 hover:underline"><ExternalLink size={10} className="flex-shrink-0"/><span>{ref.l}</span></a>)}</div></div>}
                </div>}</div></div></div>);})}</div>}</div>);})}</div>

      <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
        <p className="font-semibold mb-1">🔒 BMC Documentation Note</p>
        <p>Links marked with 🔒 require a <a href="https://www.bmc.com/support" target="_blank" rel="noopener noreferrer" className="underline font-medium">BMC Support Central login</a>. Log in first, then click doc links. Patch and bulletin links are publicly accessible.</p></div>
      <div className="mt-3 p-4 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-800">
        <p className="font-semibold mb-2">Quick reference</p>
        <div className="grid grid-cols-2 gap-1">
          <a href="https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline"><ExternalLink size={10}/>Upgrade Guide 🔒</a>
          <a href="https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline"><ExternalLink size={10}/>PAC Tool</a>
          <a href="https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline"><ExternalLink size={10}/>All 9.0.22 Patches</a>
          <a href="https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Java_Installation.htm" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline"><ExternalLink size={10}/>Java Installation 🔒</a>
        </div>
        <p className="mt-3 text-blue-600">Click any checkbox to cycle: ⬜ To Do → ✅ Done → ➖ N/A</p></div>
      <p className="text-center text-xs text-gray-400 mt-4">Generated by AMIGO Concierge Upgrade Advisor · BMC Control-M · Customer: AZAMA79</p>
    </div>);
}
