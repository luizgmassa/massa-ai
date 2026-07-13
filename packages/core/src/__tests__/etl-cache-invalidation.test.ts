import { beforeAll, describe, expect, mock, test } from "bun:test";

const invalidations: string[] = [];
let releaseInvalidation!: () => void;

mock.module("../services/search/cache-factory.js", () => ({
  getSearchCache: () => ({
    invalidateProject: async (projectId: string) => {
      invalidations.push(projectId);
      await new Promise<void>((resolve) => {
        releaseInvalidation = resolve;
      });
      return 1;
    },
  }),
}));

let pipeline: any;
let indexJobTracker: any;

beforeAll(async () => {
  ({ etlPipeline: pipeline } = await import("../services/etl/pipeline.js"));
  ({ indexJobTracker } = await import("../services/jobs/index-job-tracker.js"));
});

describe("ETL search-cache consistency", () => {
  test("invalidates project cache before exposing a completed job", async () => {
    const job = indexJobTracker.createJob("cache-project", "/tmp");
    indexJobTracker.updateStatus(job.jobId, "running");

    pipeline.discover.run = async () => [];
    pipeline.parse.run = async () => [];
    pipeline.resolve.run = async () => [];
    pipeline.load.run = async () => ({
      filesLoaded: 1,
      chunksLoaded: 1,
      symbolsLoaded: 1,
      errors: 0,
    });

    const run = pipeline.run({
      projectId: "cache-project",
      projectPath: "/tmp",
      jobId: job.jobId,
    });

    while (invalidations.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(invalidations).toEqual(["cache-project"]);
    expect(indexJobTracker.getJob(job.jobId)?.status).toBe("running");

    releaseInvalidation();
    await run;

    expect(indexJobTracker.getJob(job.jobId)?.status).toBe("completed");
  });
});
