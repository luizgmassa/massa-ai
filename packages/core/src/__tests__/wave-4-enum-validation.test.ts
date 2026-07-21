/**
 * T1 (WAVE4-N6): ToolError + validateEnum helper.
 *
 * Asserts the teaching-error contract from spec.md AC 6:
 *   - invalid enum params throw ToolError with the valid-values list
 *   - valid values pass through unchanged
 *   - empty string / undefined / null all throw (not silently coerced)
 *
 * Discrimination sensor (run by the independent verifier):
 *   - remove the `!validValues.includes` check → the "invalid value rejected"
 *     test fails (validateEnum would return the bad value).
 *   - drop the `typeof value !== "string"` guard → the "undefined throws"
 *     test fails (validateEnum would return undefined as T).
 */
import { describe, test, expect } from "bun:test";
import { ToolError, validateEnum } from "../tools/enum-validation.js";
import { validateGitRef } from "../services/symbol/git-ref-validation.js";

describe("ToolError", () => {
  test("defaults statusCode to 400", () => {
    const e = new ToolError("bad");
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe("bad");
    expect(e.name).toBe("ToolError");
    expect(e).toBeInstanceOf(Error);
  });

  test("honors an explicit statusCode (e.g. 412 for N1 stale generation)", () => {
    const e = new ToolError("stale", 412);
    expect(e.statusCode).toBe(412);
    expect(e.message).toBe("stale");
  });
});

describe("validateEnum", () => {
  const SCOPES = ["unstaged", "staged", "committed", "all"] as const;
  type Scope = (typeof SCOPES)[number];

  test("returns a valid value narrowed to T", () => {
    const v = validateEnum<Scope>("scope", "unstaged", SCOPES);
    expect(v).toBe("unstaged");
    // Type narrowing: assign to a Scope-typed slot to prove the narrow.
    const narrowed: Scope = v;
    expect(narrowed).toBe("unstaged");
  });

  test("throws ToolError listing valid values when the value is not a member", () => {
    expect(() => validateEnum<Scope>("scope", "bogus", SCOPES)).toThrow(
      ToolError,
    );
    try {
      validateEnum<Scope>("scope", "bogus", SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).statusCode).toBe(400);
      // Teaching message must name the param, the received value, and every valid value.
      const msg = (e as Error).message;
      expect(msg).toContain("Invalid scope value: bogus.");
      expect(msg).toContain("unstaged, staged, committed, all");
    }
  });

  test("empty string throws (not silently coerced to a default)", () => {
    expect(() => validateEnum<Scope>("scope", "", SCOPES)).toThrow(ToolError);
    try {
      validateEnum<Scope>("scope", "", SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("Invalid scope value:");
      expect((e as Error).message).toContain("unstaged, staged, committed, all");
    }
  });

  test("undefined throws (param omitted by the caller)", () => {
    expect(() =>
      validateEnum<Scope>("scope", undefined, SCOPES),
    ).toThrow(ToolError);
    try {
      validateEnum<Scope>("scope", undefined, SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("Invalid scope value: undefined.");
    }
  });

  test("null throws", () => {
    expect(() => validateEnum<Scope>("scope", null, SCOPES)).toThrow(ToolError);
    try {
      validateEnum<Scope>("scope", null, SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("Invalid scope value: null.");
    }
  });

  test("non-string throws (number, not coerced to a string match)", () => {
    expect(() =>
      // @ts-expect-error — deliberately feeding a non-string to prove the guard
      validateEnum<Scope>("scope", 42, SCOPES),
    ).toThrow(ToolError);
  });

  test("works for a singleton set (degenerate but legal)", () => {
    const v = validateEnum<"only">("mode", "only", ["only"] as const);
    expect(v).toBe("only");
    expect(() =>
      validateEnum<"only">("mode", "other", ["only"] as const),
    ).toThrow(ToolError);
  });
});

/**
 * T2 (WAVE4-N8): validateGitRef shell-arg guard.
 *
 * Asserts spec AC 10: `base_branch`/`since` starting with `--` or containing
 * shell metacharacters / failing the accepted pattern throw ToolError BEFORE
 * any `execFileSync("git", [...])` call.
 *
 * Discrimination: drop the `value.startsWith("--")` guard → the
 * `--upload-pack=...` test fails. Drop the pattern test → the `main;rm -rf /`
 * and `$(whoami)` tests fail. Empty string MUST NOT throw (caller falls back
 * to `main`).
 */
describe("validateGitRef", () => {
  test("valid refs pass: main, feature/foo-bar, v1.0.0, abc123", () => {
    const valid = ["main", "feature/foo-bar", "v1.0.0", "abc123", "origin/main", "2026-07-01"];
    for (const v of valid) {
      expect(() => validateGitRef("base_branch", v)).not.toThrow();
    }
  });

  test("empty string passes (caller falls back to default main)", () => {
    expect(() => validateGitRef("base_branch", "")).not.toThrow();
  });

  test("rejects `--upload-pack=evil` (git arg-injection)", () => {
    expect(() => validateGitRef("base_branch", "--upload-pack=evil")).toThrow(
      ToolError,
    );
    try {
      validateGitRef("base_branch", "--upload-pack=evil");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).statusCode).toBe(400);
      expect((e as Error).message).toContain("Invalid base_branch value:");
      expect((e as Error).message).toContain("Valid pattern:");
    }
  });

  test("rejects `main;rm -rf /` (shell metacharacter `;`)", () => {
    expect(() => validateGitRef("base_branch", "main;rm -rf /")).toThrow(
      ToolError,
    );
  });

  test("rejects `$(whoami)` (command substitution)", () => {
    expect(() => validateGitRef("since", "$(whoami)")).toThrow(ToolError);
  });

  test("rejects `--exec=...` (git option-as-arg)", () => {
    expect(() => validateGitRef("base_branch", "--exec=/tmp/evil")).toThrow(
      ToolError,
    );
  });

  test("rejects empty-with-newline `\\n` (newline injection)", () => {
    expect(() => validateGitRef("base_branch", "\n")).toThrow(ToolError);
  });

  test("rejects a ref containing a space (not in the accepted pattern)", () => {
    expect(() => validateGitRef("base_branch", "main with space")).toThrow(
      ToolError,
    );
  });

  test("rejects backtick command substitution", () => {
    expect(() => validateGitRef("base_branch", "`whoami`")).toThrow(ToolError);
  });
});

