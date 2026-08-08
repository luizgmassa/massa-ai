/**
 * Web UI ↔ route response-shape contract.
 *
 * The Web UI's Checkpoints and Proposals views both rendered a permanent empty
 * state while the routes returned real data:
 *
 *   - /checkpoints/list defaults to `format: "toon"`, whose `data` is a
 *     formatted *string* — with `success` still true, so no error path fires.
 *     The UI omitted `format`, so the renderer never saw rows.
 *   - /proposal/list returns `{ pending, count }`; the UI read `proposals`.
 *
 * Renderer-side fixtures could not catch either, because they were hand-written
 * rather than derived from the routes. This file asserts the routes still emit
 * the shape the checked-in golden fixture records; its sibling —
 * apps/web-ui/src/__tests__/route-contract.test.ts — asserts the renderer
 * consumes that same file. Drift now fails on one side or the other.
 *
 * The fixture is read with `fs`, not imported: apps/tools-api sets
 * `rootDir: ./src` with no `allowJs`, so a cross-package module import would
 * break `bun run type-check`.
 *
 * Scope is deliberately checkpoints-only. Importing checkpoints.js and
 * proposals.js into one file hangs the run before Prisma initializes; the
 * proposals half of this contract lives in proposals.test.ts instead, which
 * keeps one route import per file like the rest of this directory.
 */

import { describe, test, expect, beforeAll, mock } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-ui-contract-"));

mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    config: {
      get: (key: string) => (key === "dataDir" ? tmpDir : actual.config.get(key)),
    },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, metric: () => {} },
  };
});

import { checkpointRoutes } from "./checkpoints.js";

const FIXTURE_PATH = path.join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "web-ui",
  "src",
  "__tests__",
  "fixtures",
  "checkpoints-list.json",
);

const TASK_ID = "web-ui-contract-task";

async function post(
  routes: { handle: (req: Request) => Promise<Response> },
  p: string,
  body: unknown,
) {
  const res = await routes.handle(
    new Request(`http://localhost${p}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as { success: boolean; data?: any; error?: string };
}

describe("checkpoints list shape matches the Web UI golden fixture", () => {
  beforeAll(async () => {
    await post(checkpointRoutes, "/api/v1/checkpoints/create", {
      taskId: TASK_ID,
      description: "web ui contract probe",
      checkpointType: "milestone",
      format: "json",
    });
  });

  test('format:"json" returns rows carrying every key the renderer reads', async () => {
    const json = await post(checkpointRoutes, "/api/v1/checkpoints/list", {
      limit: 50,
      format: "json",
      taskId: TASK_ID,
    });
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data?.checkpoints)).toBe(true);

    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
      data: { checkpoints: Array<Record<string, unknown>> };
    };
    const fixtureRow = fixture.data.checkpoints[0];
    expect(fixtureRow).toBeDefined();

    const liveRow = json.data.checkpoints[0] as Record<string, unknown>;
    expect(liveRow).toBeDefined();
    // Every key the golden capture recorded must still be emitted. This is what
    // fails if core renames `type` back to `checkpointType`.
    for (const key of Object.keys(fixtureRow!)) {
      expect(Object.keys(liveRow)).toContain(key);
    }
  });

  test("omitting format yields a string body with success still true", async () => {
    // The exact trap the UI fell into: no error signal, just an unreadable body.
    const json = await post(checkpointRoutes, "/api/v1/checkpoints/list", { limit: 50 });
    expect(json.success).toBe(true);
    expect(typeof json.data).toBe("string");
  });
});

// ── Config GET golden fixture contract ───────────────────────────────────────

describe("config GET shape matches the Web UI golden fixture", () => {
  const CONFIG_FIXTURE_PATH = path.join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "web-ui",
    "src",
    "__tests__",
    "fixtures",
    "config-get.json",
  );

  test("fixture exists and has the expected top-level shape", () => {
    const fixture = JSON.parse(fs.readFileSync(CONFIG_FIXTURE_PATH, "utf8")) as any;
    expect(fixture.success).toBe(true);
    expect(fixture.data.config).toBeDefined();
    expect(fixture.data.restartNeededSections).toBeDefined();
  });

  test("fixture masks all four sensitive fields to '***'", () => {
    const fixture = JSON.parse(fs.readFileSync(CONFIG_FIXTURE_PATH, "utf8")) as any;
    const cfg = fixture.data.config;
    expect(cfg.security.apiKey).toBe("***");
    expect(cfg.llm.apiKey).toBe("***");
    expect(cfg.embedding.apiKey).toBe("***");
    expect(cfg.database.url).toBe("***");
  });

  test("fixture restartNeededSections is an array of known section names", () => {
    const fixture = JSON.parse(fs.readFileSync(CONFIG_FIXTURE_PATH, "utf8")) as any;
    const sections = fixture.data.restartNeededSections as string[];
    expect(Array.isArray(sections)).toBe(true);
    const validSections = ["database", "embedding", "llm", "security"];
    for (const s of sections) {
      expect(validSections).toContain(s);
    }
  });
});

// ── Model-registry GET golden fixture contract ───────────────────────────────

describe("model-registry GET shape matches the Web UI golden fixture", () => {
  const REGISTRY_FIXTURE_PATH = path.join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "web-ui",
    "src",
    "__tests__",
    "fixtures",
    "model-registry-get.json",
  );

  test("fixture exists and has the expected top-level shape", () => {
    const fixture = JSON.parse(fs.readFileSync(REGISTRY_FIXTURE_PATH, "utf8")) as any;
    expect(fixture.success).toBe(true);
    expect(fixture.data.registry).toBeDefined();
    expect(fixture.data.source).toBeDefined();
  });

  test("fixture source has builtin, overlay, and tombstoned", () => {
    const fixture = JSON.parse(fs.readFileSync(REGISTRY_FIXTURE_PATH, "utf8")) as any;
    expect(fixture.data.source.builtin).toBeDefined();
    expect(fixture.data.source.overlay).not.toBeUndefined();
    expect(Array.isArray(fixture.data.source.tombstoned)).toBe(true);
  });

  test("fixture registry has version, tiers, profiles", () => {
    const fixture = JSON.parse(fs.readFileSync(REGISTRY_FIXTURE_PATH, "utf8")) as any;
    expect(fixture.data.registry.version).toBe(1);
    expect(Array.isArray(fixture.data.registry.tiers)).toBe(true);
    expect(fixture.data.registry.profiles).toBeDefined();
  });
});
