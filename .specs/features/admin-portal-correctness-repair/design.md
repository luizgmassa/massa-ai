# Admin Portal Correctness Repair — Design

Companion to `spec.md`. Covers the four decisions that are not mechanical: the overlay
delta contract (APCR-01), the deployment path resolver (APCR-07), the secret-file mode
strategy (APCR-08), and the SSE handler factory (APCR-09). The remaining tasks are
local edits whose approach is fully determined by their acceptance criteria.

## Design Summary

Four things change shape; the rest are local corrections.

1. **The overlay becomes a real delta format.** Deep merge replaces whole-object replace, and
   deletion — which whole-object replace expressed implicitly, by omission — becomes explicit
   via a `null` tombstone. The route's hand-copied merge twin is deleted in favor of the
   library's, so the two cannot drift again.
2. **The generator path stops encoding the module's position in the source tree.** A bounded
   upward search for a repo marker replaces two fixed `../../../../` climbs, and a failed
   search becomes a 501 instead of an exception.
3. **Secret files get an explicit mode at every write site**, plus a `chmod` that repairs
   files already on disk, plus a retention cap on the backup family this code creates.
4. **The two SSE routes collapse to one handler behind a factory**, after the status-derivation
   fix so it is written once.

Nothing here changes a wire format, a route path, or a config key. The one behavior contract
that changes — an absent overlay key now means "inherit" rather than "absent" — is the whole
point of APCR-01 and is why the tombstone exists.

## Tech Decisions

| # | Decision | Alternative rejected | Why |
| --- | --- | --- | --- |
| TD-1 | `null` is the nested-deletion tombstone in `hostDefaults` / `workflowTiers` | Deep-merge `profiles` only, leave the flat maps as whole-object replace | Preserves the remove button with no new contract, but fails APCR-01.2/01.3 for exactly those maps — the defect, half-fixed |
| TD-2 | `null` over a `_deleted: [...]` list | A per-map deletion list | Equal power, two places to keep in sync, and it does not match the existing profile-level `_delete` idiom |
| TD-3 | Delete `mergeOverlayForValidation`; the route calls the library's exported `mergeOverlay` | Keep both and add a test asserting they agree | A test detects drift after it happens; deleting the twin makes drift unrepresentable. APCR-01.7 is satisfied structurally |
| TD-4 | Normalization is read-only; it never rewrites the overlay file | Normalize-and-persist on read | A read path that writes turns a concurrent `GET` into a config mutation. The collapse still lands, because the UI seeds from `source.overlay` and the next save persists it |
| TD-5 | Bounded upward marker search, memoized | Keep a fixed climb and add a second one for `dist` | Two hard-coded climbs is the same defect twice. The search is a superset of every position that works today |
| TD-6 | Do not ship `scripts/` in `files[]` or the Docker COPY list | Ship it so the routes work everywhere | Measured: the image also lacks the generator's charter sources and 3 of its 4 output roots, so it would run and produce a wrong artifact set — strictly worse than 501 |
| TD-7 | 501 Not Implemented | 503 Service Unavailable | The capability is absent from this deployment, not temporarily down |
| TD-8 | Explicit `mode` at creation **and** an explicit `chmodSync` after | `mode` alone | `mode` is masked by umask on creation only and does nothing for a pre-existing file, so it would never repair the already-644 `config.json` |
| TD-9 | Retention deletes only `config.json.bak.<ISO>` | Delete anything matching `config.json.bak*` | The legacy untimestamped `.bak` was not created by this scheme; deleting an operator's file to satisfy a policy we just invented is not a correctness fix |
| TD-10 | APCR-09 runs after APCR-06 | Dedupe first, then fix | Fixing first means writing the status derivation once instead of twice-then-merged |

