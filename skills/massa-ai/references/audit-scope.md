# Audit Scope

Use from audit workflows, implementation audit, bug finder, mobile Figma, and execution workflows before inspecting changed code or selecting an audit report.

## Scope Packets

Every audit scope must produce a compact scope packet before analysis:

```text
Scope Type: <modified files | explicit files/globs | commit range | branch comparison | codebase area | symbol/class/function | feature/flow | PR diff>
Target Focus: <path, module, branch comparison, commits, symbol, feature, flow, PR, changed-file set, or prompt target>
Resolution Method: <commands, tools, or user-supplied packet used to resolve scope>
Git Base: <sha/ref or n/a>
Git Head: <sha/ref or working-tree>
Resolved Files: <explicit list or pointer to summarized list>
Diff Source: <command, PR URL, supplied diff, or user-provided file set>
Excluded Paths: <generated/dependency/build/log/cache/temp/secret paths removed>
Requirements Source: <requirements-only, when applicable>
Freshness Checked At: <YYYY-MM-DD HH:MM local time, or unavailable>
```

Pass the same packet to child audit lenses. Child workflows must not silently recompute a different base or broaden scope beyond the packet.

## Target Intake Rules

Direct audit workflows require a concrete target focus before analysis. Accepted targets include modified files, explicit files or globs, commit hashes or commit ranges, branch comparisons, modules/packages, feature areas, classes/functions/symbols, runtime flows, or an explicitly requested whole-repo audit.

If the target is missing, vague, or too broad to inspect without guessing, stop and ask for a target focus. Do not default to a whole-repo audit. Whole-repo audits are valid only when the user explicitly asks for the whole repository and accepts the broader cost and lower precision.

Requirements audits also require a requirements source: prompt text, spec, issue/task, PR description, ADR/RFC, acceptance criteria, README/docs section, or another explicit source of expected behavior. If no requirements source can be found from the prompt or supplied context, stop and ask for it.

Execution workflows require both a report selector and a target focus before editing:

- Exact audit report path plus optional finding IDs is preferred.
- If the user asks for "latest" or omits a report path, first confirm a target focus such as module, flow, files, branch comparison, commit range, or PR target.
- Select the latest report only from the matching workflow directory, then verify report metadata matches the target focus before editing.
- If report target, scope, base/head, resolved files, or current evidence drift from the user's target focus, stop before editing unless the user explicitly accepts the risk.

## Audit Budgets

Use these default budgets unless the user explicitly expands scope:

| Scope size | Files / LOC / modules | Default context depth | Delegation trigger |
|---|---|---|---|
| Small | <=3 files, <=200 changed LOC, one module | touched lines plus direct callers/callees only | no delegation unless user requests it |
| Medium | 4-10 files or <=500 changed LOC in one ownership area | one-hop references, tests, config, and public surfaces | delegate only for independent verification or high/critical candidate findings |
| Large | >10 files, >500 changed LOC, >2 modules, whole-repo, or cross-boundary scope | top-level map first, then one-hop depth for selected high-risk entry points | delegation only when explicit request, >=2 disjoint slices, or high/critical findings exist |

Whole-repo audits start with top-level mapping and central entry points. They must report skipped depth checks instead of implying exhaustive line-by-line coverage.

## Scope Resolution

Use the smallest scope type that matches the user's target:

- Modified files: staged, unstaged, and relevant untracked files in the working tree. Use `working-tree` as head and record the status/diff commands used.
- Explicit files/globs: user-provided paths or globs. Resolve to concrete files; ask if nothing matches or if the glob expands beyond the intended target.
- Commit range: user-provided commit hash, commit list, or revision range. Record the exact range, base/head when available, changed files, and diff command.
- Branch comparison: user-provided base/head branch or ref comparison. Resolve base/head with the branch diff rules below and record changed files.
- Codebase area: module, package, directory, service, bounded context, or feature area. Resolve entry points, exported surfaces, tests, config, and adjacent docs only as needed.
- Symbol/class/function: locate definitions and references with massa-ai symbol
  tools, targeted enriched search, or focused fallback; use `read_file`
  for exact ranges and include defining files, callers, tests, and configs
  needed to verify claims.