/**
 * T5 (WAVE4-N6): validateEnum wired into all tool handlers.
 *
 * Asserts spec AC 6: each tool handler teaching-errors on an invalid enum
 * param with the valid-values list in the error message. Handlers wrap their
 * bodies in try/catch and return `{success:false, error:<msg>}`, so the
 * teaching text arrives via `error` (NOT as a re-thrown ToolError).
 *
 * Discrimination: remove the validateEnum call in any tool → its invalid-enum
 * test fails (silent fallback returns success:false with a generic error that
 * does NOT list valid values, or returns success:true with wrong data).
 */
import { ImpactAnalysisTool } from "../tools/impact_analysis.js";
import { TracePathTool } from "../tools/trace_path.js";
import { GetAnalyticsTool } from "../tools/get_analytics.js";
import { ListProjectsTool } from "../tools/list_projects.js";
import { SearchDefinitionsTool } from "../tools/search_definitions.js";
import { CreateCheckpointTool } from "../tools/create_checkpoint.js";
import { CompressContextTool } from "../tools/compress_context.js";
import { ExecutorController } from "../controllers/executor-controller.js";

// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * Run a tool handler call and extract the teaching-error message text, whether
 * the handler throws `ToolError` (validation at top of `handle`, before any
 * try/catch) or returns `{success:false, error:<msg>}` (validation inside a
 * try/catch). Both shapes satisfy spec AC 6 — the contract is that the
 * valid-values list reaches the caller, not the throw-vs-return mechanism.
 */
async function teachingError(call: () => Promise<unknown>): Promise<string> {
  let maybeReturn: unknown;
  try {
    maybeReturn = await call();
  } catch (e) {
    if (e instanceof ToolError) return e.message;
    throw e;
  }
  const r = maybeReturn as { success: boolean; error?: string };
  if (r && r.success === false && typeof r.error === "string") return r.error;
  throw new Error(
    `expected ToolError throw OR {success:false,error}; got: ${JSON.stringify(maybeReturn).slice(0, 200)}`,
  );
}

