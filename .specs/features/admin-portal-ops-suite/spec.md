# Admin Portal Operations Suite Specification

**Slug**: `admin-portal-ops-suite`
**projectId**: `massa-ai` · **workflowSessionId**: `spec-admin-portal-ops-suite`
**Branch**: `spec/admin-portal-ops-suite` from `origin/main` @ `c82d8f92` (v1.46.0)
**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ops-suite`
**Scope tier**: Large — 4 independent capabilities across `packages/shared`,
`packages/core`, `apps/tools-api`, `apps/web-ui`, and `apps/claude-plugin`.

## Problem Statement

Four operator-facing gaps in the Admin Portal and the profile-switch layer.
Clearing a project's memories requires one `POST /api/v1/memory/delete` per row,
which is unusable at real memory counts. The scheduler is reachable only through
environment variables, so an operator running the packaged server has no
supported way to turn periodic jobs on or retune their intervals. Server logs
exist only on stderr and an opt-in unrotated file sink, so there is no way to
read, filter, or export them from the portal. And the Models tab still tells
Claude users that profile switching is unavailable — the one host of the three
file-capable hosts that never gained parity.

## Goals

- [ ] One action deletes every memory of a selected project; index data untouched.
- [ ] `scheduler` becomes a first-class `config.json` section, editable from the
      Config tab, with `env > config.json > defaults` precedence matching every
      other section.
- [ ] A Logs tab streams new log entries live, filters a closed date/hour range,
      and downloads that range as a file.
- [ ] The Models tab lists switchable profiles for Claude and switches them,
      with the same per-host result rows Codex and OpenCode already produce.

## Measured Baseline (evidence for the Claude gap)

Read on 2026-08-09 from this machine, before any change:

| Fact | Value | Source |
| --- | --- | --- |
| `platforms.claude.installRoute` | `"marketplace"` | `~/.config/massa-ai/install-state.json` |
| `~/.claude/massa-ai/agent-profiles/` | absent | `ls` |
| `~/.claude/agents/` | present, empty | `ls` |
| Claude plugin `installPath` | `~/.claude/plugins/cache/massa-ai/massa-ai/1.45.0` | `~/.claude/plugins/installed_plugins.json` |
| `<installPath>/agents/` | 17 `massa-ai-*.md` files | `ls` |
| `<installPath>/agent-profiles/` | `balanced cheap heavy home work` | `ls` |
| Marketplace `installLocation` | `/Users/luizmassa/Projects/massa-ai` (source `directory`) | `~/.claude/plugins/known_marketplaces.json` |
| `platforms.codex.installRoute` | `"file"`, 5 variants present | state + `ls` |
| `platforms.opencode.installRoute` | `"file"`, 7 variants present | state + `ls` |

Two independent blockers follow from this table, and both must be closed:

1. `resolveHostLayout("claude")` (`packages/shared/src/profile-switch/hosts.ts:86-93`) returns the **file**-route layout (`~/.claude/agents`, `~/.claude/massa-ai/agent-profiles`). Neither path is populated on a marketplace install, so `listVariantProfiles` returns `[]` and `renderProfiles` (`apps/web-ui/src/static/app.js:1071-1078`) takes the `available.length === 0` branch that prints the reported message.
2. `detectRoute` (`hosts.ts:124-139`) refuses `installRoute: "marketplace"` outright, so even a populated variants root would report `status: "failed"`.

The refusal's stated reason — "in-place bundle rewrite would dirty a checkout
and break the drift gate" — is **false for Claude**: Claude copies the bundle
into its own versioned cache directory, which is outside the checkout. The
reason remains unverified for Codex's marketplace route and is left in force
there.

## Out of Scope

| Item | Reason |
| --- | --- |
| Codex marketplace-route switching | Not requested; the checkout-dirtying premise is unverified for Codex and verifying it is its own investigation. The refusal is narrowed to codex, not deleted. |
| Cursor profile switching | Every Cursor tier resolves to `inherit`; the switch layer skips it by design (`CURSOR_SKIP_REASON`). Unchanged. |
| Filtered / partial bulk memory delete | User-selected: the action deletes all memories for the project, ignoring the table's type/level/importance filters. |
| Deleting vectors, symbols, or checkpoints from the bulk action | `project-reset` already owns that; the new action is memories-only by construction. |
| Undo / soft-delete / recycle bin for memories | `deleteByProject` is a hard delete; adding reversibility is a separate data-model change. |
| Live scheduler reconfiguration without restart | User-selected: `scheduler` joins `restartNeededSections` and reuses the existing restart-proposal banner + Restart button. |
| New scheduler job kinds, or scheduler-triggered indexing | Indexing on a clock is a recorded OOM hazard (`scheduler-defaults.ts:26-29`). The config section exposes only the five registered kinds. |
| Cron-expression schedules in the config surface | `ScheduleSpec` and `scheduler-cron.ts` **do** support `type:"cron"`, but all five `DEFAULT_SCHEDULED_JOBS` register `type:"interval"` and every existing env knob is `*_INTERVAL_MS`. Exposing cron would add a validation surface (expression parsing, error reporting) with no requested user. The config section mirrors the env surface exactly: interval only. |
| Log ingestion from other machines, or a log search index | The Logs tab reads this server's own sink. |
| Structured log querying by arbitrary meta field | Filters are limited to time range, level, and a substring match over the rendered message. |
| Log redaction / secret scrubbing | Existing logger behavior is unchanged; no call site is audited or rewritten by this feature. |
| Retention/GDPR policy for the log file | Rotation bounds disk use; retention policy is not a stated requirement. |
| Changing which MCP tools exist | No tool-def / embedded-client change is in scope; every new endpoint is REST-only (Admin Portal surface). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Claude parity mechanism | Marketplace-cache layout: resolve `activeDir`/`variantsRoot` from `installed_plugins.json` `installPath`, read at switch time; `detectRoute` proceeds for claude+marketplace | The cache is a real copy outside the checkout and already ships both trees (measured above). The file-route alternative would leave Claude discovering the bundle's agents *and* loose `~/.claude/agents` copies — 17 duplicate specialists. | y — user |
| Log source model | File sink is the history source for range queries and export; the in-memory ring buffer is the live-tail source only | Every buffered entry is also appended to the file, so a single source per operation means no cross-source de-duplication. | y — user (both buffer + file) |
| Scheduler config surface | New `scheduler` section in `config.json`, `env > config.json > defaults`, added to `RESTART_SECTIONS` | Matches all four existing restart sections and reuses the shipped restart banner + Restart button rather than adding a live-reconfiguration path. | y — user |
| Bulk-delete scope and transport | All memories for the selected project; reuses `POST /api/v1/project/reset` with `clearVectors:false, clearSymbols:false, clearMemories:true` | That route already wires `getMemoryRepository().deleteByProject` and writes the `operation_log` audit row. A second endpoint would duplicate both. | y — user |
| `massa-ai-config.ts:152` non-goal | Overridden; the comment is replaced by one recording the reversal, its date, and who decided | The comment is a written contract; deleting it silently would leave a future reader unable to tell an override from an oversight. | y — user (question named the comment) |
| Bulk-delete confirmation shape | Inline typed-confirmation form (retype the projectId) rather than `confirm()` | `confirm()` cannot take typed input, and the registry editor already replaced `prompt()`/`alert()` with inline forms (design D-4.4). Also testable without stubbing globals. | n — agent default |
| Live-tail transport | Server exposes SSE; the browser reads it with `fetch` + a `ReadableStream` reader, not `EventSource` | `EventSource` cannot set request headers, and every non-public route requires `x-api-key` (AD-011). Putting the key in a query string would leak it into access logs and browser history. | n — agent default |
| Log file default location | `<dataDir>/logs/massa-ai.log`, default-on; `logging.file` still overrides | Range queries and export need a file to exist by default. `dataDir` already defaults to `~/.config/massa-ai/data`. | n — agent default |
| Log file rotation | Size-capped: rotate at `logging.maxFileSizeMb` (default 32) keeping `logging.maxFiles` (default 5) | The sink is documented "v1: no rotation"; making it default-on without a bound would grow unbounded on an operator machine. | n — agent default |
| Multi-process appends to one log file | Accepted: every massa-ai process appends to the same file with `O_APPEND`; rotation is best-effort under a rename | POSIX `O_APPEND` writes below `PIPE_BUF` are atomic, so interleaved lines are not corrupted. A rotation race can misfile at most a few lines. Documented, not engineered around. | n — agent default |
| Config key for a scheduler job | The `jobKind` (`memory-consolidation`, `decay-sweep`, `auto-improve`, `observation-bridge`, `checkpoint-purge`), not the row id | The kind is the stable contract shared by handler registration and the env var names; the `scheduled-*` row ids are an implementation detail. | n — agent default |
| Logs tab visibility | Read-only tab: visible without write mode; export allowed without write mode | Reading and downloading logs mutates nothing. Write mode gates mutations, and there are none here. | n — agent default |

**Open questions:** none — all resolved with the user or logged above.

---

## Implicit-Requirement Dimension Sweep

Large scope — every dimension resolves to a requirement or an explicit `N/A because`.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | `SCH-05` (scheduler bounds), `LOG-04` (range + limit bounds), `MBD-03` (typed confirmation must match exactly) |
| Failure / partial-failure states | `MBD-05` (partial reset result), `LOG-09` (unreadable/absent log file), `CPP-06` (marketplace root unresolvable) |
| Idempotency / retry / duplicate handling | `MBD-06` (second delete returns 0, still succeeds), `CPP-05` (switch to the already-active profile is a no-op-shaped success), `LOG-10` (a re-issued range query returns the same rows) |
| Auth boundaries & rate limits | `LOG-11` (every log route requires `x-api-key`; none joins `PUBLIC_PATHS`), `MBD-04` (write mode gates the button). Rate limits: `N/A because` no route in this repo is rate-limited and none is introduced. |
| Concurrency / ordering | `LOG-08` (concurrent appends + rotation), `CPP-07` (switch lock already serializes; Claude joins the same lock), `SCH-07` (restart-to-apply means no live re-registration race) |
| Data lifecycle / expiry | `LOG-07` (rotation bounds the sink), `MBD-01` (hard delete, irreversible, stated in the confirmation) |
| Observability | `MBD-07` (audit row in `operation_log`), `LOG-12` (the Logs feature never logs its own reads — no feedback loop) |
| External-dependency failure | `CPP-06` (missing/corrupt `installed_plugins.json`), `SCH-06` (config unreadable → literal defaults), `MBD-05` (repository error surfaces as an error, not a false success) |
| State-transition integrity | `CPP-04` (`install-state.json` records `modelProfile` only after the copy succeeds — existing engine ordering, preserved), `SCH-07` (config save → restart-needed → restart) |

---

## User Stories

### P1: Delete all memories of a project ⭐ MVP

**User Story**: As an operator, I want one action that deletes every memory of a
selected project, so that I can clear a project's memory without deleting rows
one at a time.

**Why P1**: The reported pain is unusable at real memory counts.

**Acceptance Criteria**:

1. WHILE write mode is enabled AND a project is selected in the topbar, the Memory tab SHALL render a `data-action="memory-delete-project"` control labelled with that projectId. <!-- state-driven -->
2. WHILE write mode is disabled, the Memory tab SHALL NOT render that control. <!-- state-driven -->
3. WHILE no project is selected, the Memory tab SHALL NOT render that control and SHALL render the text `Select a project to enable bulk delete.`. <!-- state-driven -->
4. WHEN the control is activated THEN the system SHALL render an inline confirmation form requiring the operator to retype the exact projectId, and SHALL NOT issue any request before that form is submitted. <!-- event-driven -->
5. IF the retyped value does not equal the selected projectId THEN the system SHALL render the error `Project id does not match.` and SHALL issue no request. <!-- unwanted-behavior -->
6. WHEN the confirmation matches THEN the system SHALL `POST /api/v1/project/reset` with exactly `{projectId, clearVectors:false, clearSymbols:false, clearMemories:true}`. <!-- event-driven -->
7. WHEN that request succeeds THEN the system SHALL display the returned `memoriesDeleted` count and re-render the memory list. <!-- event-driven -->
8. IF the request returns `success:false` THEN the system SHALL display the returned errors and SHALL NOT claim any deletion. <!-- unwanted-behavior -->
9. The bulk delete SHALL leave the project's vectors, keyword rows, and symbol graph unchanged. <!-- ubiquitous -->

**Independent Test**: with a project holding N memories, one bulk delete leaves
`memory/list` at 0 for that projectId while `project/list` still reports the
project with its indexed file/symbol counts unchanged.

---

### P1: Scheduler configurable from config.json and the Config tab ⭐ MVP

**User Story**: As an operator, I want to enable and retune scheduled jobs from
`config.json` or the Config tab, so that I do not have to set environment
variables on the process that runs the server.

**Why P1**: Explicitly requested; the env-only surface is unreachable for a
packaged install.

**Acceptance Criteria**:

1. The system SHALL accept an optional `scheduler` object in `config.json` with `enabled`, `tickMs`, `maxConcurrent`, and a `jobs` map keyed by the five registered job kinds, each holding `enabled` and `intervalMs`. <!-- ubiquitous -->
2. The system SHALL resolve every scheduler value as `env > config.json > literal default`, with the literal defaults unchanged from `DEFAULT_SCHEDULED_JOBS`. <!-- ubiquitous -->
3. WHERE no `scheduler` key is present in `config.json`, the system SHALL behave exactly as it does today. <!-- optional-feature -->
4. IF `tickMs` is below 1000, `maxConcurrent` is below 1, or any `intervalMs` is below 60000 THEN `PUT /api/v1/config` SHALL return HTTP 400 with a `details` entry naming the offending path, and SHALL write nothing. <!-- unwanted-behavior -->
5. IF `scheduler.jobs` contains a key that is not one of the five registered job kinds THEN `PUT /api/v1/config` SHALL return HTTP 400 naming that key. <!-- unwanted-behavior -->
6. IF `config.json` is unreadable THEN scheduler resolution SHALL fall back to the literal defaults without throwing. <!-- unwanted-behavior -->
7. WHEN a save changes any stored `scheduler` value THEN `PUT /api/v1/config` SHALL include `"scheduler"` in `changedRestartSections`, and `GET /api/v1/config` SHALL include `"scheduler"` in `restartNeededSections` whenever the key is present. <!-- event-driven -->
8. The Config tab SHALL render a `scheduler` section card whose fields round-trip through `PUT /api/v1/config` unchanged. <!-- ubiquitous -->

**Independent Test**: write `scheduler.enabled=true` plus
`jobs.checkpoint-purge.enabled=true` into `config.json` with no environment
variable set, restart, and observe the checkpoint-purge job registered enabled;
then set `MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED=false` and observe the env
value win.

---

### P1: Real-time Logs tab with range filter and export ⭐ MVP

**User Story**: As an operator, I want a Logs tab that tails new entries live,
filters a date/hour range, and downloads that range, so that I can diagnose the
server without shell access to its stderr.

**Why P1**: Explicitly requested; no read path for logs exists today.

**Acceptance Criteria**:

1. The system SHALL retain the most recent `logging.bufferSize` log entries (default 2000) in an in-process ring buffer holding `{seq, ts, level, message, meta}`. <!-- ubiquitous -->
2. The system SHALL write every emitted log line to a file sink whose path is `MASSA_AI_LOG_FILE`, else a non-empty `logging.file`, else `<dataDir>/logs/massa-ai.log`, and SHALL create that path's parent directory before its first write. <!-- ubiquitous -->
2b. WHERE `logging.enableFileSink` is `false` the system SHALL write no file sink; an empty or absent `logging.file` SHALL mean "use the default path" and SHALL NOT disable the sink. <!-- optional-feature -->
3. WHEN `GET /api/v1/logs` is called with `from`, `to`, `level`, `q`, `limit`, and `offset` THEN the system SHALL return entries from the file sink whose timestamp is within the closed interval `[from, to]`, filtered by level and substring, newest first, with a total count. <!-- event-driven -->
4. IF `from` or `to` is not a parseable ISO-8601 timestamp, or `from > to`, or `limit` exceeds 1000 THEN the endpoint SHALL return HTTP 400 with a message naming the offending parameter, and SHALL read no file. <!-- unwanted-behavior -->
5. WHEN `GET /api/v1/logs/stream` is called THEN the system SHALL open an SSE stream that emits every subsequently buffered entry, with the same heartbeat and max-duration behavior `apps/tools-api/src/routes/events.ts` uses. <!-- event-driven -->
6. WHEN `GET /api/v1/logs/export` is called with a valid range THEN the system SHALL return that range as `application/x-ndjson` (or `text/plain` for `format=txt`) with a `Content-Disposition: attachment` filename carrying the range. <!-- event-driven -->
7. The file sink SHALL rotate when it exceeds `logging.maxFileSizeMb` (default 32), keeping at most `logging.maxFiles` (default 5) rotated files. <!-- ubiquitous -->
8. WHILE several processes append to the same sink, the system SHALL open the file in append mode for every write so that no line is truncated by an interleaved write. <!-- state-driven -->
9. IF the sink file is absent or unreadable THEN `GET /api/v1/logs` SHALL serve the ring buffer instead and set `source: "buffer"` in the response, never returning an error for absence alone. <!-- unwanted-behavior -->
9b. IF the sink's parent directory cannot be created THEN the system SHALL keep logging to stderr and SHALL report `source: "buffer"` on every range query, rather than reporting an empty file range as a successful history read. <!-- unwanted-behavior -->
10. WHEN the same range query is issued twice with no intervening writes THEN both responses SHALL contain the same entries in the same order. <!-- event-driven -->
11. The system SHALL require `x-api-key` on every `/api/v1/logs*` route and SHALL NOT add any of them to `PUBLIC_PATHS`. <!-- ubiquitous -->
12. The system SHALL emit no log entry of its own while reading, streaming, or exporting logs. <!-- ubiquitous -->
13. The Admin Portal SHALL expose a `#/logs` tab with a from/to datetime range, a level filter, a substring filter, a Live toggle that streams new entries, and an Export control that downloads the current range. <!-- ubiquitous -->
14. WHILE the Live toggle is on, the tab SHALL append newly streamed entries without re-issuing the range query. <!-- state-driven -->
15. IF the stream connection fails THEN the tab SHALL turn Live off and display the failure, without discarding already-rendered entries. <!-- unwanted-behavior -->

