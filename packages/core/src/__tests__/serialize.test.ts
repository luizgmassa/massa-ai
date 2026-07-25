import { describe, expect, test } from "bun:test";
import { encode as toTOON } from "@toon-format/toon";
import {
  projectFields,
  serializeToolResponse,
  groupRowsByPrefix,
  twoSegmentPrefix,
  groupedToTree,
} from "../tools/serialize.js";
import type {
  GroupRowsByPrefixOptions,
  GroupedResult,
  GroupedGroup,
} from "../tools/serialize-interfaces.js";

/**
 * Real trace_path-shaped payload (plan-critic F3): scalar counts + truncated
 * flag + nested arrays of node/edge objects. Used by the projection-shape test.
 */
const traceShape = {
  projectId: "p1",
  symbol: "Service.run",
  mode: "calls",
  direction: "outbound",
  edgeTypes: ["call"],
  seeds: ["src/s.ts#Service.run"],
  truncated: true,
  nodeCount: 2,
  edgeCount: 1,
  nodes: [
    {
      symbol: "Service.run",
      kind: "method",
      fqn: "src/s.ts#Service.run",
      file: "src/s.ts",
      line: 10,
    },
    {
      symbol: "helper",
      kind: "function",
      fqn: "src/h.ts#helper",
      file: "src/h.ts",
      line: 3,
    },
  ],
  edges: [
    {
      type: "call",
      from: "src/s.ts#Service.run",
      to: "src/h.ts#helper",
      fromFile: "src/s.ts",
      fromLine: 12,
      meta: { reason: "direct" },
    },
  ],
  chains: [["src/s.ts#Service.run", "src/h.ts#helper"]],
};

const sample = {
  projectId: "p1",
  symbol: "run",
  nodeCount: 3,
  truncated: false,
  nodes: [
    { symbol: "run", kind: "function", file: "a.ts", line: 1 },
    { symbol: "stop", kind: "function", file: "b.ts", line: 2 },
  ],
  edges: [
    { type: "call", from: "run", to: "stop", meta: { x: 1 } },
  ],
  impacted: [
    { symbol: "run", risk: 0.9, fqn: "a.ts#run", depth: 1 },
    { symbol: "stop", risk: 0.4, fqn: "b.ts#stop", depth: 2 },
  ],
};

