/**
 * Unit tests for the per-tab write handlers.
 *
 * These handlers used to be closures inside `startApp`, capturing `api`,
 * `root`, `state` and `render` from its scope. Nothing could reach them without
 * standing up a fake-DOM `startApp` harness, so almost none of them were
 * covered: the create/edit/delete paths for memory, handoffs, checkpoints and
 * projects measured 46% as a block, and the index-status poll measured 12.5%.
 *
 * Splitting app.js turned them into `ctx`-taking module functions — the shape
 * `app.js` already documented for the admin-portal handlers and for the same
 * stated reason ("this avoids a startApp DOM harness for handler tests"). This
 * file is that reason cashed in.
 *
 * Globals: these handlers call the browser's `alert`/`prompt`, which do not
 * exist under bun:test. Every stub is installed and removed inside the test
 * that needs it — Bun runs all test files in one process, so a leaked global
 * would surface as a failure in an unrelated suite.
 */

import { describe, it, expect, mock } from "bun:test";

import { collectFormData } from "../static/lib/forms.js";
import {
  handleProjectIndex,
  handleProjectReset,
  clearIndexPoll,
  startIndexPoll,
  handleIndexStatusEvent,
} from "../static/views/projects.js";
import { handleMemoryEdit, handleMemoryDelete, handleMemoryCreate } from "../static/views/memory.js";
import {
  handleHandoffCreate,
  handleHandoffAction,
  handleHandoffEdit,
  handleHandoffDelete,
} from "../static/views/handoffs.js";
import {
  handleProposalAction,
  handleProposalCreate,
  handleProposalEdit,
  handleProposalDelete,
} from "../static/views/proposals.js";
import { handleCheckpointCreate, handleCheckpointDelete } from "../static/views/checkpoints.js";

// ── Harness ─────────────────────────────────────────────────────────────────

type El = { dataset: Record<string, string>; type: string; value: string; checked?: boolean };

function field(create: string, form: string, value = "", type = "text", checked?: boolean): El {
  return { dataset: { create, form }, type, value, checked };
}

/** Root whose `querySelectorAll` understands the one selector shape
 *  `collectFormData` uses: `[data-form="<name>"]`. */
function makeRoot(fields: El[] = []) {
  return {
    innerHTML: "",
    querySelectorAll: (sel: string) => {
      const m = /data-form="([^"]+)"/.exec(sel);
      return m ? fields.filter((f) => f.dataset.form === m[1]) : [];
    },
    querySelector: () => null,
    insertBefore: (n: unknown) => n,
    children: [] as unknown[],
    firstChild: null,
  };
}

function makeCtx(opts: { fields?: El[]; request?: unknown; state?: Record<string, unknown> } = {}) {
  const request = opts.request ?? mock(async () => ({ success: true, data: {} }));
  return {
    root: makeRoot(opts.fields),
    state: opts.state ?? {},
    api: { request, authHeaders: () => ({}) },
    render: mock(() => {}),
    doc: null,
  } as any;
}

/** Installs `alert`/`prompt` stubs for one test and always removes them. */
async function withGlobals<T>(
  stubs: { alert?: (m: string) => void; prompt?: () => string | null },
  fn: (alerts: string[]) => Promise<T> | T,
): Promise<T> {
  const g = globalThis as any;
  const hadAlert = "alert" in g;
  const hadPrompt = "prompt" in g;
  const priorAlert = g.alert;
  const priorPrompt = g.prompt;
  const alerts: string[] = [];
  g.alert = stubs.alert ?? ((m: string) => alerts.push(String(m)));
  if (stubs.prompt) g.prompt = stubs.prompt;
  try {
    return await fn(alerts);
  } finally {
    if (hadAlert) g.alert = priorAlert;
    else delete g.alert;
    if (stubs.prompt) {
      if (hadPrompt) g.prompt = priorPrompt;
      else delete g.prompt;
    }
  }
}

/** Replaces the interval globals so the poll loop is driven by hand rather than
 *  by wall clock. Returns the captured tick callback. */
async function withFakeInterval<T>(
  fn: (ctl: { tick: () => Promise<void>; cleared: () => number; handle: () => unknown }) => Promise<T>,
): Promise<T> {
  const g = globalThis as any;
  const priorSet = g.setInterval;
  const priorClear = g.clearInterval;
  let cb: (() => Promise<void>) | null = null;
  let cleared = 0;
  let handle: unknown = null;
  g.setInterval = (fnArg: () => Promise<void>) => {
    cb = fnArg;
    handle = { id: 1 };
    return handle;
  };
  g.clearInterval = () => { cleared++; };
  try {
    return await fn({
      tick: async () => { if (cb) await cb(); },
      cleared: () => cleared,
      handle: () => handle,
    });
  } finally {
    g.setInterval = priorSet;
    g.clearInterval = priorClear;
  }
}

