import { describe, test, expect } from "bun:test";
import {
  extractTopics,
  buildPrefetchPlan,
  DEFAULT_PREFETCH_CONFIG,
} from "../services/synapse/prefetch/prefetch.js";

describe("extractTopics", () => {
  test("pulls path tokens, filters stopwords and extensions", () => {
    const topics = extractTopics({ filePath: "src/auth/middleware.ts" });
    expect(topics).toEqual(["auth", "middleware"]);
  });

  test("splits CamelCase symbols", () => {
    const topics = extractTopics({
      filePath: "src/foo.ts",
      symbols: [{ name: "verifyJwtToken" }],
    });
    expect(topics).toContain("foo");
    expect(topics).toContain("verify");
    expect(topics).toContain("jwt");
    expect(topics).toContain("token");
  });

  test("deduplicates tokens", () => {
    const topics = extractTopics({
      filePath: "src/auth/auth.ts",
      symbols: [{ name: "authHandler" }],
    });
    const authCount = topics.filter((t) => t === "auth").length;
    expect(authCount).toBe(1);
  });

  test("returns empty array for path with only stopwords/extensions", () => {
    const topics = extractTopics({ filePath: "index.ts" });
    expect(topics).toEqual([]);
  });
});

describe("buildPrefetchPlan", () => {
  test("disabled config produces enabled=false plan", () => {
    const plan = buildPrefetchPlan(
      { filePath: "src/auth/middleware.ts" },
      { ...DEFAULT_PREFETCH_CONFIG, enabled: false },
    );
    expect(plan.enabled).toBe(false);
  });

  test("enabled config with topics produces a usable plan", () => {
    const plan = buildPrefetchPlan(
      { filePath: "src/auth/middleware.ts" },
      { ...DEFAULT_PREFETCH_CONFIG, enabled: true },
    );
    expect(plan.enabled).toBe(true);
    expect(plan.query).toBe("auth middleware");
    expect(plan.chains).toEqual(DEFAULT_PREFETCH_CONFIG.chains);
    expect(plan.maxResults).toBe(DEFAULT_PREFETCH_CONFIG.maxResults);
  });

  test("plan reports enabled=false when no topics could be extracted", () => {
    const plan = buildPrefetchPlan(
      { filePath: "index.ts" },
      { ...DEFAULT_PREFETCH_CONFIG, enabled: true },
    );
    expect(plan.enabled).toBe(false);
  });
});
