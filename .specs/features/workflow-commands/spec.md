# Workflow Commands Specification

Feature: **workflow-commands** — per-workflow slash commands on every host
(e.g. `/massa-ai:debug` invokes the `debug` workflow explicitly).

## Problem Statement

The 38 massa-ai workflows are reachable only through the router's semantic
classification inside a conversation. A user who already knows the workflow
they want cannot invoke it in one keystroke, and the workflow catalog is
invisible in each host's command list. Hand-authoring 38 commands × 4 hosts
is untenable; the 6 quick commands (`def`/`find`/`graph`/`index`/`map`/
`status`) are already hand-authored per host and prove the per-host surface
shapes work.

## Goals

- [ ] Every workflow is invocable as a host-native command on Claude, Codex,
      Cursor, and OpenCode, named after its file stem.
- [ ] Commands are generated from the workflow inventory — adding or deleting
      a workflow updates the command surface with zero curation.
- [ ] A command routes into the existing massa-ai router contract as an
      explicit route (precedence 1); it never forks a second routing path.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Changing router logic, precedence, or any workflow's content | Commands are a dispatch surface only |
| New workflows | Inventory is input, not subject |
| REST/MCP tool for workflow invocation | Commands are host prompt templates; no server surface |
| Rebasing onto `spec/plugin-architecture-unification` (AD-017) | User decision 2026-08-05: branch from main, park pending PR; conflict risk accepted |
| Changing the 6 hand-authored quick commands | Separate, stable surface; prune must never touch them |
| Host session-restart / hot-reload of command lists | Host-owned behavior; document only |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Coverage | All 38 workflows, generated | User choice 2026-08-05 (AskUserQuestion) | y |
| Hosts | All 4; OpenCode gated on surface verification | User choice 2026-08-05; OpenCode custom commands verified real (opencode.ai/docs/commands) | y |
| Branch base | main @ `1906a04e` (v1.29.0), pending AD-017 PR parked | User choice 2026-08-05 | y |
| Command name = workflow file stem | e.g. `architecture/architecture-audit.md` → `architecture-audit` | 38 stems verified unique (uniq -d = 0); subdir is organization, not identity | y (fact) |
| Command description = workflow frontmatter `description:` | Generator reads it; fails loudly if absent | All 38 verified present at base commit | y (fact) |
| OpenCode command dirname `command` vs `commands` | Verify at Execute against installed host; official docs say `command` | Sources disagree; host-discovery lesson: verify the host reads a path before installing to it | y (method) |
| Generated commands are gitignored build output | AD-016 pattern (generated-on-demand, prune-before-emit) | Matches existing bundle contract; avoids 100+ checked-in generated files | y (pattern) |
| Empty `$ARGUMENTS` | Command still routes; the workflow's own intake asks the user | Workflows already handle absent entity | y (default) |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: Invoke a workflow by name ⭐ MVP

**User Story**: As a massa-ai user in any supported host, I want
`/massa-ai:<workflow> [args]` (host-native equivalent) so that the named
workflow starts immediately as an explicit route without classification.

**Why P1**: The entire feature — direct invocation.

**Acceptance Criteria**:

1. WHEN a workflow command is invoked with arguments THEN the system SHALL
   load the massa-ai router (dedupe-guarded) and route to the named
   workflow under routing precedence 1 (explicit route), passing the
   arguments verbatim as the task description. <!-- event-driven -->
2. WHEN a workflow command is invoked with no arguments THEN the system SHALL
   still route to the named workflow and let that workflow's own
   intake gather the missing task description. <!-- event-driven -->
3. The command body SHALL name exactly one workflow and SHALL NOT restate,
   summarize, or override any router or workflow rule. <!-- ubiquitous -->

**Independent Test**: Render `debug` command for Claude; body names `debug`,
instructs explicit-route load of the massa-ai router, contains `$ARGUMENTS`.

### P1: Generated inventory, all hosts ⭐ MVP

**User Story**: As a maintainer, I want commands generated from
`skills/massa-ai/workflows/*.md` so that the surface tracks the inventory
with zero curation.

**Acceptance Criteria**:

