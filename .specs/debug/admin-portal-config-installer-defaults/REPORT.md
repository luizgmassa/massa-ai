# Debug Report — admin-portal-config-installer-defaults

- **projectId**: `massa-ai` · **workflowSessionId**: `debug-admin-portal-config-installer-defaults`
- **workflow**: debug · **fix size**: Standard+ (7 commits, 20+ files, public installer surface)
- **branch**: `fix/admin-portal-config-installer-defaults` from `origin/main` @ `398dc647` (v1.47.0)
- **worktree**: `/Users/luizmassa/Projects/massa-ai-wt-admin-config-defaults`
- **Isolation Gate**: satisfied — dedicated worktree + branch, recorded above. The
  main checkout was never switched; it was used read-only, once, as the `main`
  control arm for the regression measurement in H6.

## Issue Summary

Five user-reported symptoms on a developer machine running the Admin Portal and a
locally installed massa-ai.

| # | Symptom | Impact | Frequency | Environment |
|---|---|---|---|---|
| 1 | Logs tab → `NOT_FOUND: Route not found` | Logs tab unusable | Every request | macOS, local API on `:3333` |
| 2 | Claude missing from the Models-tab Profile Switch | Cannot switch Claude's profile from the portal | Every load | same |
| 3 | Scheduler + Capture Policy tabs render blank | 2 of 16 Config sections uneditable | Always | any install |
| 4 | Embedding `dimensions: 4096` after install | Fresh install starts with a width its own model (`qwen3-embedding:4b`, 2560) cannot emit | Every fresh install | any install |
| 5 | Re-running the installer never asks about features | No supported way to change an answer | Every re-install | any install |

Symptoms 1 and 2 were one root cause; 3–5 were independent.

## Feedback Loop

| Symptom | Loop that showed failure, then success |
|---|---|
| 1, 2 | Two live servers on one port, compared in the same second: `curl :3333/api/v1/logs` → 404 and `availableProfiles: []`, against a HEAD-source server on `:3399` → 401 (route exists) and 5 profiles. Killing the stale PID flipped `:3333` to 200 and 5 profiles. |
| 3 | `GET /api/v1/config` section count: 14 of the portal's 16 before, 16 after. |
| 4 | Execute the installer's shell function into a temp dir and parse the `config.json` it actually wrote — not a grep of the template, which is what let `4096` survive a sweep aimed directly at it. |
| 5 | Drive the prompt through a real pty (`installer_ask` reads `/dev/tty`, so a pipe proves nothing about whether typed answers take or Enter keeps the current value). |
| 6 (regression) | `bun test packages/core/src/__tests__/scheduler-safe-defaults.test.ts` — branch 22 pass / 4 fail, `main` @ `398dc647` 26 / 0, same host, same command. |

## Hypothesis Board

| # | Hypothesis | Prediction | Probe | Result |
|---|---|---|---|---|
| H1 | Generic `SO_REUSEPORT` under Bun lets any second process share a port | plain `node:http` would also permit it | bind the same port twice with `node:http` on the same Bun | **DISPROVEN** — it raises `EADDRINUSE` cross-process |
| H2 | `@elysiajs/node` defaults `reusePort` to true | passing `reusePort: false` restores `EADDRINUSE`; `exclusive: true` alone does not | two real child processes, one real port, isolated per option | **CONFIRMED** — the divergence point |
| H3 | The Logs route was never registered in the running build | route missing from source | grep the route table; serve HEAD source on `:3399` | **DISPROVEN** — `:3399` returns 401, so the route exists; the server answering `:3333` was 3 weeks stale |
| H4 | `defaultMassaAiConfig` lacks `scheduler`/`capturePolicy` and `loadConfig`'s deep-merge lists neither | `GET /api/v1/config` returns exactly 14 of 16 sections | count the returned sections | **CONFIRMED** |
| H5 | The v1.44.0 parity sweep could not see the installer template | its completeness scan keys on a literal the template never contained | grep `OLLAMA_EMBEDDING_` in `scripts/lib/installer-api-key.sh` | **CONFIRMED** — zero occurrences, ever |
| H6 | The 4 `mcp-client` failures at 5001 ms are a real defect | they reproduce standalone | run the suite alone, then the aggregate twice | **DISPROVEN** — 97/0 in 923 ms standalone; contention under a 10-way turbo run on a host carrying a permanent runaway process. Not reproducible; different tests failed on re-run |
| H7 | The `T29` scheduler failures are the same contention | they vary between runs like H6 | run the file standalone; compare against `main` | **CONFIRMED as a real regression** — deterministic 22/4 standalone, `main` 26/0. Timings 0.10–0.44 ms, not timeouts |

