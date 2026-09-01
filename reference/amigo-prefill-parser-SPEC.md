# AMIGO Pre-Fill Parser — Specification v0.1

**Suggested repo location:** `_tools/amigo_prefill/SPEC.md` (hcu-knowledge-graph)
**Status:** draft for review — no code written until Phase 0 gate is approved
**Companion:** `AMIGO-HCU-Crosswalk.md` (field coverage) · Concierge-Upgrade-Advisor skill `references/data-collection-guide.md` (manual fallbacks)

---

## 1. Purpose

Deterministically extract environment facts from one or more `ctm_data_collector`
(HCU) archives and pre-fill the customer columns of the AMIGO Starter Checklist
(V22 xlsx). Output is (a) a canonical `environment_facts.json` with per-field
provenance and confidence, and (b) a pre-filled copy of the checklist workbook.
The AMIGO skill then interviews only for gaps and forward-looking decisions.

**Non-goals:** no LLM calls inside the parser (all extraction is deterministic);
no writes to TSA columns; no diagnosis (that's the HCU analysis agent's job).

## 2. Design principles

1. **Two-stage: extract → map.** Stage 1 parses archives into a canonical facts
   model with zero knowledge of the spreadsheet. Stage 2 maps facts onto the
   AMIGO template via a versioned mapping file (`amigo_map_v22.yaml`). When BMC
   ships a V23 checklist, only the map changes.
2. **Provenance on every fact.** Each value records the archive-relative source
   path, the raw text matched, the transform applied, and a confidence tier.