- Feature/flow: map entry points through main transformations and side effects; ask for a narrower flow when the feature spans too many unrelated surfaces.
- Implementation parent scope: accept the exact packet supplied by `workflows/implementation/implementation-audit.md`, including PR diff when that is the selected scope type; child lenses must not broaden it without parent approval.

## Lens Audit Scope Resolution Procedure

Use this procedure in `bugs-audit`, `architecture-audit`, `code-quality-audit`, `requirements-audit`, `security-audit`, and `tests-audit` once each workflow's own step 4 has selected one of the 5 resolution branches below from its trigger list (modified files, commit range, codebase area, explicit-files/globs/branch-comparison/symbol/feature/whole-repo, or implementation-parent scope). This is the single home for the mechanical resolution steps; each lens workflow keeps only its branch-name trigger list and a pointer here.

- **Modified files**: include staged and unstaged tracked files from the working tree, plus untracked non-generated source/test/fixture/schema/config/docs files only when they can affect the lens's evidence (see Per-Lens Scope Deltas for the exact affect-scope and deleted-file-breakage wording per lens). Exclude generated, dependency, build, log, cache, temporary, and secret paths per repo rules. Inspect diffs first, then only the surrounding evidence the lens needs.
- **Commit range**: use the user-supplied explicit commits/range when given. For "commits made by me", resolve author identity from `git config user.email`, falling back to `git config user.name` when empty, and review only branch-unique commits by that identity. For branch-relative commit scopes, resolve the base with `Branch, Commit, And PR Diff Resolution` below. Ask the user for any missing range/identity/base before proceeding. Inspect the changed files and diffs from those commits, then the lens-specific evidence named in Per-Lens Scope Deltas.
- **Codebase area**: require a concrete path, module, package, feature area, or glob; ask when missing. Follow `references/codebase-investigation.md`'s retrieval order to find the lens-specific targets in Per-Lens Scope Deltas. Map only top-level modules first and recommend a narrower pass when scope is broad.
- **Explicit files/globs, branch comparison, symbol/class/function, feature/flow, or explicitly requested whole-repo scope**: resolve the target here and record the resolution method, base/head when relevant, resolved files, exclusions, requirements source when applicable, and freshness timestamp. For symbol/class/function targets, inspect definitions, references, callers, tests, and config plus the lens's extra targets, only as needed to verify a candidate finding. For feature/flow targets, map entry points through the lens-specific transformations named in Per-Lens Scope Deltas. For whole-repo scope, map the lens's first-pass surface (Per-Lens Scope Deltas) and report skipped-depth checks rather than implying exhaustive coverage.
- **Implementation parent scope**: accept the exact scope packet from `implementation-audit`; do not broaden beyond resolved files, surrounding code, and the lens-specific evidence in Per-Lens Scope Deltas needed to verify the lens's claim. Return compact lens findings to the parent implementation audit; do not write broad project memories unless explicitly assigned.

### Per-Lens Scope Deltas