H6 and H7 arrived in the same failed aggregate and looked alike. Separating them
mattered: one was noise, the other was a defect this branch introduced.

## Root Cause

**Symptoms 1+2 — one stale process, silently sharing the port.**
`@elysiajs/node` defaults `reusePort` to **true**, so `app.listen(PORT, cb)` binds a
second process over a live server with no error: both listen callbacks fire, both PIDs
appear in `lsof -iTCP:3333`, and macOS routes every request to the **first-bound**
socket. A stale server (PID 81182, started 2026-08-09 22:40) therefore answered every
request while the current process sat unused on the same port. Divergence point:
`apps/tools-api/src/index.ts`'s listen call site.

**Symptom 3.** `defaultMassaAiConfig` carried no `scheduler` key and
`capturePolicy: undefined`, and `loadConfig()` deep-merges eleven named sections
including neither.

**Symptom 4.** `scripts/lib/installer-api-key.sh` hardcoded `"dimensions": 4096` beside
`qwen3-embedding:4b` (2560). Invisible to `embedding-defaults-parity.test.ts`, whose
completeness scan keys on the literal `OLLAMA_EMBEDDING_` — a string that file has never
contained. **A scan whose population cannot include a subject reports that subject
clean.**

**Symptom 5.** `setup-local-first.sh` wrapped its prompt in
`if [ "$ENV_FILE_EXISTED" = false ]`, and only two toggles existed at all.

**Regression found during verification (H7).** Fixing symptom 3 broke the scheduler's
safe-defaults preset. `registerDefaultJobs` resolves `env > config.json > its own
preset-adjusted literal`, so its middle layer must be able to report *absence* —
`fileValue ?? fallback` reaches the third layer only when the second is `undefined`. It
read that layer via `loadConfigSafe()`, which folds `defaultMassaAiConfig` in, so once
the scheduler had defaults every job's `enabled` arrived as a defined `false` and
`applySafeDefaults`'s `defaultEnabled: true` became unreachable.
`MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true` silently stopped enabling anything.

`scheduler-defaults.ts` had already documented this precise hazard — for
`config.get("scheduler")`, "already fully resolved and therefore never `undefined`". The
warning named one door; the defect walked through the other, four lines below the comment
describing it.

## Fix + Validation

| Commit | Fix |
|---|---|
| `1fb85a35` | `reusePort: false` at the listen call site; two-real-process port suite that also pins the call site |
| `3ba4ab76` | `scheduler` + `capturePolicy` defaults; `savePartialConfig` deep-merge (it erased the rest of the block and reported a phantom restart on every save); `DEFAULT_POLICY` declared once, in `shared` |
| `a07feb1b` | embedding width derived from the model; template writes `scheduler` (safe-defaults preset) and `capturePolicy` |
| `7db67ca6` | all four prompt groups asked on every install, prefilled from `config.json`; one shared prompt library |
| `5eaedc1b` | second config CLI aligned; parity sensor widened to the defect's *shape*, plus a cross-writer check |
| `0294dea8` | port probe rethrows instead of exiting (the seam guard bans that literal for a real reason); one allowlist entry, the mechanism that guard's own docblock prescribes |
| `aa4d3ae8` | `loadRawUserConfig()` — the file layer regains the ability to say "absent" |

**Decision correction, surfaced per the user's instruction.** The chosen installer option's
preview showed `checkpoint-purge: true`, but its description said it "mirrors the existing
`MASSA_AI_SCHEDULER_SAFE_DEFAULTS` preset", and `applySafeDefaults` enables only
`memory-consolidation` + `decay-sweep`. The named mechanism won: **checkpoint-purge ships
off**. Runtime literal `scheduler.enabled` stays `false` — only the installer writes
`true` — so an upgrade never silently starts five background jobs.

### Verification recipe — every gate, real exit codes

`echo $?` after a pipeline reports the last element's status, so each was captured directly.