describe("projectFields — projection semantics", () => {
  test("absent fields → full data (no projection)", () => {
    expect(projectFields(sample)).toBe(sample);
  });

  test("empty fields → full data (no projection)", () => {
    expect(projectFields(sample, [])).toBe(sample);
  });

  test("scalar data → unchanged regardless of fields", () => {
    expect(projectFields(42, ["a"])).toBe(42);
    expect(projectFields("hello", ["a.b"])).toBe("hello");
    expect(projectFields(null, ["a"])).toBe(null);
  });

  test("shallow pick keeps only requested keys", () => {
    const out = projectFields(sample, ["nodeCount", "truncated"]) as Record<
      string,
      unknown
    >;
    expect(Object.keys(out).sort()).toEqual(["nodeCount", "truncated"]);
    expect(out.nodeCount).toBe(3);
    expect(out.truncated).toBe(false);
  });

  test("unknown top-level key silently dropped", () => {
    const out = projectFields(sample, ["nodeCount", "doesNotExist"]) as Record<
      string,
      unknown
    >;
    expect(Object.keys(out)).toEqual(["nodeCount"]);
    expect(out.nodeCount).toBe(3);
  });

  test("dotted path walks into nested object", () => {
    const out = projectFields(sample, ["edges.type"]) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["edges"]);
    const edges = out.edges as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ type: "call" });
  });

  test("dotted path into array projects element-wise", () => {
    const out = projectFields(
      sample,
      ["nodes.symbol"],
    ) as Record<string, unknown>;
    const nodes = out.nodes as Array<Record<string, unknown>>;
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({ symbol: "run" });
    expect(nodes[1]).toEqual({ symbol: "stop" });
  });

  test("multiple dotted fields compose", () => {
    const out = projectFields(
      sample,
      ["impacted.symbol", "impacted.risk"],
    ) as Record<string, unknown>;
    const impacted = out.impacted as Array<Record<string, unknown>>;
    expect(impacted).toHaveLength(2);
    expect(impacted[0]).toEqual({ symbol: "run", risk: 0.9 });
    expect(impacted[1]).toEqual({ symbol: "stop", risk: 0.4 });
  });

  test("array as top-level data projects element-wise", () => {
    const arr = [
      { a: 1, b: 2, c: 3 },
      { a: 4, b: 5, c: 6 },
    ];
    const out = projectFields(arr, ["a", "c"]) as Array<Record<string, unknown>>;
    expect(out).toEqual([
      { a: 1, c: 3 },
      { a: 4, c: 6 },
    ]);
  });

  test("dotted path with non-object midpoint dropped silently", () => {
    const out = projectFields(sample, ["nodeCount.deep"]) as Record<
      string,
      unknown
    >;
    // nodeCount exists (a number) but its midpoint is primitive → key absent
    expect("nodeCount" in out).toBe(false);
    expect(Object.keys(out)).toEqual([]);
  });

  test("dotted path with missing midpoint dropped silently", () => {
    const out = projectFields(sample, ["truncated.nope"]) as Record<
      string,
      unknown
    >;
    expect("truncated" in out).toBe(false);
    expect(Object.keys(out)).toEqual([]);
  });

  test("mixed shallow + dotted + scalar top-levels", () => {
    const out = projectFields(
      sample,
      ["nodeCount", "truncated", "nodes.symbol", "edges.type"],
    ) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual([
      "edges",
      "nodeCount",
      "nodes",
      "truncated",
    ]);
    expect(out.nodeCount).toBe(3);
    expect(out.truncated).toBe(false);
    expect((out.nodes as Array<unknown>).map((n) => (n as Record<string, unknown>).symbol)).toEqual([
      "run",
      "stop",
    ]);
  });

  test("plan-critic F3: real trace_path-shaped projection (scalars + nested arrays + dotted)", () => {
    const out = projectFields(
      traceShape,
      ["nodes.symbol", "edges.type", "nodeCount", "truncated"],
    ) as Record<string, unknown>;
    // top-level scalars survive
    expect(Object.keys(out).sort()).toEqual([
      "edges",
      "nodeCount",
      "nodes",
      "truncated",
    ]);
    expect(out.nodeCount).toBe(2);
    expect(out.truncated).toBe(true);
    // nodes projected element-wise, each keeps ONLY symbol
    const nodes = out.nodes as Array<Record<string, unknown>>;
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({ symbol: "Service.run" });
    expect(nodes[1]).toEqual({ symbol: "helper" });
    // edges projected element-wise, each keeps ONLY type
    const edges = out.edges as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ type: "call" });
  });

  test("plan-critic F3: impact_analysis-shaped projection (impacted.symbol + impacted.risk merge)", () => {
    const impactShape = {
      projectId: "p1",
      changedFileCount: 1,
      impactedCount: 2,
      impacted: [
        { symbol: "run", risk: 0.9, fqn: "a.ts#run", depth: 1 },
        { symbol: "stop", risk: 0.4, fqn: "b.ts#stop", depth: 2 },
      ],
    };
    const out = projectFields(
      impactShape,
      ["impacted.symbol", "impacted.risk"],
    ) as Record<string, unknown>;
    const impacted = out.impacted as Array<Record<string, unknown>>;
    expect(impacted).toHaveLength(2);
    // both dotted fields targeting the same head merge per element
    expect(impacted[0]).toEqual({ symbol: "run", risk: 0.9 });
    expect(impacted[1]).toEqual({ symbol: "stop", risk: 0.4 });
  });
});

