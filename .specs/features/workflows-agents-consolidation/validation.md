# Workflows + Agents Consolidation — Validation

**Verdict**: FAIL
**Verifier**: independent verification-agent (author ≠ verifier)
**Date**: 2026-07-23
**Commit range**: 50102f5..HEAD (bf013e7, e57a026)

## Per-AC Evidence

| AC | Status | Evidence |
|---|---|---|
| WAC-01 | PASS | `find skills/agents -name SKILL.md \| wc -l` = 12. Top-level `skills/` has only `agents/`, `massa-th0th/`, `massa-th0th-memory/`, `synapse-usage/`, `AGENTS.md` — old charter dirs removed. |
| WAC-02 | PASS | `skills/massa-th0th/SKILL.md` (16.1K), `workflows/` (39 files), `references/` (29 files incl. agent-orchestration.md), `scripts/lessons.py` (22.5K) all exist. |
| WAC-03 | PASS | `bun run scripts/generate-subagent-artifacts.ts --check` → "No drift: generated files match checked-in files." Exit 0. |
| WAC-04 | PASS | `bun test scripts/__tests__/subagent-parity.test.ts` → 16 pass, 0 fail, 382 expect() calls. |
| WAC-05 | FAIL | `rg 'skills/agents/' skills/AGENTS.md` = **0 hits** (expected 12). Charter column at `skills/AGENTS.md:56-67` uses `agents/<name>/SKILL.md` (relative, no `skills/` prefix), not the spec-required `skills/agents/<name>/SKILL.md`. `agent-orchestration.md:64-69` uses the full `skills/agents/` prefix — inconsistent. |
| WAC-06 | FAIL | **4 of 7 audit-family workflows have NO Dispatch blocks.** `rg -c 'Dispatch:'` per file: architecture-audit=2, code-quality-audit=1, implementation-audit=1; **security-audit=0, requirements-audit=0, tests-audit=0, bugs-audit=0**. The 4 missing workflows still carry the full inline scope-resolution prose (steps 4-9 enumerating all scope types inline). T7-T10 audit-side rewrites were skipped; only fix-side was done. |
| WAC-07 | PASS | All 7 fix-family workflows have 2 Dispatch blocks each (builder + verification-agent): architecture-fix, security-fix, requirements-fix, bugs-fix, code-quality-fix, implementation-fix, tests-fix. Total = 14 fix dispatch blocks. |
| WAC-08 | FAIL | `rg '\b(implementer\|domain-mapper\|coupling-auditor\|deepening-architect)\b' skills/massa-th0th/workflows/` = 0 (good). BUT `rg '\bverifier\b' skills/massa-th0th/workflows/` = **5 hits** (all in `spec-driven.md:25,96,99,108,135`). T15 gate requires 0. Occurrences are prose-level ("author ≠ verifier", "The verifier re-derives...") not role dispatches, but the deterministic gate returns 5, not 0. |
| WAC-09 | PASS | 20 Dispatch blocks × 8 fields = 160 expected; `rg -A 10 'Dispatch:' ... \| rg -c 'trigger:\|scope:\|permissions:\|inputs:\|sensors:\|output:\|firewall:\|memory:'` = 160. Field completeness holds for all blocks that exist. |
| WAC-10 | PASS | `the-fool.md` uses `plan-critic` (lines 23,28,32,46,49); `furps-refinement.md` uses `furps-analyst` + `plan-critic` (lines 26,27,31,65); `agent-handoff.md` present. `agent-orchestration.md:70-72` marks all three "role-based (no charter)". |
| WAC-11 | PASS | `agent-orchestration.md:62` has `Charter` column header; rows 64-72 include `skills/agents/<name>/SKILL.md` paths for mapped agents and "role-based (no charter)" for the 3 role-based roles. |
| WAC-12 | PASS | `agent-orchestration.md:64-69` shows explicit mapping (`investigator`, `implementer` → `builder`, `verifier` → `verification-agent`, `domain-mapper`/`coupling-auditor`/`deepening-architect` → `architecture-specialist`); line 74 has prose mapping. |
| WAC-13 | PASS | Routing headers (`### <Name> Audit/Fix`), `workflowSessionId` rules, finding-ID prefixes (`ARCH-`, `SEC-`, `REQ-`, `TST-`, `BUG-`, `CQ-`, `IMPL-`), severity rules, Evidence Gate steps all preserved across workflows. 37 files contain Evidence Gate references. |
| WAC-14 | PASS | `SKILL.md:120-133` router table rows unchanged — all paths point at `workflows/<path>.md`, precedence keys intact. |
| WAC-15 | PASS | All 7 finding-ID prefixes present across audit workflows. Severity rules preserved (e.g., `security-audit.md:67-71` critical/high/medium/low). `audit-report-io.md` field contract intact. |

## Discrimination Sensor Results

