# AMIGO Data Collection Guide — Where Every Answer Comes From

Purpose: before filling out the AMIGO checklist, collect these resources from the Control-M
environment. Every checklist question maps to a command, console screen, file, or query below.
Windows syntax shown first (most common); UNIX equivalents noted where they differ.

---

## 1. Identity & Versions (Questionnaire Q1/Q2, EM & Server "Existing Environment" sections)

| Checklist question | Data source | How to collect |
|---|---|---|
| EM / Server version + fix pack | Control-M Configuration Manager (CCM) | CCM → Components pane shows each component's version incl. fix pack. Also `Help → About` in the EM client. |
| Installed fix packs & patches | installed-versions.txt | Check `<EM_home>\installed-versions.txt` and `<Server_home>\installed-versions.txt` — lists every installed package (DROST/PANFT/PACTV/PAOST entries). |
| Server version (CLI) | ctm_menu | Run `ctm_menu` as the Server account — version shows in the banner. |
| Hostname | OS | `hostname` |
| Operating System & version | OS | Windows: `systeminfo | findstr /B /C:"OS Name" /C:"OS Version"` · UNIX: `cat /etc/os-release` |
| Database type & version | SQL query | MS SQL: `sqlcmd -S <dbhost> -Q "SELECT @@VERSION"` · PostgreSQL: from Server account run `sql` then `select version();` · Oracle: `select * from v$version;` |
| Database host/instance | Server config | Connection details were set at install; DBA team or the Server's DB config confirm host + instance (e.g., `TBSQL85W\OLTP`). |

## 2. Topology (HA / Distributed / same-host / multiple servers / cloud)

| Question | Data source | How to collect |
|---|---|---|
| EM HA or Distributed? | CCM | Secondary EM / Distributed EM appear as components in CCM. If only one EM host is listed → standalone. |
| Server HA? | CCM | Secondary Server component visible in CCM if configured. |
| EM + Server on same machine? | hostnames | Compare hostnames from section 1. Same host → single outage window; check same/different drive for KA 000404872. |
| More than one Server on this box? | Windows Services | `Get-Service | Select-String "Control-M"` — multiple Server service instances indicate multiple Servers (KA 000406529). |
| Cloud environment? | Infrastructure team | AWS/Azure/GCP hosting confirmation (KA 000223209 if yes). |
| Upgrading to same or different machine? | Project plan | Migration to a different machine is NOT covered under AMIGO. |

## 3. Capacity & Sizing