| Lens (workflow) | Commit-range trigger phrase | Modified-files affect-scope + deleted-file breakage extras | Codebase-area retrieval targets | Symbol/class/function extra targets | Feature/flow mapping focus | Whole-repo first pass | Implementation-parent extra evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Architecture (`architecture-audit`) | architecture issues introduced by branch commits | architecture contracts or module boundaries; deletion also breaks architecture contracts | target modules, entry points, exported surfaces, references, semantic hotspots, tests, adjacent config | exported surfaces, references, dependency direction, callers, tests, ADRs | entry points through main transformations, contracts, side effects | top-level modules | exported surfaces, references, config, tests, ADRs |
| Bugs (`bugs-audit`) | bugs introduced by branch commits | runtime or validation behavior; deletion breaks imports, exports, routing, migrations, config, tests, or packaging | entry points, public API, tests, adjacent config | callers, callees, tests, contracts, config | input -> transformation -> output through the named flow | high-risk entry points | callers, callees, tests, config, migrations, schemas, public contracts |
| Code Quality (`code-quality-audit`) | quality issues introduced by branch commits | maintainability, validation behavior, or public contracts; deletion breaks imports, exports, routing, migrations, config, tests, or packaging | target modules, semantic hotspots, public API, tests, adjacent config | references, call sites, tests, current usage evidence | main code path only as far as needed for maintainability/overengineering | sampled/top-level coverage | public API, tests, config, project patterns |
| Requirements (`requirements-audit`) | requirement drift introduced by branch commits | required behavior; deletion also breaks required behavior or documentation contracts | entry points, public API, tests, config, docs, acceptance criteria | call paths, public contracts, tests, config, docs, requirement links | expected behavior from the requirements source to implementation, tests, docs, contracts | top-level requirement areas | public contracts, tests, config, docs, requirements |
| Security (`security-audit`) | security issues introduced by branch commits | runtime or validation behavior; deletion also breaks secrets handling or policy enforcement | entry points, trust boundaries, policy checks, validators, tests, adjacent config | call paths, trust boundaries, validators, policies, tests, config, schemas | untrusted input, identity, authorization, validation, persistence, side effects, logs | major trust boundaries | called auth/validation helpers, config, schemas, tests |
| Tests (`tests-audit`) | test gaps introduced by branch commits | runtime, validation, or test behavior; deletion also breaks test coverage | production entry points, tests, fixtures, mocks, test commands, coverage-sensitive config | call paths, behavior contracts, tests, fixtures, mocks, test commands | changed or targeted behavior mapped to existing tests and deterministic harnesses | major test surfaces | nearby tests, fixtures, config, callers |

## Branch, Commit, And PR Diff Resolution

Use this order:

1. Explicit user-provided commit range, branch/PR base and head, diff, or changed-file set.
2. Upstream merge-base for the active branch.
3. Fallback bases in order: `origin/main`, `origin/master`, `main`, `master`.

Stop and ask when no base can be resolved, multiple plausible bases exist, commit/branch syntax is invalid, or the working tree/branch state makes the target ambiguous. Do not invent a base. Record the selected base/head in the scope packet and in any saved audit report.

## File Inclusion

Include files that can affect the audited behavior, including source, tests, fixtures, schemas, migrations, config, docs, and packaging metadata when they define behavior or public contracts.

Exclude generated, dependency, build, log, cache, temporary, and secret paths according to repo rules. Deleted files stay in scope only when their removal can break imports, exports, routing, migrations, config, tests, packaging, docs, policies, or public contracts.

Inspect diffs first when a diff exists. For non-diff scopes, inspect the resolved entry points first. Read surrounding code only to prove or disprove a concrete candidate finding.

## Memory Freshness Gate

Recalled memories, accepted exceptions, prior ADR interpretations, and previous audit decisions are leads, not proof.

Before suppressing or downgrading a finding because of memory:

- Confirm the memory is not tagged `stale` and is not superseded by `stale-replaces:*`.
- Corroborate it against current code, current ADRs/specs, or the current audit report evidence.
- Check whether newer code, requirements, or incidents invalidate the exception.
- If corroboration is missing, keep the candidate alive as `suspect` or report the evidence gap instead of treating memory as authoritative.

## Context Firewall

Summarize large diffs, logs, generated reports, snapshots, and broad search output before using them in the main context. Keep raw verbose output out of child-agent and final-report payloads unless a short excerpt is necessary as evidence.

When an audit requires repeated massa-ai searches, use the shared Synapse policy.
Each parallel audit lens receives an isolated `synapseSessionId`; all lenses
retain the parent/child durable `workflowSessionId` tags and the same scope
packet.
