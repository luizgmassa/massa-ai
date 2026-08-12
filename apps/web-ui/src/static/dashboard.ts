/**
 * massa-ai Web UI — dashboard.ts (N28 observability).
 *
 * Read-only dashboard rendering: fetches scheduler status, hook queue,
 * Synapse sessions, and system metrics. Renders sections into HTML.
 *
 * READ-ONLY: no write operations. Degrades gracefully when endpoints are
 * unavailable (shows "unavailable" instead of crashing).
 *
 * Pure renderers are exported for unit testing (same pattern as app.js).
 */

// ── Dashboard data fetcher ──────────────────────────────────────────────────

interface DashboardApi {
  request: (path: string) => Promise<unknown>;
}

/** Loosely typed section envelope — `data` stays `unknown` here and is
 *  narrowed inside each section renderer, mirroring `views/proposals.ts`'s
 *  `payload = data.data || (data as unknown as ProposalsPayload)` convention. */
interface DashboardSectionResult {
  data?: unknown;
  error?: string | null;
}

interface DashboardData {
  scheduler: DashboardSectionResult;
  hookQueue: DashboardSectionResult;
  synapse: DashboardSectionResult;
  metrics: DashboardSectionResult;
}

/**
 * Fetch all dashboard sections in parallel. Each section is independent:
 * if one fails, the others still render. Returns an object with per-section
 * { data, error } pairs.
 */
export async function fetchDashboardData(api: DashboardApi): Promise<DashboardData> {
  const [scheduler, hookQueue, synapse, metrics] = await Promise.allSettled([
    api.request("/api/v1/scheduler/status"),
    api.request("/api/v1/hooks/queue-status"),
    api.request("/api/v1/synapse/sessions"),
    api.request("/api/v1/system/metrics"),
  ]);

  function unwrap(result: PromiseSettledResult<unknown>): DashboardSectionResult {
    if (result.status === "fulfilled") return { data: result.value, error: null };
    return { data: null, error: String(result.reason?.message || result.reason || "unavailable") };
  }

  return {
    scheduler: unwrap(scheduler),
    hookQueue: unwrap(hookQueue),
    synapse: unwrap(synapse),
    metrics: unwrap(metrics),
  };
}

// ── Section renderers ───────────────────────────────────────────────────────

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === 0) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function fmtBool(b: unknown): string {
  return b ? "Yes" : "No";
}

/**
 * Format a number for display (T13, APUX-11): locale thousands separators
 * via toLocaleString("en-US") (fixed locale keeps tests deterministic), an
 * optional unit suffix, and an em-dash for missing/non-numeric values so a
 * raw `undefined`/`NaN` never reaches the DOM.
 */
function fmtNum(n: number | string | null | undefined, suffix = ""): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return escapeHtml(String(n));
  return `${num.toLocaleString("en-US")}${suffix}`;
}

/** Render a single labeled stat card (D-6 `.stat-card` grid). `value` is
 * pre-built HTML (caller is responsible for escaping/wrapping in `<code>`). */
function statCard(label: string, value: string): string {
  return `<div class="stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${value}</div></div>`;
}

function statGrid(cards: string[]): string {
  return `<div class="stat-grid">${cards.join("")}</div>`;
}

interface SchedulerJob {
  id?: string;
  name?: string;
  jobKind?: string;
  enabled?: boolean;
  nextRunAt?: number | string | null;
  lastRunAt?: number | string | null;
  due?: boolean;
  currentlyRunning?: boolean;
}

interface SchedulerData {
  unavailable?: boolean;
  running?: boolean;
  tickIntervalMs?: number | string;
  jobs?: SchedulerJob[];
}

export function renderSchedulerSection(result: DashboardSectionResult): string {
  if (result.error) {
    return '<section class="dashboard-section"><h2>Scheduler</h2><p class="muted">unavailable</p></section>';
  }
  const d = result.data as SchedulerData | null | undefined;
  if (!d || d.unavailable) {
    return '<section class="dashboard-section"><h2>Scheduler</h2><p class="muted">unavailable</p></section>';
  }
  if (!d.running && (!d.jobs || d.jobs.length === 0)) {
    return '<section class="dashboard-section"><h2>Scheduler</h2><p class="muted">scheduler disabled</p></section>';
  }
  const jobs = (d.jobs || []).map((j) => {
    return `<tr>
      <td><code>${escapeHtml(j.id)}</code></td>
      <td>${escapeHtml(j.name)}</td>
      <td>${escapeHtml(j.jobKind)}</td>
      <td>${fmtBool(j.enabled)}</td>
      <td>${fmtTime(j.nextRunAt)}</td>
      <td>${fmtTime(j.lastRunAt)}</td>
      <td>${fmtBool(j.due)}</td>
      <td>${fmtBool(j.currentlyRunning)}</td>
    </tr>`;
  }).join("");
  const cards = statGrid([
    statCard("Running", fmtBool(d.running)),
    statCard("Tick Interval", fmtNum(d.tickIntervalMs, " ms")),
  ]);
  return `<section class="dashboard-section">
    <h2>Scheduler</h2>
    ${cards}
    <table class="dashboard-table">
      <thead><tr><th>ID</th><th>Name</th><th>Kind</th><th>Enabled</th><th>Next Run</th><th>Last Run</th><th>Due</th><th>Running</th></tr></thead>
      <tbody>${jobs}</tbody>
    </table>
  </section>`;
}

interface HookQueueData {
  unavailable?: boolean;
  pendingCount?: number;
  maxPending?: number;
  saturated?: boolean;
}

