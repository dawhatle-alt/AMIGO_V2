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

## 2026-09-01 — M1

**`UNCOLLECTED` is archive-level diagnostics, not a fact entry.**
FR-5 requires a failed collection to yield `UNCOLLECTED` rather than `MISSING`.
The reference Python parser does not materialise either state as a `facts`
entry — a value it cannot produce is simply absent, and the distinction lives in
how the gap is presented. Emitting `UNCOLLECTED` fact objects would have put the
TS port ahead of the schema contract for failed archives, breaking cross-runtime
interop the moment a real failed collection appeared. So the precheck is carried
as `meta.archives[].collector_log_ok` plus a per-section status list in the
intake diagnostics panel, which names the failed sections and says explicitly
that absent values are UNCOLLECTED and the collector should be re-run. Promoting
this into the facts schema is a joint change to `reference/amigo_prefill.py`,
the schema and `schema_version` — flagged for a later milestone, not taken
unilaterally here.

**`pyRepr` reproduces Python's `str(dict)` for two `raw` fields.**
X01 `server.version` and X06 `server.ha` record `raw` as a Python dict repr
(single quotes, `', '` separators). The golden diff is field-for-field, so the
port reproduces that format exactly rather than substituting JSON. It is a
compatibility shim for those two call sites, documented as such in
`lib/parser/text.ts`; nothing else should use it.

**Extractor registration order is load-bearing.**
`facts` is an ordered mapping in both runtimes, and the golden test asserts key
order as well as content. The `SERVER_EXTRACTORS` / `EM_EXTRACTORS` arrays in
`lib/parser/index.ts` therefore mirror the reference lists exactly — reordering
them is a contract change, not a refactor. X18 additionally depends on the
archive's own member order (`site.plc` before `ac.plc` in the fixture), so
member lookup never sorts.

**X09, X19, X21, X24, X26 are not implemented.**
The spec tables define them but `reference/amigo_prefill.py` does not implement
them, and PRD FR-6 scopes the port to "X01–X27 as implemented in
`scripts/amigo_prefill.py`". X19 (Compatibility Mode) is an open spec question
and is already covered by the `compat_mode` gap. Implementing any of them means
extending the Python reference first so the contract stays single-sourced.

**Re-parsing clears confirmations, answers, plan and runbook.**
New facts invalidate prior confirmations and any generated output. The store
resets those blocks on `intake.parsed` and logs it, rather than leaving stale
confirmations attached to values that may have changed.

## 2026-09-01 — M1 addendum: tar container support

**`.tar` / `.tar.gz` / `.tgz` intake added to BOTH runtimes, in the same change.**
Requested by Darrell to keep the TS port and the Python reference at parity.
Spec §3 already promised "zip or tar.gz", but neither `PRD.md` FR-4 nor
`reference/amigo_prefill.py` delivered it, so the port shipped zip-only at first
pass. UNIX HCU collections (Linux/AIX/Solaris) realistically arrive as tarballs
and PRD FR-22 already branches on UNIX environments, so the gap was real.

- TS: `lib/parser/tar.ts` (new POSIX tar reader — `fflate` has gzip but no tar)
  plus an `openContainer` step in `lib/parser/archive.ts`.
- Python: `_detect_format` + a container-agnostic `Archive` in
  `reference/amigo_prefill.py`; `ar.zf.read(...)` call sites moved to
  `ar.read_bytes(...)`.

**Format is detected from MAGIC BYTES, not the file extension**, in both
runtimes. Collections get renamed in transit; a `.tar.gz` sent as `.zip` still
parses, and a genuinely unrecognised container produces a warning rather than a
crash. The extension filter in the intake UI only keeps obviously-wrong files
out of the staging list.

**No schema change, so no `schema_version` bump.** `facts`, `gaps` and
`summary` are untouched; the only difference between containers is the archive
filename inside each `source` string. Verified by direct diff: the Python
reference and the TS port produce identical output for both the zip pair and the
tar.gz pair, and both still match `fixtures/facts.reference.json`.