const throwingRequest = () => mock(async () => { throw new Error("boom"); });

// ── collectFormData ─────────────────────────────────────────────────────────

describe("collectFormData — type coercion per input kind", () => {
  it("reads text, coerces checkbox to boolean and number to Number", () => {
    const root = makeRoot([
      field("name", "f", "n"),
      field("flag", "f", "", "checkbox", true),
      field("count", "f", "7", "number"),
    ]);
    expect(collectFormData(root, "f")).toEqual({ name: "n", flag: true, count: 7 });
  });

  it("an empty number field is absent, not 0 — the route must see no value at all", () => {
    const root = makeRoot([field("count", "f", "", "number")]);
    const out = collectFormData(root, "f") as Record<string, unknown>;
    expect(out.count).toBeUndefined();
    expect("count" in out).toBe(true);
    expect(out.count === 0).toBe(false);
  });

  it("an unchecked checkbox is false, not absent", () => {
    const root = makeRoot([field("flag", "f", "", "checkbox", false)]);
    expect(collectFormData(root, "f")).toEqual({ flag: false });
  });

  it("skips elements with no data-create key", () => {
    const el = field("", "f", "x");
    el.dataset.create = "";
    expect(collectFormData(makeRoot([el]), "f")).toEqual({});
  });

  it("reads only the named form's fields", () => {
    const root = makeRoot([field("a", "one", "1"), field("b", "two", "2")]);
    expect(collectFormData(root, "one")).toEqual({ a: "1" });
  });
});

// ── Memory ──────────────────────────────────────────────────────────────────

describe("handleMemoryEdit", () => {
  // Was: `PUT /api/v1/memory/m%201`, which no route ever served — this test
  // asserted the defect and passed anyway, because `ctx.api.request` is a mock
  // and accepts any URL string. That is exactly how the dead call path survived
  // review; `route-contract.test.ts` is the sensor that can actually see it.
  // The id keeps its space: body-keyed, it must arrive UNENCODED, where the
  // path-parameter form had to percent-encode it.
  it("POSTs the prompted content to /memory/update and re-renders", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => "new body" }, () => handleMemoryEdit(ctx, "m 1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/memory/update", {
      method: "POST",
      body: { id: "m 1", content: "new body" },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("a cancelled prompt issues no request at all", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => null }, () => handleMemoryEdit(ctx, "m1"));
    expect(ctx.api.request).not.toHaveBeenCalled();
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("an empty string is a real edit, not a cancel", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => "" }, () => handleMemoryEdit(ctx, "m1"));
    expect(ctx.api.request).toHaveBeenCalled();
  });

  it("alerts and does not re-render when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    const alerts = await withGlobals({ prompt: () => "x" }, async (a) => {
      await handleMemoryEdit(ctx, "m1");
      return a;
    });
    expect(alerts).toEqual(["Edit failed: boom"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });
});