3. **Never guess.** A fact is `MISSING` unless a rule produced it. Missing ≠
   blank: before declaring MISSING, verify the section was actually collected
   (vault retrieval rule #2 — check the collector log first). A section that
   failed to collect yields `UNCOLLECTED`, which the skill reports differently.
4. **Confidence tiers:**
   - `EXACT` — value read verbatim from a structured source
   - `DERIVED` — computed or joined from two or more EXACT values
   - `INFERRED` — heuristic (e.g., DB type by elimination); skill must confirm
   - `MISSING` — section collected but value absent → interview
   - `UNCOLLECTED` — section absent/failed in the archive → re-run collector
5. **Idempotent & read-only** on inputs. The template workbook is copied, never
   modified in place. Auto-filled cells get a Remarks annotation:
   `[HCU auto-fill · <source path> · <confidence>]`.
6. **Sanitize option** (`--sanitize`): hostnames/users replaced with `<hostname>`
   tokens in the JSON (vault convention) for shareable fixtures.

## 3. Inputs & CLI

```
python amigo_prefill.py \
  --archives EM_host.zip Server_host.zip [Agent_host.zip ...] \
  --template AMIGO_Checklist_V22.xlsx \
  --out prefilled_AMIGO_Checklist.xlsx \
  --report environment_facts.json \
  [--sanitize] [--strict]
```

- Archives: zip or tar.gz, one per collected host. Product auto-detected by
  directory signature: `EM/` + `check_config_results` → EM · `CNF_INFO/` +
  `FNC_INFO/` → Server · `AG_CNF/` → Agent.
- Multiple archives merge into one facts model keyed by `(product, host)`.
  Conflict rule: each product's own archive is authoritative for its facts.
- `--strict`: exit non-zero if any extractor raises; default logs and continues.
- Runtime: Python 3.10+, stdlib + `openpyxl` only (matches sev1-weekend-report
  toolchain). No network access.

## 4. Pre-check: collection integrity

Before extraction, read the collector log (`hcu_logs/` per product;
vault: `Artifact-hcu-collector-log`). Build a `collected_sections` set. Any
extractor whose source section is absent from a *successful* collection yields
`MISSING`; absent from a *failed* collection yields `UNCOLLECTED`.

## 5. Extractors (Stage 1)

Each extractor: `id`, source path(s), parse method, produced facts, tier.
IDs are stable — findings and tests reference them.

### Identity & versions

| ID | Source | Method | Facts | Tier |
|---|---|---|---|---|
| X01 | `CNF_INFO/versions/installed-versions.txt` (+ `BMCINSTALL/CtmInstalledVersions.<n>.log`) | Whitespace-table parse; capture package, platform, package_date, install_date, version, type; sort by install_date | `server.version`, `server.fixpack`, `server.patch_history[]` | EXACT |
| X02 | `EM/check_config_results/check_config_report_<ts>.json` (latest by ts) | JSON: `product`, `location`, `version` | `em.version`, `em.home` | EXACT |
| X03 | `OS/Network/Hostname.txt` (per archive) | First non-empty line; FQDN from `Nslookup.txt` if present | `<product>.host`, `<product>.fqdn` | EXACT |
| X04 | `OS/Hardware/HardwareConfig.txt`, OS section files | Regex: Windows `OS Name/OS Version` lines; UNIX `PRETTY_NAME=` | `<host>.os_name`, `<host>.os_version` | EXACT |
| X05 | `db/postgresql/pg_settings-table.csv` → `server_version` row; `Server/db/oracle/*` presence; else elimination | CSV lookup / presence test | `db.type`, `db.version` | EXACT (pg/oracle) / INFERRED (MSSQL by elimination) |

### Topology

| ID | Source | Method | Facts | Tier |
|---|---|---|---|---|
| X06 | `report/SYSPRM.csv` | Single-row CSV: `MIRRORDB`, `PRIMARY_MIRROR`, `SSL_ENBL`, `DAYTIME`, `CURRENT_STATE` | `server.ha`, `server.ssl_enabled`, `server.newday_time` | EXACT |
| X07 | `EM/ini/CONFIG_HA.INI` | Presence + content parse | `em.ha_or_distributed` | EXACT presence / DERIVED detail |
| X08 | Hostname facts from X03 across archives | Equality join | `topology.em_server_same_host` | DERIVED |
| X09 | `CNF_INFO/data/env_details.dat` + `OS/Processes` | Multi-instance signatures | `server.multiple_on_host` | INFERRED |

### Capacity

| ID | Source | Method | Facts | Tier |
|---|---|---|---|---|
| X10 | check_config JSON `production_size` | JSON: `{jobs, executions, users, size}` | `em.daily_jobs`, `em.size_class` (drives PSR/KA 000308729 rule downstream) | EXACT |
| X11 | `report/jobs_count.csv` | Max/typical AJF count by state over window | `server.ajf_size` | DERIVED |
| X12 | `OS/Disk/partitions.txt` | Per-mount free space + fs type; flag nfs/vxfs on UNIX | `<host>.disk_free[]`, `<host>.fs_flags` | EXACT (note: snapshot at collection time) |

### Configuration state

| ID | Source | Method | Facts | Tier |
|---|---|---|---|---|
| X13 | `OS/Java/check_java_versions.txt`, `JavaHomeVersion.txt` | Regex version capture, system vs JAVA_HOME | `<host>.java_home_version`, `<host>.java_system_version` | EXACT |
| X14 | `CNF_INFO/data/api_gateway_url.dat` | Port extraction from URL | `server.apigtw_port` | EXACT |
| X15 | `CNF_INFO/data/config.dat` | Key-value grep `GD_FORWARD` (absent = default) | `server.gd_forward` | EXACT |
| X16 | `CNF_INFO/data/` inventory or `FileList*.txt` | Presence of `ctmldnrs.dat` | `server.ctmldnrs_in_use` | EXACT presence |
| X17 | `EM/LDAP/ldap.conf`, `DirectoryServiceType.cfg`; `EM/SSO/` populated | Presence + type field | `em.ldap`, `em.sso` | EXACT |
| X18 | `CNF_INFO/cert/*.plc` | Policy file inventory (note `site_upgrade_v21.plc`) | `server.ssl_policies[]` | EXACT |
| X19 | EM system-parameters dump (PARAMS) | **Field name for Compatibility Mode unverified — Phase 0 task: confirm against a real archive before implementing** | `em.compat_mode`, `em.compat_version` | TBD |

### Add-ons & agents

| ID | Source | Method | Facts | Tier |
|---|---|---|---|---|
| X20 | `EM/AAPI/ABA<n>/v*/` folders | Directory walk: job type + version list | `em.ai_jobtypes[]` | EXACT |
| X21 | `EM/WI/`, `EM/ReportingFacility/`, `EM/Services/` configs | Presence per add-on via mapping table `addon_signatures.yaml` (maintained in vault, starts minimal) | `em.addons{}` | INFERRED |
| X22 | `AG_TBL_CTM/AGENT_DISCOVERY(_ACTIVE).csv`, `CMR_NODES.csv`, `CMS_AGPRM.csv` | CSV parse: node, version, OS, state | `agents[]` | EXACT |
| X23 | `FNC_INFO/ctm_agstat.txt` | Availability parse | `agents[].available` | EXACT |
| X24 | Agent archive `AG_CNF/data/CONFIG.dat` | Authorized-servers keys | `agents[].authorized_servers` (dual-server flag) | EXACT (agent-side only) |
| X25 | Join X22.os + X18 SSL | RHEL ≥8.5 ∧ SSL → KA 000419757 flag | `flags.ka_000419757` | DERIVED |

### External environment

| ID | Source | Method | Facts | Tier |
|---|---|---|---|---|
| X26 | `OS/Network/Netstat.txt` | Listening-port capture for Control-M port set | `<host>.listening_ports[]` | EXACT |
| X27 | `OS/Processes`, `OS/StartUp` | Known-product name list (`av_signatures.yaml`: crowdstrike, mcafee, defender, whatsup, solarwinds, …) | `<host>.av_monitoring[]` | INFERRED |

### Known non-extractable (emit as gaps, reason `interview`)

Upgrade date · downtime window · fallback plan · target version/fixpack ·
client-upgrade plan · change freeze · post-upgrade test plan · same-machine
vs migration intent · cloud confirmation · in-house scripts ·
`ctmsetown` NOTIMPL (reason `run-command`, include the command) ·
`is_upgrade_ready` (reason `run-command`).

## 6. Facts model (Stage 1 output)

```json
{
  "meta": {
    "parser_version": "0.1.0",
    "generated_at": "<iso8601>",
    "archives": [
      {"file": "...", "product": "EM|Server|Agent", "host": "...",
       "collected_at": "...", "collector_log_ok": true,
       "collected_sections": ["..."]}
    ]
  },
  "facts": { "<dotted keys per extractor tables>": {
      "value": "...", "confidence": "EXACT|DERIVED|INFERRED",
      "source": "<archive>:<relative/path>", "raw": "<matched text>",
      "extractor": "X01"
  }},
  "gaps": [ {"field": "...", "state": "MISSING|UNCOLLECTED|interview|run-command",
             "action": "<what the skill should ask or run>"} ],
  "flags": [ {"id": "ka_000419757", "triggered": true, "evidence": ["..."]} ]
}
```

## 7. Mapping layer (Stage 2)

`amigo_map_v22.yaml` — one entry per checklist question:

```yaml
- id: em_from_version
  sheet: "AMIGO EM Checklist V22"
  anchor: "What is the version of the Control-M/Enterprise Manager that is being upgraded FROM?"
  match: contains          # row located by anchor-text match in the Action Item column — never by fixed cell address
  answer_col: "Customer: Answer"
  fact: em.version
  transform: major_minor   # 9.0.21.300 -> "9.0.21"
  remarks_template: "[HCU auto-fill · {source} · {confidence}]"
  min_confidence: EXACT    # INFERRED facts write to Remarks only, with 'CONFIRM:' prefix
```

Writer rules: locate header row dynamically; write only Customer columns;
INFERRED answers go to Remarks as `CONFIRM: <value>?` rather than the Answer
cell; MISSING/interview rows left untouched; a summary block is appended to the
Questionnaire sheet: filled n/total, confirm-list, gap-list.

## 8. Implementation phases (review gate after each — do not proceed without approval)

- **Phase 0 — Fixtures & verification.** Assemble a sanitized sandbox archive
  pair (EM + Server); resolve X19 (Compatibility Mode field name) and X05 MSSQL
  detection against real data; write `expected_facts.json` golden file by hand.
  *Gate: golden file reviewed.*
- **Phase 1 — Core extractors** X01–X15 + facts model + collector-log pre-check.
  *Gate: `environment_facts.json` diff vs golden = clean.*
- **Phase 2 — Fleet & inference extractors** X16–X27 + signatures YAMLs.
  *Gate: INFERRED items reviewed for false positives.*
- **Phase 3 — Mapping layer + xlsx writer** + summary block.
  *Gate: pre-filled workbook opened and eyeballed against sandbox answers.*
- **Phase 4 — Skill integration.** Concierge-Upgrade-Advisor Phase 2 gains
  "upload HCU archive" path: run parser → present filled/confirm/gap summary →
  interview only gaps. Copilot Studio parity: same facts JSON is the contract.

## 9. Testing

- Golden-file test per extractor (fixture snippet → expected fact objects).
- Negative tests: section missing, collection failed, malformed CSV row.
- Round-trip test: fixture archives → facts → workbook → re-read workbook and
  assert answers match facts.
- Regression fixture: the Protective sandbox checklist as expected output
  (SBCMEM31W/SBCMSR01W, Windows 2022, MS SQL) — validates the MSSQL-by-
  elimination path and the same-host join.

## 10. Open questions (answer at Phase 0)

1. X19 — where exactly does Compatibility Mode status/version live in the EM
   dump? Candidates: PARAMS table export, system-parameters CSV.
2. Does the collector capture `ctmsetown` output anywhere (OAP.dat/SAP.dat
   contents), or does this stay a run-command gap permanently?
3. Agent archives: are they collected per-agent in practice, or is the fleet
   view (X22/X24 agent-side) usually Server-registry-only?
4. `installed-versions.txt` line format: fixed-width or tab-delimited across
   versions/platforms? Need two real samples (Windows + Linux) to lock the parser.
