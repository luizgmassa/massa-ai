# Validation Report — Registry Cleanup And Skill Imports

- Feature: `registry-cleanup-skill-imports`
- Date: 2026-08-05
- Verifier: massa-ai-verification-agent (author != verifier)
- Branch: `spec/registry-cleanup-skill-imports`
- Commit range: `394770fc..3eb83bea` (base v1.27.0 → HEAD)
- Contract: 65cae03a · Implementation: 7e38f3cd, e6a1e61e, de2a659a, 2e845de4,
  d06e48b6, 4cdd0175, 1e02fcc7, 3eb83bea

## Overall Verdict: PASS

24/24 requirement IDs verified PASS with re-derived evidence (not author claims).
All spec-anchored sensors, generator drift checks, and full gate commands
re-run independently. 4 discrimination-sensor mutations run (3 required),
each backed up to `/tmp/verify-backup/`, restored, and SHA-256-verified
byte-identical to the pre-mutation original; `git status --porcelain` on the
working tree shows only pre-existing T8 state-file edits (STATE.md,
HANDOFF.md, FEATURES.json), not verifier artifacts. `skills/AGENTS.md`
shrank 433 → 384 lines (-49, -11.3%), confirming the spec's Success Criterion.

## Per-Requirement Table

| ID | Sensor | Observed | Verdict |
| --- | --- | --- | --- |
| RCS-01/05/07 | `grep -cE '## Orchestration Model\|## Future Integration\|symlinked' skills/AGENTS.md` | 0 | PASS |
| RCS-02/03 | `grep -cE '^- .(role\|purpose\|trigger\|scope).:' skills/AGENTS.md` | 0; pointer lines present at Capability Packet/Output Contract sections | PASS |
| RCS-04 | `grep -c 'massa-ai-<' skills/AGENTS.md` | 1 | PASS |
| RCS-06 | charter + table + 4 generated hosts | charter `permission: write`, `version: "1.2.0"`, desc. loses "Read-only "; table row `read-only (report-write, own file only)`; Claude `tools` includes `Write`,`Edit`; Codex `sandbox_mode = "workspace-write"`; Cursor frontmatter has no `readonly` key; OpenCode `permission: { edit: allow, ... }` | PASS |
| RCS-08 | `grep -c 'agent-orchestration.md'` vs full-path spelling count | 4 == 4 | PASS |
| RCS-09 | tail -1 anchor comment | `<!-- validator anchors: 17 agents \| mapping table -->`; Agent Table has 17 rows, Mapping table exists | PASS |
| RCS-10 | `grep -A1 '^\.env\*'` | `.env*` / `!.env.example` | PASS |
| RCS-11 | bootstrap stack + literal | stack is exactly `caveman full`, `massa-ai`, `persona-router` (3 items, no `coding-guidelines`); literal `references/coding-guidelines.md` survives in massa-ai Skill Summary bullet; `bun test validate-repository.test.ts` 183/183 | PASS |
| IMP-01 | reference file + SKILL.md bullet | 4 sections present (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution), no YAML frontmatter; SKILL.md line 83-84 loads it "before writing or changing implementation code" | PASS |
| IMP-02/03 | `bun test workflow-metadata-headers.test.ts` | 38 files checked, 1 pass/0 fail; test source: `EXPECTED_WORKFLOW_COUNT = 38`, `ALLOWED_LICENSES = ["MIT","CC-BY-4.0"]` | PASS |
| IMP-04/08 | router table + precedence grep | rows for `to-prd`/`skill-architect` present; precedence line routes PRD-synthesis to `to-prd` (explicit-request only) and keeps `furps-refinement` for refining an existing PRD | PASS |
| IMP-05 | materials + residual grep + path checker | `references/skill-architect/{examples,patterns,quality-checklist}.md` and `scripts/validate_skill.py` exist; `massa-th0th` residual count = 0 across all 4 files; `check-skill-doc-paths.ts`: 158 files, 1154 citations, 0 misses | PASS |
| IMP-06 | python-absent fallback grep | line 303-304: "IF Python is unavailable THEN skip `scripts/validate_skill.py` and run the ... quality-checklist.md checklist manually instead." | PASS |
| IMP-07 | `git -C .../Useful-Agent-Skills status --porcelain` | empty | PASS |
| REG-01 | file absence + PACKET_FILES + AUTHORITY_SCANNED_FILES | `capability-packet-parity.test.ts` absent; `PACKET_FILES` = exactly `agent-orchestration.md`, `subagent-design.md`; `AGENTS.md` present directly (not spread) in `AUTHORITY_SCANNED_FILES` | PASS |
| REG-02/03 | both generators `--check` + parity test | `generate-skill-artifacts.ts --check` → "No drift" exit 0; `generate-subagent-artifacts.ts --check` → "No drift" exit 0; `subagent-parity.test.ts` 65/65 pass | PASS |
| REG-04 | `test:scripts && lint && test:plugins` | `test:scripts` background run exit code 0 (per harness completion notification); `lint` (oxlint) 0 violations/no output; `test:plugins` 96/96 pass across 8 files | PASS |
| REG-05 | CHANGELOG grep | `[Unreleased]` has `### Added` (three-skill import entry) and `### Changed` (AGENTS.md registry cleanup entry) | PASS |

Supplementary green re-runs beyond the matrix: `skills-harness-integrity.test.ts`
32/32, `workflow-harness-contract.test.ts` 49/49, `subagent-parity.test.ts`
65/65, `validate-repository.test.ts` 183/183, `apps/claude-plugin/__tests__/install.test.ts`
12/12.

## Discrimination-Sensor Table (4 run; 3 required)

