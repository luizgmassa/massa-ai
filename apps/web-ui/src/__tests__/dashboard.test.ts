import { describe, it, expect } from "bun:test";

const {
  fetchDashboardData,
  renderSchedulerSection,
  renderHookQueueSection,
  renderSynapseSection,
  renderMetricsSection,
  renderDashboard,
} = await import("../static/dashboard.js");

describe("fetchDashboardData", () => {
  it("returns fulfilled data for each section", async () => {
    const api = {
      request: async (url: string) => {
        if (url.includes("scheduler")) return { running: true, jobs: [] };
        if (url.includes("hooks")) return { pendingCount: 1, maxPending: 10, saturated: false };
        if (url.includes("synapse")) return { data: { sessions: [] } };
        if (url.includes("metrics")) return { system: { uptime: 5 } };
        return null;
      },
    };
    const data = await fetchDashboardData(api);
    expect(data.scheduler.data).toEqual({ running: true, jobs: [] });
    expect(data.scheduler.error).toBeNull();
    expect(data.hookQueue.data.pendingCount).toBe(1);
    expect(data.synapse.data).toEqual({ data: { sessions: [] } });
    expect(data.metrics.data.system.uptime).toBe(5);
  });

  it("returns error string for rejected sections", async () => {
    const api = {
      request: async (url: string) => {
        if (url.includes("scheduler")) throw new Error("boom");
        if (url.includes("hooks")) throw "string-reason";
        return { ok: true };
      },
    };
    const data = await fetchDashboardData(api);
    expect(data.scheduler.error).toBe("boom");
    expect(data.scheduler.data).toBeNull();
    expect(data.hookQueue.error).toBe("string-reason");
    expect(data.synapse.error).toBeNull();
  });

  it("handles non-Error rejection reasons", async () => {
    const api = { request: async () => { throw { weird: 1 }; } };
    const data = await fetchDashboardData(api);
    expect(typeof data.scheduler.error).toBe("string");
  });
});

