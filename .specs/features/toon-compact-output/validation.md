# M36 TOON Compact Output — Independent Validation

- **Verifier:** independent (author ≠ verifier)
- **Branch:** `wave-2`
- **Commit range:** `33fea92..1d30061` (4 commits: `33fea92`, `23035ac`, `05d518b`, `1d30061`)
- **Diff:** 16 files changed, +846 / −65
- **Date:** 2026-07-18

## Verdict: **PASS**

All acceptance criteria have spec-anchored evidence. All four discrimination-sensor
mutations killed by existing tests. Defaults preserved exactly. Two-layer MCP parity
holds for the M36 scope. The only red signal — 5 `trace-path.test.ts` failures — is a
pre-existing PG-state/ETL-locking issue (confirmed out of M36's scope: TASK-03 touched
`trace_path.ts` for format/fields wrapping only; `trace-path.test.ts` has a 0-line diff
across M36). Nothing blocks merging wave-2's M36.

---

## 1. Per-AC Evidence Table

Spec AC → implementation site → test asserting the SPEC-DEFINED outcome.

### P1 — Shared serializer + behavior-preserving migration

| AC | Implementation | Test evidence | Outcome |
| --- | --- | --- | --- |
| P1.1 success path routes through `serializeToolResponse` | 12 tools, success returns only (e.g. trace_path.ts:141, impact_analysis.ts:122,137; read_file.ts:287; all 8 others) | `serialize.test.ts:305` "always returns success:true on the success path" (matrix over format×fields) | COVERED |
| P1.2 `format="json"` → raw object, byte-identical | serialize.ts:37-40 (only `"toon"` branch encodes; json/undefined → identity) | `serialize.test.ts:231` "format unset → json (raw object)", `:237` "format json → raw object" (`.toBe(sample)` reference identity) | COVERED |
| P1.3 `format="toon"` → TOON string | serialize.ts:39 | `serialize.test.ts:253` "format toon → TOON-encoded string of full data" asserts `typeof data==="string"` and `=== toTOON(sample)` | COVERED |
| P1.4 `fields` unset → no projection | serialize.ts:36, projectFields:53 | `serialize.test.ts:231` (`.toBe(sample)` identity, not just equal) + `:70` "absent fields → full data" | COVERED |

### P2 — `format` on the 3 missing tools

| AC | Implementation | Test evidence | Outcome |
| --- | --- | --- | --- |
| P2.1 the 3 tools with `format="toon"` → string | trace_path.ts:107,141; impact_analysis.ts:97,122,137; get_optimized_context.ts:107,126 | `serialize.test.ts:253,260,294` (toon-branch matrix); `impact-analysis-diff.test.ts` (3/3 pass) exercises impact tool path | COVERED (helper-level; trace_path/impact integration see §6) |
| P2.2 default → raw object | default `="json"` in all 3 (`{ format = "json" }`) | `serialize.test.ts:231,237` json identity | COVERED |
| P2.3 MCP `inputSchema` advertises `format` default json | tool-definitions.ts:550,805,868 (optimized_context, trace_path, impact_analysis) | `tool-definitions-fields-flow.test.ts:41` schema-parity test | COVERED |

### P3 — `fields` projection on all 12 tools

| AC | Implementation | Test evidence | Outcome |
| --- | --- | --- | --- |
| P3.1 `fields=["a","b"]` → only a,b (both modes) | serialize.ts:61-67 shallow pick | `serialize.test.ts:84` "shallow pick keeps only requested keys", `:243` "format json + fields → projected object", `:260` "format toon + fields" | COVERED |
| P3.2 `fields=["nodes.symbol"]` dotted → per-element only `{symbol}` | serialize.ts:90-109 projectPath (leaf wraps under head, arrays element-wise) | `serialize.test.ts:111` "dotted path into array projects element-wise", `:183` F3 real-trace-shape test asserts each node `toEqual({symbol:...})` | COVERED |
| P3.3 `fields=[]`/absent → full | serialize.ts:53 | `serialize.test.ts:70` absent, `:74` empty (`.toBe(sample)` identity), `:271` toon+empty | COVERED |
| P3.4 unknown key → silently absent (no error) | serialize.ts:63 (`continue`), :98 | `serialize.test.ts:94` "unknown top-level key silently dropped", `:145` non-object midpoint, `:155` missing midpoint | COVERED |
| P3.5 MCP advertises `fields` array-of-string on all 12 | tool-definitions.ts (12 × `fields:` block) | `tool-definitions-fields-flow.test.ts:41` iterates all 12 names, asserts `props.fields.type==="array"` | COVERED |

### Edge cases

