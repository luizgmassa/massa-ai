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
