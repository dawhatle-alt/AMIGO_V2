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

## 2026-09-01 — M4: AI agent

**Official SDK, server-side only.** `/api/chat` (`app/api/chat/route.ts`) is
the one place `ANTHROPIC_API_KEY` is read; it uses `@anthropic-ai/sdk` with
typed error classes mapped to the PRD's `{ error, retryable }` contract
(auth → not configured / not retryable; rate-limit, connection, 5xx →
retryable; bad request → not retryable). A `refusal` stop reason is returned
as a non-retryable error, never as a reply. Answers that hit `max_tokens`
(1000, per FR-15) are flagged `truncated` and the panel appends a
"cut off — ask to continue" note.

**Model default stays `claude-sonnet-4-6` per FR-15**, overridable with
`ANTHROPIC_MODEL`. The current Claude API guidance recommends `claude-opus-5`
as the default for new integrations; the PRD names Sonnet explicitly, so the
PRD wins and switching is a one-line `.env.local` change. No extended
thinking is requested: with a 1000-token budget, thinking tokens would eat
the answer, and the prototype ran without it.

**Context is built on the client, the prompt on the server (§7.2).**
`lib/agent/context.ts` turns live case state into `CaseContext` — facts
summary via `effectiveValue` (corrections win; unconfirmed INFERRED values are
marked as such), `os_family` / `db_family` classification, screen, focused
item (gap command / console path / why), progress line, outage clock —
and `lib/agent/systemPrompt.ts` renders it. The syntax rule is derived, not
hard-coded: Windows + MS SQL for the fixtures, UNIX + PostgreSQL for a Linux
estate, "ask first" when unknown, per-host when mixed.

**KA table is a data module** (`lib/agent/kaTable.ts`, `v22`): the
prototype's KA_LIST plus the SKILL.md references. URLs only where the
reference material records the sfdcid; the prompt tells the model to cite
only those numbers and never invent links.

**History lives in the case (FR-18).** `chat_history` is appended through the
store (`agent.user` / `agent.assistant` audit entries) and sent in full on
every call; a failed call keeps the user's message so Retry re-sends the same
history. The advisor rail is usable only with a case open, because there is
nowhere else to keep the conversation.

**Gate evidence split.** The offline half (key absent → 503 not-configured →
amber notice, app fully usable; malformed requests rejected; prompt assembly
asserts Windows/MSSQL syntax, hosts, KA table, guardrails; SDK mocked to prove
model/max_tokens/system/history wiring) is verified by tests and in the
browser. The live-model half ("agent answers reflect the fixture environment")
needs a real key in `.env.local`, which this workstation does not have —
see the gate report.

## 2026-09-01 — M5: Plan generation

**Templates are functions of a typed environment, not string placeholders.**
`lib/plan/templates.ts` (TEMPLATES_VERSION v22) ports the EM/Server
checklists and upgrade-plan templates; each item's `text`/`detail`/`cmd`/
`refs`/`risk` may be a function of `PlanEnv` (`lib/plan/env.ts`), which reads
the case once through `effectiveValue` so TSA corrections win. It is still a
data module — components render `PlanItem`s and never hold content — but the
tailoring (FR-22) lives next to the content it tailors instead of in a
separate rules table that would have to be kept in sync with it.

**N/A items are suppressed at generation, not stored.** A template whose
`when(env)` is false is not generated. This is what "N/A items suppressed,
not shown" means in FR-22; the `na` status remains available for the TSA to
mark an item not applicable by hand.

**Unknown OS is stated, never guessed.** When the archive has no OS fact
(the server-only Linux fixture has none), every command block opens with an
explicit "OS NOT DETECTED … shown in UNIX form" line rather than silently
picking a syntax. Correcting the OS fact on Facts Review re-tailors the plan.

**Auto-Done carries provenance in `detail`, not a new schema field.** The
schema's `autofilled_from` holds the fact key / gap id; the human note
("Auto-filled: EM disk free = … (from hcu_SBCMEM31W.zip:…)") is appended to
`detail` after a blank line so exports and the advisor see it without a
schema change. The M5 test treats that note as provenance, not plan content
— it is the one place the fixture's "MS SQL (by elimination — no
PostgreSQL/Oracle sections in archive)" value is quoted.

**Risk flags are pinned, decision gaps become risk items.** Every
`evaluateRisks` flag becomes a Blockers & Risks item (`risk_<flag id>`) with
the flag's refs and evidence; the interview-only decisions (downtime window,
fallback plan, change freeze, test plan, EM clients, CMs, migration, cloud)
become items only while unanswered or answered adversely.

**Regeneration keeps TSA progress.** `mergePlan` preserves a done/N/A mark
on an item the fresh generation would only call "todo"; an auto-filled
status always wins because it reflects new evidence. Statuses and the
generated plan live in `plan.items` and round-trip through case.json.

**Real finding on the golden fixture:** EM 9.0.21.300 is lower than Server
9.0.21.302, so "EM is the same or higher version than the Server" is a
warning, not auto-done. The test asserts that rather than papering over it.

**Commands use well-known utilities only** (setup.exe / setup.sh, stop_all,
shut_ctm / shut_ca, ctm_menu, ctmping, ctmsetown, is_upgrade_ready,
check_req, robocopy / tar, BACKUP/RESTORE DATABASE, pg_dump / pg_restore,
expdp / impdp). The prototype's `em_ctl` / `ctmgetcm` were not carried over
because they are not documented utilities. Model-default and export remain
M7 concerns; the Export button is a labelled stub.

## 2026-09-01 — M6: Runbook

**Steps store schema fields only; content is rendered by id.** The
`runbook.steps[]` schema (§7.1) has no command / expect / verify / fail
fields, so those live in `lib/runbook/templates.ts` (RUNBOOK_VERSION v22)
and are rendered at view time from the template keyed by step id
(`stepContent`). Wording can change without a schema bump; a step id that
disappears from the templates simply stops rendering content.

**Generated with the plan, progress preserved.** `generatePlan()` also
generates the runbook (PRD §4 step 6: one "Generate" action yields both).
`mergeRunbook` keeps status and timestamps for surviving step ids and the
clock start; a re-parse still resets both (existing behaviour).

**Gates and PONR are steps with `type`, passed = `done`.** Gate checkboxes
are UI-only — what the case records is that the gate was passed and when
(`completed_at`). Gate 0's checks are derived live from the open blockers
(risk flags + unanswered downtime / fallback decisions) so they cannot go
stale. PONR needs no checklist: one explicit confirmation.

**Sequential locking is strict.** Only the first unfinished item (gate, PONR
or step) can be started, completed, skipped or passed — `canActOn` in the
engine, enforced by the store, not just greyed out in the UI. N/A is allowed
on the current step only.

**Clock semantics.** `outage_started_at` is set when Gate 1 passes (never
overwritten); `window_minutes` comes from the downtime-window answer via M3.
Over-budget = remaining window < estimated remaining work, and it stops
firing once every step is finished. Without a window budget the tiles show
"—" and the screen links to the gap rather than assuming a duration.

**Real finding:** for the fixture environment the phases after Gate 1
estimate ~4 h 20 min, so a 4-hour window is over budget the moment the
outage starts. The test asserts this instead of hiding it; the prototype had
assumed 8 hours.

**Rollback panel is always present**, collapsed to its first two rules with
the full DB-correct procedure one click away (RESTORE DATABASE / pg_restore
/ impdp, robocopy or tar back, source versions to start). Advisor entry
points per step ("Ask", "Report error") pre-fill per the prototype's framing
and send the step's command + failure guidance as focus detail (FR-16/18).
