# AMIGO Concierge

HCU-driven upgrade planning for Control-M. Drop a customer's `ctm_data_collector`
archive in, and AMIGO Concierge extracts the environment facts with provenance,
walks you through confirming inferred values and closing the gaps the archive
cannot answer (with an embedded AI advisor), then generates an Upgrade Plan and
an Execution Runbook tailored to that environment — OS-correct commands,
database-correct backup and restore syntax, topology-correct sequence, only the
items that apply.

Everything runs in your browser and on your disk. Nothing is uploaded anywhere
except the questions you ask the advisor.

- Requirements: [PRD.md](PRD.md) (authoritative)
- Build protocol and status: [CLAUDE.md](CLAUDE.md) (milestones M0–M8)
- Decisions that deviate from or refine the PRD: [DECISIONS.md](DECISIONS.md)

## Quickstart

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. The advisor is optional: without a key the rest of
the app works and the advisor panel says it is not configured. To enable it,
copy `.env.local.example` to `.env.local` and add your `ANTHROPIC_API_KEY`
(`ANTHROPIC_MODEL` is optional). The key is read only by the server-side
`/api/chat` route and is never sent to the browser. `.env.local` is git-ignored.

## Walkthrough (fixture to export in ten minutes)

Two synthetic HCU archives live in `fixtures/`: `hcu_SBCMEM31W.zip` (an
Enterprise Manager host) and `hcu_SBCMSR01W.zip` (a Control-M/Server host).
The same collections are also there as `.tar.gz` for the UNIX container path.

1. **Home** — create a case (customer or case name, optional case number,
   target version 9.0.22 or 9.0.21). The case is autosaved in this browser as
   you work; **Save case file** in the header downloads it as `case.json`.
2. **Intake** — drop both fixture archives onto the drop zone and click
   **Parse 2 archives**. The summary shows facts extracted, values to confirm
   and gaps; the **Diagnostics** panel lists any extractor warnings and each
   archive's collector-log status. Parsing again later asks before it resets
   your confirmations, answers and plan.
3. **Facts Review** — risk banners come first (what could stop the upgrade),
   then the confirmation queue. Confirm or correct each INFERRED value; the
   extracted value is never overwritten, both go into the audit trail. Plan
   generation stays blocked until every blocker is resolved.
4. **Gap Walkthrough** — one card per question the archive could not answer,
   each with the exact command, console path or reference that produces the
   answer, and a Copy button. Answer the **downtime window** with a duration or
   a clock range (for example `Saturday 22:00–06:00`); that becomes the runbook
   clock budget. **Ask advisor** on any card pre-fills the question with the
   gap's context.
5. **Upgrade Plan** — click **Generate plan**. Items the archive already
   answers are marked done with an `auto · <fact>` chip; blockers and actions
   are flagged; every command is in this environment's own syntax. Click a
   status circle to cycle To do → Done → N/A. Regenerating keeps your marks.
6. **Runbook** — generated with the plan. Work top to bottom: only the current
   gate or step can be acted on. Gate 0 lists the open blockers, Gate 1 starts
   the outage clock, the point of no return needs an explicit confirmation.
   The clock tiles show elapsed time, window left and estimated work left, and
   warn when the remaining work no longer fits the window. The rollback
   procedure is always one click away. **Ask advisor** and **Report error** on a
   step hand the advisor that step's command and failure guidance.
7. **Export** (menu on the Plan and Runbook screens) — a standalone HTML
   Upgrade Plan, a standalone HTML Runbook (both open from disk by
   double-click, stay interactive offline and remember progress in that
   browser), `case.json`, and `amigo-wizard-answers.json` (confirmations and
   answers only). Each export is recorded in the case's activity log.

To come back later, open `case.json` from Home or the header; facts,
confirmations, answers, plan, runbook, advisor conversation and audit trail
return exactly as saved.

## What the advisor knows and will not do

The advisor sees the case: extracted facts, corrections, open gaps and risks,
plan and runbook progress, and whatever you focused with an Ask button. It
answers in the environment's own OS and database syntax, asks for exact error
text before diagnosing, cites knowledge articles from a fixed table, and tells
you when it is unsure. For a production failure during the upgrade it will
tell you to open a **new Severity 1 case** — it never raises the AMIGO case.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm test` | Vitest: golden parser test against `fixtures/facts.reference.json`, plus facts, gaps, agent, plan, runbook, export and hardening suites |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run build` | Production build. To build while `npm run dev` is running, set `NEXT_DIST_DIR=.next-build` first so the two do not share `.next` |

## Layout

```
app/            Next.js App Router: one route per screen, /api/chat, error boundaries
components/     Screens (Home, Intake, Facts, Gaps, Plan, Runbook), shell, advisor panel, export menu
lib/parser/     TypeScript port of the HCU extractors X01–X27 (zip + tar, magic-byte detection)
lib/rules/      Risk rules (v22) evaluated on effective values
lib/gaps/       Gap walkthrough helpers, downtime-window parsing
lib/agent/      Case context, system prompt, KA table
lib/plan/       Plan templates (v22 data modules), tailoring environment, generation
lib/runbook/    Runbook step templates, engine (locking, clock, rollback)
lib/export/     Standalone HTML renderers and JSON exports
lib/store/      Zustand case store, localStorage autosave
lib/types/      case.json schema (a contract — see CLAUDE.md)
fixtures/       Synthetic HCU archives and the golden reference output
reference/      Read-only source material: Python reference parser, prototypes, skill content
test/           Vitest suites
```

## Data and privacy

- The case lives in `case.json` (schema in PRD §7.1). The `facts` and `gaps`
  blocks match the Python reference parser's output field-for-field so the
  skill, this app and future tooling interoperate.
- Archives are unpacked and parsed in the browser with `fflate`; they never
  leave the machine.
- Autosave uses `localStorage` for the active case. If the browser refuses the
  write (storage full or blocked) the header says so — save the case file.
- Only the advisor makes network calls, and only to the local `/api/chat`
  route, which calls the Anthropic API with the server-side key.

## Troubleshooting

- **"Nothing recognised" after parsing** — the file is not a
  `ctm_data_collector` collection, or its product directory signature
  (`CNF_INFO/`, `EM/check_config_results/`, `AG_TBL_CTM/`) was not found.
  Open Diagnostics for the reason and ask for the archive the collector wrote.
- **Values show UNCOLLECTED** — the collector log reports that section failed
  on the customer's host. Re-run the collector; the app never invents a value.
- **Plan generation is blocked** — resolve every blocker banner on Facts Review
  (and confirm every INFERRED value). The plan button says what is outstanding.
- **Runbook shows "—" for window left** — answer the downtime window gap with a
  recognisable duration or clock range.
- **Advisor says it is not configured** — add `ANTHROPIC_API_KEY` to
  `.env.local` and restart `npm run dev`.
- **A screen shows "This screen hit an error"** — the case is still autosaved;
  use Save case file, then Try again or reload.

Phase 1 is local, file-based and TSA-only. Phase 2 (hosted, customer share
links, dashboard) is described in PRD §9.