**Independent Test**: open the Logs tab, turn Live on, trigger any API call, and
watch a new row appear; then set a range covering the last hour, export, and
confirm the downloaded file's line count equals the reported total.

---

### P1: Claude profile switching at parity with Codex and OpenCode ⭐ MVP

**User Story**: As a Claude Code user who installed massa-ai from the
marketplace, I want the Models tab to list and switch profiles, so that I get
the behavior Codex and OpenCode users already have.

**Why P1**: Explicitly reported as still broken after the previous feature.

**Acceptance Criteria**:

1. WHERE `platforms.claude.installRoute` is `"marketplace"` AND `~/.claude/plugins/installed_plugins.json` resolves an existing `installPath` for the massa-ai plugin, the system SHALL resolve Claude's `activeDir` to `<installPath>/agents` and its `variantsRoot` to `<installPath>/agent-profiles`. <!-- optional-feature -->
2. The system SHALL re-read `installed_plugins.json` on every resolution and SHALL NOT cache the resolved path across calls, because the path is version pinned and changes on plugin update. <!-- ubiquitous -->
3. WHEN `GET /api/v1/profiles` runs on such a machine THEN the `claude` host row SHALL report `installed: true` and the profile names present under `<installPath>/agent-profiles`. <!-- event-driven -->
4. WHEN `POST /api/v1/profiles/switch` targets Claude on that machine THEN the system SHALL overwrite the `massa-ai-*.md` files in `<installPath>/agents` from the chosen variant, record `platforms.claude.modelProfile` only after that copy succeeds, and report `status: "switched"` with `restartRequired: true`. <!-- event-driven -->
5. WHEN a switch targets the already-active profile THEN the system SHALL still report `switched` with the file count it wrote, never an error. <!-- event-driven -->
6. IF `installed_plugins.json` is missing, unparseable, or names an `installPath` that does not exist THEN the system SHALL report Claude as `installed: false` for listing and `status: "failed"` with a reason naming the unresolved path for switching — never falling back to the file-route paths. <!-- unwanted-behavior -->
7. WHEN the Claude plugin is updated to a new version THEN the installer SHALL re-apply the recorded `platforms.claude.modelProfile` to the new `installPath`'s `agents/`, so an update does not silently revert the operator to the bundle's default profile. <!-- event-driven -->
8. The system SHALL continue to refuse a Codex marketplace-route switch, with a reason naming codex only. <!-- ubiquitous -->
9. WHERE a host genuinely has no variant directories, the Models tab SHALL still render an explanatory message, and that message SHALL NOT assert that a marketplace install cannot switch profiles. <!-- optional-feature -->