| Question | Data source | How to collect |
|---|---|---|
| Free disk space (12 GB EM / 10-12 GB Server) | OS | Windows: `Get-PSDrive C,D` or File Explorer · UNIX: `df -h <install_path>` — capture the number and date (like the sandbox's "85GB free on D as of 7/27"). |
| Estimated daily jobs (EM Active / Server AJF) | CCM Usage Alerts | CCM → Manage → Usage Alerts shows daily task usage per component. Alternative: `ctmruninf -listall <from-date> <to-date>` for run statistics. |

## 4. Configuration State

| Question | Data source | How to collect |
|---|---|---|
| Compatibility Mode enabled + version | CCM | CCM → Manage → Compatibility Mode — shows on/off and the compatibility version (must be > 9.0.19 for the 9.0.22 upgrade). |
| LDAP / IdP / SSL configured? | CCM | CCM → Security → Authentication settings; SSL status in System Configuration. |
| GD_FORWARD changed? | config.dat | `findstr GD_FORWARD "<Server_home>\data\config.dat"` — also check CTM_GD_FORWARD in CCM system parameters. No entry = default. |
| Using ctmldnrs.dat? | File check | `dir "<Server_home>\data\ctmldnrs*"` (9.0.21.100+ location) or Server home; `ctmldnrs -LISTLOAD` shows current load-balancing state. |
| Server exe/script dir in PATH + SQL access | Shell test | `echo %PATH%` then run `sql` as the Server admin — if it opens a DB session, both conditions pass (KA 000358019 if not). |
| External Java set | Shell test | `echo %BMC_JAVA_HOME%` and `"%BMC_JAVA_HOME%\bin\java" -version` — compare to KA 000401084. |
| Run-as owners clean (NOTIMPL) | ctmsetown | `ctmsetown -action list` as Server admin AND as EM admin. Paste full output into the Remarks column (exactly as done in the sandbox example). Zero NOTIMPL lines required. |

## 5. Add-on Component Inventory (EM checklist add-on block)

| Component | How to confirm it's installed |
|---|---|
| Batch Impact Manager, Forecast, Self Service, Workload Change Manager, Workload Archiving, Workflow Insights | CCM → Components pane — each installed add-on appears as its own component. |
| Automation API (AAPI) | CCM shows the Automation API server + version. CLI version: `ctm -v` on any machine using the CLI. |
| Application Integrator | Deployed AI job types visible in Planning; AI designer in Control-M Web. |
| Managed File Transfer | MFT appears as a plug-in on its host agent (CCM → Agent → plug-ins) and in Web. |
| Control Modules on the Server's LOCAL agent | CCM → Agents → select local agent → installed plug-ins; or list `<agent_home>\cm\` on disk. CMs are NOT upgraded in-place — each found CM needs a migration case. |

## 6. Agent Fleet (Server checklist)

| Question | Data source | How to collect |
|---|---|---|
| Agent inventory: versions + OS | ctmgetcm / Web | `ctmgetcm -DISPLAY ALL` from the Server, or Control-M Web → Configuration → Agents (shows version, OS, status per agent). Export the list. |
| Agents on RHEL 8.5+ in SSL mode? | Web agent list + comm settings | Cross-reference agent OS column with SSL setting in agent properties (KA 000419757 if yes). |
| Agents connected to only ONE Server? | Agent config | CCM → Agent → Properties → Authorized Servers per agent; more than one active authorized Server = unsupported dual-server condition. |
| AAPI jobs on agents + agent OS support | Web agent list | Identify agents running AAPI jobs; confirm their OS supports Node.js v18+ (KA 000419428 lists dropped OSes). |
| Agent upgraded concurrently? | Project plan | Note current agent version (sandbox: already 9.0.22.100) — Server upgrades FIRST. |

## 7. External Environment

| Question | Data source | How to collect |
|---|---|---|
| Firewall rules verified | netstat + firewall team | `netstat -an | findstr "<EM/Server/Agent ports>"` on each host; confirm rules with network team for EM↔Server and Server↔Agent ports. |
| Antivirus / monitoring on the machine | Services + AV console | `Get-Service | Where-Object {$_.Status -eq "Running"}` review + AV/monitoring console (sandbox example: WhatsUp Gold — needs maintenance-mode step in the plan). Capture the product names. |
| NFS or VXFS file system (UNIX) | df | `df -T <Server_home>` — nfs/vxfs types flag the Control Module limitation. N/A on Windows. |
| In-house scripts compatibility | Script inventory | List custom scripts calling Control-M utilities; owners verify against 9.0.22 utility changes. |

## 8. Readiness Utilities (run and attach output)

| Utility | Command | Output to attach |
|---|---|---|
| check_req | `<media>\CheckReq\checkReqRun.bat` | Pass/fail summary |
| is_upgrade_ready | `<media>\UpgradeReady\upgrade_ready\is_upgrade_ready.bat -p em` (and `-p ctm` for Server) | "All upgrade readiness checks passed." or the issue list. The `-p` flag targets the product, as used in the sandbox plan. |
| ctmsetown | `ctmsetown -action list` | Full output pasted to Remarks |

## 9. The Shortcut — ctm_data_collector (HCU)

The HCU `ctm_data_collector` utility packages versions, configuration files, and logs from an
environment into one archive. A single run collects evidence for a large share of the checklist:
versions and fix packs, config.dat (GD_FORWARD), installed components, and host details.
Recommended flow: run the collector on the EM and Server hosts, then harvest checklist answers
from the archive instead of visiting each source individually. (This is also the automation
seed — a parser over the collector archive can pre-fill most of the AMIGO spreadsheet.)

---

## One-Shot Collection Script (Windows PowerShell)

Run as the Control-M service account on each Control-M host; attach the output file to the AMIGO case.

```powershell
$out = "$env:USERPROFILE\Desktop\amigo_collect_$(hostname)_$(Get-Date -f yyyyMMdd).txt"
"=== AMIGO Data Collection — $(hostname) — $(Get-Date) ===" | Tee-Object $out
"--- OS ---" | Tee-Object $out -Append
systeminfo | findstr /B /C:"OS Name" /C:"OS Version" | Tee-Object $out -Append
"--- Disk ---" | Tee-Object $out -Append
Get-PSDrive -PSProvider FileSystem | Format-Table Name,@{n="FreeGB";e={[math]::Round($_.Free/1GB,1)}} | Out-String | Tee-Object $out -Append
"--- Env vars ---" | Tee-Object $out -Append
"BMC_JAVA_HOME=$env:BMC_JAVA_HOME" | Tee-Object $out -Append
"--- Java ---" | Tee-Object $out -Append
& "$env:BMC_JAVA_HOME\bin\java" -version 2>&1 | Tee-Object $out -Append
"--- Control-M services ---" | Tee-Object $out -Append
Get-Service | Where-Object {$_.DisplayName -like "*Control-M*"} | Format-Table Status,DisplayName | Out-String | Tee-Object $out -Append
"--- ctmsetown ---" | Tee-Object $out -Append
ctmsetown -action list 2>&1 | Tee-Object $out -Append
"--- Agents (run on Server host) ---" | Tee-Object $out -Append
ctmgetcm -DISPLAY ALL 2>&1 | Tee-Object $out -Append
"--- GD_FORWARD ---" | Tee-Object $out -Append
Get-ChildItem "C:\Program Files\BMC Software\Control-M Server\ctm_server\data\config.dat" -ErrorAction SilentlyContinue | ForEach-Object { Select-String GD_FORWARD $_ } | Tee-Object $out -Append
"--- installed-versions ---" | Tee-Object $out -Append
Get-ChildItem "C:\Program Files\BMC Software" -Recurse -Filter "installed-versions.txt" -ErrorAction SilentlyContinue | ForEach-Object { "== $($_.FullName) =="; Get-Content $_.FullName } | Tee-Object $out -Append
"Done. Attach $out to the AMIGO case." | Tee-Object $out -Append
```

Note: adjust install paths to the environment. DB version requires a separate
`sqlcmd -S <dbhost> -Q "SELECT @@VERSION"` from a host with SQL tools.
