# Admin Portal Correctness Repair Specification

Feature slug: `admin-portal-correctness-repair` · projectId `massa-ai` ·
workflowSessionId `spec-admin-portal-correctness-repair` · workflow spec-driven (Large).

Branch `fix/admin-portal-correctness-repair` from `main` @ `69c0632c` (v1.42.0),
worktree `~/Projects/massa-ai-wt-admin-portal-correctness-repair`.

## Problem Statement

A prior audit of 66 commits (`cb2ca3d9~1..HEAD`, releases v1.41.0 and v1.42.0 — features
`admin-portal`, `admin-portal-enhancements`, `admin-portal-ui-fixes`,
`registry-help-dropdown-workflow-tiers`, `config-capture-reveal-field-guides`) found
8 correctness defects, 2 security issues, 4 quality issues, and 5 spec/state drifts.

Every mechanism below was **re-verified against current source at `69c0632c`** before this
spec was written. Three of the audit's named mechanisms did not survive that check; they are
recorded as amendments in the Amendments section rather than fixed as stated.

### Correctness

1. **F1 — an overlay edit freezes the registry against future builtin bumps.** The overlay
   is documented as a *delta* on the builtin registry, but every merge path replaces whole
   objects instead of merging them. `mergeOverlay` (`scripts/lib/model-profiles.ts:523-553`)
   and its route-side twin `mergeOverlayForValidation`
   (`apps/tools-api/src/routes/model-registry.ts:185-214`) both do
   `result.hostDefaults = { ...overlay.hostDefaults }` (line 531 / 192),
   `result.workflowTiers = { ...overlay.workflowTiers }` (535 / 195) and
   `profiles[key] = profileData` (548 / 207) — a **whole-profile replace**. The uncommitted
   `initRegistryOverlay` change (`apps/web-ui/src/static/app.js:1556-1590`) then seeds the
   in-memory overlay from the *effective* registry, so the UI writes a **full copy** of the
   builtin to `~/.config/massa-ai/model-profiles.json`. Once that file exists, no future
   builtin model/tier/host addition can ever reach that operator.
2. **F2 — the project list reports success on a failure it never diagnosed.**
   `apps/tools-api/src/routes/project.ts:127-135`: a bare `catch {}` around
   `vectorStore.listProjects()` catches every error class, then
   `await (vectorStore as any).listAllProjectsAcrossDimensions?.() ?? []` returns an empty
   list — as `{success:true, projects:[]}` — whenever that optional method is absent. The
   comment names one cause (embedding dimension mismatch); the code handles all of them.
   This contradicts the shipped P0 feature `tiered-fail-loud-search` (M50).
3. **F3 — orphaned connection pool.**
   `packages/core/src/data/vector/postgres-vector-store.ts`: `getPool()` (721-737) sets
   `this.pool` **without** setting `this.initialized`. `ensureInitialized()` (107) gates on
   `this.pool && this.initialized`, so after a `getPool()` call it builds a **second** pool
   and overwrites `this.pool` (121). Pool #1 is orphaned and `close()` only ends the current
   one. The same window reopens whenever `ensureInitialized()` throws after line 121.
4. **F4 — schema-blind table enumeration.** Same file, `listAllProjectsAcrossDimensions`
   (742-782): `SELECT tablename FROM pg_tables WHERE tablename ~ '^vector_documents_[0-9]+d$'`
   has **no `schemaname` filter**, so identically-named tables in other schemas are
   `UNION ALL`'d together and double-counted; and the generated SQL interpolates the
   **unqualified** `${t.tablename}`, so execution resolves via `search_path` and may read a
   different table than the one enumerated.
5. **F5 — the model-registry routes cannot run outside a source checkout.**
   `GENERATE_SCRIPT` (`model-registry.ts:28-31`, `model-registry-stream.ts:29-32`) and
   `profilesLib()` (`model-registry.ts:15-21`) anchor on `import.meta.dirname` with a fixed
   4-segment climb that is only correct from `apps/tools-api/src/routes/`. Both the published
   npm package (`files: ["dist"]`) and the Docker image resolve it wrong or to a path that
   was never shipped, and the failure surfaces as `MODULE_NOT_FOUND` or a spawn failure
   rather than a diagnosable status.
6. **F7 — the mask sentinel is persisted as a real secret.** `handleConfigReveal`
   (`app.js:1459-1481`) writes `el.value = "***"` when hiding a revealed field.
   `applyMaskedSentinel` (`packages/shared/src/config/config-writer.ts:32-50`) substitutes the
   stored value back **only when `current.<field>` is truthy**. On a previously **empty**
   sensitive field the guard fails and the literal string `"***"` is written to
   `config.json` as the real `security.apiKey`, `llm.apiKey`, `embedding.apiKey`, or
   `database.url`.
