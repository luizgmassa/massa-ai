# Tasks — Skills / Workflows Updates

- feature: `skills-workflows-updates`
- branch: `feat/skills-workflows-updates` (worktree `../massa-ai-wt-skills-workflows-updates`)
- base: `origin/main` @ `ce26f28`
- one atomic commit per task; gate = `bun run test:scripts` (and `bun run type-check` at phase end)

## Phase 0 — Shared references (no router surface change)

- [ ] **T0** — SWU-01: add the no-tests-for-data/domain-models exception to `references/code-annotation.md` §3. Enumerate excluded kinds, name languages, redirect to repository/service seam, preserve the behavior-tested rule. Gate: `bun run test:scripts`.
- [ ] **T1** — SWU-02: strengthen `references/implementation-delivery.md` Stage 1 wording to include the explicit phrase "mandatory worktree creation"; keep the two skip reasons and the read-only exclusion verbatim. Gate: `bun run test:scripts`.

## Phase 1 — spec-driven repo-rules enforcement (new router surface)

- [ ] **T2** — SWU-03: create `references/repo-rules-discovery.md` (discovery list, loading order, absence-is-valid, enforcement hook). Gate: file exists.
- [ ] **T3** — SWU-03: add `references/repo-rules-discovery.md` to `skills/massa-ai/SKILL.md` Shared References table. Gate: `bun run test:scripts` (router<->disk + reference integrity).
- [ ] **T4** — SWU-03: wire `references/repo-rules-discovery.md` into `workflows/spec-driven.md` (load line + Execute conformance clause + `repo-rules:` evidence record). Gate: `bun run test:scripts`.

## Phase 2 — Jira / commit / branch prefix cross-workflow

- [ ] **T5** — SWU-04: phased mapping in `workflows/ticket.md` (Phase→Task, Task→sub-task, emit keys). Gate: read against AC.
- [ ] **T6** — SWU-04: Decomposition Rules + intake note in `references/ticket/{templates-and-quality,intake-and-sources}.md`. Gate: read against AC.
- [ ] **T7** — SWU-05: per-task commit prefix in `workflows/commit.md` (one commit per task, `[XXX-YYYY]`, example, cross-links). Gate: read against AC.
- [ ] **T8** — SWU-06: phase branch + PR prefix in `references/implementation-delivery.md` Stages 1 & 4 (cross-link ticket.md + commit.md). Gate: read against AC.

## Phase 3 — Final gate

- [ ] **T9** — run `bun run test:scripts` and `bun run type-check`; update `.specs/project/STATE.md`; dispatch verification-agent (author ≠ verifier) → `validation.md`.

## Test Coverage Matrix

See `spec.md` → Test Coverage Matrix.

## Gate Check Commands

```bash
bun run test:scripts
bun run type-check
```
