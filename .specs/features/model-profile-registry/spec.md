# Model Profile Registry — Specification

- **Feature slug**: `model-profile-registry`
- **workflowSessionId**: `spec-model-profile-registry`
- **projectId**: `massa-ai`
- **Workflow**: spec-driven (Large — Specify + Design + Tasks + Execute)
- **Branch / worktree**: `feat/model-profile-registry` @ `.claude/worktrees/model-profiles`, cut from `origin/main` @ `45daaa1`
- **Status**: Specify

---

## 1. Problem

Every model and effort decision for the 15 subagent specialists is hand-copied across six
surfaces. Measured on `origin/main` @ `45daaa1`, tracked files only:

| Surface | Model facts | Hand-authored |
| --- | ---: | :---: |
| `scripts/generate-subagent-artifacts.ts` — `AGENT_MODELS_{CLAUDE,CODEX,OPENCODE}` | 45 | yes |
| `skills/agents/*/SKILL.md` — `metadata.model_hint` (Cursor consumes verbatim) | 15 | yes |
| `scripts/__tests__/subagent-parity.test.ts` — 4 duplicate tables | 60 | yes |
| `FEATURES.md` — 4 doc tables | 64 | yes |
| `apps/*-plugin/agents/*` | 60 | generated |
| `apps/*-plugin/skills/agents/*/SKILL.md` (byte-copied charters) | 60 | generated |
| **Total** | **304** | **184** |

Effort diverges the same way, under three key names: `effort: high` (×15),
`model_reasoning_effort = "high"` (×15), `reasoningEffort: max` (×30).

Two consequences are already measurable on `main`, not hypothetical:

**P1 — the tables have silently drifted apart.** Three of fifteen roles are assigned
contradictory tiers across hosts:

| Role | Claude | Codex | Cursor | OpenCode |
| --- | --- | --- | --- | --- |
| `navigator` | standard (`sonnet`) | light | light | light |
| `requirements-analyst` | standard | standard | light | light |
| `planner` | deep (`opus`) | deep | standard | standard |

The sharpest proof that this is drift and not intent is *inside* `FEATURES.md` itself. Only
the Claude and Codex tables carry a "Why" rationale column (Cursor and OpenCode carry
"Charter hint", the raw `model_hint` string). For `navigator`, those two rationale cells are
the **same sentence** — "Index-first lookups with cited answers; no frontier reasoning
needed" — yet Claude pairs it with a **standard**-tier model (`sonnet`) and Codex pairs it
with a **light**-tier one (`gpt-5.4-mini`). One identical stated reason, two different
answers, in the same document.

**P2 — the Cursor emitter has never worked.** Against Cursor's documented subagent schema
(`name`, `description`, `model`, `readonly`, `is_background`), the shipped Cursor agents
emit `model: DeepSeek V4 Pro` (Cursor takes model IDs, not display names — and its catalog
lists neither DeepSeek V4 Pro nor MiniMax M3), plus two keys Cursor does not define at all:
`reasoningEffort` and `tools`. This is the same defect class as the OpenCode bug recorded in
`CHANGELOG.md:799`, where "none of the model pinning had ever taken effect".

Adding a sixteenth agent today means 4 hand-edits plus 4 doc rows plus 4 test-table rows.
Adding a *cost profile* is not expressible at all.

## 2. Goal

One registry is the only hand-authored source of model and effort facts. Each host's
emitter renders those facts into that host's documented syntax, emitting only keys that
host actually supports. Profiles are open data, and each harness CLI auto-selects one.

## 3. Requirements