**Independent Test**: on this machine, `GET /api/v1/profiles` returns
`hosts[claude].availableProfiles = ["balanced","cheap","heavy","home","work"]`;
switching to `cheap` rewrites `~/.claude/plugins/cache/massa-ai/massa-ai/<v>/agents/*.md`
and records `platforms.claude.modelProfile.profile = "cheap"`.

---

## Edge Cases

- IF a bulk delete is issued for a projectId with no memories THEN the system
  SHALL return `success:true` with `memoriesDeleted: 0`.
- IF the topbar project selection changes while the inline confirmation form is
  open THEN the form SHALL close without issuing a request.
- IF `scheduler.jobs` is present but empty THEN every job SHALL fall back to its
  literal default.
- IF the log range spans a rotation boundary THEN the query SHALL read the
  rotated files as well, oldest-first, so the range is not silently truncated.
- IF the log file contains a line that does not match the
  `[ISO] [LEVEL] message` shape THEN that line SHALL be returned as an entry
  with `level: "raw"` rather than dropped.
- IF an export range matches zero entries THEN the download SHALL still be
  produced, empty, rather than returning an error.
- The live tail is scoped to the **API server's own process**, while the file
  sink is appended by every massa-ai process including the stdio MCP server. A
  range query may therefore contain entries the live tail never showed; the tab
  states this rather than presenting the two as one stream.
