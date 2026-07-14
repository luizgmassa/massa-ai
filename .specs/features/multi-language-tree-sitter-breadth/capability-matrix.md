# Multi-Language Tree-sitter Capability and Native Feasibility Matrix

**Status:** TASK-001 active for macOS arm64; grammar feasibility unproven  
**Canonical source:** `packages/shared/src/config/index.ts` (`DEFAULT_ALLOWED_EXTENSIONS`)  
**Legend:** `R` required and tested; `F` forbidden false positive; `U` unsupported/no output; `E` embedded-child capability.

## Capability Contract

| Extension | Language/dialect | Tier | Symbols/docs | Imports/modules | Type/extend/implement | Calls | Data flow | HTTP | Emit/listen | Embedded | Grammar artifact candidate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `.ts` | TypeScript | Flow | R | R | R | R | R | R | R | U | `tree-sitter-typescript@0.23.2` (`typescript`) |
| `.js` | JavaScript | Flow | R | R | R | R | R | R | R | U | `tree-sitter-javascript@0.25.0` |
| `.tsx` | TSX | Flow | R | R | R | R | R | R | R | U | `tree-sitter-typescript@0.23.2` (`tsx`) |
| `.jsx` | JSX | Flow | R | R | R | R | R | R | R | U | `tree-sitter-javascript@0.25.0` |
| `.vue` | Vue SFC; script dialect from `lang`, default JS | Flow | R | R | R | R | R | R | R | E | `tree-sitter-vue@0.2.1` plus TS/JS child grammar; feasibility risk |
| `.dart` | Dart | Flow | R | R | R | R | R | R | R | U | `tree-sitter-dart@1.0.0`; feasibility risk |
| `.py` | Python | Flow | R | R | R | R | R | R | R | U | `tree-sitter-python@0.25.0` |
| `.php` | PHP | Flow | R | R | R | R | R | R | R | U | `tree-sitter-php@0.24.2` |
| `.java` | Java | Flow | R | R | R | R | R | R | R | U | `tree-sitter-java@0.23.5` |
| `.go` | Go | Flow | R | R | R | R | R | R | R | U | `tree-sitter-go@0.25.0` |
| `.rs` | Rust | Flow | R | R | R | R | R | R | R | U | `tree-sitter-rust@0.24.0` |
| `.cpp` | C++ | Flow | R | R | R | R | R | R | R | U | `tree-sitter-cpp@0.23.4` |
| `.c` | C | Flow | R | R | R | R | R | R | R | U | `tree-sitter-c@0.24.1` |
| `.h` | C by default; C++ when importer/build evidence proves it | Flow | R | R | R | R | R | R | R | U | `tree-sitter-c@0.24.1` or `tree-sitter-cpp@0.23.4` |
| `.md` | Markdown/CommonMark+GFM | Structure | R headings | U | U | U | U | U | U | E fenced languages | `@tree-sitter-grammars/tree-sitter-markdown@0.3.2` |
| `.json` | JSON | Structure | R qualified keys | U | U | U | U | U | U | U | `tree-sitter-json@0.24.8` |
| `.yaml` | YAML | Structure | R qualified keys | U | U | U | U | U | U | U | `@tree-sitter-grammars/tree-sitter-yaml@0.7.1` |
| `.yml` | YAML | Structure | R qualified keys | U | U | U | U | U | U | U | `@tree-sitter-grammars/tree-sitter-yaml@0.7.1` |
| `.hpp` | C++ header | Flow | R | R | R | R | R | R | R | U | `tree-sitter-cpp@0.23.4` |
| `.cs` | C# | Flow | R | R | R | R | R | R | R | U | `tree-sitter-c-sharp@0.23.5` |
| `.rb` | Ruby | Flow | R | R | R | R | R | R | R | U | `tree-sitter-ruby@0.23.1` |
| `.swift` | Swift | Flow | R | R | R | R | R | R | R | U | `tree-sitter-swift@0.7.1` |
| `.kt` | Kotlin | Flow | R | R | R | R | R | R | R | U | `@tree-sitter-grammars/tree-sitter-kotlin@1.1.0` |
| `.kts` | Kotlin Script | Flow | R | R | R | R | R | R | R | U | `@tree-sitter-grammars/tree-sitter-kotlin@1.1.0` |
| `.scala` | Scala | Flow | R | R | R | R | R | R | R | U | `tree-sitter-scala@0.24.0` |
| `.lua` | Lua/LuaJIT | Flow | R | R | R | R | R | R | R | U | `@tree-sitter-grammars/tree-sitter-lua@0.4.1` |
| `.zig` | Zig | Flow | R | R | R | R | R | R | R | U | `@tree-sitter-grammars/tree-sitter-zig@1.1.2` |
| `.ex` | Elixir | Flow | R | R | R | R | R | R | R | U | `tree-sitter-elixir@0.3.5` |
| `.exs` | Elixir Script | Flow | R | R | R | R | R | R | R | U | `tree-sitter-elixir@0.3.5` |
| `.erl` | Erlang | Flow | R | R | R | R | R | R | R | U | pinned Git artifact from `WhatsApp/tree-sitter-erlang`; exact commit required by feasibility gate |
| `.clj` | Clojure | Flow | R | R | R | R | R | R | R | U | `tree-sitter-clojure@0.4.0`; feasibility risk |
| `.ml` | OCaml implementation | Flow | R | R | R | R | R | R | R | U | `tree-sitter-ocaml@0.24.2` (`ocaml`) |
| `.hs` | Haskell | Flow | R | R | R | R | R | R | R | U | `tree-sitter-haskell@0.23.1` |