7. **F8 — a failed install is reported as success.** `installActiveProfiles`
   (`model-registry-stream.ts:45-76`) emits
   `{type:"install", status:"switched"}` (line 63) whenever `switchProfile` *returns*, and
   computes `switched`/`skipped`/`failed` from the report only as display strings. A report
   in which every host failed still emits `status:"switched"`, and the UI counts it into
   `installResults.switched` (`app.js:1849`).

### Security

8. **S1 — plaintext secrets at world-readable modes, with uncapped backups.**
   `~/.config/massa-ai/config.json` holds plaintext `security.apiKey`, `llm.apiKey`,
   `embedding.apiKey` and `database.url`. Neither `saveConfig`
   (`config-loader.ts:143-163`) nor `writeOverlayAtomically` passes a `mode`, so the file
   lands at the process umask — measured **644** on this machine. `savePartialConfig`
   (`config-writer.ts:296-300`) additionally `copyFileSync`s a
   `config.json.bak.<ISO>` on **every** save with **no retention cap**.
9. **S2 — `/config/reveal` escalated the Docker exposure.** `Dockerfile:98` sets
   `MASSA_AI_WEB_UI_TRUST_LOCAL=true` unconditionally, handing the API key to every caller
   that can reach `:3333`. Before v1.41 that leaked masked values; the new
   `GET /api/v1/config/reveal` route makes it plaintext `database.url` and every API key.
   `docs/web-ui-access.md` still describes the pre-reveal exposure.

### Quality

10. **Q1 — ~90 lines of verbatim duplication.** `model-registry-stream.ts`
    `/regenerate-and-install-stream` (78-179) and `/regenerate-stream` (181-281) are
    byte-equivalent handler bodies.

### Spec / state drift

11. **D1** — `.specs/HANDOFF.md` still points at `admin-portal-enhancements`
    "validation pending", 3 features and 2 releases stale.
12. **D2** — `.specs/project/FEATURES.json` gives `admin-portal-enhancements` status
    `"execute-complete"`, a value **no other entry uses**, with notes still saying
    "Validation pending".
13. **D3** — `.specs/project/STATE.md:41-42` claims "tools-api 25 fails pre-existing on
    base". Measured at `69c0632c`: **0 fails**, 29 groups all pass.
14. **D4** — `skills/massa-ai/scripts/validate_state.ts:270` prints
    `${n} error(s) across [${checked}]` where `checked` is the **scanned** population
    (88 features), not the failing set — it reads as total collapse.
15. **D5** — the 4 modified files on the working tree carry no spec, no tasks, and no
    CHANGELOG entry; `[Unreleased]` is empty, so the CI CHANGELOG merge gate fails as-is.

## Goals

- [ ] An operator with a saved overlay still receives future builtin registry additions.
- [ ] A project-list failure is reported as a failure, naming its cause.
- [ ] One connection pool per store instance; enumerated and queried tables are the same tables.
- [ ] The mask sentinel can never be persisted as a secret value.
- [ ] An install that failed is reported as failed.
- [ ] The model-registry routes either work or return a diagnosable 501 — never a stack trace.
- [ ] Secret files are owner-only and their backups are bounded.
- [ ] `.specs/` state files describe the repository as it actually is.

## Out of Scope

| Item | Reason |
| --- | --- |
| **Q2** — reversing the `check-coverage.ts` EXCLUSIONS entry for `config-writer.ts` | The subprocess-harness blind spot is real and honestly documented (`scripts/check-coverage.ts:209-218`); reversing it needs a config-layer seam change. Its own feature. |
| **Q3** — splitting `app.js` (2601 lines, ~60 exports) | The god-file class four PRs eliminated in core (`core-layering-god-module-split`), with no equivalent gate for `apps/web-ui`. Its own feature. |
| **Q4** — the generator `--check` / non-`--check` registry split | See Amendment 4: T1 removes the *accidental* trigger but not the *intentional* one. Recorded, not fixed here. |
| The legacy 52 `validate_state` errors | The 5 admin-portal-era features are already clean; the 52 belong to pre-existing features and are not this feature's debt. D4 changes only how the count is *reported*. |
| Flipping `MASSA_AI_WEB_UI_TRUST_LOCAL` to `false` in the Docker image | User decision 2026-08-08: keep `true`, document the escalation and verify the startup warning. Flipping it is a public compatibility break for every existing `docker compose` user. |
| Changing the overlay wire format or the `PUT /` full-object contract | The overlay stays a full-object PUT; only its *interpretation* (delta, deep-merged) is corrected. |

---

## Amendments — audit mechanisms that did not reproduce