- **Sensor 1 (old-role revert)**: SURVIVED (live failure, not hypothetical). `rg '\bverifier\b' skills/massa-th0th/workflows/` already returns 5 hits in `spec-driven.md`. The T15 gate requires 0. The mutant is already present in the shipped code — no revert needed to expose it. The grep sensor would catch a hypothetical `implementer` revert (currently 0 hits), but the `verifier` channel is already red.
- **Sensor 2 (missing lens)**: KILLED (would catch mutant). `rg -A 10 'Dispatch: architecture-specialist' skills/massa-th0th/workflows/ \| rg 'lens'` = 2 hits. `architecture-audit.md:84` includes `lens sub-mode (domain/coupling/deepening)` in inputs. A dispatch block missing `lens:` would be detected. Sensor functional for existing blocks. (Note: only 1 `architecture-specialist` dispatch block exists — in architecture-audit.md; the 4 unwritten audit workflows don't dispatch architecture-specialist at all, so the sensor can't cover them.)

## Gate Results

- **type-check**: PASS — `bun run type-check` → 6/6 successful, FULL TURBO.
- **parity test**: PASS — 16 tests, 0 fail, 382 expect() calls.
- **drift gate**: PASS — `--check` exits 0, "No drift".
- **old-role sweep**: FAIL — `implementer|domain-mapper|coupling-auditor|deepening-architect` = 0 hits (pass); `verifier` = 5 hits (fail, expected 0).
- **dispatch-block count**: FAIL — 20 Dispatch blocks found (expected ≥14 for audit+fix alone; 14 fix blocks present, but only 6 audit blocks across 3 of 7 audit workflows; 4 audit workflows missing entirely).

## Spec-Precision Gaps

1. **WAC-05 path convention**: `skills/AGENTS.md` Charter column uses `agents/<name>/SKILL.md` (relative to `skills/` dir) while `agent-orchestration.md` uses `skills/agents/<name>/SKILL.md` (repo-relative). Both resolve to the same file, but the spec AC says `skills/agents/<name>/SKILL.md` and the verification command expects 12 `rg 'skills/agents/'` hits. Either the spec is too strict on path format, or AGENTS.md needs the `skills/` prefix. Marked FAIL per evidence-or-zero (command returns 0, spec says 12).

2. **WAC-08 `verifier` semantics**: The 5 `verifier` hits in `spec-driven.md` are common-noun prose ("author ≠ verifier", "The verifier re-derives coverage"), not role-name dispatches. A lenient reading could argue these are acceptable. But the T15 gate is an unambiguous deterministic sensor: `rg 'verifier' skills/massa-th0th/workflows/` returns 0. It returns 5. Marked FAIL per the gate.

## Residual Risk

1. **HIGH — 4 audit workflows unwritten (WAC-06)**: `security-audit.md`, `requirements-audit.md`, `tests-audit.md`, `bugs-audit.md` still carry the full duplicated inline scope-resolution prose that this feature was created to eliminate. The consolidation's core P2 goal (replace duplicated inline prompt sections with named dispatch blocks) is only ~43% complete on the audit side (3 of 7). This leaves the two-sources-of-truth problem partially unresolved for 4 workflow families.

2. **MEDIUM — `verifier` old-role leakage (WAC-08)**: 5 occurrences of the old role name `verifier` in `spec-driven.md`. While semantically prose, the deterministic gate fails, and downstream tooling that greps for old role names will flag these. Fix: replace "verifier" with "verification-agent" in `spec-driven.md:25,96,99,108,135`.

3. **LOW — AGENTS.md path prefix inconsistency (WAC-05)**: `skills/AGENTS.md` uses `agents/<name>/SKILL.md` while `agent-orchestration.md` uses `skills/agents/<name>/SKILL.md`. Functionally equivalent but violates the literal spec and breaks the verification command. Fix: add `skills/` prefix to all 12 Charter column entries in `skills/AGENTS.md:56-67`.

---

## Ranked Gap List (for fix tasks)

| Rank | Gap | AC | Severity | Fix |
|---|---|---|---|---|
| 1 | 4 audit workflows missing Dispatch blocks (security/requirements/tests/bugs-audit) | WAC-06 | HIGH | Rewrite the 4 audit workflows: replace inline scope-resolution prose with `Dispatch: audit-specialist` (or `investigator`) blocks + `Dispatch: verification-agent` block, per the T7-T10 pattern. Each needs ≥1 audit dispatch + the lens named in inputs. |
| 2 | `verifier` old-role name in spec-driven.md (5 hits) | WAC-08 | MEDIUM | Replace bare `verifier` with `verification-agent` in `spec-driven.md` lines 25, 96, 99, 108, 135. Re-run `rg '\bverifier\b' skills/massa-th0th/workflows/` → confirm 0. |
| 3 | AGENTS.md Charter column missing `skills/` prefix | WAC-05 | LOW | Update `skills/AGENTS.md:56-67` Charter column from `agents/<name>/SKILL.md` to `skills/agents/<name>/SKILL.md`. Re-run `rg 'skills/agents/' skills/AGENTS.md` → confirm 12. |

## Compact Verdict

**FAIL** — 3 of 15 ACs fail. The structural move (WAC-01-04) and role-map update (WAC-11-15) are solid, but the workflow rewrite phase (WAC-06-08) is incomplete: 4 of 7 audit-family workflows were never rewritten, the `verifier` old-role sweep has 5 live hits, and the AGENTS.md Charter column uses a shorter path than the spec requires. Gaps ranked 1→3 above.