describe("handleMemoryDelete", () => {
  // Was: `DELETE /api/v1/memory/a%2Fb`, a route that never existed — see the
  // note on handleMemoryEdit above. The `a/b` id is deliberate: a slash in a
  // path parameter is the case percent-encoding exists for, and body-keyed it
  // must survive verbatim instead.
  it("POSTs the id to /memory/delete and re-renders", async () => {
    const ctx = makeCtx();
    await withGlobals({}, () => handleMemoryDelete(ctx, "a/b"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/memory/delete", {
      method: "POST",
      body: { id: "a/b" },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    const alerts = await withGlobals({}, async (a) => { await handleMemoryDelete(ctx, "m1"); return a; });
    expect(alerts).toEqual(["Delete failed: boom"]);
  });
});

describe("handleMemoryCreate", () => {
  it("posts content, splits tags and forwards projectId", async () => {
    const ctx = makeCtx({
      fields: [
        field("content", "memory-create", "hello"),
        field("type", "memory-create", "decision"),
        field("importance", "memory-create", "0.8", "number"),
        field("tags", "memory-create", "a, b ,, c"),
        field("projectId", "memory-create", "p1"),
      ],
    });
    await withGlobals({}, () => handleMemoryCreate(ctx));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/memory/store", {
      method: "POST",
      body: { content: "hello", type: "decision", importance: 0.8, tags: ["a", "b", "c"], projectId: "p1" },
    });
  });

  it("defaults type to conversation and importance to 0.5", async () => {
    const ctx = makeCtx({ fields: [field("content", "memory-create", "x")] });
    await withGlobals({}, () => handleMemoryCreate(ctx));
    const body = (ctx.api.request as any).mock.calls[0][1].body;
    expect(body.type).toBe("conversation");
    expect(body.importance).toBe(0.5);
    expect(body.tags).toBeUndefined();
  });

  it("refuses empty content before issuing a request", async () => {
    const ctx = makeCtx({ fields: [field("content", "memory-create", "")] });
    const alerts = await withGlobals({}, async (a) => { await handleMemoryCreate(ctx); return a; });
    expect(alerts).toEqual(["Content is required."]);
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  it("refuses an out-of-range importance at both ends", async () => {
    for (const v of ["-0.1", "1.5"]) {
      const ctx = makeCtx({
        fields: [field("content", "memory-create", "x"), field("importance", "memory-create", v, "number")],
      });
      const alerts = await withGlobals({}, async (a) => { await handleMemoryCreate(ctx); return a; });
      expect(alerts).toEqual(["Importance must be between 0 and 1."]);
      expect(ctx.api.request).not.toHaveBeenCalled();
    }
  });

  it("accepts the exact boundaries 0 and 1", async () => {
    for (const v of ["0", "1"]) {
      const ctx = makeCtx({
        fields: [field("content", "memory-create", "x"), field("importance", "memory-create", v, "number")],
      });
      await withGlobals({}, () => handleMemoryCreate(ctx));
      expect(ctx.api.request).toHaveBeenCalled();
    }
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ fields: [field("content", "memory-create", "x")], request: throwingRequest() });
    const alerts = await withGlobals({}, async (a) => { await handleMemoryCreate(ctx); return a; });
    expect(alerts).toEqual(["Create failed: boom"]);
  });
});

// ── Handoffs ────────────────────────────────────────────────────────────────

describe("handleHandoffCreate", () => {
  it("posts the required pair and comma-splits the three list fields", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "handoff-create", "p1"),
        field("summary", "handoff-create", "s"),
        field("targetAgent", "handoff-create", "builder"),
        field("openQuestions", "handoff-create", "q1, q2"),
        field("nextSteps", "handoff-create", " n1 ,, n2 "),
        field("files", "handoff-create", "a.ts"),
      ],
    });
    await withGlobals({}, () => handleHandoffCreate(ctx));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/handoff/begin", {
      method: "POST",
      body: {
        projectId: "p1",
        summary: "s",
        targetAgent: "builder",
        openQuestions: ["q1", "q2"],
        nextSteps: ["n1", "n2"],
        files: ["a.ts"],
      },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("omits every optional field when blank", async () => {
    const ctx = makeCtx({
      fields: [field("projectId", "handoff-create", "p1"), field("summary", "handoff-create", "s")],
    });
    await withGlobals({}, () => handleHandoffCreate(ctx));
    expect((ctx.api.request as any).mock.calls[0][1].body).toEqual({ projectId: "p1", summary: "s" });
  });

  it("refuses a missing projectId, then a missing summary", async () => {
    const noProject = makeCtx({ fields: [field("summary", "handoff-create", "s")] });
    expect(await withGlobals({}, async (a) => { await handleHandoffCreate(noProject); return a; }))
      .toEqual(["Project ID is required."]);
    expect(noProject.api.request).not.toHaveBeenCalled();

    const noSummary = makeCtx({ fields: [field("projectId", "handoff-create", "p1")] });
    expect(await withGlobals({}, async (a) => { await handleHandoffCreate(noSummary); return a; }))
      .toEqual(["Summary is required."]);
    expect(noSummary.api.request).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({
      fields: [field("projectId", "handoff-create", "p"), field("summary", "handoff-create", "s")],
      request: throwingRequest(),
    });
    expect(await withGlobals({}, async (a) => { await handleHandoffCreate(ctx); return a; }))
      .toEqual(["Create failed: boom"]);
  });
});

describe("handleHandoffAction", () => {
  it("routes accept and cancel to their own path segments", async () => {
    for (const action of ["accept", "cancel"]) {
      const ctx = makeCtx();
      await withGlobals({}, () => handleHandoffAction(ctx, "h1", action));
      expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/handoff/" + action, {
        method: "POST",
        body: { id: "h1" },
      });
    }
  });

  it("names the failing action in the alert", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleHandoffAction(ctx, "h1", "cancel"); return a; }))
      .toEqual(["cancel failed: boom"]);
  });
});