The brief's RULE requires re-verifying each named mechanism before writing its fix. Three
did not survive. The **symptom** is real in all three; the **named cause** is corrected here
and the task is scoped to the measured cause.

| # | Audit claim | Measured at `69c0632c` | Effect on the task |
| --- | --- | --- | --- |
| **A1** (F5/T7) | "`import.meta.dirname` in `dist/` is one level shallower" is why the Docker image cannot serve the route. | The Docker `api` target runs **`CMD ["bun", "./apps/tools-api/src/index.ts"]`** (`Dockerfile:106`) — **source, not `dist`**. From `/app/apps/tools-api/src/routes` the 4-segment climb resolves to `/app/scripts/…`, which is the *right shape* but **absent**: `Dockerfile:40-44` copies `packages`, `apps/tools-api`, `apps/web-ui`, `apps/mcp-client`, `apps/opencode-plugin` and **never `scripts/`**. | Two independent mechanisms, not one. The `dist` arithmetic defect is real but applies only to the **published npm package** (`files: ["dist"]`). T7 must fix the anchor *and* handle a missing `scripts/` directory. Shipping `scripts/` into the image cannot rescue it — the generator's charter sources (`skills/agents/`) and 3 of its 4 output roots (`apps/{claude,codex,cursor}-plugin/`) are not in the image either. |
| **A2** (S1/T8) | "`saveConfig` uses bare `writeFileSync` with no mode"; "3 backups already accumulated locally, same 644 mode". | `saveConfig` (`config-loader.ts:143-163`) writes a uniquely-named sibling temp file and `renameSync`s over the target — **atomic, not bare**. The **mode** half is correct: no `mode` option anywhere, and `config.json` measures **644**. The backups are **mixed**: `config.json.bak` and `config.json.bak.2026-08-08T14-48-32-748Z` are **600**, `config.json.bak.2026-08-08T14-49-56-996Z` is **644** — `copyFileSync` inherits the source file's mode, which changed between saves. | T8 must **not** rewrite `saveConfig`'s atomicity (it is load-bearing — SEC-01 concurrent key provisioning). It sets an explicit mode and repairs existing files. The backup fix must set the mode explicitly rather than rely on inheritance. |
| **A3** (F2/T2) | "bare `catch {}` plus `?? []` turns DB-down into `{success:true, projects:[]}`". | On a DB-down, `ensureInitialized` assigns `this.pool` at line 121 **before** `pool.connect()` throws at 123. The inner fallback's `getPool()` therefore returns that live-but-unusable pool and its own `pool.query` throws too, reaching the **outer** catch → `{success:false}`. The silent-empty-success path is real but is reached when the store **lacks** `listAllProjectsAcrossDimensions` (`?.()` → `undefined` → `?? []`). | The defect — a bare catch that swallows every error class while its comment names one — is real and T2 stands. The **DB-down** scenario is not the one that reproduces it, so T2's regression test must assert on the *rethrow*, not on the DB-down-returns-empty story. Note the coupling to F3: the pool-assignment-before-connect at line 121 is what makes DB-down fail loudly today, and T3 must not silently remove that. |
| **A5** (S2/T8) | "Verify the startup warning fires; if it does not, add it." | It already fires. `warnIfTrustOverrideEnabled()` is defined at `apps/tools-api/src/web-ui-trust.ts:80-91`, called **unconditionally** at `apps/tools-api/src/index.ts:161`, one-shots per process via `warnedAboutTrustOverride`, and has unit coverage at `apps/tools-api/src/__tests__/web-ui-trust.test.ts:99-104`. It uses plain `console.warn` (stderr), independent of the shared logger. | The "add it if missing" half of the AC is dead. What the existing test does **not** cover is that `index.ts` reaches the call — it injects its own `warn` and tests the function in isolation. APCR-08.8 is re-scoped to that one uncovered link instead of re-testing the one-shot logic. |
| **A4** (Q4) | "T1's normalization-on-read may reduce Q4 to a non-issue." | `scripts/generate-subagent-artifacts.ts:719` uses `loadEffectiveRegistry()` for the emit path; `--check` (line 711/717) stays on `loadRegistry()` (builtin alone), documented in the comment at 716-718. Normalization drops overlay keys **byte-identical to builtin**, so it fully removes the *accidental* trigger (a full-copy overlay written by v1.41/v1.42, which today makes `--check` red for zero operator intent). It does **not** remove the *intentional* trigger: any genuine operator edit still makes `--check` red. | Q4's deferral **stands**, narrowed. Recorded in Assumptions, not scheduled. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| F1 fix direction | Server-side deep merge per profile/host/tier **plus** one-time overlay normalization on read | Settled by the user before this spec. The overlay is a delta on the builtin; deep merge makes a partial overlay valid, and normalize-on-read collapses a v1.41/v1.42 full-copy overlay back to a delta without losing operator edits. | y (user, pre-spec) |
| The client seeds the overlay from the saved overlay only | Revert `initRegistryOverlay` to overlay-only | The full-registry seed was a workaround for the whole-profile replace. Once the server deep-merges, the workaround is what causes F1. | y (user, pre-spec) |
| Branch shape | One branch, all 3 Phases, 11 atomic commits | User decision 2026-08-08. T6, T7 and T9 all edit `model-registry-stream.ts`, so a per-Phase split would force cross-branch rebases. Recorded as a deliberate deviation from `implementation-delivery.md` Stage 1's phased-work rule. | y (user) |
| Docker `MASSA_AI_WEB_UI_TRUST_LOCAL` default | Stays `true`; document + verify the startup warning | User decision 2026-08-08. Flipping it breaks `/ui` for every existing docker-compose user. | y (user) |
| T7 deployment approach | Robust anchor + clean 501; do **not** add `scripts/` to `files[]` or the Docker COPY list | Decided from measurement (Amendment A1), not preference: the generator cannot function in the image even if `scripts/` were copied, because its charter sources and 3 of 4 output roots are absent. The admin portal is a local-operator surface by design (`model-registry.ts:7-13`). | y (measured) |
| Backup retention cap | Keep the **10** most recent `config.json.bak.*`, delete older | No prior policy exists. 10 covers a normal editing session while bounding a directory that holds plaintext secrets. | Assumed — flagged |
| Existing over-permissive files are repaired, not just future ones | `chmod 0600` existing `config.json` and every `config.json.bak*` on the next save | A mode fix that only applies to future writes leaves the already-leaked 644 file in place indefinitely. | Assumed — flagged |
| Q4 stays deferred | Recorded in Out of Scope with Amendment A4's narrowing | Fixing it means changing what `--check` compares against, which is a CI build gate and `pretest:scripts` dependency. Its own feature. | y |