### Registry and resolution

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| **MPR-R1** | A single registry file is the only hand-authored place naming a model or effort level for any agent or workflow on any host. | A scripted repo-wide scan for model tokens returns hits only in the registry, in generated artifacts, and in `CHANGELOG.md`/`.specs/` history. Zero hits in `scripts/*.ts` (non-generated), `skills/agents/*/SKILL.md`, and the parity test. |
| **MPR-R2** | Model policy is factored, not a cross-product: each charter declares its own tier; the registry maps `profile → host → tier → {model, effort}` plus `hostDefaults` and `workflowTiers`. No fact is stated twice. | Total hand-authored model facts = `A + Σ(hosts(p) × T)`. **Measured at seed: 15 charter tiers + 66 registry entries = 81, expressing SEVEN profiles.** Today's 184 express exactly **one**. The meaningful figure is marginal cost: a new full profile is **12** entries (4 hosts × 3 tiers) and a host-specific one is **3**, against 60 hand-authored facts + 60 doc rows + 60 test rows today. Asserted by a test that counts them. The registry contains **no agent list** — adding an agent is one charter edit. |
| **MPR-R3** | The profile set is open data. Adding, renaming, or removing a profile requires editing only the registry — no TypeScript type, enum, test fixture, or doc table enumerates profile names. | A test adds a synthetic profile to an in-memory registry and resolves it end-to-end with zero source edits. `grep` finds no hard-coded profile-name literal outside the registry and its own tests. |
| **MPR-R4** | Profile selection per host is deterministic, with a fixed precedence: `--profile=<name>` CLI flag > `MASSA_AI_MODEL_PROFILE` env > registry `hostDefaults[host]`. | Table-driven test covering every precedence combination, including flag-and-env-both-set and neither-set. |
| **MPR-R5** | Resolution is total and fails loudly. Every unresolvable input is a named error with a non-zero exit — never a silent default, never a fallback model. | One test per error class: unknown profile; host absent from a profile; tier absent from a host block; charter with no `model_tier`; tier name not in the declared tier list; effort outside the target host's documented enum; unknown workflow name; `hostDefaults` incomplete or naming a missing profile. `validateRegistry` reports **all** violations in one throw, not the first. |
| **MPR-R6** | Charters declare a tier, never a model. `metadata.model_hint` is replaced by `metadata.model_tier`. | No charter contains a model name. `.github/workflows/skills.yml` and `scripts/__tests__/skills-harness-integrity.test.ts` validate `model_tier` against the registry's tier list and fail on an unknown value. |
| **MPR-R7** | The registry accepts workflow keys and the resolver resolves them, but no workflow markdown gains a model line. | Resolver returns a `{model, effort}` for a `workflow:<name>` key. `git diff --stat -- skills/massa-ai/workflows/` is empty across the feature branch. |

### Correctness of what ships

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| **MPR-R8** | The three drifted roles are normalized to one tier each, chosen by the rationale `FEATURES.md` already states: `navigator` → light ("no frontier reasoning needed"), `requirements-analyst` → standard ("detect ambiguity, infer missing requirements"), `planner` → deep ("highest-leverage place to spend tokens"). | Exactly the enumerated pin changes in §4 occur; every other pin is byte-identical to `main`. Proven by a scripted before/after diff against a **frozen copy** of `main`'s artifacts, not the live tree. |
| **MPR-R9** | Each host emitter emits only frontmatter keys that host documents as supported, in that host's documented format, for model, effort, and permission. | Per-host allowed-key test: parse every generated artifact, assert its key set is a subset of the documented set for that host, with the source URL cited in the test. Fails if an undocumented key reappears. |
| **MPR-R10** | One registry `effort` value renders into each host's own syntax. | Claude `effort: <v>`; Codex `model_reasoning_effort = "<v>"`; Cursor bracket parameter on the model value; OpenCode per its documented mechanism. Each asserted against a documented value enum, not a free string. |
| **MPR-R11** | Model documentation is factored the same way the policy is — one generated role→tier table, plus one small table per profile. The four duplicated per-host rationale columns are **deleted**, not consolidated. | `FEATURES.md` contains no per-host 15-row model table and no per-host rationale column; each role's reason lives once, in its own charter prose. A doc-drift test asserts the generated role→tier table matches the charters and is the file's only role-keyed model table. Structural, not assertional: a rationale that exists once cannot disagree with itself, which is what §1 P1 shows a compared-but-duplicated one can. |
| **MPR-R12** | Every model ID in the registry is checkable against the harness CLI that must resolve it, without guessing. | `bun scripts/verify-model-ids.ts` probes each locally installed harness CLI, reports per-ID resolve/miss, exits non-zero on a miss, and **skips absent CLIs with a named reason** rather than passing vacuously. Proven by the OpenCode probe already run in §7. Advisory/opt-in — not wired into the blocking CI gate, because CI has no harness CLIs installed. |

## 4. Enumerated behavior changes

MPR-R8 changes exactly five shipped pins. Everything else stays byte-identical.

