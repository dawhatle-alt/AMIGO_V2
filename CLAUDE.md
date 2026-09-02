# CLAUDE.md — AMIGO Concierge (AMIGO_V2)

Project instructions for Claude Code. Read this file and `PRD.md` in full before
writing any code.

## What this project is

AMIGO Concierge: a Next.js application that ingests Control-M HCU
(`ctm_data_collector`) archives, extracts environment facts with provenance,
walks the user through confirming inferred values and closing gaps (with an
embedded AI agent), and generates a tailored interactive Upgrade Plan and
Execution Runbook. `PRD.md` is the authoritative requirements document.

## Build protocol — milestone gates (non-negotiable)

Work proceeds in milestones M0–M8 as defined in PRD §10. At each milestone:

1. Build only that milestone's scope.
2. Run its acceptance check (the ✅ line in PRD §10).
3. STOP. Present what was built, the acceptance evidence, and any deviations.
4. Wait for explicit approval ("proceed to M<n+1>") before continuing.

Never skip ahead, never batch multiple milestones, never mark an acceptance
check passed without demonstrating it.

## Hard rules

- **Schema is a contract.** The `facts` and `gaps` shapes in `case.json`
  (PRD §7.1) must match `fixtures/facts.reference.json` field-for-field. Any
  schema change requires bumping `schema_version`, updating
  `reference/amigo_prefill.py` to match, and calling it out at the gate.
- **M1 golden test.** The TypeScript parser port must parse
  `fixtures/hcu_SBCMEM31W.zip` + `fixtures/hcu_SBCMSR01W.zip` and produce output
  that diffs clean against `fixtures/facts.reference.json` (ignore
  `meta.generated_at`). Wire this as `npm test` so it runs every milestone.
- **Extractors never invent.** Unrecognized format → `MISSING`; failed
  collection (collector log) → `UNCOLLECTED`; per-extractor try/catch so parsing
  never crashes intake.
- **Secrets:** `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` come from `.env.local`
  only. Never commit them; commit a `.env.local.example`. The key is used only
  in the `/api/chat` route — never shipped to the client.
- **Content lives in data modules.** Checklist/plan/runbook step content is
  ported from `reference/skill-references/*.md` into versioned TypeScript data
  modules — never hardcoded inside components. Follow the URL rules in
  `reference/skill-references/url-reference.md` (🔒 marking; never link the
  dead EM/Server upgrade pages).
- **`reference/` is read-only source material** (Python reference parser,
  prototypes, skill content). Don't import from it at runtime; port from it.

## Stack & conventions

- Next.js 14+ App Router, TypeScript strict, Tailwind. Zustand for state,
  localStorage autosave + case-file (JSON) open/save round-trip.
- Zip parsing client-side with `fflate`; suffix-match archive member paths
  (root folder prefix varies between collections).
- Design: IBM Plex Sans / IBM Plex Mono (self-hosted), primary #2563eb, risk
  colors red/amber/emerald, card layout, dark terminal blocks (green on navy).
  Match the look of `reference/prototypes/` — those are the approved designs.
- AI agent behavior: port the system-prompt pattern and guardrails from
  `reference/prototypes/amigo-runbook-AZAMA79-v2.jsx` (environment-correct
  syntax only; ask for exact error text; production failures → NEW SEV-1 case,
  never the AMIGO case; cite KAs; admit uncertainty). PRD FR-15..19 governs.
- Windows-friendly dev: repo runs with `npm run dev` on Windows; no bash-only
  tooling in npm scripts.

## Layout to create at M0

```
app/            # Next.js app router
components/
lib/parser/     # TS extractor port (one module per extractor family)
lib/plan/       # plan + runbook generation (data modules + tailoring rules)
lib/store/      # case state, autosave, file round-trip
fixtures/       # (exists) test archives + golden reference
reference/      # (exists) read-only source material
```

## Current status

- [x] PRD approved (PRD.md v1.0)
- [x] M0 Scaffold (gate passed 2026-09-01)
- [x] M1 Intake & parser port (golden test) (gate passed 2026-09-01)
- [x] M2 Facts review & confirm (gate passed 2026-09-01)
- [x] M3 Gap walkthrough (gate passed 2026-09-01)
- [x] M4 AI agent (gate passed 2026-09-01; live-model exchange still awaits a key)
- [x] M5 Plan generation (gate passed 2026-09-01)
- [x] M6 Runbook (built 2026-09-01; gate evidence presented, approval pending)
- [ ] M7 Export
- [ ] M8 Polish & hardening

Update the checklist above at every gate, and keep a short `DECISIONS.md` log
(date, decision, why) for anything that deviates from the PRD.
