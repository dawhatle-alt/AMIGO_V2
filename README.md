# AMIGO Concierge (AMIGO_V2)

HCU-driven upgrade planning for Control-M. Ingests a customer's
`ctm_data_collector` archive, extracts environment facts with provenance,
guides confirmation and gap collection with an embedded AI agent, and
generates a tailored interactive Upgrade Plan and Execution Runbook.

- **Requirements:** `PRD.md` (authoritative)
- **Build protocol:** `CLAUDE.md` (milestone gates M0–M8)
- **Test data:** `fixtures/` (synthetic HCU archives + golden reference output)
- **Reference material:** `reference/` (Python reference parser, validated UI
  prototypes, skill content to port) — read-only

## Quickstart (after M0)

```
npm install
copy .env.local.example .env.local   # add ANTHROPIC_API_KEY
npm run dev
```

Phase 1: local, file-based, TSA-only. Phase 2: Vercel + Supabase with
customer share links (PRD §9).