Open questions: none blocking. Two assumptions are flagged rather than confirmed — the
backup retention cap of 10, and repairing existing over-permissive files rather than only
future writes. Both are recorded above with their rationale and are reversible in one edit
if the user disagrees.

---

## User Stories

- **As an operator who saved a registry overlay**, I want later builtin registry additions to
  still reach me, so that upgrading massa-ai is not silently a no-op for my machine.
  (APCR-01)
- **As an operator whose database is unreachable**, I want the project list to tell me it
  failed, so that I do not read an empty list as "no projects indexed". (APCR-02)
- **As an operator running a long-lived API process**, I want one connection pool per store,
  so that a dimension-agnostic query does not silently leak a pool that `close()` never ends.
  (APCR-03)
- **As an operator with more than one PostgreSQL schema**, I want project counts to come from
  the schema I am actually using, so that the numbers are not doubled or read from the wrong
  table. (APCR-04)
- **As an operator setting an API key for the first time**, I want the masking sentinel never
  to become my key, so that saving the Config tab does not lock me out. (APCR-05)
- **As an operator regenerating agents**, I want a failed install reported as failed, so that
  I do not restart my host session believing agents were updated. (APCR-06)
- **As an operator running the Docker image or the published package**, I want the registry
  routes to say they are unavailable in this deployment, so that I get a diagnosis instead of
  a stack trace. (APCR-07)
- **As an operator on a shared machine**, I want `config.json` and its backups readable only
  by me and bounded in number, so that plaintext secrets are not world-readable or
  accumulating without limit. (APCR-08)
- **As a maintainer of this repository**, I want one SSE handler behind the two routes and
  `.specs/` state that matches the tree, so that the next session resumes from facts rather
  than from a stale claim. (APCR-09, APCR-10, APCR-11)

---

## Requirement Traceability

| Requirement | Audit finding | Task | Phase | Evidence anchor |
| --- | --- | --- | --- | --- |
| APCR-01 | F1 | T1 | 1 | `model-profiles.ts:523-553`, `model-registry.ts:185-214`, `app.js:1556-1590` |
| APCR-02 | F2 | T2 | 1 | `project.ts:127-135` |
| APCR-03 | F3 | T3 | 1 | `postgres-vector-store.ts:107-121, 721-737` |
| APCR-04 | F4 | T4 | 1 | `postgres-vector-store.ts:742-782` |
| APCR-05 | F7 | T5 | 1 | `app.js:1459-1481`, `config-writer.ts:32-50` |
| APCR-06 | F8 | T6 | 1 | `model-registry-stream.ts:45-76`, `app.js:1849` |
| APCR-07 | F5 | T7 | 2 | `model-registry.ts:15-31`, `model-registry-stream.ts:29-32`, `Dockerfile:40-44,106` |
| APCR-08 | S1, S2 | T8 | 2 | `config-loader.ts:143-163`, `config-writer.ts:296-300`, `Dockerfile:96-98`, `docs/web-ui-access.md` |
| APCR-09 | Q1 | T9 | 3 | `model-registry-stream.ts:78-179, 181-281` |
| APCR-10 | D1, D2, D3, D4 | T10 | 3 | `.specs/HANDOFF.md:1`, `FEATURES.json:1117`, `STATE.md:41-42`, `validate_state.ts:270` |
| APCR-11 | D5 | T11 | 3 | the 4 carried working-tree files, `CHANGELOG.md` |

