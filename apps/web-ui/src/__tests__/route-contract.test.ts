/**
 * Route-contract regression for the checkpoints view.
 *
 * app-renderers.test.ts feeds the renderers hand-written fixtures. Those
 * fixtures drifted from what POST /api/v1/checkpoints/list actually returns
 * (`type` vs `checkpointType`, and a TOON *string* body whenever `format` is
 * omitted), so the suite stayed green while the view was permanently empty.
 *
 * This file pins the renderer to a golden response captured verbatim from the
 * live API. Its sibling — apps/tools-api/src/routes/web-ui-contract.test.ts —
 * reads the same JSON file and asserts the real route still produces that
 * shape, so drift fails on one side or the other instead of going unnoticed.
 */

import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderCheckpoints, CHECKPOINTS_LIST_BODY } = { ...mod, ...UI } as {
  renderCheckpoints: (data: unknown) => string;
  CHECKPOINTS_LIST_BODY: Record<string, unknown>;
};

export const CHECKPOINTS_FIXTURE_PATH = path.join(
  import.meta.dir,
  "fixtures",
  "checkpoints-list.json",
);

const fixture = JSON.parse(fs.readFileSync(CHECKPOINTS_FIXTURE_PATH, "utf8")) as {
  success: boolean;
  data: { checkpoints: Array<Record<string, unknown>> };
};

describe("checkpoints view ↔ /api/v1/checkpoints/list contract", () => {
  it("requests JSON, because the route otherwise returns a TOON string", () => {
    expect(CHECKPOINTS_LIST_BODY.format).toBe("json");
  });

  it("renders rows from the golden live-API response", () => {
    const html = renderCheckpoints(fixture);
    expect(html).not.toContain("No checkpoints");

    const first = fixture.data.checkpoints[0];
    expect(first).toBeDefined();
    expect(html).toContain(String(first!.taskId));
    expect(html).toContain(String(first!.type));
    expect(html).toContain(String(first!.status));
  });

  it("reads every column the table header advertises", () => {
    // Guards the `type` vs `checkpointType` class of bug: a header with no
    // backing field renders a silently blank column.
    const first = fixture.data.checkpoints[0] as Record<string, unknown>;
    for (const key of ["taskId", "type", "status", "description"]) {
      expect(Object.keys(first)).toContain(key);
    }
  });
});