// T12 (HPC-01, AC-01.1/.2): the PATCH body must be exactly the allowlisted
// field(s) the user edited — nothing extra. `toHaveBeenCalledWith` does a
// deep-equal on the `body`, so a mutant that slips in a rejected field like
// `status` (which the route's own allowlist would 400 on, AC-01.2) turns
// this red. RED proof recorded manually: adding `body.status = "x"` inside
// `handleHandoffEdit` before sending the request fails this exact test with
// a body-mismatch diff, restored immediately after observing the failure.
describe("handleHandoffEdit", () => {
  it("does nothing when the edit prompt is cancelled", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => null }, () => handleHandoffEdit(ctx, "h1"));
    expect(ctx.api.request).not.toHaveBeenCalled();
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("PATCHes only the summary field the user typed, then re-renders", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => "revised summary" }, () => handleHandoffEdit(ctx, "h1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/handoff/h1", {
      method: "PATCH",
      body: { summary: "revised summary" },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("encodes the id in the URL path", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => "x" }, () => handleHandoffEdit(ctx, "h/1"));
    expect((ctx.api.request as any).mock.calls[0][0]).toBe("/api/v1/handoff/h%2F1");
  });

  // Edge Cases: a 403 from the write-mode gate resolves (not throws) as
  // `{success:false, error:"Write refused: read-only mode is active"}` —
  // `api.request()` only throws on transport failure, never on HTTP status.
  // Without checking `res.error`, this would be a silent no-op.
  it("surfaces a write-gate 403 as a visible alert and does not re-render", async () => {
    const ctx = makeCtx({
      request: mock(async () => ({ success: false, error: "Write refused: read-only mode is active" })),
    });
    const alerts = await withGlobals({ prompt: () => "x" }, async (a) => {
      await handleHandoffEdit(ctx, "h1");
      return a;
    });
    expect(alerts).toEqual(["Edit failed: Write refused: read-only mode is active"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  // The route's own 400/404 domain rejections carry `{status, error}` with
  // no `success` key at all — a different shape from the write-gate's
  // `{success:false, error}`, and both must be caught by the same check.
  it("surfaces a route-level 404 (no success key) as a visible alert", async () => {
    const ctx = makeCtx({ request: mock(async () => ({ status: 404, error: "not-found" })) });
    const alerts = await withGlobals({ prompt: () => "x" }, async (a) => {
      await handleHandoffEdit(ctx, "h1");
      return a;
    });
    expect(alerts).toEqual(["Edit failed: not-found"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({ prompt: () => "x" }, async (a) => { await handleHandoffEdit(ctx, "h1"); return a; }))
      .toEqual(["Edit failed: boom"]);
  });
});

describe("handleHandoffDelete", () => {
  it("DELETEs the handoff and re-renders on success", async () => {
    const ctx = makeCtx();
    await withGlobals({}, () => handleHandoffDelete(ctx, "h1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/handoff/h1", { method: "DELETE" });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("surfaces a write-gate 403 as a visible alert and does not re-render", async () => {
    const ctx = makeCtx({
      request: mock(async () => ({ success: false, error: "Write refused: read-only mode is active" })),
    });
    const alerts = await withGlobals({}, async (a) => {
      await handleHandoffDelete(ctx, "h1");
      return a;
    });
    expect(alerts).toEqual(["Delete failed: Write refused: read-only mode is active"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleHandoffDelete(ctx, "h1"); return a; }))
      .toEqual(["Delete failed: boom"]);
  });
});

// ── Proposals ───────────────────────────────────────────────────────────────

describe("handleProposalAction", () => {
  it("routes approve and reject to their own path segments", async () => {
    for (const action of ["approve", "reject"]) {
      const ctx = makeCtx();
      await withGlobals({}, () => handleProposalAction(ctx, "p1", action));
      expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/proposal/" + action, {
        method: "POST",
        body: { id: "p1" },
      });
      expect(ctx.render).toHaveBeenCalled();
    }
  });

  it("names the failing action in the alert", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleProposalAction(ctx, "p1", "approve"); return a; }))
      .toEqual(["approve failed: boom"]);
  });
});

