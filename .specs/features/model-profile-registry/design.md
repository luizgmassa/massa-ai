# Model Profile Registry — Design

Companion to `spec.md`. Requirement IDs are `MPR-R1..R11` from there.

---

## 1. Approach

Three layers, one direction of flow. Nothing flows back.

```
skills/model-profiles.json        DATA. Only hand-authored model/effort facts.
        │                         roles -> tier;  profile -> host -> tier -> {model, effort}
        ▼
scripts/lib/model-profiles.ts     SEMANTICS. Load, validate, select profile, resolve.
        │                         Total functions. Every failure is a named throw.
        ▼
scripts/generate-subagent-artifacts.ts   SYNTAX. Per-host emitters render the
                                         resolved pair into that host's own keys.
```

The split is the abstraction. The registry never knows that Cursor spells effort as a
bracket parameter; an emitter never knows what a profile is.

### Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Runtime resolution via env var read by the host | No host reads an env var from an agent's `model:` field. The two global knobs that exist are not per-agent and sit on **opposite sides** of frontmatter in their precedence chains — `CLAUDE_CODE_SUBAGENT_MODEL` *overrides* frontmatter, Codex's `agents.default_subagent_model` *loses* to the agent file (verbatim sources in `spec.md` §5). Neither can express a per-role profile. |
| Registry as a TypeScript module | A `type Profile = "cheap" \| "heavy"` union makes the profile set closed, breaking MPR-R3. JSON keeps profiles as data a user edits without touching source. |
| Flat `profile → host → role → model` | 2×4×15 = 120 facts and no place to state a role's rationale once. Rejected in Specify. |
| Keep per-host tier overrides so output stays byte-identical | Re-encodes exactly the drift the feature removes (`spec.md` P1). Rejected in Specify. |
| Registry under `skills/massa-ai/` | `generate-skill-artifacts.ts:103-140` copies that whole subtree into all four plugin bundles, so the registry would ship four redundant times. `skills/model-profiles.json` sits outside every copy glob (verified) and stays a build-time input. |

---

## 2. Registry schema

`skills/model-profiles.json`. One file, `version: 1`.

```jsonc
{
  "version": 1,
  "tiers": ["light", "standard", "deep"],          // ordered cheap -> capable
  "hostDefaults": {                                 // MPR-R4: host auto-selects a profile
    "claude": "balanced",
    "codex": "balanced",
    "cursor": "balanced",
    "opencode": "balanced"
  },
  "workflowTiers": {},                              // MPR-R7: shape supported, seeded empty
  // NOTE: there is deliberately no agents->tier map here. See §2.1.
  "profiles": {
    "balanced": {
      "description": "Default. Mixed-capability spread per host.",
      "hosts": {
        "claude":   { "light": { "model": "haiku",  "effort": "high" },
                      "standard": { "model": "sonnet", "effort": "high" },
                      "deep": { "model": "opus", "effort": "high" } },
        "codex":    { "light": { "model": "gpt-5.4-mini", "effort": "high" }, /* ... */ },
        "cursor":   { "light": { "model": "inherit", "effort": null }, /* ... */ },
        "opencode": { "light": { "model": "opencode-go/deepseek-v4-pro", "effort": "max" }, /* ... */ }
      }
    },
    "frugal": { "description": "Cheapest verified model per host, every tier.", "hosts": { /* ... */ } }
  }
}
```

### 2.1 Where a role's tier lives — exactly one place

An earlier revision put the agent→tier map in **both** the registry (`roles.agents`) and the
charter (`metadata.model_tier`), cross-validated. That is two sources of truth for the same
fact — the precise defect this feature exists to remove, reintroduced one layer up. A
cross-validation test would have caught disagreement but not prevented it, and the drift in
`spec.md` §1 P1 happened *inside* a single document that also cross-referenced itself.

Split by what owns the fact:

| Fact | Owner | Why |
| --- | --- | --- |
| an **agent's** tier | `skills/agents/<n>/SKILL.md` → `metadata.model_tier` | the tier is a property of that agent's job, and belongs beside the charter defining the job. One file per agent, no central list to fall out of sync with the 15 directories on disk. |
| a **workflow's** tier | registry `workflowTiers` | workflows have no charter, so there is nowhere else to put it |
| `tiers`, `hostDefaults`, `profiles` | registry | genuinely central, cross-cutting policy |