| Edge case | Test evidence | Outcome |
| --- | --- | --- |
| Array data → element-wise projection | `serialize.test.ts:133` top-level array, `:111` nested array via dotted | COVERED |
| Scalar data → unchanged | `serialize.test.ts:78` (42/"hello"/null), `:300` scalar+fields | COVERED |
| Non-object midpoint → dropped | `serialize.test.ts:145` (nodeCount.deep), `:155` (truncated.nope) | COVERED |
| `format="toon"` + projected `{}` → valid empty TOON | `serialize.test.ts:277` asserts `typeof string` and `=== toTOON({})` | COVERED |
| Error path → `{success:false,error}` regardless of format/fields | trace_path.ts:110,113,131,167; impact_analysis.ts:99,103,164 — all bypass serializer; `trace-path.test.ts:118` "not-found hint" asserts `success===false && data.hint defined` | COVERED (boundary + not-found test passes) |
| Dotted field with no dot → top-level key | `serialize.test.ts:84` shallow pick treats undotted fields as top-level | COVERED |

---

## 2. Discrimination Sensor

Five behavior-level faults injected into `serialize.ts` scratch copies, reverted after each.
`serialize.test.ts` re-run for each. Kill = at least one spec-relevant test fails.

| # | Mutation | Result | Catching test(s) |
| --- | --- | --- | --- |
| a | flip `format === "toon"` → `!==` | **KILLED** (10/25 fail) | `format "json" → raw object`, `format "toon" → ...`, `scalar data: toon`, `array data: json + fields`, `format unset` |
| b | `projectFields` no-op `return data` | **KILLED** (13/25 fail) | all projection cases incl. F3 trace-shape, shallow pick, dotted element-wise, array top-level, unknown drop |
| c | unknown-key `throw` instead of `continue` | **KILLED** (2 fail) | `unknown top-level key silently dropped`, `format toon + unknown fields` |
| d | disable `mergeProjection` (last-write-wins) | **KILLED** (2 fail) | `multiple dotted fields compose`, `F3 impact_analysis-shaped projection (impacted.symbol + impacted.risk merge)` — the exact spec.md L80 independent-test case |
| e | (static + dynamic) error path routed through serializer | **NOT APPLICABLE / CONFIRMED-NO-FAULT** | static: trace_path/impact_analysis error returns (L110,113,131,167 / L99,103,164) contain zero `serializeToolResponse` calls. Dynamic: `trace-path.test.ts:118` not-found test passes; `data.hint` survives as a plain string, not a TOON blob. |

**Kill rate: 4/4 behavior mutations killed.** Sensor (e) is a boundary-absence check
(verified by grep: error branches have zero serializer calls) plus a live not-found test.

Note on (d): the worker flagged `mergeProjection` as a judgment call beyond the design
pseudocode. The judgment matches AC P3 intent: spec.md L74 (P3.1) requires `fields=["a","b"]`
to yield both keys, and L80 (independent test) explicitly uses multi-field projection on
`impact_analysis`. Last-write-wins would drop `symbol` from each impacted element, violating
P3.1. The merge is correctly required.

---

## 3. Per-Tool Defaults (resolved-format literal)

Verified the literal each tool passes into `serializeToolResponse({format,...})`:

| Tool | Default | Contract expected | Match |
| --- | --- | --- | --- |
| read_file | `"json"` (`p.format \|\| "json"`) | json | ✓ |
| list_checkpoints | `"toon"` | toon | ✓ |
| store_memory | `"toon"` | toon | ✓ |
| search_memories | `"toon"` | toon | ✓ |
| update_memory | `"toon"` | toon | ✓ |
| create_checkpoint | `"toon"` | toon | ✓ |
| search_project | `"toon"` (`p.format \|\| "toon"`) | toon | ✓ |
| restore_checkpoint | `"toon"` | toon | ✓ |
| delete_memory | `"toon"` | toon | ✓ |
| get_optimized_context | `"json"` | json (new) | ✓ |
| trace_path | `"json"` | json (new) | ✓ |
| impact_analysis | `"json"` | json (new) | ✓ |

All 12 defaults preserved. The helper (`serialize.ts:39`) only branches on literal
`"toon"`; defaults are resolved by each caller and passed in — matches design.md §3 and
plan-critic F5 (no helper-side default picking).

---

## 4. Two-Layer MCP Parity

For each of the 12 tools, `fields` is present in BOTH class `inputSchema` AND
`apps/mcp-client/src/tool-definitions.ts` — asserted by
`tool-definitions-fields-flow.test.ts:41` (all 12 names, `props.fields.type==="array"`).
`fields`-flow-through-dispatch also tested: POST impact_analysis (`:57`) and GET trace_path
(`:90`) confirm `fields` survives the proxy verbatim (not stripped/renamed) and absent-fields
isn't injected (`:120`).

`format` parity: added to all 3 new tools in both layers. The 9 existing tools already had
`format` in both layers pre-M36 (verified).

