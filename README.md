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

## Quickstart

```
npm install
copy .env.local.example .env.local   # add ANTHROPIC_API_KEY (used from M4)
npm run dev
```

Then open http://localhost:3000.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — includes the M1 golden test against `fixtures/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

The app is fully offline except AI agent calls. `.env.local` is git-ignored and
the API key is read only by the server-side `/api/chat` route (M4).

Phase 1: local, file-based, TSA-only. Phase 2: Vercel + Supabase with
customer share links (PRD §9).