// T13 (HPC-02, AC-02.1/.2): `kind` must be one of exactly memory.create /
// memory.update / memory.tag, validated client-side before any request goes
// out. RED proof recorded manually: removing the `isValidProposalKind` guard
// (or its call) inside `handleProposalCreate` lets an illegal kind reach
// `ctx.api.request`, which turns "refuses a kind outside the allowed three"
// below red — it asserts BOTH the alert text and that no request fired.
// Restored immediately after observing the failure.
describe("handleProposalCreate", () => {
  it("posts kind/payload and the optional rationale/targetMemoryId when present", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.create"),
        field("payload", "proposal-create", '{"content":"x"}'),
        field("rationale", "proposal-create", "why"),
        field("targetMemoryId", "proposal-create", "m1"),
      ],
    });
    await withGlobals({}, () => handleProposalCreate(ctx));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/proposal/create", {
      method: "POST",
      body: {
        projectId: "p1",
        kind: "memory.create",
        payload: { content: "x" },
        rationale: "why",
        targetMemoryId: "m1",
      },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("omits rationale and targetMemoryId when blank", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.tag"),
        field("payload", "proposal-create", "{}"),
      ],
    });
    await withGlobals({}, () => handleProposalCreate(ctx));
    expect((ctx.api.request as any).mock.calls[0][1].body).toEqual({
      projectId: "p1",
      kind: "memory.tag",
      payload: {},
    });
  });

  it("refuses a missing projectId before issuing a request", async () => {
    const ctx = makeCtx({
      fields: [field("kind", "proposal-create", "memory.create"), field("payload", "proposal-create", "{}")],
    });
    expect(await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; }))
      .toEqual(["Project ID is required."]);
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  it("refuses a blank kind before issuing a request", async () => {
    const ctx = makeCtx({
      fields: [field("projectId", "proposal-create", "p1"), field("payload", "proposal-create", "{}")],
    });
    const alerts = await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; });
    expect(alerts).toEqual(["kind must be one of memory.create, memory.update, memory.tag"]);
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  // The RED proof this suite requires: an illegal kind must never reach the
  // network. This test fails (not just alerts differently) if the client-side
  // check is removed, because `ctx.api.request` would then be called.
  it("refuses a kind outside the allowed three, without issuing a request", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.delete"),
        field("payload", "proposal-create", "{}"),
      ],
    });
    const alerts = await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; });
    expect(alerts).toEqual(["kind must be one of memory.create, memory.update, memory.tag"]);
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  it("refuses an empty payload before issuing a request", async () => {
    const ctx = makeCtx({
      fields: [field("projectId", "proposal-create", "p1"), field("kind", "proposal-create", "memory.create")],
    });
    const alerts = await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; });
    expect(alerts).toEqual(["Payload is required."]);
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  it("refuses payload text that is not valid JSON, without issuing a request", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.create"),
        field("payload", "proposal-create", "{not json"),
      ],
    });
    const alerts = await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; });
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain("Payload is not valid JSON");
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  // Edge Cases: a 403 from the write-mode gate resolves (not throws) — same
  // shape as handleHandoffEdit/Delete's check above.
  it("surfaces a write-gate 403 as a visible alert and does not re-render", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.create"),
        field("payload", "proposal-create", "{}"),
      ],
      request: mock(async () => ({ success: false, error: "Write refused: read-only mode is active" })),
    });
    const alerts = await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; });
    expect(alerts).toEqual(["Create failed: Write refused: read-only mode is active"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("surfaces a route-level 400 (no success key) as a visible alert", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.create"),
        field("payload", "proposal-create", "{}"),
      ],
      request: mock(async () => ({ status: 400, error: "payload does not match kind" })),
    });
    const alerts = await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; });
    expect(alerts).toEqual(["Create failed: payload does not match kind"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectId", "proposal-create", "p1"),
        field("kind", "proposal-create", "memory.create"),
        field("payload", "proposal-create", "{}"),
      ],
      request: throwingRequest(),
    });
    expect(await withGlobals({}, async (a) => { await handleProposalCreate(ctx); return a; }))
      .toEqual(["Create failed: boom"]);
  });
});

