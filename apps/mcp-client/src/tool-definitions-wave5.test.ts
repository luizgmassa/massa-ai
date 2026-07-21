/**
 * Wave 5 T06 — mcp-client impact_analysis enum drift fix + cbm alignment.
 *
 * FR-04 / AC-4: the mcp-client `impact_analysis` schema enum must include
 * `"all"` (today drifts from the core tool which accepts all four scopes).
 * Field names match cbm delta: impacted_total/shown/omitted/modules/truncated.
 */

import { describe, expect, test } from "bun:test";
import { getToolDefinition, TOOL_DEFINITIONS } from "./tool-definitions.js";

describe("Wave 5 T06 — impact_analysis enum drift + cbm alignment (FR-04 / AC-4)", () => {
  test("impact_analysis scope enum includes 'all' (matches core tool)", () => {
    const def = getToolDefinition("impact_analysis");
    expect(def).toBeDefined();
    const scope = (def!.inputSchema.properties as any).scope;
    expect(scope.enum).toContain("unstaged");
    expect(scope.enum).toContain("staged");
    expect(scope.enum).toContain("committed");
    expect(scope.enum).toContain("all");
  });

  test("get_architecture is registered (added in T04)", () => {
    const def = getToolDefinition("get_architecture");
    expect(def).toBeDefined();
    expect(def!.apiMethod).toBe("GET");
    expect(def!.apiEndpoint).toBe("/api/v1/project/:id/architecture");
  });

  test("get_architecture accepts aspects array (cbm parity)", () => {
    const def = getToolDefinition("get_architecture");
    const aspects = (def!.inputSchema.properties as any).aspects;
    expect(aspects.type).toBe("array");
  });

  test("tool count reflects Wave 5 additions (get_architecture)", () => {
    // T04 added get_architecture; the identity test pinned 49 pre-Wave-5.
    // We don't hard-pin the exact count here (future waves may add more) —
    // we just assert get_architecture is present.
    const names = TOOL_DEFINITIONS.map((d) => d.name);
    expect(names).toContain("get_architecture");
    expect(names).toContain("impact_analysis");
  });
});