| Gate | Result | Exit |
|---|---|---|
| `bun run lint` | clean (oxlint 1.76.0 prints nothing on a clean tree) | 0 |
| `bun run type-check --force` | 6/6 tasks, 0 cached | 0 |
| `bun run build --force` | 5/5 tasks, 0 cached | 0 |
| `bun run test --force` | 11/11 tasks, all 157 core groups | 0 |
| `bun run test:scripts` | 1773 pass / 0 fail across 80 files + 8 shell-suite groups | 0 |
| `bun run test:plugins` | 135 / 0 | 0 |
| `bun test apps/web-ui` | 522 / 0 across 10 files | 0 |
| `bun scripts/check-security-allowlist.ts` | PASS — 0 violations | 0 |
| `bash scripts/tests/test-setup-local-first-api-key.sh` | 26 / 0 | 0 |

A scratch `XDG_CONFIG_HOME` is load-bearing on every run: a real
`~/.config/massa-ai/config.json` has `llm.enabled: true` and breaks drift gates and
LLM-reaching suites.

**The lint gate was proven live rather than assumed.** It emits nothing on success, which
is indistinguishable from a gate that ran nothing. A planted duplicate declaration
produced `error: Identifier 'dup' has already been declared`, exit 1; the probe file was
removed and `git status --porcelain` confirmed no residue.

## Prevention

- **Regression coverage at the seam that owns the property.** The scheduler's own SCH-02
  block mocks this reader out, so it structurally cannot sense a regression in it. Five
  new cases in `packages/shared/src/config/__tests__/config-defaults-sections.test.ts`
  pin the raw/resolved distinction at the shared layer: absent file, absent section, one
  configured job not filling in its four siblings (asserted as an **exact key set**, not a
  count), an explicit `false` surviving as a value, and malformed/non-object JSON
  returning `{}`.
- **Mutation-verified.** Pointing `loadRawUserConfig` back at `loadConfigSafe` turns 4 of
  the 5 red. The fifth stays green **correctly** — a merged read preserves an explicit
  `false` too, so it pins a different property; counting it as a gap would have overstated
  the sensor. The first mutation attempted (`if (false) return {}`) was **equivalent** —
  the missing file throws `ENOENT` into the same catch — and was discarded rather than
  reported as a kill. Restore was byte-preserving and SHA-verified
  (`dda18bf6…`), never `git checkout`.
- **Sensor populations widened by shape, not spelling.** The embedding parity scan now
  keys on any file writing an embedding block with a literal width and asserts the matched
  set exactly, so a surface disappearing is as red as a new unlisted one; plus a
  cross-writer check comparing the two config CLIs *to each other*, which is the assertion
  that says they are one decision.
- **Config-section coverage takes its population from `app.js`**, not a list written beside
  it, so a portal section added with no default fails on the commit that adds it.
- **Runbook.** After this merges, restart the `:3333` API so the fail-loud bind is in
  effect. A duplicate bind now refuses at startup instead of producing a split brain.

## Memory Outcome

Deferred — no `remember` call was made. The MCP memory surface was not exercised in this
session, and the durable lessons here (a merged config layer destroying a caller's
fallback; separating a contention flake from a real regression in one failed aggregate)
are recorded in this report and in the commit messages, which are the artifacts
`.specs/` treats as authoritative. No memory writes failed; none were attempted.

## Residual Risk

- **`mcp-client` `embedded-api-client-endpoints.test.ts` remains contention-sensitive** on
  this host: 4 tests hit the global 5 s per-test timeout inside a 10-way-concurrent turbo
  run, then passed on re-run and standalone (97/0 in 923 ms). Host load was 5.15 with a
  permanent runaway (PID 75218, ~99% CPU since 30 Jul, 15766 CPU-minutes). CI is
  unaffected — it has no such process — but the suite has no budget of its own, so a
  loaded machine can still redden it.
- **Symptom 1's characterization test is deliberately informative rather than protective**:
  "without the option the adapter permits a silent duplicate bind" goes red if
  `@elysiajs/node` changes its `reusePort` default, at which point the workaround can be
  reconsidered. That is intended, not a latent failure.
- Tests, specs, fixtures, snapshots, schemas, public contracts and validator checks were
  **not weakened**. The single guard edit is one `SPAWN_ALLOWLIST` entry — the mechanism
  that guard's own docblock prescribes for child-probe suites, with `restart-e2e.test.ts`
  as precedent — and its `process.exit(` ban is untouched and still applies to the file
  that was added. The allowlist entry was confirmed non-vacuous: `git ls-files
  apps/tools-api/src` lists 57 `.test.ts` files including the new one.
