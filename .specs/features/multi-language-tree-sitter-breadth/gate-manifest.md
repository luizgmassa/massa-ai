# Multi-Language Tree-sitter Breadth Gate Manifest

**Workflow session:** `spec-multi-language`  
**Feature status:** BLOCKED in Execute; TASK-001 target discovery cannot reach the mandatory Linux matrix  
**Baseline commit:** `5d43a96f4c0f1dfbd04ee7ae95f589f9b023bf03`  
**Baseline worktree:** supplied `plan-multi-language.md` was the only user-owned untracked file before feature artifact creation.

## Planning Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Required coding bootstrap | PASS | `caveman full`, `coding-guidelines`, `massa-th0th`, persona router loaded in required order. |
| Memory/context restore | PASS with degradation | No exact-session memories; current source and `.specs/` used. Fresh index mapped the workspace; Synapse failed because shared `dist` lacks `requirePostgresDatabaseUrl`, so searches were stateless and source-confirmed. |
| Specify closure | PASS | 23 requirement IDs, 12 ACs, edge/failure cases, full implicit sweep, no open questions. |
| Discuss closure | PASS | Consequential native/readiness/generation/FQN/span/capability/custom-extension decisions recorded in `context.md`. |
| Design | PASS | Three approaches compared; supplied native-package approach selected; data/migration/concurrency/public compatibility defined. |
| Tasks | PASS | 26 tasks, seven execution phases, coverage/gate/parallelism tables, dependency cross-check, co-location validation, expected sensor counts. |
| Full Plan Challenge | PASS after revision | Pre-mortem critical/high findings revised: graph generation includes centrality/diagnostics, DB lease/snapshot/CAS and synchronous job ordering; readiness/liveness split; capability tiers conditional; FQN/SourceSpan contracts; generation completeness/last-good retention; benchmark corpus/variance/RSS semantics. Final closure pass found no remaining critical/high contradiction. |
| Phase-worker permission | PASS | User explicitly allowed sub-agents when useful, including final verification. One sequential worker per Execute phase is selected. |

## TASK-001 Preflight

| Check | Current evidence | Status |
| --- | --- | --- |
| Canonical extensions | 33 entries, 33 unique in `DEFAULT_ALLOWED_EXTENSIONS` | PASS |
| Current structural breadth | 8 symbol extensions, 7 import extensions, 4 typed-edge extensions | BASELINE |
| Package runtime pin | root declares Bun `1.2.0` | DRIFT |
| Local runtime | Bun `1.3.11`, Darwin arm64 | MEASURED |
| Docker runtime | `oven/bun:1.3-alpine`; blanket `--ignore-scripts` | DRIFT |
| CI runtime | Bun `latest` | DRIFT |
| Container engine | Docker, Podman, Colima, Lima, nerdctl, OrbStack, and Buildah unavailable locally | BLOCKING TARGET SENSOR |
| Native grammar dependencies | none in current lockfile | UNPROVEN |
| Candidate provenance | npm registry candidates captured in `capability-matrix.md`; Erlang requires an exact pinned Git commit | UNPROVEN |

TASK-001 SHALL not claim Linux glibc or Alpine musl PASS from static workflow definitions. It must run the declared target or produce CI evidence. The source plan forbids a WASM/runtime-download fallback and requires execution to block when the native matrix cannot pass.

## TASK-001 Execution Result (2026-07-13)

**Result:** BLOCKED before grammar artifact probing. The local macOS arm64 sensor exists, but all four mandatory Linux libc/CPU targets are unavailable. No clean grammar install, native load, parse smoke, linkage inspection, or incompatible-ABI negative sensor was attempted; therefore no grammar artifact row is PASS.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `rtk uname -s` | 0 | `Darwin` |
| `rtk uname -m` | 0 | `arm64` |
| `rtk sw_vers` | 0 | macOS `26.5.2`, build `25F84` |
| `rtk bun --version` | 0 | `1.3.11` |
| `rtk which bun` | 0 | `/Users/luizmassa/.bun/bin/bun` |
| `rtk file /Users/luizmassa/.bun/bin/bun` | 0 | `Mach-O 64-bit executable arm64` |
| `rtk which docker` | 1 | no executable path |
| `rtk which podman` | 1 | no executable path |
| `rtk which colima` | 1 | no executable path |
| `rtk which limactl` | 1 | no executable path |
| `rtk which lima` | 1 | no executable path |
| `rtk which nerdctl` | 1 | no executable path |
| `rtk which orbctl` | 1 | no executable path |
| `rtk which buildah` | 1 | no executable path |
| `rtk which qemu-aarch64` | 1 | no executable path |
| `rtk which qemu-x86_64` | 1 | no executable path |
| `rtk which multipass` | 1 | no executable path |

Unavailable mandatory sensors: Linux glibc amd64, Linux glibc arm64, Linux musl amd64, and Linux musl arm64. Static repository Docker/CI declarations remain non-executable evidence and were not promoted to PASS.

**Required authority/environment:** either provide a local multi-architecture Linux container/VM setup capable of executing glibc and musl probes on amd64 and arm64, or authorize creation and push of a dedicated remote CI matrix with suitable runners/emulation. Installing system/container software and pushing a CI branch are outside TASK-001's granted scope, so execution stops here. Once available, rerun the full matrix with one exact Bun release and clean caches before TASK-002.

## Planned Gate Commands

- `bun run verify:tree-sitter-native`
- `bun run --filter @massa-th0th/core test:unit`
- `bun run type-check`
- `bun run build`
- Owned PostgreSQL focused generation/migration tests with `--max-concurrency 1`
- Owned sequential `02.indexing`, `09.symbol-graph`, and `15.nfr` E2E suites
- `docker build --target api .`
- `docker build --target mcp .`
- `bun run bench:parser -- --baseline 5d43a96f4c0f1dfbd04ee7ae95f589f9b023bf03`
- Independent spec-anchored verification and discrimination sensors

## Artifact Freeze v2 (TASK-001 Blocked Evidence)

| Artifact | SHA-256 |
| --- | --- |
| `plan-multi-language.md` | `5bd97356cd2de163bb60169fbaf80b2e68b6adf36950fcf10fc147c41ce0f619` |
| `spec.md` | `9fde60c0158c7a52c30029ffa60b669320fdb6efe96659e3d66b5fe2e80250ca` |
| `context.md` | `a785cac4cad6ad57cfc96e5743ff04d3b949ff96ee2ad8bd7b4a38bedce2979f` |
| `design.md` | `3862902bec59d181dea7714a1e4a60b76beb1b99debea349b9703da79ae14571` |
| `tasks.md` | `1c1589e30ebf693770d874ae6eaadbecff485aba51beb8a241a0cca60d9fa8f6` |
| `capability-matrix.md` | `7d226de867544e9ea9b0030a9c9f9984ff858d153606cddc33fb88c3343e1a0a` |
| `.specs/project/FEATURES.json` | `8fb0bdb03783a71fe8e47edbe4174ddf7c83445ecb141c0338259204ebc74be9` |
| `.specs/project/STATE.md` | `05cc36fd27a4a35187a65c2af7580e146ffba4365ca6d6a5af0642c2b5f9194a` |
| `.specs/HANDOFF.md` | `60fb06495fcab2e16aadadee36cdd5e634d6ccfebf53b24ca99442126b4581a3` |

`gate-manifest.md` cannot embed its own stable file checksum; record its Git blob ID at each committed freeze.