Deferred, traced but not scheduled: **Q2** (`check-coverage.ts:209-218`), **Q3**
(`app.js`, 2601 lines), **Q4** (`generate-subagent-artifacts.ts:711-719`).

---

## Requirements

### Phase 1 — Correctness (P0)

#### APCR-01 — Overlay is a delta, deep-merged (T1, was F1)

**User Story**: As an operator who saved a registry overlay, I want later builtin registry
additions to still reach me, so that upgrading massa-ai is not silently a no-op for me.

**Acceptance Criteria**:

1. WHEN an overlay specifies `profiles.<p>.hosts.<h>.<tier>` THEN the merged registry SHALL retain every other profile, host, and tier present in the builtin. <!-- event-driven -->
2. WHEN an overlay specifies `hostDefaults.<h>` or `workflowTiers.<w>` for a subset of keys THEN the merged registry SHALL retain the builtin's remaining keys. <!-- event-driven -->
3. WHEN a builtin adds a new profile, host, tier, `hostDefaults` entry, or `workflowTiers` entry AND an overlay exists that does not mention it THEN the merged registry SHALL contain the new entry. <!-- event-driven — the regression test the audit asked for -->
4. WHEN an overlay key is byte-identical to the builtin's value for the same path THEN the read path SHALL drop it, so a full-copy overlay collapses to a delta. <!-- event-driven -->
5. WHEN an overlay carries an operator edit that differs from the builtin THEN normalization SHALL preserve it. <!-- event-driven -->
6. WHEN a profile carries `_delete: true` THEN the merge SHALL tombstone it exactly as before. <!-- event-driven — no regression -->
7. The route and the library SHALL share one merge implementation, so identical input cannot produce differing output. <!-- ubiquitous — they are twins and drifted once already -->
8. The client SHALL seed the in-memory overlay from the saved overlay only, never from the effective registry. <!-- ubiquitous -->
9. WHERE a pre-existing overlay entry was copied from an **older** builtin whose value has since changed, normalization SHALL NOT drop it and the overlay value SHALL win. <!-- state-driven — documented limitation, see below -->
10. The read path SHALL report the count of overlay entries that survive normalization, so an operator can see how much of the registry their overlay is overriding. <!-- ubiquitous — the only available mitigation for AC9 -->

**Limitation behind AC9 — recorded, not fixed.** Normalization compares an overlay value
against the **current** builtin. `OverlayData` (`model-profiles.ts:431-436`) carries no
version, timestamp, or provenance field, so an entry copied from a past builtin and an entry
the operator deliberately typed are indistinguishable once the builtin's value moves. Deep
merge fully fixes AC3 (a builtin **addition** always reaches the operator, because the merge
starts from the builtin). Normalization fully fixes the case where the builtin value has
**not** changed. The remaining case — a v1.41/v1.42 full-copy overlay entry whose builtin
value later changes — stays frozen on the old value until the operator edits or clears the
overlay. AC10 is the mitigation: make the override count visible rather than silent.
Clearing is already available via `DELETE /api/v1/model-registry/overlay`.

**Independent Test**: construct a builtin with profile `A`, add an overlay touching only
`A.hosts.claude.light.model`, add a new profile `B` to the builtin, merge — assert `B` is
present and `A`'s other tiers are unchanged. Separately, pin AC9: an overlay byte-identical
to builtin **v1**, read against builtin **v2** whose value changed, still returns the v1
value — asserted as the known limitation, so a future change to normalization is a visible
test change rather than a silent behavior change.

#### APCR-02 — Project list fails loud (T2, was F2)

1. WHEN `listProjects()` throws an embedding-dimension-mismatch error THEN the route SHALL fall back to `listAllProjectsAcrossDimensions()`. <!-- event-driven — preserves the existing behavior at `project.test.ts:90` -->
2. WHEN `listProjects()` throws any other error THEN the route SHALL NOT fall back, and SHALL return `{success:false}` carrying that error's message. <!-- event-driven -->
3. The route SHALL NOT reach `listAllProjectsAcrossDimensions` through an `as any` cast or an optional-call-plus-`?? []` default. <!-- ubiquitous -->
4. `listAllProjectsAcrossDimensions` SHALL be declared on the vector-store interface the route depends on. <!-- ubiquitous -->