1. WHEN the generator runs THEN it SHALL emit one command artifact per
   workflow file found by filesystem scan (38 at base) for each host:
   Claude `apps/claude-plugin/commands/<managed-subdir>/<stem>.md`, Codex
   `apps/codex-plugin/skills/<managed-subdir or prefix>/<stem>.md`, Cursor
   `apps/cursor-plugin/skills/<stem>/SKILL.md` or a managed variant, and
   OpenCode `apps/opencode-plugin/command/<stem>.md` (exact per-host layout
   fixed in Design; each layout SHALL be one the host verifiably reads).
   <!-- event-driven -->
2. WHEN a workflow file is added or deleted THEN a generator re-run SHALL
   make the emitted command set gain or lose exactly that stem
   (prune-before-emit inside managed roots only). <!-- event-driven -->
3. The generator SHALL derive each command's description from the workflow's
   frontmatter `description:`. <!-- ubiquitous -->
4. IF a workflow lacks `description:` or has a stem collision THEN the generator SHALL
   exit non-zero naming the offending file, emitting nothing for that run —
   collisions cover hand-authored quick-command names (`def`, `find`,
   `graph`, `index`, `map`, `status`) and duplicate workflow stems.
   <!-- unwanted-behavior -->
5. The generator SHALL never create, modify, or delete a hand-authored
   quick-command file, and SHALL be byte-idempotent: two consecutive runs
   produce identical trees. <!-- ubiquitous -->
6. WHERE the `--check` mode is used THEN the system SHALL diff the full
   directory inventory of every managed command root against
   freshly-generated output and exit non-zero on any drift, including a
   stale artifact whose source workflow was deleted. <!-- optional-feature -->

**Independent Test**: Run generator twice → identical trees, 38 artifacts
per host root; delete one workflow in a scratch copy → re-run drops exactly
that stem; strip a `description:` → non-zero exit naming the file.

### P1: Delivery and contract gates ⭐ MVP

**User Story**: As a maintainer, I want the commands delivered by the
existing installers and locked by the existing contract-test families so the
surface cannot silently rot.

**Acceptance Criteria**:

1. WHEN a detected host's installer runs THEN it SHALL install the generated
   command artifacts to the location that host verifiably reads, and
   `--uninstall` SHALL remove exactly the massa-ai-owned command artifacts
   it installed (plugin `install.sh` and harness installer alike).
   <!-- event-driven -->
2. The generated command paths SHALL be gitignored with root-precise
   entries, and generation SHALL run ahead of every consumer through the
   existing entrypoints (`generate:artifacts` pre-scripts, CI build step,
   checkout-detected install path) — no new generation entrypoint.
   <!-- ubiquitous -->
3. WHEN `bun run test:scripts` runs THEN a contract test SHALL assert
   per-host command-artifact count equals the workflow-inventory count
   (derived by scan, not a hardcoded 38) and per-host byte/shape parity of
   each command with its source template. <!-- event-driven -->
4. IF an existing count lock conflicts with the new surface THEN it SHALL
   be widened to state the new true population — never deleted, never
   loosened past it — and each widened or new lock SHALL have an observed
   red (mutation or fixture) before it counts as a gate. Known locks:
   codex/cursor manifest "exactly 6" quick files, EXPECTED_WORKFLOW_COUNT,
   parity `--check`. <!-- unwanted-behavior -->
5. IF a host is absent on the machine THEN the installer SHALL skip that
   host's command delivery and record the skip, identically to the existing
   harness host-detection behavior. <!-- unwanted-behavior -->

**Independent Test**: Fresh worktree → `bun run test:scripts` green with new
contract test present; mutate generator to drop one host → contract test
red; `install.sh --uninstall` leaves the 6 quick commands in place.

### P2: Catalog discoverability

**User Story**: As a user, I want the command list in each host to describe
each workflow so I can pick without reading docs.

**Acceptance Criteria**:

1. The rendered per-host command SHALL carry the workflow description in the
   field that host displays (`description:` frontmatter on all four hosts).
   <!-- ubiquitous -->
2. WHEN this feature's docs are written THEN `README.md`/`FEATURES.md` SHALL
   document the command surface once, in the docs-layering location,
   without restating per-workflow content. <!-- event-driven -->

## Edge Cases

- IF two workflow files ever share a stem THEN generation SHALL fail
  non-zero (AC P1-2.4) — subdirectory organization never disambiguates a
  command name.
- WHEN a workflow stem contains characters a host rejects in command names
  THEN generation SHALL fail loudly rather than emit a dead command (all 38
  current stems are kebab-case-safe; the guard is for future inventory).
