# Repo Rules Discovery

Use from `workflows/spec-driven.md` before the first repository
mutation. Defines how to discover, load, and enforce the target repository's
own AI-harness rules and implementation conventions, so spec-driven
implementation conforms to the repo it runs in rather than only to the
skill's defaults.

massa-ai is shipped to many repositories. This reference is **conditional on
the target repo**: it loads what is present and never invents what is absent.

## Principle

A repository's rules live in its own harness files and conventions. spec-driven
must read them before implementing and enforce conformance — a change that
follows the skill's defaults but violates the repo's module layout, test
placement, or lint rules is not deliverable. Silence here reads as "the repo
has no rules", which is almost never true — it means they were not looked up.

## 1. Discovery list

Look for the target repo's AI-harness rule sources in this order. Record each
one found with its path; record `none present` for any that are absent.

### `.claude/` harness

- `.claude/CLAUDE.md` — the primary Claude Code instructions file.
- `.claude/rules/**` — rule files imported by CLAUDE.md.
- `.claude/settings.json` — permissions and tool policy (read-only; never mutate).
- A root `CLAUDE.md` when `.claude/CLAUDE.md` is absent.

### `.cursor/` harness

- `.cursor/rules/*.mdc` and `.cursor/rules/*.md` — Cursor rule files (MDC format).
- `.cursorrules` — the legacy single-file Cursor rules at repo root.

### Other harness sources

- `AGENTS.md` at the repo root and in subdirectories (the cross-host standard).
- `CONTRIBUTING.md`, `README.md`, and `docs/` when they state implementation,
  testing, or layout rules.
- The repo's test-runner config (`bunfig.toml`, `jest.config.*`, `vitest.config.*`,
  `pytest.ini`/`pyproject.toml`, `gradle` test blocks, Xcode test schemes) —
  these pin **where tests live and how the gate runs**.

### Repo / module implementation pattern

Derive the repo's own conventions by reading current source, not by assuming
the skill's defaults:

- **Module layout** — where new source files go (layer folders, feature folders,
  package boundaries).
- **Unit-test location** — the source set or directory the repo uses for unit
  tests (`__tests__/`, `src/test/`, `commonTest/`, `androidUnitTest/`,
  `unitTest/`, `tests/`, the repo's actual equivalent).
- **Testing areas** — integration vs unit vs e2e boundaries the repo already
  enforces, and which test runner command exercises each.

## 2. Loading order

1. Read each present source from §1; skip absent ones without erroring.
2. Summarize what binds implementation into a compact `repo-rules` record:
   - the paths loaded,
   - the rules that constrain implementation (layout, naming, lint, test
     placement, commit/branch conventions),
   - any rule that conflicts with the skill's default.
3. If a repo rule conflicts with a skill default, the **repo rule wins** for
   implementation placement and gate commands; record the conflict and the
   resolution.

## 3. Absence is valid

If none of the sources in §1 are present, record:

```
repo-rules: none present
```

and continue. **Never fabricate rules. Never create `.claude/`, `.cursor/`, or
any harness directory in a repo that lacks them.** A repo with no harness rules
is implemented against its own source conventions (§1 "Repo / module
implementation pattern") and the skill's defaults — that is a legitimate state,
not a failure.

## 4. Enforcement hook (spec-driven)

Before the first repository mutation, spec-driven:

1. runs this discovery,
2. records the `repo-rules` summary (paths loaded, or `none present`),
3. implements so that every new or changed file conforms to the discovered
   module layout, unit-test location, and testing-area conventions,
4. records any deviation with an explicit reason in the completion evidence.

A deviation is allowed only with a recorded reason; an unrecorded deviation is
a protocol violation, not a shortcut.

## Completion Evidence

Report, in one block: the harness sources loaded (paths), the repo's module /
unit-test / testing-area conventions in effect, any repo-rule vs skill-default
conflict and its resolution, or `repo-rules: none present` with the conventions
derived from source.
