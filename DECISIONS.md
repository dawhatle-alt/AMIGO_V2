# DECISIONS

Short log of choices that deviate from, or resolve ambiguity in, `PRD.md` /
`CLAUDE.md`. Format: date · decision · why.

## 2026-09-01 — M0

**Next.js 15 / React 19 rather than 14.**
CLAUDE.md says "Next.js 14+". 15 is the current stable App Router release and
satisfies that floor; nothing in the PRD depends on 14-specific behaviour.

**Tailwind 3.4, not 4.x.**
Tailwind 4 moves configuration into CSS and drops `tailwind.config.ts`. The
design tokens ported from the prototypes are clearer as a typed config, and v3
is the version the ecosystem (and the prototypes' utility classes) assume.

**IBM Plex self-hosted via `@fontsource/*` packages.**
PRD §8 requires self-hosted IBM Plex. `@fontsource` ships the woff2 files as a
dependency, so the app makes no external font request and builds offline —
unlike `next/font/google`, which fetches at build time.

**`npm test` wired at M0 with the M1 diff skipped, not failing.**
CLAUDE.md requires the golden test to run every milestone. The parser does not
exist until M1, so the diff block is gated on `PARSER_IMPLEMENTED` and reports
as skipped. The suite is not hollow in the meantime: it asserts
`fixtures/facts.reference.json` is present and structurally valid against the
schema contract (blocks, per-fact provenance, gap shape, summary counts), so a
lost or mangled contract file fails the build from M0 onward. Flipping
`PARSER_IMPLEMENTED` to `true` at M1 activates the real diff.

**Agent panel is a right rail at ≥1024px and an overlay drawer below it.**
PRD §6 specifies a persistent collapsible right rail; the validated prototypes
use a floating panel. The rail is authoritative, but a rail alone is unusable at
tablet width — and PRD §6 requires the runbook to stay usable there on upgrade
night. Below `lg` the same panel overlays instead of splitting the column.

**`case.created_at` doubles as the case id for the recents index.**
PRD §7.1 defines no id field. `created_at` is assigned once and never mutated,
so it is a stable key without adding a field to the schema contract.

**localStorage holds one case in full plus a lightweight recents index.**
PRD FR-1 requires autosave and a file round-trip, not a local multi-case store.
Recents are name/number/target/timestamp only; the case file is the way to
restore any case other than the most recent. The Home screen says so explicitly
rather than implying the browser holds them all.
