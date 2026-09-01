# PRD — AMIGO Concierge
### HCU-Driven Upgrade Planning Application for Control-M

| | |
|---|---|
| **Version** | 1.0 (build-ready) |
| **Owner** | Darrell (Control-M TSA) |
| **Status** | Approved for build in Claude Code |
| **Phasing** | Phase 1: local MVP, file-based, TSA-only · Phase 2: deployed (Vercel + Supabase), customer access |

---

## 1. Problem & Opportunity

The AMIGO upgrade review program asks customers to manually complete a ~60-question
checklist. Submissions arrive incomplete (a recent production case had ~18 unanswered
items), blockers surface late, and TSA review time is spent collecting data instead of
assessing risk.

The HCU (`ctm_data_collector`) already captures ~52% of the required environment facts
exactly, and ~30% partially (validated analysis: AMIGO-HCU-Coverage-Analysis;
question-level mapping: AMIGO-HCU-Crosswalk; reference model:
https://github.com/dawhatle-alt/hcu-knowledge-graph).

**AMIGO Concierge** turns an HCU archive into a complete, customer-specific upgrade
plan: parse → review/confirm → guided gap collection → AI-assisted Q&A → generated
step-by-step execution plan. Working prototypes exist for every stage (Python parser,
HTML gap wizard, React plan + runbook artifacts with embedded AI chat); this PRD
productizes them into one application.

## 2. Goals / Non-Goals

**Goals (Phase 1)**
- G1: Ingest standard HCU archives (EM + Server hosts) and extract all facts the
  archive can answer, with provenance and confidence on every value.
- G2: Present pre-populated information for TSA review; require explicit confirmation
  of INFERRED values.
- G3: Walk the user through every gap with the exact command, console path, or KA
  needed to close it.
- G4: Embed an AI agent (context-aware of the case) for questions, gap help, and
  error troubleshooting.
- G5: Generate the walk-away deliverables: an interactive upgrade plan and a
  sequenced execution runbook (phases, gates, point-of-no-return, timers, rollback),
  tailored to the environment (OS-correct commands, DB-correct syntax,
  topology-correct sequence).
- G6: Export everything as self-contained HTML + JSON so it works with zero
  infrastructure.

**Non-Goals (Phase 1)**
- No accounts, auth, or multi-user (Phase 2).
- No direct connection to customer environments — file upload only.
- No modification of the official AMIGO xlsx (kept as a later mapping stage).
- No diagnosis of environment health issues (HCU analysis is a separate effort).

## 3. Users

| Persona | Phase | Needs |
|---|---|---|
| **TSA** (primary, v1) | 1 | Process customer archives fast; see blockers early; produce the plan for the Starter call; audit trail |
| **Customer admin** (fast-follow) | 2 | Complete gaps guided; ask questions safely; work the runbook during the upgrade window |
| **TSA lead** (Phase 2) | 2 | Roll-up across active AMIGO cases: % ready, blockers, days to cutover |

## 4. End-to-End Flow (Phase 1)

1. **New case** → name it (customer/case number), select target version (9.0.21/9.0.22).
2. **Intake** → drag-drop 1–3 HCU zip archives → client-side parse → facts + gaps.
3. **Facts review** → table of extracted facts (confidence badges, source paths);
   triggered risk flags shown as banners (e.g., KA 000419757).
4. **Confirm** → INFERRED items require Confirm/Correct before plan generation.
5. **Gap walkthrough** → ordered cards; each with command (copy button) / console
   path / doc + KA refs; answers captured; agent one click away per gap.
6. **Generate plan** → interactive Upgrade Plan (checklist sections) + Execution
   Runbook (sequenced steps, Gate 0/1/2, PONR, timers, rollback panel).
7. **Work & export** → statuses/timestamps recorded; export standalone HTML plan,
   standalone HTML runbook, case.json, answers JSON.

The AI agent is available on every screen (persistent panel), with per-item
"Ask about this" and "Report error" entry points.

## 5. Functional Requirements

### 5.1 Case & Persistence (Phase 1: file-based)
- FR-1: A case is a single JSON document (schema §7). Autosave to localStorage on
  every mutation; explicit **Save case file** (download) and **Open case file**
  (upload) round-trip the full state.
- FR-2: Activity log: every confirmation, answer, status change, gate pass, and
  export appends `{ts, actor:"TSA", action, detail}` — this is the audit trail.
- FR-3: App works fully offline except AI agent calls.

### 5.2 Archive Intake & Parsing
- FR-4: Accept 1–3 `.zip` archives via drag-drop. Detect product per archive
  (EM / Server / Agent) by directory signature; suffix-match member paths (root
  folder prefix varies).
- FR-5: Collector-log precheck (`hcu_logs/collector.log`): sections from a failed
  collection yield `UNCOLLECTED`, not `MISSING`.
- FR-6: Implement the extractor set from amigo-prefill-parser-SPEC v0.1 (X01–X27
  as implemented in `scripts/amigo_prefill.py`) as TypeScript modules running
  client-side (unzip via `fflate`). **The Python parser is the reference
  implementation; the facts JSON schema (§7) is the compatibility contract** —
  outputs must match field-for-field so the skill, this app, and a future Hermes
  agent interoperate.
- FR-7: Every fact: `{value, confidence: EXACT|DERIVED|INFERRED, source, extractor, raw?}`.
  Derivations: same-host join, KA 000419757 flag (RHEL ≥8.5 ∧ SSL agents),
  AV/monitoring detection from process lists.
- FR-8: Parse errors never crash intake — per-extractor try/catch, warnings surfaced
  in a collapsible diagnostics panel.

### 5.3 Facts Review & Confirmation
- FR-9: Facts table grouped by domain (EM / Server / Topology / DB / Agents /
  Environment), confidence badges, monospace source path, raw-value tooltip.
- FR-10: INFERRED facts render as confirmation cards (Confirm / Correct with input).
  Plan generation is blocked until all are resolved; corrections keep both values
  in the audit trail.
- FR-11: Risk flags (from facts + rules table) render as persistent banners:
  version-path violations (source <9.0.20 → 9.0.22), Compatibility Mode gate,
  unavailable agents, KA-triggered conditions.

### 5.4 Gap Walkthrough
- FR-12: Gaps from the parser's gap list render as ordered cards:
  question, why-it-matters, then exactly one or more of
  `command` (terminal block + copy), `console` (CCM path), `refs` (KA/doc links,
  🔒 marker for login-required). Answer textarea + Save per card. Progress bar.
- FR-13: Gap states: `open → answered`; decision gaps (dates, windows, fallback)
  feed plan parameters directly (e.g., downtime window ⇒ runbook clock budget).
- FR-14: "Ask agent about this gap" pre-fills the agent input with gap context.

### 5.5 AI Agent
- FR-15: Chat panel available on all screens. Calls go through a local API route
  (`/api/chat`) that injects `ANTHROPIC_API_KEY` from env — the key never ships
  to the client. Model configurable via `ANTHROPIC_MODEL` (default
  `claude-sonnet-4-6`), `max_tokens` 1000.
- FR-16: System prompt assembled per message from live case state:
  environment summary (hosts, versions, OS, DB, topology, add-ons),
  current screen + focused item (gap or runbook step incl. its command and
  failure guidance), progress stats, elapsed outage time when the runbook clock
  is running, and the KA reference table.
- FR-17: Agent guardrails (in system prompt, non-negotiable):
  answers use the environment's OS/DB syntax only; ask for exact error text
  before diagnosing; production failures → instruct to open a NEW SEV-1 case,
  never escalate the AMIGO case; uncertain → say so and point to the doc/KA,
  never invent BMC behavior; concise, working-session tone.
- FR-18: Entry points: global panel, per-gap "Ask", per-runbook-step "Ask" and
  "Report error" (pre-filled framing). Full conversation history sent per call;
  history stored in the case document.
- FR-19: Agent failures degrade gracefully (retry affordance + offline notice);
  the app remains fully usable without the agent.

### 5.6 Plan Generation
- FR-20: **Upgrade Plan** view: sections = Environment Summary, Blockers & Risks,
  Pre-Upgrade EM, Pre-Upgrade Server, Fallback Plan, Upgrade Sequence,
  Post-Upgrade Verification, Post-Upgrade Tasks. Items carry: status cycle
  (todo → done → n/a), risk badge, context text, command block, refs.
  Items auto-populated: facts mark items Done (with provenance note); gaps/answers
  fill parameters; blockers from flags pin to the Blockers section.
- FR-21: **Execution Runbook** view: sequenced steps in phases (Pre-flight,
  Shutdown, EM upgrade, Server upgrade, Reconnect & agents, Verification,
  Wrap-up) with: sequential locking, Gate 0 (blockers resolved), Gate 1
  (GO/NO-GO starts outage clock), PONR confirmation before EM upgrade, Gate 2
  (verification GO/NO-GO), per-step start/complete timestamps + actual-vs-estimate,
  window countdown from the answered downtime-window gap, over-budget warning,
  always-visible Rollback panel (DB-correct restore syntax).
- FR-22: Tailoring rules (deterministic, from facts):
  Windows ⇒ `REM`/`setx`/`.bat`/robocopy; UNIX ⇒ `#`/`export`/`.sh`/tar.
  MS SQL ⇒ `BACKUP/RESTORE DATABASE`; PostgreSQL ⇒ `pg_dump` + PG-upgrade section;
  same-host ⇒ single outage sequence; HA ⇒ KA 000386814 steps; add-ons present ⇒
  their verification steps only; N/A items suppressed, not shown.
- FR-23: Plan/runbook content templates live as versioned TS data modules ported
  from the skill's reference files (em/server checklists + upgrade plans v22) —
  single source of truth, no hardcoded steps inside components.

### 5.7 Export
- FR-24: One-click exports: (a) standalone self-contained HTML Upgrade Plan,
  (b) standalone self-contained HTML Runbook (both mirror the prototypes:
  inline CSS/JS, work by double-click, include 🔒 notice + quick-reference links),
  (c) `case.json`, (d) `amigo-wizard-answers.json` (answers + confirmations only).
- FR-25: Exported HTML embeds current statuses/timestamps at export time and remains
  interactive (checkbox cycling) offline.

## 6. Screens (Phase 1)

| # | Screen | Purpose |
|---|---|---|
| S1 | Home | Open case file / new case / recent (localStorage) |
| S2 | Intake | Drag-drop archives, parse progress, diagnostics |
| S3 | Facts Review | Facts table + risk banners + confirmations queue |
| S4 | Gap Walkthrough | Gap cards, progress, agent shortcuts |
| S5 | Upgrade Plan | Generated plan, statuses, export |
| S6 | Runbook | Live execution mode: gates, clock, steps, rollback |
| — | Agent panel | Persistent right rail (collapsible), all screens |

Design: professional BMC-adjacent look. IBM Plex Sans / IBM Plex Mono, blue
primary (#2563eb), risk colors (red/amber/emerald), card-based layout, dark
terminal blocks (green-on-navy) — consistent with the validated prototypes.
Desktop-first; runbook view must remain usable at tablet width (upgrade-night use).

## 7. Data Contracts

### 7.1 `case.json` (single source of truth)
```json
{
  "schema_version": "1.0",
  "case": { "name": "", "case_number": "", "target_version": "9.0.22",
            "created_at": "", "updated_at": "" },
  "archives": [ { "file": "", "product": "EM|Server|Agent", "host": "",
                  "collector_log_ok": true } ],
  "facts": { "<dotted.key>": { "value": {}, "confidence": "EXACT|DERIVED|INFERRED",
             "source": "", "extractor": "X01", "raw": "" } },
  "confirmations": { "<fact.key>": { "status": "confirmed|corrected",
             "corrected_value": null, "ts": "" } },
  "gaps": [ { "id": "", "question": "", "why": "", "state": "run-command|console|interview",
              "command": "", "console": "", "refs": [{"label": "", "url": ""}] } ],
  "answers": { "<gap.id>": { "value": "", "ts": "" } },
  "plan": { "generated_at": "", "items": [ { "id": "", "section": "", "text": "",
            "status": "todo|done|na", "risk": "blocker|warning|clear",
            "detail": "", "cmd": "", "refs": [], "autofilled_from": null } ] },
  "runbook": { "steps": [ { "id": "", "phase": "A-G", "type": "step|gate|ponr",
               "title": "", "est_min": 0, "status": "pending|active|done|na",
               "started_at": null, "completed_at": null } ],
               "outage_started_at": null, "window_minutes": null },
  "chat_history": [ { "role": "user|assistant", "content": "", "ts": "" } ],
  "activity_log": [ { "ts": "", "actor": "TSA", "action": "", "detail": "" } ]
}
```
The `facts` + `gaps` shapes are identical to the Python parser's
`environment_facts.json` — that schema is the cross-runtime contract (skill,
this app, Hermes).

### 7.2 `/api/chat` (Phase 1 local API route)
Request: `{ messages: [...], case_context: {facts_summary, screen, focused_item, progress, elapsed} }` →
server assembles the system prompt (FR-16/17) → Anthropic Messages API →
`{ reply }`. Errors: `{ error, retryable }`.

## 8. Technology

| Layer | Phase 1 | Phase 2 |
|---|---|---|
| Framework | Next.js 14+ (App Router), TypeScript, Tailwind | same |
| Zip parsing | `fflate` client-side | same |
| State | Zustand (or React context) + localStorage autosave + file round-trip | + Supabase (Postgres) |
| AI | Next API route → Anthropic SDK (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` env) | same route, deployed |
| Icons/fonts | lucide-react, IBM Plex (self-hosted) | same |
| Run | `npm run dev` locally (Claude Code) | Vercel |
| Auth | none | Supabase Auth (TSA), magic-link share (customer) |

## 9. Phase 2 (deployed) — requirements sketch

- FR-26: Supabase persistence: tables `cases`, `facts`, `answers`, `events`,
  `share_links`; RLS: TSAs see their cases; share-link scope = single case,
  customer role.
- FR-27: TSA dashboard: all active cases — % ready, open blockers, days to
  cutover, last activity; click-through to case.
- FR-28: Customer share link (no login): customer completes confirmations/gaps
  and works the runbook; TSA sees updates live (Supabase realtime).
- FR-29: Role-aware agent: customer mode adds stricter guardrails (no internal
  commentary; always SEV-1 routing language).
- FR-30: Migration: `case.json` import seeds a hosted case losslessly.

## 10. Build Milestones (Claude Code) — gate at each ✅ before proceeding

- **M0 — Scaffold**: Next.js + TS + Tailwind + fonts + layout shell + agent panel
  stub. ✅ App runs; empty case can be created/saved/reopened.
- **M1 — Intake & parser port**: fflate unzip, product detect, X01–X27 port,
  facts/gaps produced. ✅ Both fixture archives (`hcu_SBCMEM31W.zip`,
  `hcu_SBCMSR01W.zip`) parse to outputs matching the reference `facts.json`
  (field-for-field diff = clean); collector-log precheck works.
- **M2 — Facts review & confirm**: table, badges, provenance, risk banners,
  confirmation queue. ✅ MS SQL inference requires confirmation; KA 000419757
  banner appears for fixture; plan generation blocked until confirms done.
- **M3 — Gap walkthrough**: cards, commands, refs, answers, progress.
  ✅ All 15 fixture gaps completable; answers persist through save/reopen.
- **M4 — AI agent**: /api/chat, context assembly, guardrails, entry points.
  ✅ Agent answers reflect fixture environment (Windows/MSSQL syntax);
  key absent → graceful degradation.
- **M5 — Plan generation**: templates ported, tailoring rules, plan view.
  ✅ Fixture produces a plan with zero PostgreSQL content, robocopy/T-SQL
  syntax, auto-Done items carrying provenance notes.
- **M6 — Runbook**: phases, gates, PONR, sequential locking, clock, rollback.
  ✅ Gate 1 starts clock; window from gap answer; over-budget warning fires
  when simulated.
- **M7 — Export**: standalone HTMLs + JSONs. ✅ Exported plan/runbook open
  from disk in a clean browser with full interactivity.
- **M8 — Polish & hardening**: empty/error states, diagnostics panel, a11y pass,
  README. ✅ A TSA unfamiliar with the project completes fixture-to-export
  end-to-end unassisted.

## 11. Test Assets & Acceptance

- Fixture archives: `hcu_SBCMEM31W.zip`, `hcu_SBCMSR01W.zip` (synthetic,
  sanitized) + reference `facts.json` — commit under `/fixtures`.
- Golden test: parser port output vs reference JSON (M1 gate).
- Real-archive validation session planned post-M1: lock `installed-versions.txt`
  format variants, resolve Compatibility Mode capture (spec X19), MSSQL direct
  detection — extractors must degrade to MISSING (never crash, never invent)
  on unrecognized formats.

## 12. Risks & Open Items

| Risk | Mitigation |
|---|---|
| Real archive formats differ from fixture | Suffix-matching + per-extractor try/catch; post-M1 validation session; formats table maintained in the knowledge graph |
| AI calls send environment context externally | Phase 1 is TSA-only; add a per-case "agent enabled" toggle + context redaction list; revisit for customer phase / Hermes hosting |
| BMC data governance for Phase 2 hosting | Decision point before Phase 2; Hermes/internal hosting is the alternate path — the facts schema contract keeps that door open |
| Checklist/KA content drift (patch numbers, URLs) | All content in versioned data modules; url-reference rules from the skill (🔒 marking, no dead upgrade-page links) |
| Scope creep into HCU diagnosis | Non-goal; link out to the HCU analysis effort |