## Risks & Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **The tombstone change breaks REG-03's remove button** — the exact regression this design exists to prevent | Medium if unguarded | High: silently reverts a feature validated PASS 2026-08-08 | AC in APCR-01; the UI handler and the merge change land in the same commit (T1); a test asserts a `null` tombstone actually deletes |
| **An overlay written by a *newer* client is read by an *older* massa-ai** — the old whole-object replace would treat `null` as a literal value and fail `validateRegistry` | Low (single-machine tool, overlay is local) | Medium: registry read falls back to builtin with an `overlayError`, which is the existing corrupt-overlay path, not a crash | Accepted. Documented here; the failure is already graceful by construction (`loadEffectiveRegistry:502-509`) |
| **T3 removes the assign-before-connect ordering** that currently makes a DB-down `listProjects` throw, converting F2's loud failure back into a silent empty list | Medium — the natural "clean up" is exactly this | High: undoes T2 in the same phase | APCR-03.4 is an explicit AC with its own test; T2 → T3 ordering makes the coupling visible in the diff |
| **`mock.module` registration misses after T7 changes the specifier shape** | Low — it registers by resolved path | Medium: tests would silently exercise the real library | The resolved file is unchanged; T7's gate re-runs the registry suites, and a miss would surface as a real spawn attempt |
| **`chmod 0600` on a config file the operator deliberately shared** (e.g. a container bind-mount read by another UID) | Low | Medium: another process loses read access after the next save | The file holds the API key and `database.url`; 0600 is the correct default. Called out in the CHANGELOG so the behavior change is discoverable |
| **`bun run generate:artifacts` regenerates ~580 files** when T10 touches `validate_state.ts`, inflating the diff | High — it is the designed behavior | Low: they are gitignored build output (AD-016) | Verified gitignored before committing; the PR description names the blast radius |
| **Turbo caches `type-check` and reports a stale 6/6** | High on repeat runs | Medium: a green gate that measured nothing | Gates use `--force` for the close-out measurement |
| **A pre-existing full-copy overlay stays frozen on any builtin value that later changes** — normalization diffs against the *current* builtin and the overlay carries no provenance | High for anyone who used the v1.41/v1.42 registry editor | Medium: APCR-01's Goal is met for *additions* but not for *changes* to keys the full copy already covers | Not closable without a provenance field. Recorded as APCR-01.9, pinned by a test so it cannot change silently, mitigated by APCR-01.10's visible override count and the existing `DELETE /overlay` |
| **The server-side status fix lands and the operator still sees green** — `app.js:1854-1859` keys the banner on `exitCode` alone | Certain if unguarded — it is the current code | High: defeats the entire point of APCR-06 | APCR-06.6 puts that branch inside T6's scope, with a UI-level assertion rather than an array-membership one |
| **`unsupported` hosts stay invisible** — a fourth `HostSwitchStatus` value the detail-string joins never bucket | Medium — reachable whenever a plugin bundle lacks a variant | Medium: reads as "skipped" (nothing to do) when it means the profile cannot run there | APCR-06.7; reuse `reportSucceeded` (`report.ts:51-53`) instead of re-deriving the success boundary |
| **The `getPool`/`ensureInitialized` unification skips the dimension setup** — the shortest way to share the pool is to let `getPool` satisfy the `initialized` gate, which also skips `tableName`/`schemaDimensions` | Medium — it is the shortest implementation | High: every later dimension-scoped query runs against an unset table name | APCR-03.5 forecloses it with an AC and an assertion in the same new test file |
| **A backup is readable before its `chmod` lands** — `copyFileSync` inherits the source mode, and a `chmod` cannot revoke an already-open descriptor | Low-medium — needs a same-UID watcher, which is this requirement's own threat actor | High: plaintext API keys and `database.url` | APCR-08.2 routes backups through the same temp-file-plus-rename path as the primary write |
| **Backups retain a rotated secret** — up to 10 files keep the old key after the operator rotates it | Medium | Medium: the exposure window outlives the rotation | Accepted and documented (APCR-08.9). "Bounded in number" caps disk growth, not exposure time; the docs say so rather than leaving it implied |

---

## D-1 — The overlay delta contract (APCR-01)

### The problem the audit did not name

Deep-merging the overlay makes an absent key mean **"inherit from builtin"**. Today an
absent key means **"this key does not exist"**, because `workflowTiers` and `hostDefaults`
are replaced wholesale (`model-profiles.ts:530-536`). One shipped feature depends on the
current meaning:

`handleRegistryWorkflowTierRemove` (`app.js:1663-1669`) removes a workflow tier by
`delete ctx.state.registryOverlay.workflowTiers[workflow]`. That is REG-03 from
`registry-help-dropdown-workflow-tiers`, **validated PASS 2026-08-08**. Under deep merge
alone the removal becomes a silent no-op — the builtin's entry is restored on the next read
and the button appears to do nothing.

Switching to a delta format therefore requires deletion to become **expressible**, not
implicit. Profiles already have this (`_delete: true`); the two flat maps do not.

