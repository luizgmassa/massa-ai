# Workflow Metadata Headers Specification

Slug: `workflow-metadata-headers` · Workflow: spec-driven (Medium) ·
Session: `spec-workflow-metadata-headers`

## Problem Statement

The 36 workflow files under `skills/massa-ai/workflows/` carry no machine-readable
metadata: no name, no description, no version. Every other instruction surface in
this repo (`SKILL.md` files for massa-ai, persona-router, and the 17 agent
charters) already uses Agent Skills YAML frontmatter (`name` / `description` /
`license`). Workflow files cannot be versioned, validated, or introspected without
parsing prose. The user directed (2026-08-04): add metadata headers to all
workflow files, version `1.0.0`, following the Agent Skills specification
(https://agentskills.io/specification) as the pattern reference.

## Requirements

- **WMH-01** — Every `.md` file under `skills/massa-ai/workflows/` (exactly 36;
  population locked by `EXPECTED_WORKFLOW_COUNT = 36` in
  `scripts/__tests__/workflow-harness-contract.test.ts`) begins with YAML
  frontmatter modeled on the Agent Skills spec:
  - `name`: the file stem (e.g. `spec-driven`, `bugs-audit`) — 1–64 chars,
    lowercase alphanumerics + hyphens, no leading/trailing/consecutive hyphens.
  - `description`: what the workflow does and when to route to it, 1–1024 chars,
    hand-authored from the file's own opening routing paragraph — no invented
    claims. Always emitted as a double-quoted single-line YAML scalar with
    internal quotes escaped (Plan Challenge F1: 8/36 opening paragraphs contain
    inline `: ` sequences that break unquoted plain scalars — reproduced against
    a real YAML parser).
  - `license: MIT` — mirrors the repo's existing SKILL.md convention.
  - `metadata:` map with `version: "1.0.0"` — quoted string, exactly as the
    Agent Skills spec models version (spec has no top-level `version` field;
    version lives under the `metadata` map).
- **WMH-02** — Body content is byte-identical after stripping the added
  frontmatter: prepend-only change, no prose edits, no heading changes (existing
  greps in harness gates anchor on body text).
- **WMH-03** — A committed deterministic gate
  (`scripts/__tests__/workflow-metadata-headers.test.ts`, reached by
  `bun run test:scripts`) validates for all 36 files: frontmatter block parsed
  by a **real YAML parser** (never a key-presence regex — Plan Challenge F1/F2:
  regex-green + parse-broken is the failure mode, and `skills.yml` CI validates
  only `SKILL.md`, so this test is the sole backstop for `workflows/*.md`
  frontmatter), zero parse errors, `name` matches the file stem and the spec's
  charset rules, `description` a non-empty single-line string 20–1024 chars,
  `metadata.version` present and semver. Population is printed beside the
  verdict; an empty population fails. Sensor lands red-first: observed failing
  against pre-change tree before the headers land.
- **WMH-04** — Generated plugin bundles regenerated via
  `bun scripts/generate-skill-artifacts.ts`; `--check` exits 0 (no drift) after.
- **WMH-05** — Existing gates stay green: `bun run test:scripts`, `bun run lint`.
- **WMH-06** — `CHANGELOG.md` gains an `[Unreleased]` entry (CI merge gate).

## Acceptance Criteria

- AC1: `grep -L '^---$' $(find skills/massa-ai/workflows -name '*.md')` on first
  line — zero files missing frontmatter; count of files checked printed = 36.
- AC2: For each file, frontmatter `name` == file stem; `metadata.version` ==
  `"1.0.0"`; `description` 1–1024 chars. Verified by the WMH-03 gate.
- AC3: `git diff` per file shows additions only at file top (prepend-only);
  stripping lines 1..N (the frontmatter block) reproduces the pre-change file
  byte-for-byte.
- AC4: `bun scripts/generate-skill-artifacts.ts --check` exit 0 after regen.
- AC5: `bun run test:scripts` exit 0 (includes WMH-03 gate green post-change and
  the untouched 36-count + venue + integrity + parity gates); `bun run lint`
  exit 0.
- AC6: WMH-03 sensor observed red on the pre-change tree (run log recorded in
  validation.md).

## Edge Cases

- Nested files (`bugs/bugs-audit.md`): `name` is the file stem (`bugs-audit`),
  not the relative path — spec charset forbids `/`.
- `judge-with-debate.md` and others with emoji headings (`### 🟡 Feature`):
  frontmatter sits above the heading; heading untouched.
- `spec-driven.md` ends with a `<!-- validator anchors -->` comment — tail
  untouched (prepend-only).
- Descriptions containing `:` or quotes must be YAML-safe (quoted style).

## Out Of Scope

- `.github/workflows/` CI files (accepted assumption: "workflow files" means the
  massa-ai skill workflows; version 1.0.0 semantics do not apply to Actions yml).
- `references/`, `personas/`, agent charters, `SKILL.md` files (already carry
  frontmatter or are separate surfaces).
- Installed copies under `~/.claude/skills/` (refresh is a post-merge installer
  concern, not part of this change).
- Consuming the new metadata anywhere (routing still reads the router table;
  headers are inert metadata until a future feature reads them).

## Assumptions (accepted unless user overrides)

- A1: `license: MIT` included to match the repo SKILL.md convention.
- A2: Version is per-file `metadata.version`, all set to `"1.0.0"` now; future
  edits may bump individual files independently.
- A3: The Agent Skills `name`-matches-parent-directory rule is adapted to
  name-matches-file-stem, because workflow files are files, not skill dirs.