| Role | Host | Before | After | Reason |
| --- | --- | --- | --- | --- |
| `navigator` | claude | `sonnet` | `haiku` | tier standard → light |
| `requirements-analyst` | cursor | `DeepSeek V4 Pro` | *(standard-tier value)* | tier light → standard |
| `requirements-analyst` | opencode | `opencode-go/deepseek-v4-pro` | `opencode-go/glm-5.2` | tier light → standard |
| `planner` | cursor | `GLM-5.2` | *(deep-tier value)* | tier standard → deep |
| `planner` | opencode | `opencode-go/glm-5.2` | `opencode-go/minimax-m3` | tier standard → deep |

MPR-R9 additionally changes two hosts' emitted key sets. Claude and Codex are unchanged.

| Host | Change | Applies to | Justification |
| --- | --- | --- | --- |
| Cursor | drop `tools: [...]` | 15 | not a Cursor frontmatter key |
| Cursor | drop `reasoningEffort: max` | 15 | not a Cursor frontmatter key |
| Cursor | add `readonly: true` | 12 read-only agents | the only documented Cursor permission mechanism; replaces the inert `tools` array |
| Cursor | `model:` → `inherit` | 15 | no resolvable Cursor model ID exists for the pinned models; unresolvable is a hard error |
| OpenCode | drop `name:` | 15 | not an OpenCode key — name comes from the filename, which already yields `massa-ai-<n>`; currently forwarded to the provider as a model option |
| OpenCode | **move** `massa-ai-owned: true` from frontmatter `metadata:` to a body comment `<!-- massa-ai-owned: true -->` | 15 | not an OpenCode key, so as frontmatter it is forwarded to the provider — but it **is** read: `apps/opencode-plugin/src/config-cli.ts:248` scopes `agents uninstall` by that literal substring. Relocating keeps uninstall working with no code change, and stays backward compatible with agent files an older version already installed. |

Cursor keeps `name:` — it *is* a documented Cursor field, and dropping it would change agent
identity from the frontmatter value to the filename stem.

## 5. Out of scope

- **Runtime model switching inside a live host session.** No host supports *per-agent*
  runtime indirection. The two global knobs that exist sit on **opposite sides** of the
  frontmatter in their precedence chains, and neither is per-agent, so neither can express a
  profile:

  | Knob | Direction | Verbatim source |
  | --- | --- | --- |
  | `CLAUDE_CODE_SUBAGENT_MODEL` | **override** — beats frontmatter | "Accepts an alias such as `haiku` or a full model name, and overrides the per-invocation `model` parameter and the subagent definition's `model` frontmatter." (`code.claude.com/docs/en/model-config.md`) |
  | `agents.default_subagent_model` (Codex) | **fallback** — loses to the agent file | "If a custom agent file sets `model` or `model_reasoning_effort`, the value in the file takes precedence." (`learn.chatgpt.com/docs/agent-configuration/subagents`) |

  Resolution is therefore build-time; switching profiles means regenerating. One operational
  consequence must be documented rather than worked around: a user who sets
  `CLAUDE_CODE_SUBAGENT_MODEL` to a real model **silently defeats every registry pin on
  Claude**, because it outranks frontmatter. Setting it to `inherit` restores normal
  resolution.
- **`packages/core` LLM configuration** (`MASSA_AI_LLM_MODEL`, `MASSA_AI_LLM_CODE_MODEL`,
  `modelRole`). A different subsystem — retrieval-time inference, not agent dispatch.
- **Embedding models** (`OLLAMA_EMBEDDING_MODEL` and friends).
- **Changing which models are used**, beyond the five normalization pins in §4 and whatever
  MPR-R9 requires to make a host's value resolvable at all.
- **Emitting model information into workflow markdown** (explicitly rejected: it would add
  context weight to every workflow load).
- The OpenCode `.opencode/agents/` vs `.opencode/agent/` directory discrepancy found during
  research — a real upstream bug, but not this feature's.

## 6. Accepted assumptions