**Member order is preserved through tar** and nothing sorts — X18
(`server.ssl_policies`) depends on the archive's own entry order, and the tar
fixtures reproduce `["site.plc", "ac.plc"]` exactly.

**`./` prefixes are stripped.** `tar czf .` writes `./OS/Network/Hostname.txt`;
suffix matching makes the prefix harmless, but normalising keeps the `source`
provenance strings readable and identical across containers.

**Tar fixtures are generated, not hand-made.** `fixtures/build_tar_fixtures.py`
rebuilds `hcu_*.tar.gz` from the zip twins with a fixed mtime, so the pair can
never drift apart and rebuilds stay byte-stable.

**Open item for Darrell: `PRD.md` FR-4 still says "Accept 1–3 `.zip` archives".**
That line is now stale. Not edited unilaterally — `PRD.md` is the authoritative
requirements document and carries a version number.

## 2026-09-01 — M2

**`db.type` family is read from the identifier, never the whole string.**
Caught by a test, and it was a real defect. X05's by-elimination value is
`"MS SQL (by elimination — no PostgreSQL/Oracle sections in archive)"`: the
parenthetical names the databases that were RULED OUT, so a substring search for
"postgres" reported PostgreSQL for an MS SQL environment. `dbFamily()` in
`lib/rules/risk.ts` parses only the text before the parenthetical. This is
exactly the false positive M5's acceptance forbids ("zero PostgreSQL content"),
so it is locked down by a test now rather than found at M5.

**Risk rules live in `lib/rules/risk.ts` as a data module, not in components.**
Nine deterministic rules, each traceable to
`reference/skill-references/version-matrix.md` and `url-reference.md`:
version-path violation, Compatibility Mode gate, unavailable agents,
KA 000419757, PostgreSQL post-upgrade, EM/Server disk space, AIX end-of-support,
and the confirmation gate. FR-11 names four; the others come straight from the
version matrix and are equally deterministic. Rules evaluate `effectiveValue()`,
so a TSA correction re-runs them — correcting `agents_unavailable` to empty
clears its banner.

**Disk-space rule flags the install drive, not any short volume.**
`em.home` gives the drive letter, so a small unrelated data volume never raises a
false shortage. With no known install drive the rule fires only when EVERY drive
is below the minimum — extractors never invent, and neither do rules.

**Confirmation gate is enforced in state, surfaced on two screens.**
`canGeneratePlan()` / `planGenerationBlockers()` live with the rules. Facts
Review shows the gate, and the still-stubbed S5 Plan screen shows it too, so the
block is visible where generation will actually happen at M5.

**`facts` is never overwritten by a correction (FR-10).**
`facts` keeps what the archive said; `confirmations[key].corrected_value` records
what the TSA says it actually is; the audit entry carries both
(`extracted X -> corrected to Y`). The facts table shows the corrected value with
the extracted one struck through beneath it.

**Fact domains (FR-9) are assigned by rule, with a documented fallback.**
Host-level facts (`*.os_name`, `*.disk_free`, `*.av_monitoring`, `*.fs_flag`) go
to Environment regardless of which product reported them; `em.host`/`server.host`
join `topology.*` under Topology; `flags.*` sit with Agents because X25 derives
them from the agent inventory. An unlabelled key still renders under its dotted
key — a new extractor is never silently hidden.

## 2026-09-01 — M2 addendum: X01 install-date sort + patch-history table

**X01 now sorts patch history by parsed DATE, in both runtimes.**
Found from Darrell's real Linux archive screenshot: Windows collections write
ISO dates (string order = date order, so the fixtures never caught it), but
Linux collections write `Mon-DD-YYYY`, which sorts alphabetically by month
name. `server.version` and `server.fixpack` take the LAST row after sorting, so
a 9.0.21.x environment was reported as 9.0.20.x — which would feed the wrong
upgrade path into the version-path rule and, later, the plan/runbook.
`installDateKey()` accepts `YYYY-MM-DD` and `Mon-DD-YYYY`; if ANY row's date is
unrecognised the whole table falls back to the old string sort rather than
guessing a partial order. Same logic, same fallback, in
`lib/parser/extractors/identity.ts` and `reference/amigo_prefill.py`; verified
identical output on the new fixture.