- IF the OpenCode command dirname probe finds the host reads neither
  `command/` nor `commands/` THEN OpenCode delivery SHALL be skipped with a
  recorded reason, not guessed (user-approved gate).
- WHEN the massa-ai router skill is not installed on the host THEN the
  command body's instruction to load it degrades exactly as the existing
  bootstrap contract does — the command adds no new failure mode; command
  templates SHALL contain no shell-execution placeholders (OpenCode
  `` !`cmd` `` syntax) so `$ARGUMENTS` can never reach a shell.

## Implicit-Requirement Sweep (Large — all dimensions)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | AC P1-1.2 (empty args), Edge (stem charset guard, no shell placeholders) |
| Failure / partial-failure | AC P1-2.4 (fail-loud, emit nothing on violation), Edge (OpenCode probe skip) |
| Idempotency / retry / duplicates | AC P1-2.5 (byte-idempotent), prune-before-emit, installer idempotency inherited |
| Auth boundaries & rate limits | N/A because commands are local prompt templates; no server, no credential surface |
| Concurrency / ordering | N/A because generation is a sequential build step; installers already single-writer per surface |
| Data lifecycle / expiry | Gitignored generated output (AC P1-3.2); uninstall removes owned artifacts only (AC P1-3.1) |
| Observability | `--check` drift gate (AC P1-2.6); generator prints emitted population count per host (no silent caps) |
| External-dependency failure | Host absent → recorded skip (AC P1-3.5); no runtime network dependency |
| State-transition integrity | N/A because no persisted state machine; install-state.json untouched by this feature unless Design finds a version-gate need — then it round-trips the existing v2 shape |

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WFC-01 | P1: Invoke by name (route, args, thin body) | Design | Pending |
| WFC-02 | P1: Generated inventory (scan, per-host emit) | Design | Pending |
| WFC-03 | P1: Generated inventory (add/delete tracks, prune) | Design | Pending |
| WFC-04 | P1: Generated inventory (description sourcing) | Design | Pending |
| WFC-05 | P1: Generated inventory (fail-loud: desc/collision/charset) | Design | Pending |
| WFC-06 | P1: Generated inventory (hand-authored preserved, idempotent) | Design | Pending |
| WFC-07 | P1: Generated inventory (`--check` drift gate) | Design | Pending |
| WFC-08 | P1: Delivery (installers deliver + uninstall owned-only) | Design | Pending |
| WFC-09 | P1: Delivery (gitignore + existing generation entrypoints) | Design | Pending |
| WFC-10 | P1: Delivery (contract test, scan-derived count, parity) | Design | Pending |
| WFC-11 | P1: Delivery (locks widened w/ observed red) | Design | Pending |
| WFC-12 | P1: Delivery (host-absent skip) | Design | Pending |
| WFC-13 | P2: Catalog (description rendered per host) | Design | Pending |
| WFC-14 | P2: Catalog (docs layering) | Design | Pending |

**Coverage:** 14 total, 0 mapped to tasks (Tasks phase pending), 14 unmapped ⚠️

## Verification Approach

- Contract test in `scripts/__tests__/` (reached by `bun run test:scripts`):
  scan-derived count parity per host + template shape assertions (WFC-10).
- Every new/widened lock gets an observed red before it counts (WFC-11;
  lesson L-001 and "a new sensor needs an observed red").
- Generator `--check` in CI build job beside the existing artifact checks
  (WFC-07/09).
- Install tests in each plugin's `__tests__/` extended for command delivery
  and owned-only uninstall (WFC-08).
- OpenCode dirname probe evidence recorded in validation.md (Edge gate).
- Final gate: independent verification-agent per spec-driven Execute
  contract (author ≠ verifier), mutations per AC family.

## Sizing

Large — multi-component (generator, 4 host surfaces, installers, contract
tests, docs), >10 tasks expected. **Design: required** (per-host layout,
managed-root and prune boundaries, template shape, lock-widening strategy).
**Tasks: required** (dependency complexity: generator → surfaces → installers
→ locks → docs).

## Discuss Context Summary

User decisions 2026-08-05 (AskUserQuestion): all 38 generated; all 4 hosts
with OpenCode gated on surface verification (verified real, dirname probe
deferred to Execute); branch from main @ `1906a04e` v1.29.0, pending AD-017
PR parked — conflict risk in generator/installer files accepted.