| ID | Assumption | Basis | If wrong |
| --- | --- | --- | --- |
| **A1** | Build-time resolution is the only viable mechanism. | No host resolves a per-agent model from an env var in agent frontmatter; all four read a literal. Verified per host in §7. | The feature still works; a runtime path could be added later without changing the registry. |
| **A2** | Three tiers (light / standard / deep) are sufficient. | Every one of the four current host tables uses exactly three distinct model values. | A fourth tier is additive registry data, no code change (MPR-R3 covers this shape). |
| **A3** | Byte-identity against a frozen `main` fixture is the right regression proof. | Prior lesson: a before-baseline that reads the live tree goes red the moment the refactor starts. | — |

## 7. Host-resolution evidence

Research completed during Specify. Knowledge Verification Chain: step 1 codebase ✅,
step 2 project docs ✅, step 3 Context7 MCP **skipped — not registered in this session**,
step 4 web ✅.

| Host | Model key + format | Effort mechanism | Documented fields | Unknown key handling |
| --- | --- | --- | --- | --- |
| Claude Code | `model:` — `haiku`/`sonnet`/`opus`/`fable`, full ID, or `inherit` (default) | `effort:` — `low`\|`medium`\|`high`\|`xhigh`\|`max` | plugin agents: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`; `hooks`/`mcpServers`/`permissionMode` rejected | — |
| Codex | `model =` — bare slug (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.4-mini` all currently valid) | `model_reasoning_effort =` — `minimal`\|`low`\|`medium`\|`high`\|`xhigh` | `name`, `description`, `developer_instructions` (required); `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config` (optional). `sandbox_mode` ∈ `read-only`\|`workspace-write`\|`danger-full-access` is the documented read-only mechanism. No `tools` key exists at any layer. | UNDOCUMENTED |
| Cursor | `model:` — `inherit` (default) or a model **ID**, optional bracket params (`claude-opus-5[effort=high,context=300k]`) | bracket parameter `[effort=…]` on the model value — **no** separate key | exactly `name`, `description`, `model`, `readonly`, `is_background`. `readonly: true` is the only permission mechanism; no `tools` allowlist exists. | unresolvable model → hard error (`Invalid model selection`), not silent fallback |
| OpenCode | `model:` — `provider/model-id` | `reasoningEffort` — generic provider pass-through, provider-specific enum | `description` (required); `mode`, `model`, `temperature`, `top_p`, `permission`, `steps`, `hidden`, `disable`, `color`. **No `name` key** — the agent name is the filename. `tools` is deprecated in favour of `permission`. | **passed through to the provider as model options** — not inert |

### Conformance of what ships today

| Host | Emitted keys | Verdict |
| --- | --- | --- |
| Claude | `name`, `description`, `tools`, `model`, `effort` | ✅ conformant |
| Codex | `name`, `description`, `model`, `model_reasoning_effort`, `sandbox_mode`, `developer_instructions` | ✅ conformant |
| Cursor | `name`, `description`, `tools`, `model`, `reasoningEffort` | ❌ `tools` and `reasoningEffort` are not Cursor keys; `model` holds a display name, not an ID; `readonly` is missing |
| OpenCode | `name`, `description`, `mode`, `model`, `reasoningEffort`, `permission`, `metadata` | ❌ `name` and `metadata` are not OpenCode keys and are forwarded to the provider as bogus model options |

`metadata: { massa-ai-owned: true }` was introduced (per
`.specs/features/subagent-skills-plugin-parity/design.md:129`) on the premise that "hosts
ignore unknown frontmatter". OpenCode's current docs contradict that premise — but the marker
is **load-bearing**, so it is relocated rather than removed. OpenCode has two install paths
with different uninstall scoping:

| Path | Installs as | Uninstall scoped by |
| --- | --- | --- |
| `apps/opencode-plugin/install.sh:435-448` | symlinks | symlink + `massa-ai-*` filename prefix (`:310-317`) |
| `apps/opencode-plugin/src/config-cli.ts:224-238` | real file copies | `content.includes("massa-ai-owned: true")` (`:248`) |

Deleting the marker would make `massa-ai-config agents uninstall` match zero files, print
`removed 0`, and orphan 15 installed agents. It moves to a body comment instead (see §4).
Codex's `# massa-ai-owned` is a real TOML comment and *is* greped
(`apps/codex-plugin/install.sh:483`) — it stays where it is.

### Cursor model IDs — resolved as "no portable value exists"