describe("renderSchedulerSection", () => {
  it("shows unavailable on error", () => {
    const html = renderSchedulerSection({ error: "down", data: null });
    expect(html).toContain("unavailable");
  });

  it("shows unavailable when data missing or d.unavailable", () => {
    expect(renderSchedulerSection({ data: null, error: null })).toContain("unavailable");
    expect(renderSchedulerSection({ data: { unavailable: true }, error: null })).toContain("unavailable");
  });

  it("shows disabled when not running and no jobs", () => {
    const html = renderSchedulerSection({ data: { running: false, jobs: [] }, error: null });
    expect(html).toContain("disabled");
  });

  it("renders job table rows", () => {
    const html = renderSchedulerSection({
      data: {
        running: true,
        tickIntervalMs: 1000,
        jobs: [{ id: "j1", name: "reindex", jobKind: "index", enabled: true, nextRunAt: 0, lastRunAt: 100, due: true, currentlyRunning: false }],
      },
      error: null,
    });
    expect(html).toContain("j1");
    expect(html).toContain("reindex");
    // T13: raw "<strong>Running:</strong>" line replaced by a `.stat-card`
    // labeled "Running" (no colon); tickIntervalMs is now locale-formatted
    // via toLocaleString("en-US"), so 1000 renders "1,000" not "1000".
    expect(html).toContain('<div class="stat-label">Running</div>');
    expect(html).toContain("1,000");
  });

  it("renders stat cards and code-wrapped job id (T13)", () => {
    const html = renderSchedulerSection({
      data: {
        running: true,
        tickIntervalMs: 1000,
        jobs: [{ id: "j1", name: "reindex", jobKind: "index", enabled: true, nextRunAt: 0, lastRunAt: 100, due: true, currentlyRunning: false }],
      },
      error: null,
    });
    expect(html).toContain('class="stat-grid"');
    expect(html).toContain('class="stat-card"');
    expect(html).toContain("<code>j1</code>");
    expect(html).toContain("Tick Interval");
  });

  it("escapes html in job fields", () => {
    const html = renderSchedulerSection({
      data: { running: true, tickIntervalMs: 1, jobs: [{ id: "<script>", name: "x", jobKind: "y" }] },
      error: null,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderHookQueueSection", () => {
  it("shows unavailable on error", () => {
    expect(renderHookQueueSection({ error: "x" })).toContain("unavailable");
  });

  it("shows unavailable when data missing", () => {
    expect(renderHookQueueSection({ data: null, error: null })).toContain("unavailable");
    expect(renderHookQueueSection({ data: { unavailable: true }, error: null })).toContain("unavailable");
  });

  it("renders pending count + percentage", () => {
    const html = renderHookQueueSection({ data: { pendingCount: 5, maxPending: 10, saturated: false }, error: null });
    expect(html).toContain("5 / 10");
    expect(html).toContain("50%");
  });

  it("handles maxPending=0 without divide-by-zero", () => {
    const html = renderHookQueueSection({ data: { pendingCount: 0, maxPending: 0, saturated: true }, error: null });
    expect(html).toContain("0 / 0");
    expect(html).toContain("(0%)");
    expect(html).toContain("Saturated");
  });

  it("renders a stat-card grid (T13)", () => {
    const html = renderHookQueueSection({ data: { pendingCount: 5, maxPending: 10, saturated: false }, error: null });
    expect(html).toContain('class="stat-grid"');
    expect(html).toContain('class="stat-card"');
  });
});

describe("renderSynapseSection", () => {
  it("shows unavailable on error", () => {
    expect(renderSynapseSection({ error: "x" })).toContain("unavailable");
  });

  it("shows unavailable when data missing", () => {
    expect(renderSynapseSection({ data: null, error: null })).toContain("unavailable");
    expect(renderSynapseSection({ data: { unavailable: true }, error: null })).toContain("unavailable");
  });

  it("shows 'No active sessions' when empty", () => {
    expect(renderSynapseSection({ data: { data: { sessions: [] } }, error: null })).toContain("No active sessions");
    expect(renderSynapseSection({ data: { sessions: [] }, error: null })).toContain("No active sessions");
  });

  it("renders session rows", () => {
    const html = renderSynapseSection({
      data: { data: { sessions: [{ sessionId: "s1", agentId: "a1", workspaceId: "w", taskContext: "t", expiresAt: 123 }] } },
      error: null,
    });
    expect(html).toContain("s1");
    expect(html).toContain("a1");
    expect(html).toContain("Synapse Sessions (1)");
  });

  it("wraps session id/agent id/workspace id in <code> (T13)", () => {
    const html = renderSynapseSection({
      data: { data: { sessions: [{ sessionId: "s1", agentId: "a1", workspaceId: "w", taskContext: "t", expiresAt: 123 }] } },
      error: null,
    });
    expect(html).toContain("<code>s1</code>");
    expect(html).toContain("<code>a1</code>");
    expect(html).toContain("<code>w</code>");
  });

  it("uses em-dash for missing session fields", () => {
    const html = renderSynapseSection({
      data: { data: { sessions: [{ sessionId: "s2", agentId: "a2" }] } },
      error: null,
    });
    expect(html).toContain("—");
  });
});

describe("renderMetricsSection", () => {
  it("shows unavailable on error", () => {
    expect(renderMetricsSection({ error: "x" })).toContain("unavailable");
  });

  it("shows unavailable when data missing", () => {
    expect(renderMetricsSection({ data: null, error: null })).toContain("unavailable");
  });

  it("renders uptime + memory", () => {
    const html = renderMetricsSection({
      data: { system: { uptime: 99, databaseSize: "10MB", memory: { heapUsed: 1, heapTotal: 2, rss: 3 } } },
      error: null,
    });
    expect(html).toContain("99s");
    expect(html).toContain("10MB");
    // T13: raw "<strong>Heap:</strong>"/"<strong>RSS:</strong>" lines
    // replaced by separate "Heap Used"/"Heap Total"/"RSS" stat cards.
    expect(html).toContain("Heap Used");
    expect(html).toContain("Heap Total");
    expect(html).toContain('<div class="stat-label">RSS</div>');
  });

  it("renders formatted stat cards with large numbers (T13)", () => {
    const html = renderMetricsSection({
      data: { system: { uptime: 12345, databaseSize: "10MB", memory: { heapUsed: 123456, heapTotal: 2, rss: 3 } } },
      error: null,
    });
    expect(html).toContain('class="stat-grid"');
    expect(html).toContain('class="stat-card"');
    expect(html).toContain("12,345s");
    expect(html).toContain("123,456");
  });

  it("uses em-dash for missing system fields", () => {
    const html = renderMetricsSection({ data: { system: {} }, error: null });
    expect(html).toContain("—");
  });
});

describe("renderDashboard", () => {
  it("returns error div for null data", () => {
    expect(renderDashboard(null)).toContain("unavailable");
  });

  it("renders all 4 sections", () => {
    const html = renderDashboard({
      scheduler: { data: { running: true, jobs: [] }, error: null },
      hookQueue: { data: { pendingCount: 0, maxPending: 1, saturated: false }, error: null },
      synapse: { data: { data: { sessions: [] } }, error: null },
      metrics: { data: { system: { uptime: 1 } }, error: null },
    });
    expect(html).toContain("Scheduler");
    expect(html).toContain("Hook Queue");
    expect(html).toContain("Synapse Sessions");
    expect(html).toContain("System Metrics");
  });

  it("defaults missing sections to unavailable", () => {
    const html = renderDashboard({});
    expect(html).toContain("unavailable");
  });
});