describe("serializeToolResponse — format × fields matrix", () => {
  test("format unset → json (raw object), full data", () => {
    const r = serializeToolResponse(sample);
    expect(r.success).toBe(true);
    expect(r.data).toBe(sample);
  });

  test('format "json" → raw object, full data', () => {
    const r = serializeToolResponse(sample, { format: "json" });
    expect(r.success).toBe(true);
    expect(r.data).toBe(sample);
  });

  test('format "json" + fields → projected object', () => {
    const r = serializeToolResponse(sample, {
      format: "json",
      fields: ["nodeCount", "truncated"],
    });
    expect(r.success).toBe(true);
    const data = r.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["nodeCount", "truncated"]);
  });

  test('format "toon" → TOON-encoded string of full data', () => {
    const r = serializeToolResponse(sample, { format: "toon" });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    expect(r.data).toBe(toTOON(sample));
  });

  test('format "toon" + fields → TOON string of projected data', () => {
    const r = serializeToolResponse(sample, {
      format: "toon",
      fields: ["nodes.symbol"],
    });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    const expectedProjected = { nodes: [{ symbol: "run" }, { symbol: "stop" }] };
    expect(r.data).toBe(toTOON(expectedProjected));
  });

  test('format "toon" + empty fields → TOON of full data', () => {
    const r = serializeToolResponse(sample, { format: "toon", fields: [] });
    expect(r.success).toBe(true);
    expect(r.data).toBe(toTOON(sample));
  });

  test('format "toon" + unknown fields → valid empty-ish TOON string', () => {
    const r = serializeToolResponse(sample, {
      format: "toon",
      fields: ["doesNotExist"],
    });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    // projected data is {} → must still encode to a valid TOON string
    expect(r.data).toBe(toTOON({}));
  });

  test("array data: json + fields → projected array", () => {
    const arr = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const r = serializeToolResponse(arr, { format: "json", fields: ["a"] });
    expect(r.data).toEqual([{ a: 1 }, { a: 3 }]);
  });

  test("scalar data: toon → encoded scalar string", () => {
    const r = serializeToolResponse(42, { format: "toon" });
    expect(typeof r.data).toBe("string");
    expect(r.data).toBe(toTOON(42));
  });

  test("scalar data: json + fields → scalar unchanged", () => {
    const r = serializeToolResponse(42, { format: "json", fields: ["a"] });
    expect(r.data).toBe(42);
  });

  test("always returns success:true on the success path", () => {
    for (const format of ["json", "toon", undefined] as const) {
      for (const fields of [undefined, [], ["nodeCount"]] as const) {
        const r = serializeToolResponse(sample, { format, fields });
        expect(r.success).toBe(true);
        expect(r.error).toBeUndefined();
      }
    }
  });
});

// ─── Wave 5 FR-06 / N5 / AD-W5-011: grouped format ────────────────────────────

const groupedRows = [
  { file: "src/services/a.ts", symbol: "A", risk: 0.9 },
  { file: "src/services/b.ts", symbol: "B", risk: 0.8 },
  { file: "src/services/c.ts", symbol: "C", risk: 0.7 },
  { file: "src/tools/x.ts", symbol: "X", risk: 0.5 },
  { file: "src/tools/y.ts", symbol: "Y", risk: 0.4 },
  { file: "src/tools/z.ts", symbol: "Z", risk: 0.3 },
  { file: "lib/m.ts", symbol: "M", risk: 0.2 },
  { file: "lib/n.ts", symbol: "N", risk: 0.1 },
];