The registry therefore contains **no agent list at all**. Adding an agent means creating its
charter with a `model_tier` — one edit, one file, and the generator discovers it by reading
`skills/agents/`, which it already does (`loadAllCharters`). Nothing enumerates the 15 names
except `SPECIALIST_NAMES`, which stays as the ordering/registration list it already is.

Fact count at seed: 15 charter tiers + (2 profiles × 4 hosts × 3 tiers) = **39**, against 184
today — same total as the earlier shape, with no fact stated twice.

### Invariants (MPR-R2, enforced by §3 validation)

1. Every charter's `metadata.model_tier` is a member of `tiers`.
2. Every profile defines **all four** hosts — no partial profiles. A profile is switchable
   for the whole harness or it is invalid.
3. Every host block in every profile defines **every** tier in `tiers`.
4. `hostDefaults` covers all four hosts and names only existing profiles.
5. Every `workflowTiers` value is a member of `tiers`.
6. Every charter directory under `skills/agents/` has a `model_tier`. A charter missing it is
   an error, never a silent default.

### Why two seeded profiles, and why these values

`frugal` exists so the multi-profile machinery ships exercised by real data rather than only
by a synthetic test fixture. Its values introduce **no unverified model ID**: each is a value
already shipping on that host today, collapsed across all three tiers.

| Host | `frugal` value (all tiers) | Verified by |
| --- | --- | --- |
| claude | `haiku` | documented alias (`sub-agents.md`) |
| codex | `gpt-5.4-mini` | listed as currently supported (`learn.chatgpt.com/docs/models`) |
| cursor | `inherit` | documented default |
| opencode | `opencode-go/deepseek-v4-pro` | `opencode-go` is a real built-in provider (`opencode.ai/docs/go/`) |

A `heavy` profile is deliberately **not** seeded: it would require inventing model choices,
which is a cost decision and would ship IDs no source verifies. `README`/`FEATURES.md`
document the shape so adding one is registry-only (MPR-R3).

---

## 3. Resolver — `scripts/lib/model-profiles.ts`

Pure, no side effects beyond reading the registry file. No dependency outside `node:fs`/`node:path`,
so it runs in the deterministic gate and needs no `node_modules`.

```ts
export type Host = "claude" | "codex" | "cursor" | "opencode";
export type RoleKind = "agents" | "workflows";
export interface Resolved { readonly model: string; readonly effort: string | null }

export function loadRegistry(file?: string): Registry;          // parse + validateRegistry
export function validateRegistry(r: unknown): Registry;         // throws RegistryError
export function selectProfile(host: Host, opts?: SelectOpts): string;
export function resolveTier(r: Registry, host: Host, profile: string, tier: string): Resolved;
export function workflowTier(r: Registry, name: string): string;
```

`resolveTier` takes a **tier**, not a role name — the registry has no agent list (§2.1), so the
caller supplies the tier it read from the charter. That keeps the resolver ignorant of which
agents exist, which is why adding an agent needs no resolver change.

### Profile selection (MPR-R4)

`selectProfile` precedence, first match wins:

| Rank | Source | Notes |
| --- | --- | --- |
| 1 | `--profile=<name>` | generator argv; wins over everything |
| 2 | `MASSA_AI_MODEL_PROFILE` | one env prefix in this project (**AD-010**) |
| 3 | `hostDefaults[host]` | the "auto-choose by harness CLI" path |

There is no rank 4. An unknown name at *any* rank is `UnknownProfileError`, never a
fall-through to a default — a typo'd `--profile=chaep` must fail, not silently ship
`balanced`.

Adding `MASSA_AI_MODEL_PROFILE` obliges an edit to `turbo.json` → `tasks.test.passThroughEnv`;
turbo sandboxes the environment and the var would otherwise arrive `undefined` under
`bun run test` while working under a bare `bun test`.

### Fail-loud validation (MPR-R5)

One error class per failure mode, each carrying the offending key path. `validateRegistry`
collects **all** violations and throws once with the full list — a first-throw would make a
registry with six mistakes take six edit/run cycles.

| Error | Trigger |
| --- | --- |
| `UnknownProfileError` | requested profile absent from `profiles` |
| `MissingHostError` | profile does not define a host |
| `MissingTierError` | host block omits a declared tier |
| `UnknownTierError` | a charter's or workflow's `tier` is not in `tiers` |
| `MissingCharterTierError` | charter dir exists with no `metadata.model_tier` |
| `UnknownWorkflowError` | `workflowTier` called for a name absent from `workflowTiers` |
| `InvalidEffortError` | effort outside the target host's documented enum |
| `InvalidHostDefaultError` | `hostDefaults` missing a host or naming an unknown profile |