**Independent Test**: mock `listProjects` to throw a non-dimension error; assert the response
is `success:false` and that the fallback was never called.

#### APCR-03 — One pool per store (T3, was F3)

1. WHEN `getPool()` runs before `ensureInitialized()` THEN exactly **one** `Pool` SHALL be constructed across both calls. <!-- event-driven -->
2. WHEN `ensureInitialized()` throws after constructing a pool AND is called again THEN the store SHALL NOT leak the first pool. <!-- event-driven -->
3. `close()` SHALL end every pool the store constructed. <!-- ubiquitous -->
4. A DB-down `listProjects()` SHALL still surface as a thrown error, not a silent empty result. <!-- ubiquitous — guards Amendment A3's coupling -->
5. WHEN `getPool()` runs before `ensureInitialized()` AND `ensureInitialized()` is then called THEN `tableName` and `schemaDimensions` SHALL still be populated. <!-- event-driven — sharing the pool path must not let `getPool` satisfy the `initialized` gate and skip the dimension setup at lines 125-131 -->

**Independent Test**: inject a Pool constructor counter; call `getPool()` then
`ensureInitialized()`; assert the counter is 1.

#### APCR-04 — Schema-qualified table enumeration (T4, was F4)

1. The `pg_tables` scan SHALL filter on `schemaname = current_schema()`. <!-- ubiquitous -->
2. The generated `UNION ALL` SQL SHALL reference each table by a quoted, schema-qualified identifier. <!-- ubiquitous -->
3. WHEN two schemas each hold a `vector_documents_768d` THEN the result SHALL count only the current schema's rows. <!-- event-driven -->

**Independent Test**: assert the emitted SQL string contains `schemaname` and a quoted
qualified identifier; assert a two-schema fixture is not double-counted.

#### APCR-05 — The mask sentinel is never persisted (T5, was F7)

1. WHEN a sensitive field's submitted value equals `"***"` THEN the saved config SHALL carry the previously stored value for that field, whatever it was. <!-- event-driven -->
2. WHEN a sensitive field's previously stored value is empty or absent AND the submitted value is `"***"` THEN the saved config SHALL NOT contain the literal `"***"` for that field. <!-- event-driven — the defect -->
3. The four sensitive fields (`security.apiKey`, `llm.apiKey`, `embedding.apiKey`, `database.url`) SHALL behave identically. <!-- ubiquitous -->
4. Hiding a revealed field in the UI SHALL NOT leave a value that, if submitted, would be stored verbatim. <!-- ubiquitous -->

**Independent Test**: save a partial config with `security.apiKey = "***"` against a current
config whose `security.apiKey` is `""`; assert the persisted value is not `"***"`.

#### APCR-06 — Install status derives from the report (T6, was F8)

1. WHEN `switchProfile`'s report contains at least one host with status `switched` THEN the emitted install event status SHALL be `switched`. <!-- event-driven -->
2. WHEN the report contains no `switched` host and at least one `failed` host THEN the emitted status SHALL be `failed`. <!-- event-driven — the defect -->
3. WHEN the report contains only `skipped` hosts THEN the emitted status SHALL be `skipped`. <!-- event-driven -->
4. The emitted event SHALL retain the per-host detail strings for every status class. <!-- ubiquitous — no UI regression -->
5. The UI banner SHALL classify the event by that status, not by the presence of the event. <!-- ubiquitous -->
6. WHEN the generator exits 0 AND at least one install failed or was unsupported THEN the UI banner SHALL NOT be rendered as `success`. <!-- event-driven — see below -->
7. `unsupported` SHALL be its own class in both the derived status and the detail strings, never folded into `skipped`. <!-- ubiquitous — see below -->

**AC6 — the defect that survives the server fix.** `app.js:1854-1859` selects the banner
from `event.exitCode === 0` alone, so a run in which the generator succeeded and **every**
host install failed still calls `showBanner(ctx.root, "success", …)` with `"Failed: …"`
inside the message text. Deriving the SSE status correctly (AC1-3) does not touch that
branch. Without AC6, APCR-06 can be fully implemented and the operator still sees green —
which is the exact outcome the requirement's user story disclaims.