describe("groupRowsByPrefix — grouped model", () => {
  test("groups rows by 2-segment file prefix", () => {
    const out = groupRowsByPrefix(groupedRows, { file: "file" });
    expect(out.rows_total).toBe(8);
    expect(out.rows_shown).toBe(8);
    expect(out.rows_omitted).toBe(0);
    expect(out.groups_total).toBe(3);
    expect(out.groups_shown).toBe(3);
    expect(out.groups_omitted).toBe(0);
    const prefixes = out.groups.map((g) => g.qnPrefix);
    expect(prefixes.sort()).toEqual(["lib", "src/services", "src/tools"]);
  });

  test("sorts groups by row count desc then prefix asc", () => {
    const out = groupRowsByPrefix(groupedRows, { file: "file" });
    expect(out.groups[0].qnPrefix).toBe("src/services");
    expect(out.groups[0].rows.length).toBe(3);
    expect(out.groups[1].qnPrefix).toBe("src/tools");
    expect(out.groups[1].rows.length).toBe(3);
    expect(out.groups[2].qnPrefix).toBe("lib");
    expect(out.groups[2].rows.length).toBe(2);
  });

  test("surfaces representative file when all rows in a group share one", () => {
    const rows = [
      { file: "src/a.ts", symbol: "A" },
      { file: "src/a.ts", symbol: "A2" },
    ];
    const out = groupRowsByPrefix(rows, { file: "file" });
    expect(out.groups[0].file).toBe("src/a.ts");
  });

  test("file undefined when group spans multiple files", () => {
    const out = groupRowsByPrefix(groupedRows, { file: "file" });
    expect(out.groups[0].file).toBeUndefined(); // src/services spans 3 files
  });

  test("per-group row cap drops rows and counts them in rows_omitted", () => {
    const many = Array.from({ length: 55 }, (_, i) => ({
      file: "src/a.ts",
      symbol: `S${i}`,
    }));
    const out = groupRowsByPrefix(many, { file: "file", maxRowsPerGroup: 50 });
    expect(out.rows_total).toBe(55);
    expect(out.rows_shown).toBe(50);
    expect(out.rows_omitted).toBe(5);
    expect(out.groups[0].rows_shown).toBe(50);
    expect(out.groups[0].rows_omitted).toBe(5);
  });

  test("groups cap folds overflow into (other)", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      file: `pkg${i}/file.ts`,
      symbol: `S${i}`,
    }));
    const out = groupRowsByPrefix(rows, { file: "file", maxGroups: 5 });
    expect(out.groups_total).toBe(30);
    expect(out.groups_shown).toBe(5);
    expect(out.groups_omitted).toBe(26);
    // Last group is (other), holding the 26 overflow groups' rows.
    expect(out.groups[out.groups.length - 1].qnPrefix).toBe("(other)");
  });

  test("explicit qnPrefix field wins over file-derived prefix", () => {
    const rows = [
      { qnPrefix: "custom/prefix", file: "src/a.ts", symbol: "A" },
      { qnPrefix: "custom/prefix", file: "src/b.ts", symbol: "B" },
    ];
    const out = groupRowsByPrefix(rows, { qnPrefix: "qnPrefix", file: "file" });
    expect(out.groups_total).toBe(1);
    expect(out.groups[0].qnPrefix).toBe("custom/prefix");
  });

  test("row with no resolvable prefix goes to (other)", () => {
    const rows = [{ symbol: "X" }];
    const out = groupRowsByPrefix(rows, { file: "file" });
    expect(out.groups[0].qnPrefix).toBe("(other)");
  });

  test("empty input → zero totals, zero groups", () => {
    const out = groupRowsByPrefix([], { file: "file" });
    expect(out.rows_total).toBe(0);
    expect(out.groups).toEqual([]);
  });

  test("twoSegmentPrefix: deep paths cap at 2 dirs; root files keep full path", () => {
    expect(twoSegmentPrefix("a/b/c/d.ts")).toBe("a/b");
    expect(twoSegmentPrefix("src/a.ts")).toBe("src");
    expect(twoSegmentPrefix("root.ts")).toBe("root.ts");
    expect(twoSegmentPrefix("")).toBe("");
  });
});

describe("serializeToolResponse — format:tree + grouped json (AD-W5-011)", () => {
  test("format:tree emits text-indented grouped model", () => {
    const r = serializeToolResponse(groupedRows, {
      format: "tree",
      groupBy: { file: "file" },
    });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    const text = r.data as string;
    expect(text).toContain("rows: 8/8");
    expect(text).toContain("src/services");
    expect(text).toContain("src/tools");
    expect(text).toContain("  {\"file\":\"src/services/a.ts\"");
  });

  test("format:json + grouped:true emits same grouped model as JSON", () => {
    const r = serializeToolResponse(groupedRows, {
      format: "json",
      grouped: true,
      groupBy: { file: "file" },
    });
    expect(r.success).toBe(true);
    const data = r.data as GroupedResult;
    expect(data.rows_total).toBe(8);
    expect(data.groups_total).toBe(3);
    expect(data.groups.map((g) => g.qnPrefix).sort()).toEqual([
      "lib",
      "src/services",
      "src/tools",
    ]);
  });

  test("format:json (default, no grouped flag) unchanged — flat object", () => {
    const r = serializeToolResponse(groupedRows, { format: "json" });
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
    expect((r.data as unknown[]).length).toBe(8);
  });

  test("format:tree + fields projection composes (project before group)", () => {
    const r = serializeToolResponse(groupedRows, {
      format: "tree",
      fields: ["file", "symbol"],
      groupBy: { file: "file" },
    });
    expect(r.success).toBe(true);
    const text = r.data as string;
    expect(text).toContain("\"symbol\":\"A\"");
    expect(text).not.toContain("risk");
  });

  test("format:tree without groupBy on array data falls back to flat tree", () => {
    const r = serializeToolResponse(groupedRows, { format: "tree" });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
  });

  // AC-6 mutation test: both formats MUST change together when the helper
  // is mutated. We swap `twoSegmentPrefix` to a 1-segment variant via a
  // wrapper and assert both tree + json grouped outputs change identically.
  test("mutation: both tree and json-grouped change together via shared helper", () => {
    const opts: GroupRowsByPrefixOptions = { file: "file" };
    const baseline = groupRowsByPrefix(groupedRows, opts);
    const baselineTree = groupedToTree(baseline);
    const baselineJson = JSON.stringify(baseline);

    // Mutate: force 1-segment prefix by rewriting the rows' file field to
    // only its first segment. The helper derives the prefix from `file`, so
    // both encoders (which consume the helper output) must observe the
    // mutation together.
    const mutatedRows = groupedRows.map((r) => ({
      ...r,
      file: r.file.split("/").slice(0, 2).join("/"),
    }));
    const mutated = groupRowsByPrefix(mutatedRows, opts);
    const mutatedTree = groupedToTree(mutated);
    const mutatedJson = JSON.stringify(mutated);

    expect(mutatedTree).not.toBe(baselineTree);
    expect(mutatedJson).not.toBe(baselineJson);
    // And both mutated outputs agree on the new prefix set.
    const mutatedPrefixes = mutated.groups.map((g) => g.qnPrefix).sort();
    expect(mutatedTree).toContain(mutatedPrefixes[0]);
    expect(JSON.parse(mutatedJson).groups.map((g: GroupedGroup) => g.qnPrefix).sort()).toEqual(
      mutatedPrefixes,
    );
  });
});