### search/format follow-up classification

**Pre-existing, out of scope.** The MCP `search` definition advertises `fields` (added
by M36) but lacks the `format` (json|toon) param — the class `search_project.ts` has had
`format` for a long time. Verified pre-existing: `git show 33fea92^:apps/mcp-client/src/tool-definitions.ts`
shows 0 occurrences of a `format:` block in the `search` def before M36 (only `responseMode`
with default `"summary"`). Spec L17 (Out of Scope) covers schema-layer de-duplication; AC P2.3
only requires `format` parity for the 3 newly-enabled tools. Not an M36 gap.

---

## 5. Gate Results

| Gate | Command | Result |
| --- | --- | --- |
| Serializer unit suite | `bun test src/__tests__/serialize.test.ts` | **25/25 pass** (78 expects) |
| Fields-flow + MCP parity | `bun test src/tool-definitions-fields-flow.test.ts` (mcp-client) | **4/4 pass** (42 expects) |
| read-file tests | `bun test src/__tests__/read-file.test.ts` | **7/7 pass** |
| impact-analysis-diff | `bun test src/__tests__/impact-analysis-diff.test.ts` | **3/3 pass** |
| checkpoints e2e | `bun test src/__tests__/e2e/06.checkpoints.test.ts` | **11/11 pass** |
| Repo type-check | `bun run type-check` (turbo) | **6/6 successful** (cached, green) |
| trace-path integration | `bun test src/__tests__/trace-path.test.ts` | **11/16 pass / 5 fail** — see §6 |

---

## 6. Env-Blocked / Pre-Existing Failures (honest)

`trace-path.test.ts`: 11/16 pass, 5 fail with PG UP. Worker claimed 13/16 env-blocked;
actual is 11/16 with PG available. The 5 failures are:

1. `outbound traversal follows alpha → beta → gamma`
2. `both direction returns outbound and inbound nodes`
3. `depth cap limits traversal depth`
4. `depth is hard-capped at MAX_DEPTH (6)`
5. `cycle guard prevents infinite loops`

Failure mode: `active_graph_generation_missing` and `graph_generation_workspace_missing`
errors during test-fixture ETL setup — graph-generation workspace/active-generation locking
inside `symbol-repository-pg.ts:535` and `graph-generation-repository-pg.ts:113`. These are
infra-level ETL/state errors, not format/fields/serialization.

**Not an M36 regression.** Evidence:
- `git diff 33fea92^..1d30061 -- packages/core/src/__tests__/trace-path.test.ts` → 0 lines
  (M36 never touched the test file; 16 tests both sides).
- TASK-03 (commit `05d518b`) changed `trace_path.ts` only by adding the `format` param to the
  interface/schema and wrapping the success-path return in `serializeToolResponse` — zero
  change to traversal/depth/mode/cycle-guard logic, error/not-found branches untouched.
- The 3 error/not-found tests (lines 104, 111, 118) all pass — proving the serializer boundary
  is sound; only the ETL-dependent traversal tests fail.
- The failing path requires successful graph indexing of the fixture project; PG-state residue
  between test runs (`p4d2-trace-path` project) prevents generation activation. This is a test
  isolation / PG-fixture-state issue outside M36's scope.

Classification: **env/fixture-state, not M36 regression.** Recommendation: track as a separate
test-isolation task (not a wave-2 M36 blocker).

---

## 7. Ranked Gap List

1. **(NONE for M36)** — no spec gaps, no regression gaps, no discrimination-sensor survivors.
2. *(Out-of-scope, pre-existing)* `search` MCP def missing `format` (json|toon) — present before
   M36, explicitly excluded by spec L17 "Out of Scope" (schema-layer de-duplication is M32).
   No fix task for M36.
3. *(Out-of-scope, pre-existing)* `trace-path.test.ts` 5 ETL-state failures — test-isolation /
   PG-fixture issue, unrelated to M36. Separate task if prioritized.

---

## 8. Files Changed (33fea92..1d30061, 16 files, +846/−65)

- `packages/core/src/tools/serialize.ts` (NEW, 140 lines)
- `packages/core/src/__tests__/serialize.test.ts` (NEW, 314 lines, 25 tests)
- `apps/mcp-client/src/tool-definitions-fields-flow.test.ts` (NEW, 138 lines, 4 tests)
- 12 tool files in `packages/core/src/tools/` (format+fields threading, behavior-preserving)
- `apps/mcp-client/src/tool-definitions.ts` (+90: 12 × fields, 3 × format)

## Conclusion

M36 meets its spec contract end-to-end. Behavior-preserving for the 9 existing tools, additive
for the 3 new tools, all 12 advertise `fields` in both schema layers, error paths correctly
excluded from the serializer, all four discrimination mutations killed. M36 is mergeable in
wave-2.