**Manifest check:** 33 rows, 33 unique extensions, no extra structural extension. This is a planned contract; Execute must compare it mechanically with the source constant.

## Required Symbol Kinds

Every programming-language query pack maps applicable declarations into the additive normalized set:

`module`, `namespace`, `class`, `interface`, `trait`, `enum`, `function`, `method`, `constructor`, `property`, `field`, `variable`, `constant`, `type`, `type_parameter`, `export`, `heading`, `key`.

Applicability is grammar-defined. A pack must not synthesize an inapplicable kind merely to fill the taxonomy. Markdown requires `heading`; JSON/YAML require `key`.

## Edge Rules

- `call`: invocation nodes only; declarations and specialized-edge duplicates are excluded.
- `data_flow`: bare identifier arguments with zero-based parameter position.
- `type_ref`, `extend`, `implement`, `import`: corresponding syntax constructs only.
- `http_call`: URL-literal calls or the current normalized HTTP-client vocabulary.
- `emit`: terminal call name `emit`.
- `listen`: terminal call name `on`, `once`, `addListener`, `addEventListener`, `off`, or `removeListener`.
- Unsupported capabilities produce no placeholder/unresolved edge. Required but unresolved targets retain a stable unresolved payload.

## Correctness Floors

For every `R` capability:

- Golden fixture recall: 100% of explicitly listed expected declarations/edges.
- Forbidden false positives: zero for every fixture's declared negatives.
- Duplicate normalized nodes: zero after `(kind, qualifiedName, host span, target)` suppression.
- Transport-visible names, kinds, spans, targets, and ambiguity candidates must match exact expected values.

Broad-language benchmark measurements are informative; TS/JS performance thresholds remain gating.

## Native Feasibility Evidence Required

Each unique grammar artifact receives one row during TASK-001:

| Artifact | Version/commit | Source repository | License | Lifecycle scripts | Tree-sitter peer/ABI | macOS arm64 clean install | Minimal module load/parse | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _Populated by measured macOS arm64 feasibility_ | | | | | | NOT RUN | NOT RUN | ACTIVE |

Evidence includes clean frozen install, integrity/commit, Mach-O arm64 linkage, minimal parse, and a missing/incompatible negative sensor. `tree-sitter-vue`, `tree-sitter-dart`, `tree-sitter-clojure`, and the pinned Erlang Git artifact are called out as current high-risk candidates because their npm/native publication path is old or absent.

### TASK-001 Target Discovery (2026-07-13)

| Required execution target | Sensor result | Grammar install/load/parse | Status |
| --- | --- | --- | --- |
| Bun on macOS arm64 | `uname -s` -> `Darwin`; `uname -m` -> `arm64`; `sw_vers` -> macOS `26.5.2` (`25F84`); `bun --version` -> `1.3.11`; Bun binary -> Mach-O arm64 | Pending clean artifact loop | AVAILABLE SENSOR; ACTIVE |

The user explicitly limited native implementation and verification to macOS arm64. The local Bun path is `/Users/luizmassa/.bun/bin/bun`; `file` identified it as `Mach-O 64-bit executable arm64`. TASK-001 now proceeds on this target only.

## Out-of-Manifest Extensions

An extension allowed by `security.allowedExtensions` but absent above remains eligible for semantic chunking/search. Structural status is `unsupported_structural_language`; symbols/imports/references are empty by contract; parser readiness remains healthy; regex extraction is forbidden.

## Artifact Store Evidence

- Active key: `.specs/features/multi-language-tree-sitter-breadth/capability-matrix.md`
- Version: 3 (macOS arm64-only scope override)
- Checksum: recorded in `gate-manifest.md` after artifact freeze.