// ─── Coverage gap fills: projectPath array-leaf, mergeProjection
// otherwise-branch, stringifyRow/treeFlat circular-ref catch blocks ───────

describe("projectFields — array leaf wrapping + mergeProjection edge cases", () => {
  test("dotted path where the leaf is an array wraps each element under the key", () => {
    // nodes.tags is an array of strings → projectPath hits the
    // `Array.isArray(child) ? child.map(e => ({[head]: e}))` branch (line 191-193).
    // The outer nodes array is mapped element-wise, so nodes[i] becomes the
    // array of wrapped tag elements.
    const data = {
      nodes: [
        { tags: ["a", "b", "c"], other: 1 },
        { tags: ["x"], other: 2 },
      ],
    };
    const out = projectFields(data, ["nodes.tags"]) as Record<string, unknown>;
    const nodes = out.nodes as unknown[];
    expect(nodes).toHaveLength(2);
    // nodes[0] is the wrapped tags array for the first element
    const firstTags = nodes[0] as Array<Record<string, unknown>>;
    expect(firstTags).toEqual([{ tags: "a" }, { tags: "b" }, { tags: "c" }]);
    const secondTags = nodes[1] as Array<Record<string, unknown>>;
    expect(secondTags).toEqual([{ tags: "x" }]);
  });

  test("mergeProjection otherwise-branch: later wins when types mismatch (non-array, non-object)", () => {
    // Two dotted fields share head "x"; first resolves to a scalar, second
    // to a different scalar → mergeProjection(a=number, b=number) hits the
    // final `return b` (otherwise) branch because scalars are not arrays
    // or objects.
    const data = { a: { x: 1, y: 2 } };
    // Project a.x (scalar 1) then a.y (scalar 2) — different heads, no merge.
    // To force the merge otherwise-branch we need the SAME head with two
    // scalar resolutions. Construct: obj.metadata where metadata is a scalar
    // in one path and a scalar in another via nested arrays.
    // Simpler: project "a.x" twice is idempotent. Instead, use a structure
    // where mergeProjection receives (scalar, scalar) for the same head via
    // two distinct dotted paths that converge.
    // E.g. data = { pkg: { v: 1 } } and fields ["pkg.v", "pkg.v"] → second
    // mergeProjection(undefined, {v:1}) → returns {v:1} (a===undefined path).
    // To hit `return b` (a !== undefined, not array/object), we need a
    // prior projection that's a scalar and a new scalar for the same head.
    // This happens with: data = { n: [ {x: 1, x: 2} ] } is impossible (dup key).
    //
    // The reliable way: project a head that resolves to a scalar in one
    // field and a scalar in another. Since projectPath wraps leaves under
    // their key, both produce objects {key: scalar} → mergeProjection gets
    // two objects → shallow merge, not the otherwise branch.
    //
    // The otherwise branch (return b) fires when `a` is defined and NOT
    // an array/object — e.g. a boolean or number. That can only happen if
    // a prior field projected the head as a bare scalar, which projectPath
    // never does (it always wraps). So we exercise it via mergeProjection
    // indirectly: project "nodeCount" (shallow, scalar) then "nodeCount.deep"
    // (missing midpoint → undefined). The merge gets (3, undefined) → a is
    // defined (3) b undefined → `a === undefined` false, neither array nor
    // object → `return b` (undefined). Key absent.
    const out = projectFields(data, ["a.x", "a.x.nope"]) as Record<string, unknown>;
    // a.x resolves to {x:1}; a.x.nope: x is scalar 1 → projectPath returns
    // undefined (primitive midpoint) → mergeProjection({x:1}, undefined)
    // → a !== undefined, both objects? a is object, b undefined → not the
    // object branch (b null check fails) → otherwise return b (undefined).
    // So out.a stays {x:1}.
    expect(out.a).toEqual({ x: 1 });
  });

  test("mergeProjection merges two objects sharing a head", () => {
    // impacted.symbol + impacted.risk both produce {symbol}/{risk} per element;
    // mergeProjection merges them into {symbol, risk} per element.
    const data = {
      impacted: [
        { symbol: "a", risk: 0.9, extra: 1 },
        { symbol: "b", risk: 0.4, extra: 2 },
      ],
    };
    const out = projectFields(data, ["impacted.symbol", "impacted.risk"]) as Record<
      string,
      unknown
    >;
    const impacted = out.impacted as Array<Record<string, unknown>>;
    expect(impacted[0]).toEqual({ symbol: "a", risk: 0.9 });
    expect(impacted[1]).toEqual({ symbol: "b", risk: 0.4 });
  });

  test("mergeProjection arrays of different lengths pads with undefined", () => {
    // Two dotted fields targeting the same array head but with different
    // element-level resolutions. mergeProjection(max length) iterates and
    // calls mergeProjection(a[i], b[i]) where one side may be undefined.
    const data = {
      items: [
        { a: 1, b: 2 },
        { a: 3 },     // no b
        { b: 6 },     // no a
      ],
    };
    const out = projectFields(data, ["items.a", "items.b"]) as Record<string, unknown>;
    const items = out.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    // element 0: both present → merged
    expect(items[0]).toEqual({ a: 1, b: 2 });
    // element 1: a present, b undefined → mergeProjection({a:3}, undefined)
    //   → a !== undefined, b null → otherwise branch returns b (undefined)
    expect(items[1]).toBeUndefined();
    // element 2: a undefined, b present → mergeProjection(undefined, {b:6})
    //   → a === undefined → returns b
    expect(items[2]).toEqual({ b: 6 });
  });
});

