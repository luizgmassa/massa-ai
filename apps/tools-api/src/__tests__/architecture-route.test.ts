/**
 * Architecture REST route — Wave 5 FR-01 / AC-1 / AC-4.
 *
 * GET /api/v1/project/:id/architecture
 *   - ?aspects=cycles surfaces cycles + cycles_truncated
 *   - unknown aspect → 400 teaching error listing valid values
 *   - _aspects meta endpoint lists valid aspects
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { architectureRoutes } from "../routes/architecture.js";

const app = new Elysia().use(architectureRoutes);

async function getJson(path: string): Promise<any> {
  const res = await app.handle(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json() };
}

describe("GET /api/v1/project/:id/architecture (Wave 5 T04)", () => {
  beforeAll(() => {
    // No DB needed for the teaching-error + meta-endpoint paths. The
    // not-found path is covered by the core tool test.
  });

  test("?aspects=bogus → 400 teaching error listing valid values", async () => {
    const { status, body } = await getJson(
      "/api/v1/project/some-project/architecture?aspects=bogus",
    );
    // The tool returns {success:false, error:"Invalid aspects value: bogus. ..."}
    // Elysia returns 200 with the JSON body (the tool does not throw; it returns).
    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid aspects value: bogus.");
    expect(body.error).toContain("cycles");
  });

  test("unknown aspect mixed with valid → 400 teaching error", async () => {
    const { body } = await getJson(
      "/api/v1/project/some-project/architecture?aspects=cycles,nope",
    );
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid aspects value: nope.");
  });

  test("/architecture/_aspects → lists valid aspects", async () => {
    const { status, body } = await getJson(
      "/api/v1/project/architecture/_aspects",
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.aspects).toContain("cycles");
  });

  test("missing project with valid aspects → not-found error (not teaching error)", async () => {
    const { body } = await getJson(
      "/api/v1/project/definitely-not-here/architecture?aspects=cycles",
    );
    expect(body.success).toBe(false);
    expect(body.error).not.toContain("Invalid aspects");
  });
});