- The reported `memoriesDeleted` count MAY exceed the memory table's displayed
  total: `deleteByProject` issues `DELETE … WHERE project_id = <canonical>` with
  no `deleted_at` predicate and resolves retired project aliases, while the list
  filters `deleted_at IS NULL` and matches the id literally. Already-tombstoned
  rows are therefore deleted but were never displayed.
- WHEN two profile switches run concurrently THEN the existing switch lock SHALL
  serialize them and the loser SHALL receive HTTP 409.
- IF `installed_plugins.json` lists more than one installed record for the
  massa-ai plugin THEN resolution SHALL pick the `scope: "user"` record with the
  most recent `lastUpdated`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MBD-01 | P1: Bulk memory delete | Design | Pending |
| MBD-02 | P1: Bulk memory delete | Design | Pending |
| MBD-03 | P1: Bulk memory delete | Design | Pending |
| MBD-04 | P1: Bulk memory delete | Design | Pending |
| MBD-05 | P1: Bulk memory delete | Design | Pending |
| MBD-06 | P1: Bulk memory delete | Design | Pending |
| MBD-07 | P1: Bulk memory delete | Design | Pending |
| SCH-01 | P1: Scheduler config | Design | Pending |
| SCH-02 | P1: Scheduler config | Design | Pending |
| SCH-03 | P1: Scheduler config | Design | Pending |
| SCH-04 | P1: Scheduler config | Design | Pending |
| SCH-05 | P1: Scheduler config | Design | Pending |
| SCH-06 | P1: Scheduler config | Design | Pending |
| SCH-07 | P1: Scheduler config | Design | Pending |
| LOG-01 | P1: Logs tab | Design | Pending |
| LOG-02 | P1: Logs tab | Design | Pending |
| LOG-03 | P1: Logs tab | Design | Pending |
| LOG-04 | P1: Logs tab | Design | Pending |
| LOG-05 | P1: Logs tab | Design | Pending |
| LOG-06 | P1: Logs tab | Design | Pending |
| LOG-07 | P1: Logs tab | Design | Pending |
| LOG-08 | P1: Logs tab | Design | Pending |
| LOG-09 | P1: Logs tab | Design | Pending |
| LOG-10 | P1: Logs tab | Design | Pending |
| LOG-11 | P1: Logs tab | Design | Pending |
| LOG-12 | P1: Logs tab | Design | Pending |
| CPP-01 | P1: Claude parity | Design | Pending |
| CPP-02 | P1: Claude parity | Design | Pending |
| CPP-03 | P1: Claude parity | Design | Pending |
| CPP-04 | P1: Claude parity | Design | Pending |
| CPP-05 | P1: Claude parity | Design | Pending |
| CPP-06 | P1: Claude parity | Design | Pending |
| CPP-07 | P1: Claude parity | Design | Pending |