export function renderHookQueueSection(result: DashboardSectionResult): string {
  if (result.error) {
    return '<section class="dashboard-section"><h2>Hook Queue</h2><p class="muted">unavailable</p></section>';
  }
  const d = result.data as HookQueueData | null | undefined;
  if (!d || d.unavailable) {
    return '<section class="dashboard-section"><h2>Hook Queue</h2><p class="muted">unavailable</p></section>';
  }
  // Number(...) reproduces the original untyped `>`/`/` implicit coercion of a
  // possibly-undefined operand exactly (both coerce via ToNumber), so this is
  // not a behaviour change — just what strict mode requires to type-check it.
  const maxPending = Number(d.maxPending);
  const pendingCount = Number(d.pendingCount);
  const pct = maxPending > 0 ? Math.round((pendingCount / maxPending) * 100) : 0;
  const cards = statGrid([
    statCard("Pending", `${fmtNum(d.pendingCount)} / ${fmtNum(d.maxPending)} (${pct}%)`),
    statCard("Saturated", fmtBool(d.saturated)),
  ]);
  return `<section class="dashboard-section">
    <h2>Hook Queue</h2>
    ${cards}
  </section>`;
}

interface SynapseSession {
  sessionId?: string;
  agentId?: string;
  workspaceId?: string;
  taskContext?: string;
  expiresAt?: number | string | null;
}

interface SynapsePayload {
  sessions?: SynapseSession[];
}

interface SynapseData {
  unavailable?: boolean;
  data?: SynapsePayload;
  sessions?: SynapseSession[];
}

export function renderSynapseSection(result: DashboardSectionResult): string {
  if (result.error) {
    return '<section class="dashboard-section"><h2>Synapse Sessions</h2><p class="muted">unavailable</p></section>';
  }
  const d = result.data as SynapseData | null | undefined;
  if (!d || d.unavailable) {
    return '<section class="dashboard-section"><h2>Synapse Sessions</h2><p class="muted">unavailable</p></section>';
  }
  const sessions = d.data?.sessions || d.sessions || [];
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return '<section class="dashboard-section"><h2>Synapse Sessions</h2><p class="muted">No active sessions</p></section>';
  }
  const rows = sessions.map((s) => {
    const workspace = s.workspaceId ? `<code>${escapeHtml(s.workspaceId)}</code>` : "—";
    return `<tr>
      <td><code>${escapeHtml(s.sessionId)}</code></td>
      <td><code>${escapeHtml(s.agentId)}</code></td>
      <td>${workspace}</td>
      <td>${escapeHtml(s.taskContext || "—")}</td>
      <td>${fmtTime(s.expiresAt)}</td>
    </tr>`;
  }).join("");
  return `<section class="dashboard-section">
    <h2>Synapse Sessions (${sessions.length})</h2>
    <table class="dashboard-table">
      <thead><tr><th>Session ID</th><th>Agent</th><th>Workspace</th><th>Task</th><th>Expires</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

interface MetricsMemory {
  heapUsed?: number | string;
  heapTotal?: number | string;
  rss?: number | string;
}

interface MetricsSystem {
  uptime?: number | string;
  databaseSize?: string;
  memory?: MetricsMemory;
}

interface MetricsData {
  system?: MetricsSystem;
}

export function renderMetricsSection(result: DashboardSectionResult): string {
  if (result.error) {
    return '<section class="dashboard-section"><h2>System Metrics</h2><p class="muted">unavailable</p></section>';
  }
  const d = result.data as MetricsData | null | undefined;
  if (!d) {
    return '<section class="dashboard-section"><h2>System Metrics</h2><p class="muted">unavailable</p></section>';
  }
  const sys = d.system || {};
  const mem = sys.memory || {};
  const cards = statGrid([
    statCard("Uptime", fmtNum(sys.uptime, "s")),
    statCard("DB Size", escapeHtml(sys.databaseSize || "—")),
    statCard("Heap Used", fmtNum(mem.heapUsed)),
    statCard("Heap Total", fmtNum(mem.heapTotal)),
    statCard("RSS", fmtNum(mem.rss)),
  ]);
  return `<section class="dashboard-section">
    <h2>System Metrics</h2>
    ${cards}
  </section>`;
}

/** T14, APUX-10: "About this tab" help card — the Dashboard is read-only, so
 *  this is a short orientation note rather than a field-by-field guide. */
const DASHBOARD_HELP_CARD =
  '<details class="help-card"><summary>About this tab</summary>' +
  '<div class="help-card-body">' +
  '<p>A read-only snapshot of the scheduler, hook queue, Synapse sessions, and system metrics. Nothing on this tab can be edited — reload the page to see the latest values.</p>' +
  '</div>' +
  '</details>';

/**
 * Top-level dashboard renderer. Takes the fetched data object and returns
 * an HTML string with all sections. Pure function (no DOM, no fetch).
 */
export function renderDashboard(data: Partial<DashboardData> | null | undefined): string {
  if (!data) return '<div class="error">Dashboard data unavailable</div>';
  return [
    '<div class="dashboard">',
    renderSchedulerSection(data.scheduler || { error: "no data" }),
    renderHookQueueSection(data.hookQueue || { error: "no data" }),
    renderSynapseSection(data.synapse || { error: "no data" }),
    renderMetricsSection(data.metrics || { error: "no data" }),
    DASHBOARD_HELP_CARD,
    '</div>',
  ].join("\n");
}