### Decision — `null` is the nested tombstone

| Overlay value | Meaning |
| --- | --- |
| key absent | inherit the builtin's value |
| key present, non-null | override the builtin's value |
| key present, `null` | delete the key from the merged registry |
| profile `{_delete: true}` | delete the profile (**unchanged** — existing contract) |

`null` is chosen over a sentinel string because it is unambiguous in JSON, cannot collide
with a legal tier name or host id, and is what the UI already produces for an empty cell's
`model`/`effort`. Scoped to the two flat maps (`hostDefaults`, `workflowTiers`); `tiers` is
an array and stays a whole-value replace, which is correct for an ordered list.

**Rejected alternatives**

- *Deep-merge `profiles` only, keep the flat maps as whole-object replace.* Preserves the
  remove button with no new contract, but fails APCR-01.2 and APCR-01.3 for exactly those
  maps — a builtin adding a `workflowTiers` entry would still never reach an operator who
  has an overlay. That is the defect, half-fixed.
- *A separate `_deleted: [...]` list per map.* Equivalent power, two places to keep in sync,
  and it does not match the existing profile-level `_delete` idiom.

### Decision — one merge implementation, not two

`mergeOverlayForValidation` (`model-registry.ts:185-214`) is a hand-copied twin of
`mergeOverlay` (`model-profiles.ts:523-553`). They are already byte-equivalent in behavior
and have no reason to differ. APCR-01.7 requires identical output; the structural way to get
that is to **delete the twin** and have the route call the library's merge through the
`profilesLib()` handle it already holds.

`mergeOverlay` is currently module-private and becomes an export. The route's test mock
(`model-registry.test.ts:63`) gains the new key. `mock.module` registers by *resolved* path,
so the route's `["..","..","..","..","scripts","lib","model-profiles.ts"].join("/")`
specifier and the test's literal specifier still land on the same registration after
APCR-07 changes how that path is computed — provided the resolved file is unchanged, which
it is.

### Decision — normalization is read-only

`loadEffectiveRegistry` drops overlay entries whose value is byte-identical
(`JSON.stringify` equality) to the builtin's value at the same path, and drops `null`
tombstones for keys the builtin does not have. It returns the normalized overlay in
`source.overlay`. It does **not** rewrite the file: a read path that writes turns a
concurrent `GET` into a config mutation, and the effect is achieved anyway because the UI
seeds from `source.overlay` and the next save persists the collapsed delta.

With deep merge in place, normalization is not what fixes APCR-01.3 — deep merge alone
already does, because the merge starts from the builtin. Normalization earns its place by
collapsing the full-copy overlays v1.41/v1.42 already wrote onto operator machines, which
is what removes Q4's *accidental* trigger (Amendment A4).

### Client changes that follow

1. `initRegistryOverlay` reverts to seeding from `source.overlay` only (APCR-01.8).
2. `mergeRegistryForDisplay` currently reads `overlay.hostDefaults || merged.hostDefaults`.
   With an overlay-only seed those are `{}` — **truthy** — so the display would blank the
   host defaults and workflow tiers. Each must become a per-key merge over the server's
   registry, not a truthiness fallback (APCR-11.4).
3. `handleRegistryWorkflowTierRemove` sets `workflowTiers[workflow] = null` instead of
   deleting the key, and the renderer treats a `null` value as removed.

### Blast radius

`scripts/lib/model-profiles.ts` is read by the generator, both CLIs, the profile-switch
engine, and the MCP `profile_list`/`profile_set` tools. The merge change is additive for any
overlay that contains no `null` values, which is every overlay written before this change.

---

## D-2 — Deployment path resolver (APCR-07)

### Decision — walk up for a marker, memoize, return `null` on failure

A fixed `../../../../` climb encodes the module's position in the source tree, which is
wrong from `dist/` and meaningless in a deployment that never shipped `scripts/`. Replace it
with a bounded upward walk from `import.meta.dirname` looking for
`scripts/generate-subagent-artifacts.ts`, capped at 6 levels, resolved once and cached.

| Runtime | `import.meta.dirname` | Result |
| --- | --- | --- |
| dev checkout | `apps/tools-api/src/routes` | found 4 up |
| bundled `dist` | `apps/tools-api/dist` | found 3 up |
| published npm package | `<node_modules>/@massa-ai/tools-api/dist` | not found → `null` |
| Docker `api` image | `/app/apps/tools-api/src/routes` | not found → `null` (`scripts/` is not copied) |

