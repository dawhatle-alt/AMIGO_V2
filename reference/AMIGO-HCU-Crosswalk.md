---
type: meta
status: seeded
tags:
  - hcu
  - amigo
  - crosswalk
---

# AMIGO Checklist ↔ HCU Archive Crosswalk

Maps every AMIGO upgrade-checklist data need to its source inside a
`ctm_data_collector` archive. Purpose: pre-fill the AMIGO spreadsheet from a
single HCU run instead of manual collection. Manual-collection fallbacks live
in the Concierge-Upgrade-Advisor skill (`references/data-collection-guide.md`).

Legend: ✅ direct answer in archive · 🟡 partial/inferable · ❌ not collected (interview required)

## 1. Identity & Versions

| AMIGO question | HCU source | Coverage |
|---|---|---|
| Server version + fix pack + patch history | [[Server-Artifact-installed-versions]] — `CNF_INFO/versions/installed-versions.txt` + `BMCINSTALL/CtmInstalledVersions.<n>.log`. Full PIM history: package, platform, dates, version, install type. | ✅ |
| EM version | [[Artifact-check_config_report-json]] — top-level `version` + `location` (EM_HOME) | ✅ |
| Hostname | [[OS-Network]] — `Hostname.txt` (+ `Nslookup*` for FQDN) | ✅ |
| Operating System + version | [[OS-Hardware]] `HardwareConfig.txt` · [[Server-OS]] / [[Agent-OS]] | ✅ |
| Database type + version | [[db-postgresql]] `pg_settings-table.csv` · [[Server-db-oracle]] · [[Server-db-DBUtils]] — DB flavor identifiable by which section is populated | ✅ |

## 2. Topology

| AMIGO question | HCU source | Coverage |
|---|---|---|
| Server HA configured? | [[Server-HA_TBL_CTM]] HA tables · [[Server-Artifact-SYSPRM-csv]] `MIRRORDB`, `PRIMARY_MIRROR` fields | ✅ |
| EM HA / Distributed? | [[EM-ini]] `CONFIG_HA.INI` presence/content | ✅ |
| EM + Server same host? | Compare `Hostname.txt` across the EM and Server archive roots | ✅ |
| Multiple Servers on one box? | [[Server-CNF_INFO]] `data/env_details.dat` + OS process/service inventory in [[OS-Processes]] | 🟡 |
| Cloud environment? | 🟡 inferable from [[OS-Hardware]] (hypervisor strings) — confirm in interview | 🟡 |
| Same-machine vs migration | ❌ project decision — interview | ❌ |

## 3. Capacity & Sizing

| AMIGO question | HCU source | Coverage |
|---|---|---|
| Estimated daily jobs (EM) | [[Artifact-check_config_report-json]] — `production_size {jobs, executions, users, size}`. **Measured, not estimated** — and the Small/Medium/Large class directly drives the KA 000308729 PSR-document rule in the AMIGO flow. | ✅ |
| AJF size (Server) | [[Server-Artifact-jobs_count-csv]] — job counts by state over time | ✅ |
| Free disk space | [[OS-Disk]] `partitions.txt` — snapshot at collection time; re-verify near cutover | ✅ |

## 4. Configuration State

| AMIGO question | HCU source | Coverage |
|---|---|---|
| External Java set correctly | [[OS-Java]] — `check_java_versions.txt` compares system Java vs EM's JAVA_HOME; `JavaHomeVersion.txt`, `JavaVersion.txt`. Answers the AMIGO Java question *and* pre-validates KA 000401084. | ✅ |
| API gateway port (8393 question) | [[Server-CNF_INFO]] `data/api_gateway_url.dat` | ✅ |
| GD_FORWARD changed? | [[Server-CNF_INFO]] `data/config.dat` — grep GD_FORWARD | ✅ |
| LDAP / IdP configured? | [[EM-LDAP]] — `ldap.conf`, `DirectoryServiceType.cfg`, SSL keystore PEM · [[EM-SSO]] | ✅ |
| SSL in use (Server↔Agent) | [[Server-CNF_INFO-SSL]] `cert/*.plc` (note `site_upgrade_v21.plc` — upgrade-relevant policy) | ✅ |
| ctmldnrs.dat in use? | [[Server-CNF_INFO]] `data/` inventory — presence of ctmldnrs.dat | 🟡 |
| Compatibility Mode status + version | candidate: EM system parameters ([[Check-system_parameters]] / EM PARAMS dump) — **verify field name in a real archive; not yet confirmed in vault** | 🟡 |
| Run-as owners (ctmsetown NOTIMPL) | ❌ `ctmsetown -action list` output not collected; [[Server-CNF_INFO]] `OAP.dat`/`SAP.dat` are candidates but unverified | ❌ |