Cursor publishes no display-name→ID mapping. IDs are discoverable only at runtime via the
`cursor-agent` CLI (`agent models` / `--list-models` / `/models`). Of the three models pinned
today, **DeepSeek V4 Pro and MiniMax M3 are absent from Cursor's catalog entirely** (providers
listed: Anthropic, Google, Z.ai, OpenAI, Moonshot, SpaceXAI) and work only as per-machine BYOK
custom models; "GLM 5.2" is in the catalog but has no published ID. Both facts are STRONG —
independently re-fetched twice.

**What is NOT established:** whether an unresolvable value hard-errors or silently falls back.
Cursor's docs describe graceful fallback for exactly three *permission* scenarios (team admin
restriction, legacy Max Mode, plan limitation) and are silent on a catalog-absent or mistyped
ID. The hard-error reading rests on a single staff-acknowledged forum thread — not
authoritative. The falsifier is a one-file probe (`.cursor/agents/probe.md` with today's
literal `model: DeepSeek V4 Pro`, invoked via `cursor-agent`), but **`cursor-agent` is not
installed on this machine** (`command -v cursor-agent` → not found; only the `cursor` GUI
binary and `~/.cursor/` are present). Recorded as a **skipped sensor with reason**, not as an
answered question.

**Decision, and why it does not depend on that gap:** the Cursor tier values are `inherit` —
documented, always valid, and the field's own default. `inherit` is correct under *either*
reading: if unresolvable IDs hard-error, `inherit` avoids a hard failure; if they silently
fall back, `inherit` is what they fall back *to*, stated explicitly instead of by accident.
The registry makes this a one-line change per tier once real IDs are read off
`cursor-agent models`. Known limitation, not a silent gap.

### OpenCode model IDs — verified empirically

The three OpenCode IDs are no longer research claims. Probed against the locally installed
`opencode` 1.18.9 (`opencode models | grep '^opencode-go/'`), all three resolve:

```
opencode-go/deepseek-v4-pro   OK
opencode-go/glm-5.2           OK
opencode-go/minimax-m3        OK
```

The provider exposes 16 ids in total, so alternative tier values for additional profiles are
selectable from a measured list rather than guessed.

Sources: `code.claude.com/docs/en/sub-agents.md`, `code.claude.com/docs/en/model-config.md`,
`code.claude.com/docs/en/plugins-reference.md`, `learn.chatgpt.com/docs/agent-configuration/subagents`,
`learn.chatgpt.com/docs/config-file/config-reference`, `learn.chatgpt.com/docs/models`,
`cursor.com/docs/subagents.md`, `cursor.com/docs/models`, `opencode.ai/docs/agents/`,
`opencode.ai/docs/config/`.

**Open research item (blocks MPR-R9/R10 for Cursor):** Cursor documents no model-ID table
anywhere, and its catalog lists no DeepSeek or MiniMax entry. The Cursor tier values cannot
be chosen until that closes; `inherit` is the documented fallback if no resolvable ID is
found.

## 8. Verification recipe

```bash
bun run scripts/generate-subagent-artifacts.ts --check   # zero drift
bun run scripts/generate-skill-artifacts.ts --check      # zero drift
bun run test:scripts                                     # parity + integrity + registry suites
bun run lint                                             # oxlint correctness
```

Plus the frozen-fixture diff proving §4 is the complete set of shipped changes.

### Measured baseline (worktree, before any edit)

| Gate | Result |
| --- | --- |
| `generate-subagent-artifacts.ts --check` | `No drift` (exit 0) |
| `generate-skill-artifacts.ts --check` | `No drift` (exit 0) |
| `bun run test:scripts` | **733 pass / 1 skip / 4 fail**, exit 1 |

The 4 baseline failures are **not task-owned** and must still fail identically after this
feature lands — they are the tree-sitter native/packaging contracts, which need a built
`dist/` and packed artifacts that a fresh worktree does not have:

```
macOS arm64 packed Tree-sitter artifact contract > freezes publish-safe manifests and exact build tools
native Tree-sitter package contract > imports real source and built dist entries in separate cold Bun processes
native Tree-sitter package contract > guards every patched post-delete behavior in a cold child
native Tree-sitter package contract > discriminates no-delete growth and bounds patched 100-cycle RSS
```

Execute's gate is therefore *zero new failures against 733/1/4*, not a green suite.