**New fixture `hcu_SBCMSR02L.zip`** (generated by
`fixtures/build_realdate_fixture.py`): Linux Server collection with
Mon-DD-YYYY dates shaped like the real archive. Expected: version 9.0.21.300
(last install Aug-20-2025), fixpack PACTV.9.0.21.302. A string sort yields
9.0.20.207 — the tests assert that exact gap, and a mutation run confirmed it.
The golden reference is untouched (ISO dates sort identically either way).

**Known residual heuristic, deliberately unchanged:** X01's "version = last
installed row" mixes package families — an add-on package (PAAFT) installed
after the last Server patch (PACTV) wins the sort. `server.running_version`
(X06, from SYSPRM.csv) is the cross-check the Facts screen already shows
side-by-side. Refining "latest PACTV wins" is a semantics change to the
reference parser — queued for the real-archive validation session, not taken
here.

**Record arrays render as tables (Darrell's request).**
`components/ui/RecordTable.tsx`: patch history, agent inventory and disk-free
now render as collapsible tables (10 rows shown, "Show all N") instead of
joined prose; UNAVAILABLE/DISABLED/FAILED cells render red. Generic over any
uniform record array, so future extractors get it for free.

## 2026-09-01 — M3: Gap walkthrough

**Gap state is derived, not stored.** PRD FR-13 says gaps move `open →
answered`; the schema (§7.1) has no state field on `gaps[]`, only `answers`.
So "answered" = a non-blank `answers[gap.id]`, computed by
`lib/gaps/walkthrough.ts`. No schema change, no `schema_version` bump; the
`gaps` array stays byte-identical to the parser's output and the golden
reference.

**Answers are free text; the runbook window budget is parsed from one of
them (FR-13).** `saveAnswer('downtime_window', …)` sets
`runbook.window_minutes` via `windowMinutesFromAnswer()`, which recognises
explicit durations ("4 hours", "4h30m", "240 min") and clock ranges
("22:00–02:00", "10pm to 2am", overnight wraps). An explicit duration wins
over a range. Anything unrecognised leaves the budget `null` — the screen says
so, and the audit-log line records it — rather than guessing. Clearing the
answer clears the budget; a re-parse clears both (existing behaviour).
The other decision gaps (target_version, upgrade_date, fallback_plan,
change_freeze, test_plan) are labelled "Feeds plan · …" on their cards but are
consumed at M5/M6, where the plan and runbook generators read `answers`
directly — no second copy of the value is kept.

**Blank answers clear.** Saving whitespace removes the answer (logged as
`gap.answer_cleared`) instead of storing an empty string that would count as
answered.

**"Ask advisor about this gap" (FR-14) is wired now, sending is not (M4).**
The store carries non-persisted `agentOpen` / `agentFocus`; the card opens the
rail with a read-only pre-filled prompt (question, command or console path,
why). M4 replaces the read-only input with the live one and adds the focus to
the system prompt — the entry point does not change.

**Shared `RefLink`.** Extracted from FactsScreen to `components/ui/RefLink.tsx`
so gap cards and risk banners render references identically; padlocked links
(documents.bmc.com / selfservice.bmc.com, or 🔒 in the label) get the
Support-Central-login tooltip. A test asserts every fixture gap ref follows
url-reference.md (padlock on login-required hosts; the dead EM/Server upgrade
pages never linked).

**Plan is not gated on gaps.** PRD gates plan generation on confirmations and
blockers (FR-10/FR-11), not on gap completion, so the walkthrough's footer
offers "Continue with N open" and the plan gate shows the open count as
information. Open gaps become open plan items at M5.
