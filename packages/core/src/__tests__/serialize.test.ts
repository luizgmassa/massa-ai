import { describe, expect, test } from "bun:test";
import { encode as toTOON } from "@toon-format/toon";
import {
  projectFields,
  serializeToolResponse,
} from "../tools/serialize.js";

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