**ID → AC mapping**: `MBD-01..07` are P1-Bulk ACs 1-9 collapsed by concern
(01 = render/gating ACs 1-3, 02 = inline form AC 4, 03 = typed match AC 5,
04 = request shape AC 6, 05 = success/failure display ACs 7-8, 06 = idempotent
re-delete, 07 = audit row + AC 9 non-interference). `SCH-01..07` and
`LOG-01..12` map 1:1 to their story's numbered ACs (LOG-13..15 fold into
LOG-03/05/06 as the UI side). `CPP-01..07` map to P1-Claude ACs 1-7; ACs 8-9
fold into CPP-06 and CPP-01 respectively.

**Coverage:** 33 total, 0 mapped to tasks yet, 33 unmapped ⚠️ (resolved in `tasks.md`).

---

## Verification Approach

- Deterministic unit suites per package, run through each package's own runner
  (`bun scripts/run-tests-isolated.ts` for core / tools-api / mcp-client; plain
  `bun test` for shared and web-ui).
- New route suites assert over **real HTTP responses** where a content-type or a
  `Content-Disposition` header is part of the contract — an in-process handler
  call cannot observe the documented bare-string `text/plain` trap.
- Profile-switch changes are proven against temp-dir fixtures with a synthetic
  `installed_plugins.json`, never against the developer's real `~/.claude`.
