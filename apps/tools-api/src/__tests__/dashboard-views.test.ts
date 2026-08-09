/**
 * Dashboard UI view tests — Wave 6 T28 / N28.
 *
 * Imports the pure renderers from dashboard.js (bun runs JS natively). Each
 * section is fed a deterministic fixture and the returned HTML is asserted to
 * contain expected fields. Covers unavailable/disabled states.
 */

import { describe, test, expect } from "bun:test";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const dash = require("../../../web-ui/src/static/dashboard.js") as {
  renderDashboard: (d: unknown) => string;
  renderSchedulerSection: (r: unknown) => string;
  renderHookQueueSection: (r: unknown) => string;
  renderSynapseSection: (r: unknown) => string;
  renderMetricsSection: (r: unknown) => string;
};

describe("dashboard views (T28)", () => {
  test("scheduler section renders jobs table when running", () => {
    const html = dash.renderSchedulerSection({
      data: {
        running: true,
        tickIntervalMs: 30000,
        jobs: [
          {
            id: "scheduled-memory-consolidation",
            name: "Memory Consolidation",
            jobKind: "memory-consolidation",
            enabled: true,
            nextRunAt: 1700000000000,
            lastRunAt: 1699999990000,
            due: true,
            currentlyRunning: false,
          },
        ],
      },
      error: null,
    });
    expect(html).toContain("Scheduler");
    expect(html).toContain("Memory Consolidation");
    expect(html).toContain("memory-consolidation");
    // APUX-11 (admin-portal-ux-overhaul T13): boolean cells render Title Case.
    expect(html).toContain("Yes");
  });

  test("scheduler section shows 'scheduler disabled' when no jobs + not running", () => {
    const html = dash.renderSchedulerSection({
      data: { running: false, tickIntervalMs: 0, jobs: [] },
      error: null,
    });
    expect(html).toContain("scheduler disabled");
  });

  test("scheduler section shows 'unavailable' on error", () => {
    const html = dash.renderSchedulerSection({ data: null, error: "connection refused" });
    expect(html).toContain("unavailable");
  });

  test("scheduler section shows 'unavailable' when data.unavailable=true", () => {
    const html = dash.renderSchedulerSection({
      data: { unavailable: true, error: "subsystem offline" },
      error: null,
    });
    expect(html).toContain("unavailable");
  });

  test("hook queue section renders pending + saturated", () => {
    const html = dash.renderHookQueueSection({
      data: { pendingCount: 5, maxPending: 256, saturated: false },
      error: null,
    });
    expect(html).toContain("Pending");
    // APUX-11 (T13): counts render as one stat-card value, booleans Title Case.
    expect(html).toContain("5 / 256");
    expect(html).toContain('<div class="stat-card"><div class="stat-label">Saturated</div><div class="stat-value">No</div></div>');
  });

  test("hook queue section shows 'unavailable' on error", () => {
    const html = dash.renderHookQueueSection({ data: null, error: "boom" });
    expect(html).toContain("unavailable");
  });

  test("synapse section renders sessions table", () => {
    const html = dash.renderSynapseSection({
      data: {
        data: {
          sessions: [
            {
              sessionId: "syn_abc",
              agentId: "implementer",
              workspaceId: "proj-1",
              taskContext: "fix bug",
              expiresAt: 1700000100000,
            },
          ],
        },
      },
      error: null,
    });
    expect(html).toContain("syn_abc");
    expect(html).toContain("implementer");
    expect(html).toContain("fix bug");
  });

  test("synapse section shows 'No active sessions' when empty", () => {
    const html = dash.renderSynapseSection({
      data: { data: { sessions: [] } },
      error: null,
    });
    expect(html).toContain("No active sessions");
  });

  test("synapse section shows 'unavailable' on error", () => {
    const html = dash.renderSynapseSection({ data: null, error: "refused" });
    expect(html).toContain("unavailable");
  });

  test("metrics section renders uptime + memory", () => {
    const html = dash.renderMetricsSection({
      data: {
        system: {
          uptime: 3600,
          databaseSize: "1.2 GB",
          memory: { heapUsed: "50MB", heapTotal: "100MB", rss: "150MB" },
        },
      },
      error: null,
    });
    // APUX-11 (T13): numbers render via toLocaleString("en-US") in stat cards.
    expect(html).toContain("3,600s");
    expect(html).toContain("1.2 GB");
    expect(html).toContain("50MB");
  });

  test("metrics section shows 'unavailable' on error", () => {
    const html = dash.renderMetricsSection({ data: null, error: "err" });
    expect(html).toContain("unavailable");
  });

  test("renderDashboard assembles all sections", () => {
    const html = dash.renderDashboard({
      scheduler: { data: { running: true, tickIntervalMs: 30000, jobs: [] }, error: null },
      hookQueue: { data: { pendingCount: 0, maxPending: 256, saturated: false }, error: null },
      synapse: { data: { data: { sessions: [] } }, error: null },
      metrics: { data: { system: { uptime: 60 } }, error: null },
    });
    expect(html).toContain("Scheduler");
    expect(html).toContain("Hook Queue");
    expect(html).toContain("Synapse Sessions");
    expect(html).toContain("System Metrics");
  });

  test("renderDashboard handles all sections unavailable", () => {
    const html = dash.renderDashboard({
      scheduler: { data: null, error: "x" },
      hookQueue: { data: null, error: "x" },
      synapse: { data: null, error: "x" },
      metrics: { data: null, error: "x" },
    });
    expect(html).toContain("unavailable");
  });
});