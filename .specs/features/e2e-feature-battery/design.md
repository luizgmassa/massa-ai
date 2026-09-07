# E2E Feature Battery — Design

## Architecture — four tiers

| Tier | Subject | Transport | Runner |
| --- | --- | --- | --- |
| A | core product surfaces | HTTP `:3334` + MCP stdio | `bun test` over `packages/core/src/__tests__/e2e/` |
| B | host harness (installers, agents, commands, profiles) | shell into a scratch `HOME` | `scripts/__tests__/` |
| C | Admin Portal | real browser | `@playwright/test` under `apps/web-ui/e2e/` |
| D | Claude Code CLI + evals | CLI into a scratch `CLAUDE_CONFIG_DIR` | `apps/claude-plugin/__tests__/` |

Tier A is a **profile matrix**, not one run. `e2e-stack.sh`'s five profiles differ only in the
Tools API environment, so a suite that needs `hooks-off` or `scheduler-on` states that in its
own header rather than mutating global state at runtime.

## Decisions

**The stack is a script, not a runbook.** A suite attached to a process it did not start
cannot test a restart or an environment swap. That is not theoretical: `15.nfr.test.ts:716`
carried a skip reading "would require restarting tools-api with a key", and
`16.destructive.test.ts` printed runbooks instead of running them. Owning the three services
converts both into executable cases.

Three of `e2e-stack.sh`'s behaviours are load-bearing rather than defensive:

1. It refuses any port whose listener it does not own, so the developer's own
   `:3333` / `:5432` / `:11434` can never become a test target.
2. It re-runs database provisioning on every `up`. A run that created the cluster and died
   before `createdb` otherwise stays half-provisioned forever.
3. It asserts *after* startup that the dedicated API really reached `:11435` and
   `massa_ai_test` on `:5433`. Proven red by forcing `OLLAMA_BASE_URL` at the shared
   instance — without it, a misconfigured run silently tests the developer's stack.

**The fixture is content-addressed, and that is a hard requirement, not tidiness.**
`resolveSharedProfileIdentity` (`_helpers.ts:151-163`) runs `git rev-parse HEAD` in
`PROJECT_PATH` and mixes the SHA into the shared-index identity. Pointing at the repository
root would satisfy the pins and then index the whole repository, which `CLAUDE.md` records as
never completing. So the corpus is a sparse git repository built from a declared manifest and
committed with a fixed identity: same content, same SHA, same shared index.

**The embedding profile is a variable, not a constant.** The historical runbook pins
`qwen3-embedding:8b` at 4096 dimensions. That model is not installed on this machine, and a
dimension mismatch degrades *silently* to a different vector table rather than failing — so
the pin is corrected in the script to the installed `qwen3-embedding:4b` at 2560. Any test
that names a dimension table literally encodes a profile it does not own.

**LLM features never enter the default aggregate.** Tier A's `llm-on` suite sits behind its
own `RUN_E2E_LLM=1`, matching the repository rule that every LLM-driven feature defaults off.

## Phase 0 repairs — the shape of the six defects

The scripted stack moved the suite from 223 pass / 5 fail to green by exposing six tests that
asserted contracts the product no longer has. They fall into three classes, and the class
matters more than the count:

- **Asserted a deleted contract.** `N19` asserted `AUTH_REQUIRED === false` and `N18` was a
  static skip; AD-011 deleted the no-key pass-through and made auth non-configurable, so no
  supported configuration could satisfy `N19`. `N5` asserted that three concurrent `index()`
  calls on one `projectId` all complete, citing a queue mutex that a `managed_runs` lease
  replaced — the lease *refuses* the losers with `indexing_busy` (`EtlPipelineBusyError`,
  `services/etl/pipeline.ts:47-62`, FR-09 / AC-7).
- **Encoded a corpus rather than a contract.** `N15` named `vector_documents_4096d`
  literally. `D2` seeded `trace_path` on a class, but call edges are attributed to the symbol
  containing the call site, so a class resolves as a seed and walks to nothing.
- **Green for the opposite of its stated reason.** `T15` seeds the shared index at a
  deliberately wrong root, then asserted warmth using the canonical corpus's probe queries —
  symbols absent from the corpus it had just indexed. It could only pass when the reindex
  failed to clear the previous corpus.

Each replacement is at least as strict as what it removes. `N5` now requires exactly one
winner, every loser refused *for the documented reason*, every job terminal, and a searchable
final state — two winners, the corruption the lease exists to prevent, became the one outcome
the test cannot accept. `N15` discovers which dimension table holds the project and asserts
exactly one does, which also catches a project split across two profiles.

`D4`'s repair is the one that reads as a loosening and is not. It opened each of six additive
architecture fields with `expect(Array.isArray(map.X))` and then iterated `map.X ?? []`, the
`?? []` conceding what the line above denied. `symbol-graph.service.ts:521-527` sets all six to
`undefined` when empty and the type declares them optional, so the assertion contradicted the
product and passed only because the full repository filled all six.

## Constraints

- The live-stack suite stays local and opt-in. CI has no Ollama, no dedicated cluster, and no
  API key, and is not a target of this feature.
- Tier C adds a dependency (`@playwright/test`). Its version must be chosen so the required
  chromium revision is the one already cached; otherwise the first execution downloads a
  browser and the offline constraint stops holding.
- Tier B cannot assert on `install-harness.sh`'s exit code. `installer_host_detected`
  (`scripts/lib/installer-shared.sh:225-241`) detects a host by config directory **or**
  binary on `PATH`, so on a machine without `cursor-agent` a clean `HOME` skips that host and
  the exit code turns 1 for a reason unrelated to the code under test. The expected host set
  is explicitly seeded input, and the assertion is per host, line by line.