## 5. Add-on Inventory

| AMIGO question | HCU source | Coverage |
|---|---|---|
| Application Integrator + deployed AI job types | [[EM-AAPI]] — one folder per deployed AI job type with versions (v0, v1, …) | ✅ |
| Workflow Insights installed? | [[EM-WI]] section populated | ✅ |
| Reporting Facility | [[EM-ReportingFacility]] · [[Component-Reporting-Facility]] | ✅ |
| BIM / Forecast / Self Service / WCM / Archiving | 🟡 inferable from [[EM-Services]] microservice configs + component logs in [[EM-Log]] — mapping per add-on not yet documented in vault | 🟡 |
| Control Modules on Server's local agent | 🟡 Agent archive [[Agent-AG_CNF]] — CM presence not explicitly inventoried in current notes | 🟡 |

## 6. Agent Fleet

| AMIGO question | HCU source | Coverage |
|---|---|---|
| Agent inventory (names, versions, OS) | [[Server-AG_TBL_CTM]] — `AGENT_DISCOVERY(_ACTIVE).csv`, `CMR_NODES.csv`, `CMS_AGPRM.csv` — the Server-side agent registry | ✅ |
| Agent availability | [[Server-Artifact-agent-availability]] — `FNC_INFO/ctm_agstat.txt` + discovery CSVs | ✅ |
| Agents authorized to >1 Server (dual-server check) | [[Agent-Artifact-CONFIG-dat]] — agent-side authorized-server settings (requires agent-side collection) | 🟡 |
| RHEL 8.5+ agents in SSL mode (KA 000419757) | Join `AGENT_DISCOVERY` OS column with [[Server-CNF_INFO-SSL]] policies | 🟡 |
| AAPI jobs on agents + Node.js OS support | Agent OS from registry + AAPI deployment from [[EM-AAPI]] | 🟡 |

## 7. External Environment

| AMIGO question | HCU source | Coverage |
|---|---|---|
| Firewall / ports verified | [[OS-Network]] — `Netstat.txt`, `RouteDefinition.txt`, `PingMe.txt`, `etc/hosts` — shows actual listening ports and connectivity at collection time | 🟡 |
| Antivirus / monitoring present | [[OS-Processes]] + [[OS-StartUp]] — AV/monitoring products visible in process and startup inventories (e.g., WhatsUp Gold, CrowdStrike services) | 🟡 |
| NFS / VXFS file system | [[OS-Disk]] `partitions.txt` — fs types on UNIX | 🟡 |
| In-house script compatibility | ❌ interview | ❌ |

## 8. Interview-Only (never in the archive — by design)

Planned upgrade date · downtime window · fallback plan existence · target
version/fix pack · client-upgrade intentions · change-freeze plan ·
post-upgrade test plan · is_upgrade_ready output (run at upgrade time).

## Bottom line

- ~60–70% of the AMIGO environment-fact questions are answerable from one HCU
  archive per host (EM + Server + local agent).
- The strongest hits: [[Server-Artifact-installed-versions]] (versions/patches),
  [[Artifact-check_config_report-json]] `production_size` (measured job volume →
  PSR sizing rule), [[OS-Java]] (external-Java pre-validation),
  [[Server-AG_TBL_CTM]] (whole agent-fleet block), and `api_gateway_url.dat`.
- Confirmed gaps needing interview or a targeted command: ctmsetown NOTIMPL,
  Compatibility Mode status (candidate in system parameters — verify), CM
  inventory on local agent, and all forward-looking project decisions.
- Integration path: AMIGO skill accepts an HCU archive upload → parses per this
  crosswalk → pre-fills the checklist → interview covers only section 8 + gaps.