describe("T5: tool handlers wired to validateEnum (N6)", () => {
  test("impact_analysis rejects invalid scope with valid-values list", async () => {
    const tool = new ImpactAnalysisTool();
    const err = await teachingError(() =>
      tool.handle({
        projectId: "p",
        projectPath: "/tmp",
        scope: "bogus",
      } as any),
    );
    expect(err).toContain("Invalid scope value: bogus.");
    expect(err).toContain("unstaged, staged, committed");
  });

  test("trace_path rejects invalid direction with valid-values list", async () => {
    const tool = new TracePathTool();
    const err = await teachingError(() =>
      tool.handle({
        projectId: "p",
        function_name: "x",
        direction: "sideways",
      } as any),
    );
    expect(err).toContain("Invalid direction value: sideways.");
    expect(err).toContain("outbound, inbound, both");
  });

  test("trace_path rejects invalid mode with valid-values list", async () => {
    const tool = new TracePathTool();
    const err = await teachingError(() =>
      tool.handle({
        projectId: "p",
        function_name: "x",
        mode: "nope",
      } as any),
    );
    expect(err).toContain("Invalid mode value: nope.");
    expect(err).toContain("calls, data_flow, cross_service, all");
  });

  test("get_analytics rejects invalid type with valid-values list", async () => {
    const tool = new GetAnalyticsTool();
    const err = await teachingError(() =>
      tool.handle({ type: "bogus" } as any),
    );
    expect(err).toContain("Invalid type value: bogus.");
    expect(err).toContain("summary, project, query, cache, recent");
  });

  test("list_projects rejects invalid status with valid-values list", async () => {
    const tool = new ListProjectsTool();
    const err = await teachingError(() =>
      tool.handle({ status: "archived" } as any),
    );
    expect(err).toContain("Invalid status value: archived.");
    expect(err).toContain("pending, indexing, indexed, error, all");
  });

  test("search_definitions rejects invalid kind with valid-values list", async () => {
    const tool = new SearchDefinitionsTool();
    const err = await teachingError(() =>
      tool.handle({ projectId: "p", kind: ["function", "bogus_kind"] } as any),
    );
    expect(err).toContain("Invalid kind value: bogus_kind.");
    // Valid-values list must include the 18 canonical kinds (sample-check a few).
    expect(err).toContain("function");
    expect(err).toContain("class");
    expect(err).toContain("module");
  });

  test("create_checkpoint rejects invalid status with valid-values list", async () => {
    const tool = new CreateCheckpointTool();
    const err = await teachingError(() =>
      tool.handle({ taskId: "t", description: "d", status: "archived" } as any),
    );
    expect(err).toContain("Invalid status value: archived.");
    expect(err).toContain("pending, in_progress, completed, failed, paused");
  });

  test("create_checkpoint rejects invalid checkpointType with valid-values list", async () => {
    const tool = new CreateCheckpointTool();
    const err = await teachingError(() =>
      tool.handle({
        taskId: "t",
        description: "d",
        checkpointType: "final",
      } as any),
    );
    expect(err).toContain("Invalid checkpointType value: final.");
    expect(err).toContain("manual, milestone");
  });

  test("compress_context rejects invalid strategy with valid-values list", async () => {
    const tool = new CompressContextTool();
    const err = await teachingError(() =>
      tool.handle({ content: "x", strategy: "bogus" } as any),
    );
    expect(err).toContain("Invalid strategy value: bogus.");
    expect(err).toContain(
      "code_structure, conversation_summary, semantic_dedup, hierarchical",
    );
  });

  test("ExecutorController.execute rejects invalid language with valid-values list", async () => {
    const ctrl = ExecutorController.getInstance();
    const err = await teachingError(() =>
      ctrl.execute({
        language: "klingon" as any,
        code: "1+1",
      } as any),
    );
    expect(err).toContain("Invalid language value: klingon.");
    expect(err).toContain(
      "javascript, typescript, python, shell, ruby, go, rust, php, perl, r",
    );
  });

  test("ExecutorController.executeFile rejects invalid language with valid-values list", async () => {
    const ctrl = ExecutorController.getInstance();
    const err = await teachingError(() =>
      ctrl.executeFile({
        language: "klingon" as any,
        path: "/tmp/x.py",
      } as any),
    );
    expect(err).toContain("Invalid language value: klingon.");
    expect(err).toContain(
      "javascript, typescript, python, shell, ruby, go, rust, php, perl, r",
    );
  });
});