**AC7 — the fourth status.** `HostSwitchStatus` is
`"switched" | "skipped" | "unsupported" | "failed"` (`packages/shared/src/profile-switch/report.ts:29`),
and `unsupported` is reachable in ordinary operation (`engine.ts:257, 264` — "bundle has no
variants — upgrade plugin"). The current detail-string joins
(`model-registry-stream.ts:59-61`) filter for three of the four, so an `unsupported` host is
**invisible** today. A three-value derivation would report it as `skipped` — "nothing needed
doing" — when it means "this host cannot run the profile you chose".
`reportSucceeded(report)` (`report.ts:51-53`) already encodes the correct
`switched|skipped` = success boundary and SHALL be reused rather than re-derived.

**Independent Test**: mock `switchProfile` to return a report whose only host is `failed`;
assert the SSE frame carries `status:"failed"` **and** that the UI renders a non-success
banner for that stream.

### Phase 2 — Deployment + security (P1)

#### APCR-07 — Registry routes degrade diagnosably off-checkout (T7, was F5)

1. The generator-script path SHALL resolve correctly when the route module runs from `apps/tools-api/src/routes/`. <!-- ubiquitous -->
2. The generator-script path SHALL resolve correctly when the route module runs from a bundled `dist/`. <!-- ubiquitous -->
3. WHEN the generator script is not present at the resolved path THEN `POST /regenerate` SHALL return **501** with a message naming the deployment limitation, not a spawn failure. <!-- event-driven -->
4. WHEN `scripts/lib/model-profiles.ts` is not resolvable THEN the registry read/write routes SHALL return **501** with the same class of message, not `MODULE_NOT_FOUND`. <!-- event-driven -->
5. WHEN the generator script is not present THEN the SSE stream routes SHALL emit a terminal `done` frame carrying that reason. <!-- event-driven -->
6. The 501 message SHALL be identical in shape across all affected routes. <!-- ubiquitous -->

**Independent Test**: point the resolver at a non-existent root; assert 501 and the message,
with no thrown module error.

#### APCR-08 — Secret files are owner-only and bounded (T8, was S1+S2)

1. `config.json` SHALL be written with mode `0600`. <!-- ubiquitous -->
2. Every `config.json.bak.*` SHALL be created at `0600` by the **same** temp-file-plus-rename path used for `config.json`, never by `copyFileSync` followed by a separate `chmod`. <!-- ubiquitous — see below -->
3. WHEN an existing `config.json` or backup is more permissive than `0600` THEN the next save SHALL tighten it — including the legacy untimestamped `config.json.bak`, which is chmod'd but never deleted. <!-- event-driven -->
4. WHEN more than 10 `config.json.bak.<ISO>` files exist after a save THEN the oldest SHALL be deleted until 10 remain. <!-- event-driven -->
5. `saveConfig`'s temp-file-plus-rename atomicity SHALL be preserved, and the temp file SHALL also be `0600` — a temp file at 644 would leak the same secrets in the rename window. <!-- ubiquitous — Amendment A2 -->
6. The overlay file `model-profiles.json` is **not** in scope for `0600`: its schema is `version` / `tiers` / `hostDefaults` / `workflowTiers` / `profiles.*.hosts.*.{model,effort}` — model ids and effort levels, no secrets. <!-- ubiquitous — verified against the schema, not assumed -->
7. `docs/web-ui-access.md` SHALL state that with `MASSA_AI_WEB_UI_TRUST_LOCAL=true` the `/config/reveal` route exposes plaintext `database.url` and every API key to any caller that can reach the port. <!-- ubiquitous -->
8. A test SHALL assert that `apps/tools-api/src/index.ts` actually reaches the startup warning call. <!-- ubiquitous — re-scoped, see Amendment A5 -->
9. `docs/web-ui-access.md` SHALL state that backups are **not** purged when a key is rotated: up to 10 files retain the previous secret at `0600` until they age out. <!-- ubiquitous -->
10. `docs/web-ui-access.md` SHALL state that `/config/reveal` carries **no protection beyond** the already-accepted `/ui` key-injection chain — it is not in `PUBLIC_PATHS`, so it is authenticated, but the key that authenticates it is the same key `/ui` hands out. <!-- ubiquitous — so "documented" is not misread as "mitigated" -->

**AC2 — why not `copyFileSync` + `chmod`.** `copyFileSync` inherits the **source** file's
mode (which is why the three existing backups measure 600/600/644). A subsequent `chmodSync`
leaves a window in which the new backup exists at the source's mode — 644 on this machine
until the AC3 repair lands — and, more importantly, **a `chmod` does not revoke a file
descriptor already opened**. A same-UID process watching the config directory (the exact
"shared machine" actor in this requirement's user story) can open the backup the instant
`copyFileSync` returns and keep reading the plaintext secret. This is the same defect class
AC5 already closes for the primary write; AC2 closes it for the backup path.

**Independent Test**: save a config in a scratch `XDG_CONFIG_HOME`; `stat` the resulting
`config.json`, its temp file and every backup; assert `0600` and a count ≤ 10. Separately,
plant a pre-existing 644 `config.json.bak` and assert the next save tightens it without
deleting it.

### Phase 3 — Hygiene + state truth (P2)

#### APCR-09 — One SSE handler, two routes (T9, was Q1)

1. The two SSE routes SHALL share one handler implementation. <!-- ubiquitous -->
2. `POST /regenerate-stream` SHALL remain registered and behave identically to `POST /regenerate-and-install-stream`. <!-- ubiquitous -->
3. The refactor SHALL be behavior-preserving: the existing `model-registry-stream.test.ts` suite SHALL pass unchanged except for additions. <!-- ubiquitous -->

#### APCR-10 — State files describe the repository (T10, was D1-D4)

1. `.specs/HANDOFF.md` SHALL describe this feature as Active, with the prior Active block renamed to Previous — rotated, not replaced. <!-- ubiquitous -->
2. The rotation SHALL be verified by asserting the file's `##` section count **grew**. <!-- ubiquitous — the recorded prepend-regex failure mode -->
3. `FEATURES.json` SHALL contain no `execute-complete` status; `admin-portal-enhancements` SHALL be `complete` with notes that no longer say "Validation pending". <!-- ubiquitous -->
4. `STATE.md`'s "tools-api 25 fails pre-existing on base" SHALL be corrected to the measured **0 fails / 29 groups pass**, with the measurement date. <!-- ubiquitous -->
5. `validate_state.ts` SHALL print the **failing** feature set in the summary line, not the scanned population. <!-- ubiquitous -->
6. WHEN there are zero errors THEN the summary line SHALL not print an empty bracket. <!-- event-driven -->
7. The 4 `apps/*-plugin/skills/massa-ai/scripts/validate_state.ts` copies SHALL match, via `bun run generate:artifacts` — they are generated build output, not hand-edited. <!-- ubiquitous -->

**Independent Test**: run `validate_state.ts --root .`; assert the bracket lists strictly
fewer features than the scanned total and that each listed feature appears in an `ERROR` line.

#### APCR-11 — The uncommitted work lands with a contract (T11, was D5)

The 4 pre-existing modified files are part of this feature and carry these behaviors:

- `apps/web-ui/src/static/app.js` — `createApiClient` gains `authHeaders()`; the raw
  `fetch()` in `handleRegistryRegenerate` was sending **no API key** against a mandatory-auth
  API (AD-011). Registry add/duplicate/delete gained existence checks and a source-profile
  picker. `mergeRegistryForDisplay` makes add/duplicate/delete visible before save.
- `apps/tools-api/src/routes/model-registry-stream.ts` — new
  `POST /regenerate-and-install-stream` that auto-installs after a successful regenerate;
  `/regenerate-stream` kept as a deprecated alias.
- the two `*.test.ts` files — coverage for the above.

**Acceptance Criteria**:

1. The delivered suite SHALL represent every behavior above as an acceptance criterion in this spec or as a passing test. <!-- ubiquitous -->
2. The `[Unreleased]` section of `CHANGELOG.md` SHALL carry entries for this feature under headings that map to the intended version bump per `CONTRIBUTING.md`. <!-- ubiquitous -->
3. WHEN the regenerate handler issues its `fetch` THEN it SHALL send the API key. <!-- event-driven -->
4. WHERE the in-memory overlay carries empty objects for `hostDefaults`, `workflowTiers`, or `tiers`, the display merge SHALL NOT blank them — a live coupling to APCR-01.8's revert. <!-- state-driven -->

---

## Verified Baselines

Re-measured on this branch at `69c0632c` before any edit. A regression against any of these
is a gate failure.

| Gate | Baseline |
| --- | --- |
| `bun test apps/web-ui/src/__tests__/` | 320 pass / 0 fail (703 expect, 9 files) |
| `cd apps/tools-api && bun scripts/run-tests-isolated.ts` | 29 groups, all pass |
| `bun run type-check` | 6/6 successful |
| `npx oxlint --quiet` | exit 0 |
| `bun skills/massa-ai/scripts/validate_state.ts --root .` | exit 1, 52 errors, all legacy; the 5 admin-portal-era features clean |
| `apps/web-ui/src/static/app.js` | 2601 lines |
| `apps/web-ui/src/static/styles.css` | 802 lines |

## Sizing

Large. `3 Phases = 11 Tasks`. Design required (public compatibility surface, security,
data-loss-adjacent config backups, a shared merge contract with two implementations).
Tasks required (dependency complexity: T9 depends on T6; T11 depends on T1 and T6).