### Per-host effort validation

The documented enum per host lives beside the resolver, with its source URL in a comment:

| Host | Accepted `effort` | Source |
| --- | --- | --- |
| claude | `low` `medium` `high` `xhigh` `max` | `code.claude.com/docs/en/sub-agents.md` |
| codex | `minimal` `low` `medium` `high` `xhigh` | `learn.chatgpt.com/docs/config-file/config-reference` |
| cursor | **must be `null`** | Cursor has no effort key; effort is a bracket param on a model ID, and bracket syntax on `inherit` is undocumented |
| opencode | any non-empty string | generic provider pass-through; `opencode.ai/docs/models/` documents enums for Anthropic/OpenAI/Google but names no value for `opencode-go`, so this is not enumerable |

The `opencode` row is a deliberate hole and is commented as one. `reasoningEffort: max` is
kept because it is today's shipped value and the *mechanism* is documented; narrowing it on
unverified evidence would be a behavior change with no proof behind it.

---

## 4. Emitter changes

Each emitter keeps its signature and gains a `Resolved` argument. Only Cursor and OpenCode
change shape (`spec.md` §4).

### Claude — values only

```yaml
name: massa-ai-<n>
description: <charter description>
tools: ["Read","Grep","Glob","Bash"]
model: <resolved.model>
effort: <resolved.effort>
```

### Codex — values only

`sandbox_mode` stays: it is the documented per-agent read-only mechanism, and `read-only` /
`workspace-write` are both valid enum members. `# massa-ai-owned` stays — a real TOML comment,
greped by `apps/codex-plugin/install.sh:483`.

### Cursor — before / after

```diff
  name: massa-ai-investigator
  description: ...
- tools: ["Read","Grep","Glob","Bash"]
- model: DeepSeek V4 Pro
- reasoningEffort: max
+ model: inherit
+ readonly: true
```

`tools` and `reasoningEffort` are not in Cursor's five-field schema. `readonly: true` is
emitted for the 12 read-only charters and omitted for the 3 writers (`false` is the default —
emitting it would be noise). `model: inherit` because no resolvable Cursor ID exists for the
pinned models (`spec.md` §7); the value is registry data, so it becomes a one-line change once
IDs are read off `cursor-agent models`.

### OpenCode — before / after

```diff
- name: massa-ai-investigator
  description: ...
  mode: all
  model: opencode-go/deepseek-v4-pro
  reasoningEffort: max
  permission: { edit: deny, bash: deny }
- metadata: { massa-ai-owned: true }
  ---
+ <!-- massa-ai-owned: true -->
  # Investigator Agent Skill
```

Both keys leave the frontmatter because OpenCode's documented pass-through rule forwards
unrecognized keys to the model provider as model options. Dropping `name` is
behaviour-preserving: the agent name is the filename stem, and the file is already
`massa-ai-<n>.md` (asserted by D1).

**The ownership marker is not dropped — it moves.** An earlier revision of this design claimed
the marker was read by nothing, based on a grep limited to `install.sh`. That was wrong.
OpenCode has **two** install paths:

| Path | Installs as | Uninstall scoping |
| --- | --- | --- |
| `apps/opencode-plugin/install.sh:435-448` | symlinks | symlink + `massa-ai-*` filename prefix (`:310-317`) |
| `apps/opencode-plugin/src/config-cli.ts:224-238` (`massa-ai-config agents install`) | **real file copies** | `content.includes("massa-ai-owned: true")` (`:248`) |

Removing the marker outright would make `massa-ai-config agents uninstall` match zero files
and report `removed 0` while silently orphaning 15 installed agents — a data-safety
regression, not a cleanup. Three tests assert the marker
(`apps/opencode-plugin/src/__tests__/agents-install.test.ts:107,119,164`) plus
`scripts/__tests__/subagent-parity.test.ts:347`.

Relocating it to a markdown comment on the first body line satisfies both constraints at once:

- it is body text, not a frontmatter key, so OpenCode never forwards it as a model option;
- it still contains the literal substring `massa-ai-owned: true`, so `config-cli.ts:248`
  keeps working **with no code change**, and — importantly — keeps matching agent files that
  an *older* version already installed in the frontmatter form. Backward compatible in both
  directions.