describe("handleProposalEdit", () => {
  it("does nothing when the edit prompt is cancelled", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => null }, () => handleProposalEdit(ctx, "p1"));
    expect(ctx.api.request).not.toHaveBeenCalled();
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("PATCHes only the rationale field the user typed, then re-renders", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => "revised rationale" }, () => handleProposalEdit(ctx, "p1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/proposal/p1", {
      method: "PATCH",
      body: { rationale: "revised rationale" },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("encodes the id in the URL path", async () => {
    const ctx = makeCtx();
    await withGlobals({ prompt: () => "x" }, () => handleProposalEdit(ctx, "p/1"));
    expect((ctx.api.request as any).mock.calls[0][0]).toBe("/api/v1/proposal/p%2F1");
  });

  it("surfaces a write-gate 403 as a visible alert and does not re-render", async () => {
    const ctx = makeCtx({
      request: mock(async () => ({ success: false, error: "Write refused: read-only mode is active" })),
    });
    const alerts = await withGlobals({ prompt: () => "x" }, async (a) => {
      await handleProposalEdit(ctx, "p1");
      return a;
    });
    expect(alerts).toEqual(["Edit failed: Write refused: read-only mode is active"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("surfaces a route-level 404 (no success key) as a visible alert", async () => {
    const ctx = makeCtx({ request: mock(async () => ({ status: 404, error: "not-found" })) });
    const alerts = await withGlobals({ prompt: () => "x" }, async (a) => {
      await handleProposalEdit(ctx, "p1");
      return a;
    });
    expect(alerts).toEqual(["Edit failed: not-found"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({ prompt: () => "x" }, async (a) => { await handleProposalEdit(ctx, "p1"); return a; }))
      .toEqual(["Edit failed: boom"]);
  });
});

describe("handleProposalDelete", () => {
  it("DELETEs the proposal and re-renders on success", async () => {
    const ctx = makeCtx();
    await withGlobals({}, () => handleProposalDelete(ctx, "p1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/proposal/p1", { method: "DELETE" });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("surfaces a write-gate 403 as a visible alert and does not re-render", async () => {
    const ctx = makeCtx({
      request: mock(async () => ({ success: false, error: "Write refused: read-only mode is active" })),
    });
    const alerts = await withGlobals({}, async (a) => {
      await handleProposalDelete(ctx, "p1");
      return a;
    });
    expect(alerts).toEqual(["Delete failed: Write refused: read-only mode is active"]);
    expect(ctx.render).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleProposalDelete(ctx, "p1"); return a; }))
      .toEqual(["Delete failed: boom"]);
  });
});

// ── Checkpoints ─────────────────────────────────────────────────────────────

describe("handleCheckpointCreate", () => {
  it("posts every supplied field with its coerced type", async () => {
    const ctx = makeCtx({
      fields: [
        field("taskId", "checkpoint-create", "t1"),
        field("description", "checkpoint-create", "d"),
        field("status", "checkpoint-create", "in_progress"),
        field("checkpointType", "checkpoint-create", "milestone"),
        field("progressPercent", "checkpoint-create", "40", "number"),
        field("currentStep", "checkpoint-create", "s"),
        field("totalSteps", "checkpoint-create", "5", "number"),
        field("completedSteps", "checkpoint-create", "2", "number"),
      ],
    });
    await withGlobals({}, () => handleCheckpointCreate(ctx));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/checkpoints/create", {
      method: "POST",
      body: {
        taskId: "t1",
        description: "d",
        status: "in_progress",
        checkpointType: "milestone",
        progressPercent: 40,
        currentStep: "s",
        totalSteps: 5,
        completedSteps: 2,
      },
    });
  });

  it("defaults status and checkpointType, and omits absent numerics", async () => {
    const ctx = makeCtx({
      fields: [field("taskId", "checkpoint-create", "t1"), field("description", "checkpoint-create", "d")],
    });
    await withGlobals({}, () => handleCheckpointCreate(ctx));
    expect((ctx.api.request as any).mock.calls[0][1].body).toEqual({
      taskId: "t1",
      description: "d",
      status: "pending",
      checkpointType: "manual",
    });
  });

  it("forwards progressPercent 0 — it is a value, not an absence", async () => {
    const ctx = makeCtx({
      fields: [
        field("taskId", "checkpoint-create", "t1"),
        field("description", "checkpoint-create", "d"),
        field("progressPercent", "checkpoint-create", "0", "number"),
      ],
    });
    await withGlobals({}, () => handleCheckpointCreate(ctx));
    expect((ctx.api.request as any).mock.calls[0][1].body.progressPercent).toBe(0);
  });

  it("refuses a missing taskId, then a missing description", async () => {
    const noTask = makeCtx({ fields: [field("description", "checkpoint-create", "d")] });
    expect(await withGlobals({}, async (a) => { await handleCheckpointCreate(noTask); return a; }))
      .toEqual(["Task ID is required."]);
    expect(noTask.api.request).not.toHaveBeenCalled();

    const noDesc = makeCtx({ fields: [field("taskId", "checkpoint-create", "t")] });
    expect(await withGlobals({}, async (a) => { await handleCheckpointCreate(noDesc); return a; }))
      .toEqual(["Description is required."]);
    expect(noDesc.api.request).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({
      fields: [field("taskId", "checkpoint-create", "t"), field("description", "checkpoint-create", "d")],
      request: throwingRequest(),
    });
    expect(await withGlobals({}, async (a) => { await handleCheckpointCreate(ctx); return a; }))
      .toEqual(["Create failed: boom"]);
  });
});

describe("handleCheckpointDelete", () => {
  it("posts the id to the delete route and re-renders", async () => {
    const ctx = makeCtx();
    await withGlobals({}, () => handleCheckpointDelete(ctx, "c1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/checkpoints/delete", {
      method: "POST",
      body: { id: "c1" },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleCheckpointDelete(ctx, "c1"); return a; }))
      .toEqual(["Delete failed: boom"]);
  });
});

// ── Projects ────────────────────────────────────────────────────────────────

describe("handleProjectIndex", () => {
  it("posts the path and tracks the returned jobId", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectPath", "project-index", "/repo"),
        field("projectId", "project-index", "p1"),
        field("forceReindex", "project-index", "", "checkbox", true),
        field("warmCache", "project-index", "", "checkbox", true),
      ],
      request: mock(async () => ({ data: { jobId: "j9" } })),
    });
    await withGlobals({}, () => handleProjectIndex(ctx));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/project/index", {
      method: "POST",
      body: { projectPath: "/repo", projectId: "p1", forceReindex: true, warmCache: true },
    });
    expect(ctx.state.indexJobId).toBe("j9");
    expect(ctx.state.indexJobStatus).toBe("pending");
    expect(ctx.render).toHaveBeenCalled();
  });

  it("omits the two checkbox flags when unchecked, rather than sending false", async () => {
    const ctx = makeCtx({
      fields: [
        field("projectPath", "project-index", "/repo"),
        field("forceReindex", "project-index", "", "checkbox", false),
        field("warmCache", "project-index", "", "checkbox", false),
      ],
      request: mock(async () => ({ data: {} })),
    });
    await withGlobals({}, () => handleProjectIndex(ctx));
    expect((ctx.api.request as any).mock.calls[0][1].body).toEqual({ projectPath: "/repo" });
  });

  it("still re-renders when the response carries no jobId", async () => {
    const ctx = makeCtx({
      fields: [field("projectPath", "project-index", "/repo")],
      request: mock(async () => ({ data: {} })),
    });
    await withGlobals({}, () => handleProjectIndex(ctx));
    expect(ctx.render).toHaveBeenCalled();
    expect(ctx.state.indexJobId).toBeUndefined();
  });

  it("refuses an empty project path before issuing a request", async () => {
    const ctx = makeCtx({ fields: [field("projectPath", "project-index", "")] });
    expect(await withGlobals({}, async (a) => { await handleProjectIndex(ctx); return a; }))
      .toEqual(["Project path is required."]);
    expect(ctx.api.request).not.toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ fields: [field("projectPath", "project-index", "/r")], request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleProjectIndex(ctx); return a; }))
      .toEqual(["Index failed: boom"]);
  });
});