- The installer re-apply path is proven by extending the existing mock-CLI shell
  suites (`scripts/tests/test-plugin-marketplace-cache-refresh.sh`,
  `scripts/tests/test-model-profile-installer-reapply.sh`).
- Every suite that reaches `@massa-ai/core` config sets a scratch
  `XDG_CONFIG_HOME` before the first core-reaching import, per the documented
  cold-Ollama timeout mechanism.
- Final gate: `bun run lint`, `bun run type-check`, `bun run test`,
  `bun run test:scripts`, `bun run test:plugins`, plus web-ui's suite —
  with exit codes captured, not eyeballed.

## Success Criteria

- [ ] One click plus a typed confirmation clears a project's memories; the
      project's index survives, and `operation_log` carries the row.
- [ ] A `scheduler` block in `config.json` alone (no env vars) turns a job on
      after a restart; an env var still overrides it.
- [ ] The Logs tab shows a line appearing live, and an exported hour-range file
      whose line count equals the reported total.
- [ ] `GET /api/v1/profiles` reports 5 switchable profiles for Claude on the
      measured machine, and a switch rewrites the cache bundle's `agents/`.
- [ ] **Mandatory acceptance step (CPP, unverifiable from this repo):** after a
      Claude switch, fully restart the Claude session and re-read
      `<installPath>/agents/massa-ai-builder.md`. Claude's cache-refresh cadence
      cannot be established from this repository — the only evidence is that
      `lastUpdated` moved with the installer's `claude plugin update` and not
      with any of the 189 recorded startups. If the file reverts to the bundle
      default, the recorded `modelProfile` remains authoritative and the
      installer re-apply (CPP-07) is the supported path; report the reversion
      rather than reporting the switch as effective.