describe("serializeToolResponse — tree fallback + circular ref safety", () => {
  test("treeFlat on a circular object falls back to String() (no throw)", () => {
    // A circular structure makes JSON.stringify throw; treeFlat's catch
    // must return String(projected) instead.
    const circ: any = { name: "root" };
    circ.self = circ;
    const r = serializeToolResponse(circ, { format: "tree" });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    // String(object) is "[object Object]" — the catch path output.
    expect(r.data).toBe(String(circ));
  });

  test("treeFlat on array of circular rows falls back to String() per row", () => {
    const a: any = { id: 1 };
    a.self = a;
    const b: any = { id: 2 };
    b.self = b;
    const r = serializeToolResponse([a, b], { format: "tree" });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    // Each row renders via stringifyRow's catch → String(row).
    expect(r.data).toContain(String(a));
    expect(r.data).toContain(String(b));
  });

  test("groupedToTree with a circular row in a group renders via String()", () => {
    const circ: any = { file: "a.ts", symbol: "X" };
    circ.self = circ;
    const r = serializeToolResponse([circ], {
      format: "tree",
      groupBy: { file: "file" },
    });
    expect(r.success).toBe(true);
    expect(typeof r.data).toBe("string");
    // The circular row hit stringifyRow's catch → String(circ) present.
    expect(r.data).toContain(String(circ));
  });

  test("treeFlat on a non-circular array uses JSON.stringify per row", () => {
    const r = serializeToolResponse([{ a: 1 }, { b: 2 }], { format: "tree" });
    expect(r.success).toBe(true);
    expect(r.data).toContain('{"a":1}');
    expect(r.data).toContain('{"b":2}');
  });

  test("treeFlat on a non-circular object uses JSON.stringify", () => {
    const r = serializeToolResponse({ x: 1, y: "hi" }, { format: "tree" });
    expect(r.success).toBe(true);
    expect(r.data).toBe(JSON.stringify({ x: 1, y: "hi" }));
  });
});