describe("handleProjectReset", () => {
  it("clears vectors, symbols and memories together", async () => {
    const ctx = makeCtx();
    await withGlobals({}, () => handleProjectReset(ctx, "p1"));
    expect(ctx.api.request).toHaveBeenCalledWith("/api/v1/project/reset", {
      method: "POST",
      body: { projectId: "p1", clearVectors: true, clearSymbols: true, clearMemories: true },
    });
    expect(ctx.render).toHaveBeenCalled();
  });

  it("alerts when the request throws", async () => {
    const ctx = makeCtx({ request: throwingRequest() });
    expect(await withGlobals({}, async (a) => { await handleProjectReset(ctx, "p1"); return a; }))
      .toEqual(["Reset failed: boom"]);
  });
});

describe("clearIndexPoll", () => {
  it("clears a live interval and nulls the handle", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({ state: { indexPollInterval: { id: 1 } } });
      clearIndexPoll(ctx);
      expect(ctl.cleared()).toBe(1);
      expect(ctx.state.indexPollInterval).toBeNull();
    });
  });

  it("is a no-op when no poll is running — every teardown path calls it blind", async () => {
    await withFakeInterval(async (ctl) => {
      clearIndexPoll(makeCtx({ state: {} }));
      expect(ctl.cleared()).toBe(0);
    });
  });
});

