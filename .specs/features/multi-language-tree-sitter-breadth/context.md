# Multi-Language Tree-sitter Breadth Context

**Gathered:** 2026-07-13  
**Spec:** `.specs/features/multi-language-tree-sitter-breadth/spec.md`  
**Status:** Approved context; ready for Design

## Feature Boundary

Replace regex structural extraction for the 33 canonical default extensions with pinned native Tree-sitter grammars, repository-owned query/resolver packs, safe graph generations, diagnostics, compatibility contracts, and deterministic native/correctness/performance validation. Semantic chunking, embeddings, ranking, and search behavior do not change.

## Implementation Decisions

### Native packaging and readiness

- Exact Bun/runtime/platform combinations are evidence, not assumptions.
- Required grammars are present before indexing starts; runtime downloads are forbidden.
- `/health` remains liveness. Parser readiness is separately observable and gates indexing.
- Only native packages with lifecycle scripts enter `trustedDependencies`; Docker builders own compilers, runtime images do not.

### Structural generations

- A generation attempt ID is distinct from the reusable structural fingerprint.
- Files, definitions, references, imports, centrality, diagnostics, and full counts activate together.
- A PostgreSQL-backed per-project lease, immutable input snapshot, and CAS protect multi-process ordering.
- Activation and terminal job state are synchronous. EventBus notifications report the transition but do not own it.
- Old-generation visibility covers graph data only. Semantic vector/keyword lifecycle remains unchanged.
- Required-file hard failure blocks activation; incremental hard failure retains last-known-good rows and exposes stale diagnostics.

### Public identity and spans

- One versioned FQN codec serves persistence, Resolve, definition, reference, trace, HTTP, and MCP paths.
- Legacy `file#name` resolves only when unique; ambiguity returns stable candidates.
- `SourceSpan` is UTF-8 byte based, row/column zero based, end exclusive, and remappable through embedded hosts.

### Capability breadth

- Named Structure, Dependencies, and Flow tiers drive implementation and tests; packs do not invent unsupported edges.
- Resolution is syntax/build-metadata based. Compiler/LSP semantics remain excluded.
- `.h` defaults to C until importer/build evidence selects C++.
- Vue and Markdown embed to two levels. Unknown fences remain plain chunks.
- Custom configured extensions absent from the default manifest remain semantic-only with an explicit unsupported diagnostic.

### Agent's Discretion

- Exact module splits inside `packages/core/src/services/structural/`, provided ownership remains precise and testable.
- Exact PostgreSQL lease primitive and identifier hash implementation, provided migration/CAS/collision sensors prove the spec.
- Exact query syntax representation (`.scm` assets or typed strings), provided source and published `dist` builds package the same bytes.

## Rejected Alternatives

| Alternative | Why rejected |
| --- | --- |
| Keep regex fallback for unsupported languages | Hides structural failure and violates the native replacement goal. |
| WebAssembly grammars | Not the requested native runtime and changes the performance/packaging premise. |
| Runtime-downloaded language packs | Violates offline/frozen readiness and runtime-download exclusion. |
| Clear-and-rebuild graph in place | Current behavior loses usable graph data on failure and cannot provide old-generation visibility. |
| Process-local project queue only | Does not serialize multiple API processes. |
| Flat FQNs plus first-definition wins | Drops overload/nesting identity and hides ambiguity. |
| Persist raw CSTs | Explicitly out of scope and unnecessary for normalized graph contracts. |

## Gray-Area Closure

| Question | Affected requirements | Resolution | Basis |
| --- | --- | --- | --- |
| Does one missing grammar kill the service? | MLTS-002,003 | It blocks parser/indexing readiness; liveness and unrelated APIs remain available. | Conservative availability default. |
| What happens to custom extensions? | MLTS-019 | Semantic-only; explicit unsupported structural diagnostic; no regex fallback. | Current runtime configurability plus bounded feature scope. |
| Does generation visibility include embeddings? | MLTS-011-014 | No; graph only. Semantic/vector/keyword lifecycle is unchanged. | Explicit source-plan boundary. |
| Can recoverable syntax activate? | MLTS-012,017 | Yes, with valid structure and recovered diagnostics. Hard parser/query/ABI/persistence failures cannot. | Tree-sitter recovery goal plus failure-safety contract. |
| Which capabilities must every language implement? | MLTS-008,015 | Only manifest-tier capabilities; unsupported features emit no placeholders and have negative tests. | Revised Plan Challenge contract. |

## Specific References

- Canonical extensions: `packages/shared/src/config/index.ts`.
- Current parser boundary: `packages/core/src/services/etl/stages/parse.ts`.
- Current resolver/FQN boundary: `packages/core/src/services/etl/stages/resolve.ts`.
- Current graph schema: `packages/core/prisma/schema.prisma`.
- Current per-file transaction: `packages/core/src/data/symbol/symbol-repository-pg.ts`.
- Current liveness route: `apps/tools-api/src/index.ts`.
- Supplied and challenged plan: `plan-multi-language.md`.

## Deferred Ideas

- Compiler/LSP type resolution.
- Structural parsing for arbitrary user-configured extensions.
- Persisted raw CST/navigation snapshots.
- Semantic chunking or search-quality changes.

## Artifact Store Evidence

- Active key: `.specs/features/multi-language-tree-sitter-breadth/context.md`
- Version: 1
- Checksum: recorded in `gate-manifest.md` after artifact freeze.