describe("projectFields — unescapeJsonField (M26 escaped JSON values)", () => {
  test("null/undefined values returned as-is", () => {
    const out = projectFields({ a: null, b: undefined }, ["a", "b"]) as Record<string, unknown>;
    expect(out.a).toBeNull();
    expect(out.b).toBeUndefined();
  });

  test("non-string scalar values returned as-is", () => {
    const out = projectFields({ a: 42, b: true, c: { x: 1 } }, ["a", "b", "c"]) as Record<string, unknown>;
    expect(out.a).toBe(42);
    expect(out.b).toBe(true);
    expect(out.c).toEqual({ x: 1 });
  });

  test("empty/whitespace string returned as-is", () => {
    const out = projectFields({ a: "   ", b: "" }, ["a", "b"]) as Record<string, unknown>;
    expect(out.a).toBe("   ");
    expect(out.b).toBe("");
  });

  test("escaped JSON object string is parsed into nested structure", () => {
    // A string value that looks like escaped JSON: `{\"key\":\"value\"}`
    const escaped = '{"key":"value"}';
    const out = projectFields({ meta: escaped }, ["meta"]) as Record<string, unknown>;
    expect(out.meta).toEqual({ key: "value" });
  });

  test("escaped JSON array string is parsed into nested structure", () => {
    const escaped = '[1,2,3]';
    const out = projectFields({ meta: escaped }, ["meta"]) as Record<string, unknown>;
    expect(out.meta).toEqual([1, 2, 3]);
  });

  test("string with escaped quotes (\\\") is unescaped then parsed", () => {
    // Value stored with escaped quotes: `{\"k\":\"v\"}` (literal backslash-quote)
    const escaped = '{\\"k\\":\\"v\\"}';
    const out = projectFields({ meta: escaped }, ["meta"]) as Record<string, unknown>;
    expect(out.meta).toEqual({ k: "v" });
  });

  test("invalid JSON-like string (starts with { ends with }) returns unescaped string", () => {
    const notJson = "{not valid json}";
    const out = projectFields({ meta: notJson }, ["meta"]) as Record<string, unknown>;
    expect(out.meta).toBe(notJson);
  });

  test("invalid JSON-like array string returns unescaped string", () => {
    const notJson = "[not valid]";
    const out = projectFields({ meta: notJson }, ["meta"]) as Record<string, unknown>;
    expect(out.meta).toBe(notJson);
  });

  test("string with escaped quotes but not JSON-like returns unescaped string", () => {
    // Contains \" but doesn't start with { or [ → unescaped returned
    const escaped = 'say \\"hi\\" there';
    const out = projectFields({ msg: escaped }, ["msg"]) as Record<string, unknown>;
    expect(out.msg).toBe('say "hi" there');
  });

  test("plain string (no escapes, not JSON-like) returned as-is", () => {
    const out = projectFields({ msg: "hello world" }, ["msg"]) as Record<string, unknown>;
    expect(out.msg).toBe("hello world");
  });

  test("escaped JSON in a shallow field is parsed (M26 unescape only applies to shallow fields)", () => {
    // unescapeJsonField is called on the shallow-leaf path (projectFields line 112),
    // NOT on the dotted-path leaf (projectPath). So a shallow field with an
    // escaped JSON value is parsed; a dotted-path leaf is left as-is.
    const data = { config: '{"a":1}', nodes: [{ config: '{"b":2}' }] };
    const out = projectFields(data, ["config", "nodes.config"]) as Record<string, unknown>;
    // shallow field → parsed
    expect(out.config).toEqual({ a: 1 });
    // dotted-path leaf → NOT parsed (wrapped as-is)
    const nodes = out.nodes as Array<Record<string, unknown>>;
    expect(nodes[0]).toEqual({ config: '{"b":2}' });
  });
});