describe("startIndexPoll", () => {
  it("stores the interval handle and polls the job's status route", async () => {
    await withFakeInterval(async (ctl) => {
      const request = mock(async () => ({ data: { status: "running", phase: "embed", fileCount: 12 } }));
      const ctx = makeCtx({ request, state: { view: "projects" } });
      startIndexPoll(ctx, "j 1");
      expect(ctx.state.indexPollInterval).toBe(ctl.handle());
      await ctl.tick();
      expect(request).toHaveBeenCalledWith("/api/v1/project/index/status/j%201");
      expect(ctx.state.indexJobStatus).toBe("running");
      expect(ctx.state.indexJobPhase).toBe("embed");
      expect(ctx.state.indexJobFileCount).toBe(12);
    });
  });

  it("stops polling and re-renders on a terminal status", async () => {
    for (const status of ["completed", "failed"]) {
      await withFakeInterval(async (ctl) => {
        const ctx = makeCtx({
          request: mock(async () => ({ data: { status } })),
          state: { view: "projects" },
        });
        startIndexPoll(ctx, "j1");
        const clearedAfterStart = ctl.cleared();
        await ctl.tick();
        expect(ctl.cleared()).toBe(clearedAfterStart + 1);
        expect(ctx.render).toHaveBeenCalled();
      });
    }
  });

  it("does not re-render when the operator navigated off the projects tab", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({
        request: mock(async () => ({ data: { status: "completed" } })),
        state: { view: "memory" },
      });
      startIndexPoll(ctx, "j1");
      await ctl.tick();
      expect(ctx.render).not.toHaveBeenCalled();
    });
  });

  it("keeps polling through a network error rather than giving up", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({ request: throwingRequest(), state: { view: "projects" } });
      startIndexPoll(ctx, "j1");
      const clearedAfterStart = ctl.cleared();
      await ctl.tick();
      expect(ctl.cleared()).toBe(clearedAfterStart);
      expect(ctx.state.indexJobStatus).toBeUndefined();
    });
  });

  it("keeps the prior field values when a poll returns a partial payload", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({
        request: mock(async () => ({ data: {} })),
        state: { view: "projects", indexJobStatus: "running", indexJobPhase: "parse", indexJobFileCount: 5 },
      });
      startIndexPoll(ctx, "j1");
      await ctl.tick();
      expect(ctx.state.indexJobStatus).toBe("running");
      expect(ctx.state.indexJobPhase).toBe("parse");
      expect(ctx.state.indexJobFileCount).toBe(5);
    });
  });

  it("gives up at the 150-poll cap and marks the job unknown", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({
        request: mock(async () => ({ data: { status: "running" } })),
        state: { view: "projects" },
      });
      startIndexPoll(ctx, "j1");
      const clearedAfterStart = ctl.cleared();
      for (let i = 0; i < 150; i++) await ctl.tick();
      expect(ctx.state.indexJobStatus).toBe("running");
      expect(ctl.cleared()).toBe(clearedAfterStart);
      await ctl.tick(); // poll 151 — over the cap
      expect(ctx.state.indexJobStatus).toBe("unknown");
      expect(ctl.cleared()).toBe(clearedAfterStart + 1);
    });
  });

  it("restarts cleanly — a second start clears the first interval", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({ state: { view: "projects" } });
      startIndexPoll(ctx, "j1");
      const afterFirst = ctl.cleared();
      startIndexPoll(ctx, "j2");
      expect(ctl.cleared()).toBe(afterFirst + 1);
    });
  });
});

describe("handleIndexStatusEvent — terminal transition stops the poll", () => {
  it("clears a running poll when the SSE frame reports completion", async () => {
    await withFakeInterval(async (ctl) => {
      const ctx = makeCtx({ state: { indexJobId: "j1", indexPollInterval: { id: 1 } } });
      expect(handleIndexStatusEvent(ctx, { jobId: "j1", status: "completed" })).toBe(true);
      expect(ctl.cleared()).toBe(1);
      expect(ctx.state.indexPollInterval).toBeNull();
    });
  });

  it("ignores a frame for a different job", () => {
    const ctx = makeCtx({ state: { indexJobId: "j1" } });
    expect(handleIndexStatusEvent(ctx, { jobId: "j2", status: "completed" })).toBe(false);
    expect(ctx.state.indexJobStatus).toBeUndefined();
  });

  it("ignores every frame when no job is tracked", () => {
    expect(handleIndexStatusEvent(makeCtx({ state: {} }), { jobId: "j1" })).toBe(false);
  });
});
