# Plan Challenge — Pre-Mortem

**Gate**: full (spec-driven always takes the full gate; the plan also touches
irreversible deletion, host-managed state, and >5 files).
**Mode**: `pre_mortem` (policy `mode: auto`; selected for a plan whose dominant
risks are silent-degradation and irreversible-action classes, not option choice).
**Delegation**: run as a **standalone fresh-eyes local critique**, not via
`massa-ai-plan-critic`. Skipped-delegation reason, verbatim: *the session's
operating instruction is "Do not call the AgentTool unless the user requested
it".* Output written against the same contract the agent charter defines.

**Steelmanned thesis**: four small, independent slices, each reusing shipped
machinery (`/project/reset`, `CONFIG_SECTIONS`, the events-route SSE shape, the
profile-switch engine), with no schema migration, no new MCP tool, and a
measured root cause for the one reported regression. The riskiest slice (CPP)
is the one with the hardest evidence behind it.

---

## Failure Narratives

### 1. The Logging config card silently disables the new log sink — Likelihood: **High** | Impact: **High**

It is the day after release. An operator opens Config, edits `logging.level`
from `info` to `debug`, and clicks Save. `collectConfigSectionFields` reads
every `[data-field]` under the section, including the `file` text input, which
rendered **empty** because `GET /api/v1/config` returns `loadConfig()` — the
file config — and `logging.file` was never written there; the default path is
applied downstream in the runtime resolver. `buildConfigSectionBody` passes the
empty string through for a `text` field, `savePartialConfig` merges
`logging: {file: ""}`, and the design's rule "an explicit empty string disables
the sink" fires. The Logs tab reports `source:"buffer"` from then on, history
resets on every restart, and export returns a few hundred lines instead of days.
Nobody connects it to the level change. Root cause: an in-band sentinel
(`""`) on a field the UI cannot distinguish from "not set".

**Consequence chain**
- 1st: the sink stops after the first unrelated Logging save.
- 2nd: range queries and export silently degrade to the ring buffer; LOG-03's
  "closed interval over history" is unsatisfiable but returns `success:true`.
- 3rd: the feature is judged unreliable and the operator goes back to reading
  stderr — the exact problem the tab was built to remove.

**Revision applied**: the empty-string sentinel is deleted. `logging.file`
empty or absent means *use the default path*; disabling is an explicit
`logging.enableFileSink: false` boolean, which the Config card renders as a
checkbox that round-trips truthfully. Spec LOG-02 and design 3d updated.

### 2. The sink never writes because its directory does not exist — Likelihood: **High** | Impact: **High**

First boot after upgrade. `Logger.emit` resolves the new default
`<dataDir>/logs/massa-ai.log`. `<dataDir>` exists (checkpoints live there) but
`logs/` does not. `fs.appendFileSync` throws `ENOENT`, the documented
best-effort `catch {}` swallows it, and every subsequent line takes the same
path. The Logs tab shows `source:"buffer"` on a machine that has been running
for a week; the range query for "yesterday" is empty and correct-looking. The
team discovers it only when someone strace-checks the process. Root cause: the
current sink was opt-in with an operator-supplied path that already existed, so
it never needed to create anything, and the swallow that made it safe then makes
it silent now.

**Revision applied**: `appendLine` creates the parent directory once per
resolved path (`mkdirSync(dirname, {recursive: true})`, memoized) before its
first write, and `sinkFiles`/`appendLine` failures are surfaced through the
`source` field rather than being invisible. Design 3b updated; T10's test list
gains a "directory absent" case.

### 3. `detectRoute`'s signature change breaks a published package — Likelihood: **Medium** | Impact: **High**

The design made `detectRoute(host, platform)` host-aware. `detectRoute` is
re-exported from `packages/shared/src/index.ts:55` — it is **public API of the
published `@massa-ai/shared`**, not an internal helper. In-repo the change is
compile-visible (one call in `engine.ts:290`, four in `hosts.test.ts`), but any
out-of-tree consumer breaks at runtime with the platform record landing in the
`host` slot, so `route === undefined` and every host refuses. The failure looks
like "profile switching stopped working entirely" and points at the wrong slice.

**Revision applied**: the host parameter becomes **optional and trailing** —
`detectRoute(platform, host?)`. Existing calls compile and behave identically,
and the marketplace-proceed path activates only when a host is supplied, so the
conservative refusal remains the default for any caller that does not know the
host. Design 4b and T17 updated.

### 4. Claude re-copies the plugin cache and silently reverts the switch — Likelihood: **Medium** | Impact: **High**