| # | Mutation | Expected red gate | Observed | Restored + SHA-verified |
| --- | --- | --- | --- | --- |
| a | Reinserted `- \`role\`: the dispatched agent's specialist role name.` bullet under `## Capability Packet` in `skills/AGENTS.md` | RCS-02/03 matrix grep sensor | Grep sensor: 0→1 (caught). `skills-harness-integrity.test.ts` stayed 32/32 green — **automated-suite coverage gap**, see Gaps below | Yes — `sha256` `37caf76...` before/after match |
| b | Removed `"judge"` from `WRITE_AGENTS` in `scripts/generate-subagent-artifacts.ts` source (read-only `--check` invocations only; no unchecked regen run) | generator `--check` drift; `subagent-parity.test.ts` | `--check` exit 1, 14 host files flagged as drifted (all `massa-ai-judge.{md,toml}` variants); `subagent-parity.test.ts` 64 pass/1 fail on the drift-gate assertion | Yes — `sha256` `68de260...` before/after match; `--check` clean and parity 65/65 after restore |
| c | Deleted the intake line (`Load references/project-context.md ...`) from `skills/massa-ai/workflows/to-prd.md` | `workflow-harness-contract.test.ts` universal-intake gate | 48 pass/1 fail, exact expected diff (`missing: ["to-prd.md"]`) | Yes — `sha256` `3471d92...` before/after match; 49/49 after restore |
| d | Set `to-prd.md` frontmatter `license: GPL-3.0` | `workflow-metadata-headers.test.ts` license allowlist | 0 pass/1 fail: `license: expected one of ["MIT","CC-BY-4.0"], got "GPL-3.0"` | Yes — `sha256` `3471d92...` before/after match; 1/1 after restore |

All mutations run one at a time; each backed up to `/tmp/verify-backup/` before
editing; restored by file copy (never `git checkout`/`git restore`); SHA-256
compared before mutation and after restoration for every touched file.

## Gaps / Risks (ranked)

1. **Medium — RCS-02/03 field-bullet regression is not codified in an automated test.**
   The only sensor that catches a reintroduced Capability-Packet field bullet
   (e.g. `- \`role\`: ...`) in `skills/AGENTS.md` is the ad hoc grep command
   from the Test Coverage Matrix, run manually/in CI as a standalone step —
   `skills-harness-integrity.test.ts`'s only related assertion
   (`PACKET_PERSONA_CLAUSE` appears in exactly `PACKET_FILES`) checks a
   different, narrower substring and did not fire on this mutation. If the
   matrix grep is ever dropped from CI, this regression class becomes
   silently unguarded. Recommend a follow-up test asserting zero
   `^- \`(role|purpose|trigger|scope)\`:` matches in `AGENTS.md`.
2. **Low — `.specs/` state files intentionally uncommitted.** `STATE.md`,
   `HANDOFF.md`, `FEATURES.json` carry T8's registry-cleanup-skill-imports
   updates but are not yet committed; `check_specs_delivered.ts` reports 3
   errors for this reason. This is the expected pending step per this
   packet's `next_use` (main agent commits state + validation on PASS), not
   a defect.
3. **Informational — `test:scripts` full-suite evidence is exit-code-only.**
   The command ran past the 120s foreground timeout and was backgrounded;
   the harness reported completion with exit code 0, but the captured log
   only retains the last 60 lines (tail truncation), so no aggregate
   pass/fail line was directly observed by this verifier. Exit code 0 is
   accepted as sufficient per REG-04's literal "SHALL exit 0" wording, and
   is corroborated by every individual suite inside its scope re-run green
   above.

## Skipped Checks

- None. All 24 requirement IDs were independently sensed; all Gate Check
  Commands from tasks.md were run in read-only/`--check` form where a
  destructive form existed (generators), consistent with this packet's
  read-only permission scope.

## Exact Next Step

PASS — hand back to the main agent to commit `.specs/HANDOFF.md`,
`.specs/project/FEATURES.json`, `.specs/project/STATE.md`, and this
`validation.md`, then push and open the PR. Consider filing the Gap #1
follow-up (automated field-bullet regression test) as a lightweight
post-merge task; it does not block this PR since the live grep sensor
proves zero occurrences today.

## Addendum — post-validation fixes (2026-08-05, main agent)

The original PASS predates two post-validation events:

1. **CI red on PR #72 (build + coverage): a FOURTH WRITE_AGENTS roster copy**
   — `apps/opencode-plugin/src/__tests__/agents-install.test.ts:195` (OPC-02).
   It escaped both the author sweep and this validation because its suite runs
   only under turbo `bun run test` (CI build job), which neither ran locally;
   `test:scripts`/`test:plugins` cannot reach it. Fixed by adding `judge`;
   recorded as lesson L-019. Both CI failures shared this single root cause.
2. **User directive: `validate_skill.py` → `validate_skill.ts`** (supersedes
   the spec assumption "stays Python"; spec/design/tasks amended in place with
   the override recorded). TS port parses frontmatter with `Bun.YAML.parse`;
   smoke-tested green (skills/persona-router → PASS 21 checks, exit 0) and red
   (frontmatter-less scratch skill → exit 1). Stale bundled `.py` copies
   removed; `generate-skill-artifacts --check` caught them first (stale-entry
   detection working as designed). Lesson L-020.

Re-run evidence: turbo `bun run test` — only remaining red was
`embedded-api-client-endpoints.test.ts` cold-start flake (96/1 cold with a
20 s live ETL, 97/0 warm at 864 ms; documented env-sensitivity class, no
runtime code in this diff), isolation runner then PASS all 10 groups;
`test:scripts` exit 0; `lint` exit 0; `test:plugins` exit 0; WMH +
workflow-harness-contract 50/0; both generators `--check` clean.