The walk is a *superset* of the current behavior in every case where the current behavior
works, so no working deployment changes.

### Decision — do not ship `scripts/` to make the routes work

Measured (Amendment A1): the Docker image also lacks the generator's charter sources
(`skills/agents/`) and 3 of its 4 output roots (`apps/{claude,codex,cursor}-plugin/`).
Copying `scripts/` alone would move the failure from "module not found" to "generator runs
and produces a wrong or empty artifact set" — strictly worse. `files: ["dist"]` is likewise
left alone; the admin portal is a local-operator surface by design
(`model-registry.ts:7-13`).

### Decision — one 501 shape

```
501 { success: false, error: "model-registry is unavailable in this deployment: <what> was not found under <root-search>. This route requires a massa-ai source checkout." }
```

Applied identically by the three JSON routes and, as the terminal `done` frame's `error`
field, by the two SSE routes. 501 (Not Implemented) rather than 503: the capability is
absent from this deployment, not temporarily down.

---

## D-3 — Secret file modes (APCR-08)

### Decision — explicit mode at creation *and* an explicit `chmod` after

`saveConfig`'s temp-file-plus-rename is load-bearing (SEC-01: two processes can
auto-provision the API key concurrently) and is **not** rewritten — Amendment A2 corrects
the audit's "bare `writeFileSync`" claim.

Three changes, all additive:

1. The temp file is created with `{ mode: 0o600 }`. Without this the secret is world-readable
   for the whole write-then-rename window, which the current code leaves open.
2. `fs.chmodSync(CONFIG_FILE, 0o600)` after the rename. `writeFileSync`'s `mode` is masked by
   the umask on *creation only* and does nothing for a pre-existing file, so this is what
   repairs the already-644 `config.json` on the next save (APCR-08.3).
3. Backups are `copyFileSync` + explicit `chmodSync(backupPath, 0o600)`. `copyFileSync`
   inherits the **source** file's mode, which is why the three existing backups measure
   600/600/644 rather than a single value.

### Decision — retention deletes only what this code creates

The cap applies to files matching `config.json.bak.<ISO>` — the pattern
`savePartialConfig` writes. The legacy `config.json.bak` (no timestamp, present on this
machine) is tightened to `0600` but never deleted: it was not created by this scheme and
deleting an operator's file to satisfy a retention policy we just invented is not a
correctness fix. Sort is lexical on the ISO timestamp, which is chronological by
construction; keep 10, unlink the rest.

`model-profiles.json` is explicitly **not** included — it holds no secrets, and tightening
it would be scope creep with no threat behind it.

---

## D-4 — SSE handler factory (APCR-09)

`/regenerate-and-install-stream` and `/regenerate-stream` have byte-equivalent bodies. One
factory returning the handler closure, called twice with only the `detail` metadata
differing. The deprecated alias stays registered with its own `summary`/`description` so the
Swagger surface is unchanged.

Ordering: APCR-09 runs **after** APCR-06 so the status-derivation fix is written once, in
the shared handler, rather than twice and then deduplicated.

---

## Task dependency graph

```
Phase 1 (P0)          Phase 2 (P1)            Phase 3 (P2)
T1 ──────────────────────────────────────────► T11 (spec/CHANGELOG must describe T1's final shape)
T2 ─┐
T3 ─┼─ (T3 must not remove the pool-assign-before-connect that makes T2's DB-down path loud)
T4 ─┘
T5
T6 ─────────────────► T9 (dedupe after the status fix, not before)
                      T7 (independent)
                      T8 (independent)
                                              T10 (independent)
```

`T1 → T11` and `T6 → T9` are the only hard orderings. T2/T3/T4 share
`postgres-vector-store.ts` and `project.ts` and are sequenced to keep commits atomic.

## Verification approach

Each task's gate is the narrowest suite that can observe its acceptance criteria, plus the
full baseline set before the close-out commit. Two criteria need a sensor that does not
exist yet:

- **APCR-03.1** (one pool) needs a Pool-constructor counter injected into the store, since
  the defect is invisible from the store's public behavior — both pools work.
- **APCR-08.1-4** (modes, retention) need a scratch `XDG_CONFIG_HOME` and a real `stat`;
  `config-writer.ts` is coverage-excluded but is exercised through the `runIsolated`
  subprocess harness, which is where these assertions belong.
