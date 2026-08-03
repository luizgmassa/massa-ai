# Contributing to massa-ai — Managed Harness Protocol

This document defines the 7-step managed-harness contribution protocol for
adding or modifying agent harness components (skills, workflows, references,
agents, subagents, plugins, MCP servers, permission rules) in massa-ai.

Every contribution MUST complete all 7 steps in order. Each step has a
concrete acceptance gate.

---

## Step 1: Contract — define the behavioral contract

Before writing any code, define the behavioral contract: what the component
does, what inputs it accepts, what outputs it produces, and what invariants it
maintains.

**Acceptance gate**: a written contract (in the PR description or a linked
spec) specifies:
- Component name and type (skill, workflow, agent, etc.)
- Inputs (parameters, env vars, stdin, file paths)
- Outputs (return values, side effects, stdout, file writes)
- Invariants that must always hold

---

## Step 2: Register — register the component in the harness registry

Every harness component MUST be registered so the harness can discover and
load it. Registration is explicit — no magic auto-discovery.

**Acceptance gate**: the component is registered in the appropriate registry
file (e.g., `available_skills` list, `workflows/` directory, agent catalog,
or MCP server config) and the harness can discover it by name.

---

## Step 3: Preserve argv — preserve the caller's argument vector

Harness components that wrap or delegate to external commands MUST preserve
the caller's argument vector. The component may add, filter, or transform
arguments, but it MUST NOT silently drop arguments the caller passed.

**Acceptance gate**: a test verifies that arguments passed by the caller reach
the underlying command (or are explicitly documented as filtered with a
rationale).

---

## Step 4: Read-only export — export state for inspection without mutation

Harness components that maintain internal state (session state, working memory,
cached context) MUST export that state in a read-only format for inspection by
other components or debugging tools. The export MUST NOT mutate state.

**Acceptance gate**: a read-only export function exists, returns a serializable
representation of the state, and a test verifies it does not mutate the
internal state.

---

## Step 5: Deliver-before-ack — deliver the result before acknowledging

When a harness component is invoked asynchronously, it MUST deliver the
result (write the output, complete the side effect) BEFORE acknowledging
completion to the caller. Acknowledgment before delivery is a protocol
violation.

**Acceptance gate**: a test verifies that the caller receives the result
before the component's completion acknowledgment resolves.

---

## Step 6: Invariants — maintain documented invariants under all conditions

Every component has invariants (documented in Step 1). The component MUST
maintain those invariants under all conditions, including error paths,
timeouts, and partial failures. If an invariant cannot be maintained, the
component MUST fail loudly (throw, return an error, log at error level) —
never silently violate an invariant.

**Acceptance gate**: tests cover the happy path, error path, timeout path, and
partial-failure path for each invariant. No invariant is silently violated.

**Retiring a compatibility boundary** (an env-var prefix, a config key, a
feature flag) is itself an invariant change and needs the same discipline. A
suite that only checks the new name still passes if the old name was left
silently wired up beside it — that is exactly the outcome the retirement is
supposed to rule out. Assert both directions in one test: the new name
reaches its target, AND the old name has zero effect. See
`packages/shared/src/config/__tests__/llm-env-prefix.test.ts` for the
reference shape (AD-010's `MASSA_AI_LLM_*` retirement of `RLM_LLM_*`).

---

## Step 7: Tests — write tests that discriminate (kill mutations)

Every harness component MUST have tests that discriminate — meaning they fail
if the component's behavior is subtly wrong, not just if it crashes. Use
mutation-style reasoning: if you changed one line of the component, would the
test catch it?

**Acceptance gate**:
- Tests exist for every public function/branch
- Tests cover error paths, not just happy paths
- A mutation test (or manual mutation review) confirms the tests catch
  behavioral changes
- Tests run in the deterministic gate (`_DETERMINISTIC_ONLY=1`) when possible

---

## Summary Checklist

| Step | Gate |
|------|------|
| 1. Contract | Written contract with inputs/outputs/invariants |
| 2. Register | Component discoverable by name in the registry |
| 3. Preserve argv | Test: caller args reach the command |
| 4. Read-only export | Test: export does not mutate state |
| 5. Deliver-before-ack | Test: result delivered before ack resolves |
| 6. Invariants | Tests: happy + error + timeout + partial-failure |
| 7. Tests | Discriminating tests that kill mutations |

## CHANGELOG authoring — your entry picks the version

This section is the single source for CHANGELOG rules. `CLAUDE.md` covers the release
*mechanics* and links here; do not copy these rules into another file.

Releases are automatic: merging to `main` with green CI derives the next version from the
`[Unreleased]` section of `CHANGELOG.md`, tags it, and publishes it. So the heading you
file your entry under is load-bearing, not cosmetic.

Entries always go under `## [Unreleased]`, in Keep a Changelog format:

| Heading | Meaning | Effect |
|---------|---------|--------|
| `### Added` | new capability | minor bump (`1.2.1` → `1.3.0`) |
| `### Changed` | change to existing behavior | minor bump |
| `### Removed` | something taken away | minor bump |
| `### Deprecated` | marked for removal | minor bump |
| `### Fixed` | bug fix | patch bump (`1.2.1` → `1.2.2`) |
| `### Security` | security fix | patch bump |
| no entry (`no-changelog` label) | docs/chore only | no release at all |

If both a minor-class and a patch-class heading have content, **minor wins**.

**A heading with no bullets is ignored**, so an empty `### Added` will not force a minor
bump — but don't commit one anyway.

**Never hand-edit a released section.** `## [X.Y.Z] - DATE` and everything under it are
written by `scripts/release-version.ts` and committed by `release.yml`. Likewise never
hand-edit `version` in `package.json` for a routine change — the release derives it.
Major versions are never bumped automatically; cutting a `2.0.0` is a deliberate manual
`package.json` edit.

**The CI merge gate** fails any PR that does not modify `CHANGELOG.md` unless it carries
the `no-changelog` label (bot-authored PRs are exempt). Use that label for docs-only or
chore-only work that should not cut a release.

**Never write the skip-ci marker literally in a commit message, a commit body, or a PR
body.** GitHub scans the entire commit message for `[skip ci]`, not just the subject, and a
squash merge folds every commit body into it. Writing it — even while explaining it —
skips CI on the merge commit, and no CI run means no release: `release.yml` triggers on a
completed `CI` run. Refer to it as "the skip-ci marker" in prose instead. This one cannot
be caught by a test, because the thing that would run the test is what gets skipped.