A user switches Claude to `cheap`, restarts, and gets `balanced` back. The
switch wrote `<installPath>/agents/*.md` and recorded
`platforms.claude.modelProfile = {profile:"cheap"}`, so the Models tab keeps
reporting `cheap` as active while the files on disk say otherwise — a
report that is confidently wrong, which is worse than the original message. Root
cause: Claude's cache-refresh cadence is **not verifiable from this
repository**, and the plan assumed refresh happens only on `claude plugin update`.

Evidence available: `installed_plugins.json` records
`installedAt: 2026-08-05T21:11:52Z` and `lastUpdated: 2026-08-10T01:35:53Z`,
and the later timestamp coincides with the installer's own
`claude plugin update` run rather than with any of the 189 recorded startups —
weak but real evidence that a session start does **not** re-copy. It is not
proof.

**Revision applied**: not a plan change but a mandatory acceptance step —
CPP gains an explicit post-implementation UAT: switch, fully restart the Claude
session, and re-read `<installPath>/agents/massa-ai-builder.md`'s model line.
Recorded in the spec's success criteria and as a HANDOFF verification item. If
the file reverts, the recorded `modelProfile` is still authoritative and the
installer re-apply (T19) becomes the supported path, which the plan already
builds.

### 5. Live tail and history disagree because they have different scopes — Likelihood: **High** | Impact: **Low**

The ring buffer belongs to the tools-api process. The file sink is appended by
**every** massa-ai process, including the stdio MCP server. So the live tail
shows only API-server lines while a range query over the same minute shows MCP
lines too. A user watching Live concludes the tab drops entries.

**Revision applied**: disclosure, not redesign. The Logs tab labels the live
region as this server's process, and the spec records the scope difference as a
stated edge case rather than a discoverable surprise.

### 6. The deleted count exceeds the number of rows the table displayed — Likelihood: **Medium** | Impact: **Low**

Measured: `deleteByProject` issues `DELETE FROM memories WHERE project_id = $1`
against a **canonical** id resolved through
`getProjectIdentityAliasResolver()`, with no `deleted_at` predicate. The Memory
tab's list goes through `repo.search`, which filters `deleted_at IS NULL` and
matches `project_id` **literally**. Two divergences follow: soft-deleted
tombstones are removed but were never displayed, and a retired project alias
lists nothing while deleting the rows that moved to its canonical id.

**Revision applied**: disclosure. The confirmation copy states the action
removes every memory for the project including already-tombstoned rows, and the
spec adds the divergence as an edge case, so the reported count exceeding the
table total is specified rather than looking like a bug.

### 7. A scheduler config read at import time hits the developer's real config — Likelihood: **Medium** | Impact: **Medium**

`getScheduler()` caches a module-level instance. Once the constructor reads
`config.get('scheduler')`, the first import in any test process resolves the
developer's own `~/.config/massa-ai/config.json`. A suite that never mentions
the scheduler starts depending on a file outside the repository — the same
mechanism that made `CodeCompressor` take 42 s cold and pass warm, and that CI
never reproduces because CI has no config file.

**Revision applied**: T5 and T6's test lists require a scratch
`XDG_CONFIG_HOME` set before the first core-reaching import plus
`resetScheduler()` in `beforeEach`; recorded in the design's verification
section and in the gate-command block.

---

## Early Warning Signs

| Signal | Failure it predicts | Check |
| --- | --- | --- |
| The Logs tab reports `source:"buffer"` on a long-running server | #1 or #2 | First manual UAT, and after any Config save |
| `<dataDir>/logs/` does not exist after the first request | #2 | Immediately after T11 lands |
| `bun run build` passes but a `@massa-ai/shared` consumer errors on `route === undefined` | #3 | T17's gate |
| `platforms.claude.modelProfile` says one profile and `<installPath>/agents/*.md` says another | #4 | The mandatory post-restart UAT |
| A test outside `scheduler*.test.ts` slows down after T6 | #7 | Phase 4 gate wall-clock |

## Inversion Check

**What would guarantee failure**

1. An in-band sentinel on a field the Config UI round-trips blindly — **existed**, removed in revision #1.
2. A silent `catch {}` on the only write path of a default-on feature — **existed**, narrowed in revision #2.
3. A breaking signature change on published package API — **existed**, made additive in revision #3.
4. Trusting an unverifiable host behavior as a load-bearing assumption — **exists and cannot be removed**; converted from a silent assumption into a mandatory acceptance step (#4).

**Do any exist now?** Three of four were removed by revision. The fourth is
retained as a disclosed, testable acceptance step rather than an assumption.

---

## Gate Outcome

`serious_findings: revise_plan`. Findings #1, #2, #3 were `critical`/`high` and
valid; `spec.md` and `design.md` were revised before Execute. #4 became an
acceptance step; #5, #6, #7 became disclosures and test constraints.
