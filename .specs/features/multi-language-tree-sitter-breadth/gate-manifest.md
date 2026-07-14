# Multi-Language Tree-sitter Breadth Gate Manifest

**Workflow session:** `spec-multi-language`  
**Feature status:** Execute active; TASK-001 is scoped to macOS arm64  
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
| macOS arm64 scope challenge | PASS after revision | Removed container/runtime-image gates, enforced the Bun candidate ladder, added explicit AC traceability, and added a baseline non-touch sensor for excluded platform files. |
| Phase-worker permission | PASS | User explicitly allowed sub-agents when useful, including final verification. One sequential worker per Execute phase is selected. |

## TASK-001 Preflight

| Check | Current evidence | Status |
| --- | --- | --- |
| Canonical extensions | 33 entries, 33 unique in `DEFAULT_ALLOWED_EXTENSIONS` | PASS |
| Current structural breadth | 8 symbol extensions, 7 import extensions, 4 typed-edge extensions | BASELINE |
| Package runtime pin | root declares Bun `1.2.0` | DRIFT |
| Local runtime | Bun `1.3.11`, Darwin arm64 | MEASURED |
| macOS native CI runtime | Bun currently floats until TASK-024 pins the proven release | DRIFT |
| Native grammar dependencies | none in current lockfile | UNPROVEN |
| Candidate provenance | npm registry candidates captured in `capability-matrix.md`; Erlang requires an exact pinned Git commit | UNPROVEN |

TASK-001 measures only macOS arm64 after the user's explicit scope override. It must run every grammar on that target. The source plan still forbids a WASM/runtime-download fallback.

## TASK-001 Execution Result (2026-07-13)

**Result:** REOPENED. Initial target discovery established a usable macOS arm64 sensor. The user then narrowed supported native scope to this target, so clean grammar install, load, parse, linkage, and incompatible-ABI negative sensors are now the active gate.

| Command | Exit | Evidence |
| --- | ---: | --- |
| `rtk uname -s` | 0 | `Darwin` |
| `rtk uname -m` | 0 | `arm64` |
| `rtk sw_vers` | 0 | macOS `26.5.2`, build `25F84` |
| `rtk bun --version` | 0 | `1.3.11` |
| `rtk which bun` | 0 | `/Users/luizmassa/.bun/bin/bun` |
| `rtk file /Users/luizmassa/.bun/bin/bun` | 0 | `Mach-O 64-bit executable arm64` |

**Scope authority:** user instruction on 2026-07-13 makes macOS arm64 the only implementation target. Other platforms, container-native packaging, and other architectures are not gates and SHALL not be modified by this feature.

## Planned Gate Commands

- `bun run verify:tree-sitter-native`
- `bun run --filter @massa-th0th/core test:unit`
- `bun run type-check`
- `bun run build`
- Owned PostgreSQL focused generation/migration tests with `--max-concurrency 1`
- Owned sequential `02.indexing`, `09.symbol-graph`, and `15.nfr` E2E suites
- Baseline non-touch sensor rejecting feature changes to `Dockerfile`, compose/container packaging, pre-existing workflow files, or non-arm64 native paths
- `bun run bench:parser -- --baseline 5d43a96f4c0f1dfbd04ee7ae95f589f9b023bf03`
- Independent spec-anchored verification and discrimination sensors

## Historical Artifact Freeze v2 (Superseded)

Committed at `c497a41838b002fde99d57a2ba6fcc81f0b06f10`. Superseded by the user's macOS arm64-only scope override; retained as historical evidence only.

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

## Active Artifact Freeze v3 (macOS arm64 Scope)

| Artifact | SHA-256 |
| --- | --- |
| `plan-multi-language.md` | `528e01ba925c314e6f0296b2f25bc5abaa9f4a09c85eb73dd795127836b2a2f2` |
| `spec.md` | `8914a74a433e1df9878a606a9cdf647fe463a6c87ac0e33106c9d6a7c85a9aa9` |
| `context.md` | `af3339803245375d6a69890cfe49e60902a21d71ba969580f555b20fc460a7a9` |
| `design.md` | `45285b90059deeb3e7b9e720b26376048a77a28602086df6fd3e9f42a53e0ea3` |
| `tasks.md` | `81071e4f53101c58a0011355995016691e66af17ddd3facc3584f193e1b82f3f` |
| `capability-matrix.md` | `61f113d7f2cf5b783d769281d011227b0f31aaeeb6a7df53483119e0758751b6` |
| `.specs/project/FEATURES.json` | `851c7662bebb18fe138d1324d6f29d8a945b03e737b016f761359e20d8f5eced` |
| `.specs/project/STATE.md` | `ef803e536bfdc7e3ddeeb6dcc4192bdeb356446960bb8700ebb5b919b26a42ac` |
| `.specs/HANDOFF.md` | `dc159a1af7972984d5cce544563df8a32bec96378fd49eb8233e7aeb2664464d` |

`gate-manifest.md` cannot embed its own stable file checksum; record its Git blob ID at each committed freeze.