`subagent-parity.test.ts:347` changes from asserting `fm.metadata` to asserting the body
marker. The narrower assertion (marker present *and* `metadata` absent from frontmatter) is
what makes the relocation discriminating rather than a no-op.

---

## 5. Charter change (MPR-R6)

```diff
  metadata:
    author: S1LV4, luizgmassa
    version: "1.0.0"
-   model_hint: DeepSeek V4 Pro
+   model_tier: light
    permission: read-only
```

Consumers updated in lockstep:

| Consumer | Change |
| --- | --- |
| `generate-subagent-artifacts.ts` `loadCharter` | reads `model_tier`; throws when absent |
| `.github/workflows/skills.yml:61` | `grep -q "^  model_hint:"` → validate `model_tier` against the registry's `tiers` |
| `scripts/__tests__/skills-harness-integrity.test.ts` | asserts charter tier matches the registry role entry |
| 60 mirrored charters | regenerate via `generate-skill-artifacts.ts` (byte copy, automatic) |

`model_tier` is a rename, not an addition — keeping both would leave two sources of model
truth in the charter, the exact defect being removed.

---

## 6. Tests

`scripts/__tests__/model-profiles.test.ts` (new) — resolver unit + validation:

| Group | Cases |
| --- | --- |
| Schema invariants | fact count = 39; partial profile rejected; missing tier rejected; `hostDefaults` completeness |
| Selection (MPR-R4) | flag only; env only; both (flag wins); neither (hostDefaults); unknown at each rank throws |
| Validation (MPR-R5) | one case per error class in §3; asserts error *name* and key path, not just "throws" |
| Openness (MPR-R3) | inject a synthetic profile into an in-memory registry, resolve all 4 hosts × 3 tiers, zero source edits |
| Workflows (MPR-R7) | resolve a `workflows` key; assert no workflow markdown is written |
| Multi-error | a registry with 3 distinct faults throws once listing all 3 |

`scripts/__tests__/subagent-parity.test.ts` (rewritten) — its four hard-coded tables are
deleted and replaced by registry-derived expectations, plus per-host allowed-key assertions
for MPR-R9 with the source URL cited per host.

> **Trap:** the parity test must derive expectations from the registry *and* assert against a
> frozen baseline, or it becomes a tautology — a table that reads the same registry the
> generator reads passes no matter what either contains. The frozen fixture is what makes it
> discriminating.

`fixtures/baseline-main.json` (already written) — 15 agents × 4 hosts of
`{model, effort, keys}`, extracted with `git show 45daaa1:<path>`, pinned to
`45daaa162ca18799a6da4ac832a65b5e83199572`. A regression test asserts the post-change tree
differs from it in **exactly** the rows enumerated in `spec.md` §4, and nowhere else.

### Discrimination plan (CONTRIBUTING step 7)

Mutations the suite must kill:

| Mutation | Killed by |
| --- | --- |
| swap two roles' tiers in the registry | frozen-fixture row diff |
| flip a `hostDefaults` entry | selection test + fixture diff |
| make `selectProfile` fall back to `balanced` on unknown name | unknown-profile-throws case |
| drop one tier from one host block | `MissingTierError` case |
| reinstate `reasoningEffort` in the Cursor emitter | Cursor allowed-key assertion |
| reinstate `metadata` in the OpenCode emitter frontmatter | OpenCode allowed-key assertion |
| drop the OpenCode ownership marker entirely | body-marker assertion + a `config-cli` uninstall test that installs, uninstalls, and asserts 15 files removed and a seeded user agent survives |
| edit a charter's `model_tier` without regenerating artifacts | `generate-subagent-artifacts.ts --check` drift gate |
| reintroduce a per-host rationale column to `FEATURES.md` | doc-drift test asserts the generated role→tier table is the only role-keyed model table in the file |
| point a registry tier at a model ID the provider does not expose | `scripts/verify-model-ids.ts` (MPR-R12) against an installed CLI |
| change `validateRegistry` to throw on first fault | multi-error case |
| let `loadCharter` default a missing `model_tier` | charter-throws case |

---

## 7. Documentation (MPR-R11)

`FEATURES.md` loses its four 15-row per-host tables (64 rows) and gains:

- one **role → tier** table, 15 rows, generated from the charters' `metadata.model_tier`;
- one small **tier → model** table per profile;
- the per-host key/format/effort reference from `spec.md` §7, with source URLs;
- the Cursor `inherit` limitation and the `cursor-agent models` discovery path.

The four duplicated rationale columns are **deleted, not consolidated**. Each role's reason
for its tier already lives in its charter's own prose; restating it in a table beside the model
value is what allowed `navigator` to ship the sentence "no frontier reasoning needed" next to a
standard-tier model on one host and a light-tier model on another (`spec.md` §1 P1).

This is a stronger answer to the rationale-drift risk than testing for it: a duplicated
rationale that a test compares can still be *jointly* wrong, whereas a rationale that exists
once cannot disagree with itself. The doc-drift test consequently compares tier only, and
MPR-R11's `why` clause is satisfied structurally rather than by assertion.

`CLAUDE.md` gains a short pointer in the agent-harness section, plus the
`CLAUDE_CODE_SUBAGENT_MODEL` caveat: setting it to a real model silently defeats every
registry pin on Claude, because it outranks frontmatter.

`CHANGELOG.md` gets a `### Changed` entry under `[Unreleased]` (minor bump: shipped model pins
and emitted frontmatter keys both change). It must name **three** defect classes closed, not
two — the third is easy to under-report as hygiene:

1. cross-host tier drift on 3 roles (5 pins);
2. the Cursor emitter emitting two keys Cursor does not define, a display name where an ID is
   required, and no `readonly`;
3. **OpenCode sending `name` and `metadata` to the model provider as bogus model options on
   every subagent invocation** — live on `main` today, under OpenCode's documented
   unknown-key pass-through rule. This is a currently-shipping bug, not cleanup, and
   `CONTRIBUTING.md` treats generated-artifact behavior changes as breaking-until-proven-otherwise.

### New: `scripts/verify-model-ids.ts` (MPR-R12)

Probes each locally installed harness CLI and checks every registry model ID resolves.

| Host | Probe | Status |
| --- | --- | --- |
| opencode | `opencode models` → grep exact ID | works; already run (`spec.md` §7) |
| codex | installed locally; probe TBD during Execute | — |
| cursor | needs `cursor-agent`, **not installed** | skipped-with-reason |
| claude | aliases are documented, not CLI-enumerable | n/a |

Absent CLI ⇒ skip **with a named reason**, never a silent pass. Advisory, not wired into the
blocking CI gate — CI has no harness CLI installed, so making it blocking there would either
fail always or pass vacuously.

---

## 8. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| D1 | Dropping OpenCode `name:` changes agent identity if a filename ever stops matching. | Assertion: every emitted OpenCode filename stem equals `massa-ai-<charter name>`. |
| D2 | `readonly: true` may restrict Cursor agents differently than the inert `tools` array did — a real behavior change for 12 agents. | Intended: `tools` was doing nothing. Called out in CHANGELOG as a behavior change, not a refactor. |
| D3 | `model: inherit` removes Cursor model differentiation entirely. | Today's values error out or silently fall back, so `inherit` is not a downgrade. Documented limitation + one-line fix path. |
| D4 | Cursor's `fast` value and unknown-key handling are in flux across 2026 doc revisions. | Only `inherit` is used — documented continuously and the field default. |
| D5 | The 5 normalized pins change which model runs 5 agent/host combinations. | Enumerated in `spec.md` §4, justified by each role's own `why`, asserted by the fixture diff. |
| D6 | `MASSA_AI_MODEL_PROFILE` absent from `turbo.json` passThroughEnv → arrives `undefined` under `bun run test` only. | Explicit task; a selection test that reads the env var proves it. |
| D7 | Registry JSON has no comments, so a role's rationale could drift from reality. | `why` is a required field per role and is the source of the docs table (MPR-R11). |
| D8 | Relocating the OpenCode ownership marker to the body silently breaks scoped uninstall if `config-cli.ts:248` ever tightens its substring match to a frontmatter-shaped regex. | The uninstall path is covered end-to-end by a test that installs via `config-cli`, uninstalls, and asserts 15 removed + a seeded user agent preserved. Any tightening of that match fails the test. |
| D9 | An OpenCode agent installed by an **older** version carries the marker in frontmatter; a new uninstall must still remove it. | The substring match is unchanged, so both forms match. Asserted by a test that seeds one old-form and one new-form file and uninstalls both. |
