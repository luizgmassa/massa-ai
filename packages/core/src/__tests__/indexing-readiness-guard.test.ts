import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { EtlPipeline } from "../services/etl/pipeline.js";
import { ContextualSearchRLM } from "../services/search/contextual-search-rlm.js";
import {
  resetParserReadinessForTests,
} from "../services/structural/parser-readiness.js";
import { IndexProjectTool } from "../tools/index_project.js";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";

describe("indexing parser-readiness guards", () => {
  test("rejects tool, ETL, and legacy indexing before accepting work", async () => {
    resetParserReadinessForTests(async () => {
      throw new Error("Cannot find required native grammar");
    });
    const createJob = spyOn(indexJobTracker, "createJob");
    (EtlPipeline as any).runTails = new Map();
    (ContextualSearchRLM as any).indexingLocks = new Map();

    try {
      const toolResult = await new IndexProjectTool().handle({
        projectPath: "/path/that/must/not/be-read",
        projectId: "unready-tool",
      });
      expect(toolResult.success).toBe(false);
      expect(toolResult.error).toContain("not ready");
      expect(createJob).not.toHaveBeenCalled();

      await expect(EtlPipeline.getInstance().run({
        projectId: "unready-etl",
        projectPath: "/path/that/must/not/be-read",
        jobId: "must-not-start",
        forceReindex: true,
      })).rejects.toThrow("not ready");
      expect((EtlPipeline as any).runTails.size).toBe(0);

      await expect(new ContextualSearchRLM().indexProject(
        "/path/that/must/not-be-read",
        "unready-legacy",
      )).rejects.toThrow("not ready");
      expect((ContextualSearchRLM as any).indexingLocks.size).toBe(0);
    } finally {
      createJob.mockRestore();
    }
  });
});

afterAll(() => {
  resetParserReadinessForTests();
});
