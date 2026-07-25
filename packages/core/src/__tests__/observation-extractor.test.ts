/**
 * observation-extractor unit tests — covers every classifier branch in
 * extractCategory: tool-call dispatch (all normalized names), user-prompt
 * signals, session-start, pre-compact, error detection, rule-file reads,
 * skill invocations, git payload, and the lifecycle-raw fallback.
 *
 * Pure function tests — no IO, no mocks.
 */
import { describe, test, expect } from "bun:test";
import {
  extractCategory,
  CATEGORY_LABELS,
  type ObservationCategory,
} from "../services/hooks/observation-extractor.js";
import type { LifecycleEventKind } from "../data/memory/observation-repository.js";

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return over;
}

describe("extractCategory — tool-call classifier", () => {
  test("Read → files-read", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read" }))).toBe("files-read");
  });

  test("Write/Edit/MultiEdit → files-written", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Write" }))).toBe("files-written");
    expect(extractCategory("post-tool-use", payload({ tool_name: "Edit" }))).toBe("files-written");
    expect(extractCategory("post-tool-use", payload({ tool_name: "MultiEdit" }))).toBe("files-written");
  });

  test("Glob/list_files → file-search", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Glob" }))).toBe("file-search");
    expect(extractCategory("post-tool-use", payload({ tool_name: "list_files" }))).toBe("file-search");
  });

  test("Grep/search_files/grep → file-search", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Grep" }))).toBe("file-search");
    expect(extractCategory("post-tool-use", payload({ tool_name: "search_files" }))).toBe("file-search");
    expect(extractCategory("post-tool-use", payload({ tool_name: "grep" }))).toBe("file-search");
  });

  test("Bash with git commit/merge/rebase → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Bash", command: "git commit -m x" }))).toBe("git-changes");
    expect(extractCategory("post-tool-use", payload({ tool_name: "Bash", command: "git merge feature" }))).toBe("git-changes");
    expect(extractCategory("post-tool-use", payload({ tool_name: "Bash", command: "git rebase main" }))).toBe("git-changes");
  });

  test("Bash with generic git → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Bash", command: "git status" }))).toBe("git-changes");
  });

  test("Bash without git → tool-calls", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Bash", command: "ls -la" }))).toBe("tool-calls");
  });

  test("Bash with git via tool_input.command", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Bash", tool_input: { command: "git log" } }))).toBe("git-changes");
  });

  test("TodoWrite → tasks, Task → subagents-spawned", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "TodoWrite" }))).toBe("tasks");
    expect(extractCategory("post-tool-use", payload({ tool_name: "Task" }))).toBe("subagents-spawned");
  });

  test("WebFetch → web-fetch", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "WebFetch" }))).toBe("web-fetch");
  });

  test("WebSearch → searches", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "WebSearch" }))).toBe("searches");
  });

  test("search/recall/search_definitions/get_references → searches", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "search" }))).toBe("searches");
    expect(extractCategory("post-tool-use", payload({ tool_name: "recall" }))).toBe("searches");
    expect(extractCategory("post-tool-use", payload({ tool_name: "search_definitions" }))).toBe("searches");
    expect(extractCategory("post-tool-use", payload({ tool_name: "get_references" }))).toBe("searches");
  });

  test("store_memory → memories-stored", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "store_memory" }))).toBe("memories-stored");
  });

  test("compact_snapshot → compaction-snapshots", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "compact_snapshot" }))).toBe("compaction-snapshots");
  });

  test("mcp__ namespaced tool → mcp-calls", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "mcp__server__tool" }))).toBe("mcp-calls");
  });

  test("toolName via toolInput fallback (camelCase)", () => {
    expect(extractCategory("post-tool-use", payload({ toolName: "Read" }))).toBe("files-read");
  });

  test("unknown tool name → falls through to source-based fallback", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "UnknownTool" }))).toBe("lifecycle-raw");
  });

  test("run_shell_command normalizes to Bash", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "run_shell_command", command: "echo hi" }))).toBe("tool-calls");
  });

  test("shell/write_file/edit_file normalize", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "shell", command: "echo x" }))).toBe("tool-calls");
    expect(extractCategory("post-tool-use", payload({ tool_name: "write_file" }))).toBe("files-written");
    expect(extractCategory("post-tool-use", payload({ tool_name: "edit_file" }))).toBe("files-written");
  });

  test("glob (lowercase) normalizes to Glob → file-search", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "glob" }))).toBe("file-search");
  });
});

describe("extractCategory — user-prompt classifier", () => {
  test("goal markers → goal", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "/goal build the thing" }))).toBe("goal");
    expect(extractCategory("user-prompt", payload({ prompt: "goal: ship it" }))).toBe("goal");
    expect(extractCategory("user-prompt", payload({ prompt: "objective: release v2" }))).toBe("goal");
  });

  test("plan marker → plan-changes", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "/plan refactor auth" }))).toBe("plan-changes");
  });

  test("decision signals → decisions", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "let's go with option A" }))).toBe("decisions");
    expect(extractCategory("user-prompt", payload({ prompt: "decide on postgres" }))).toBe("decisions");
    expect(extractCategory("user-prompt", payload({ prompt: "decision: use React" }))).toBe("decisions");
    expect(extractCategory("user-prompt", payload({ prompt: "we'll use bun" }))).toBe("decisions");
    expect(extractCategory("user-prompt", payload({ prompt: "chosen approach: tdd" }))).toBe("decisions");
  });

  test("constraint signals → constraints", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "must not break tests" }))).toBe("constraints");
    expect(extractCategory("user-prompt", payload({ prompt: "constraint: no deps" }))).toBe("constraints");
    expect(extractCategory("user-prompt", payload({ prompt: "don't touch secrets" }))).toBe("constraints");
    expect(extractCategory("user-prompt", payload({ prompt: "never delete data" }))).toBe("constraints");
    expect(extractCategory("user-prompt", payload({ prompt: "avoid mutation" }))).toBe("constraints");
  });

  test("rejected approach signals → rejected-approaches", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "not that one" }))).toBe("rejected-approaches");
    expect(extractCategory("user-prompt", payload({ prompt: "rejected: old design" }))).toBe("rejected-approaches");
    expect(extractCategory("user-prompt", payload({ prompt: "don't do X" }))).toBe("rejected-approaches");
    expect(extractCategory("user-prompt", payload({ prompt: "instead of Y use Z" }))).toBe("rejected-approaches");
  });

  test("blocked-on signals → blocked-on", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "blocked on API" }))).toBe("blocked-on");
    expect(extractCategory("user-prompt", payload({ prompt: "waiting on review" }))).toBe("blocked-on");
    expect(extractCategory("user-prompt", payload({ prompt: "can't proceed without keys" }))).toBe("blocked-on");
    expect(extractCategory("user-prompt", payload({ prompt: "stuck on deploy" }))).toBe("blocked-on");
  });

  test("role/persona signals → role", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "/persona senior-engineer" }))).toBe("role");
    expect(extractCategory("user-prompt", payload({ prompt: "act as a reviewer" }))).toBe("role");
    expect(extractCategory("user-prompt", payload({ prompt: "you are a QA engineer" }))).toBe("role");
  });

  test("plain prompt → user-prompts", () => {
    expect(extractCategory("user-prompt", payload({ prompt: "hello world" }))).toBe("user-prompts");
  });

  test("message fallback field", () => {
    expect(extractCategory("user-prompt", payload({ message: "goal: ship" }))).toBe("goal");
  });

  test("text fallback field", () => {
    expect(extractCategory("user-prompt", payload({ text: "blocked on X" }))).toBe("blocked-on");
  });

  test("non-user-prompt source with no tool match → lifecycle-raw", () => {
    expect(extractCategory("post-tool-use", payload({ prompt: "/goal x" }))).not.toBe("goal");
  });
});

describe("extractCategory — session-start classifier", () => {
  test("settings/model → session-settings", () => {
    expect(extractCategory("session-start", payload({ model: "gpt-4" }))).toBe("session-settings");
    expect(extractCategory("session-start", payload({ settings: { foo: 1 } }))).toBe("session-settings");
  });

  test("cwd → cwd-changes", () => {
    expect(extractCategory("session-start", payload({ cwd: "/repo" }))).toBe("cwd-changes");
    expect(extractCategory("session-start", payload({ workingDirectory: "/repo" }))).toBe("cwd-changes");
  });

  test("env → env-changes", () => {
    expect(extractCategory("session-start", payload({ env: { FOO: 1 } }))).toBe("env-changes");
    expect(extractCategory("session-start", payload({ environment: { FOO: 1 } }))).toBe("env-changes");
  });

  test("empty session-start → session-settings (fallback)", () => {
    expect(extractCategory("session-start", payload({ foo: 1 }))).toBe("session-settings");
  });
});

describe("extractCategory — pre-compact classifier", () => {
  test("pre-compact → compaction-snapshots", () => {
    expect(extractCategory("pre-compact", payload({ foo: 1 }))).toBe("compaction-snapshots");
  });
});

describe("extractCategory — error classifier", () => {
  test("tool_response.is_error=true → errors", () => {
    expect(extractCategory("post-tool-use", payload({ tool_response: { is_error: true } }))).toBe("errors");
  });

  test("tool_response.error present → errors", () => {
    expect(extractCategory("post-tool-use", payload({ tool_response: { error: "boom" } }))).toBe("errors");
  });

  test("toolResponse (camelCase) with error → errors", () => {
    expect(extractCategory("post-tool-use", payload({ toolResponse: { is_error: true } }))).toBe("errors");
  });

  test("stdout contains 'error:' → errors", () => {
    expect(extractCategory("post-tool-use", payload({ stdout: "error: something failed" }))).toBe("errors");
  });

  test("stdout contains 'failed:' → errors", () => {
    expect(extractCategory("post-tool-use", payload({ stdout: "failed: build" }))).toBe("errors");
  });

  test("non-post-tool-use source → error classifier returns null", () => {
    expect(extractCategory("user-prompt", payload({ tool_response: { is_error: true } }))).not.toBe("errors");
  });
});

describe("extractCategory — rule-file classifier", () => {
  test("Read of CLAUDE.md → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: "CLAUDE.md" }))).toBe("rules");
  });

  test("Read of AGENTS.md → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: "sub/AGENTS.md" }))).toBe("rules");
  });

  test("Read of .cursorrules → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: ".cursorrules" }))).toBe("rules");
  });

  test("Read of .clinerules → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: ".clinerules" }))).toBe("rules");
  });

  test("Read of file with claudemd in path → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: "docs/claudemd-config.md" }))).toBe("rules");
  });

  test("Read of rtk.md → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: "rtk.md" }))).toBe("rules");
  });

  test("read_file (lowercase) of CLAUDE.md → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "read_file", file_path: "CLAUDE.md" }))).toBe("rules");
  });

  test("path via tool_input.file_path → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", tool_input: { file_path: "CLAUDE.md" } }))).toBe("rules");
  });

  test("path via 'path' field → rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", path: "CLAUDE.md" }))).toBe("rules");
  });

  test("Read of non-rule file → files-read (rule classifier returns null)", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Read", file_path: "src/main.ts" }))).toBe("files-read");
  });

  test("non-Read tool with CLAUDE.md path → not rules", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Write", file_path: "CLAUDE.md" }))).not.toBe("rules");
  });
});

describe("extractCategory — skill classifier", () => {
  test("Skill tool_name → skills-invoked", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "Skill" }))).toBe("skills-invoked");
  });

  test("skill (lowercase) tool_name → skills-invoked", () => {
    expect(extractCategory("post-tool-use", payload({ tool_name: "skill" }))).toBe("skills-invoked");
  });
});

describe("extractCategory — git-payload classifier", () => {
  test("command starts with 'git ' and includes commit → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ command: "git commit -m x" }))).toBe("git-changes");
  });

  test("command starts with 'git ' and includes merge → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ command: "git merge feature" }))).toBe("git-changes");
  });

  test("command starts with 'git ' and includes checkout → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ command: "git checkout main" }))).toBe("git-changes");
  });

  test("command starts with 'git ' and includes reset → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ command: "git reset --hard" }))).toBe("git-changes");
  });

  test("diff field present → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ diff: "some diff" }))).toBe("git-changes");
  });

  test("git_diff field present → git-changes", () => {
    expect(extractCategory("post-tool-use", payload({ git_diff: "some diff" }))).toBe("git-changes");
  });
});

describe("extractCategory — fallbacks and edge cases", () => {
  test("session-end → lifecycle-raw", () => {
    expect(extractCategory("session-end", payload({ foo: 1 }))).toBe("lifecycle-raw");
  });

  test("non-object payload → lifecycle-raw", () => {
    expect(extractCategory("post-tool-use", null as any)).toBe("lifecycle-raw");
  });

  test("classifier that throws is caught → continue", () => {
    // A payload that would cause a classifier to throw is caught by the
    // try/catch in extractCategory. We can't easily force a throw without
    // mocking, but an undefined tool_name still returns gracefully.
    expect(extractCategory("post-tool-use", payload({ tool_name: undefined }))).toBe("lifecycle-raw");
  });

  test("all categories have labels in CATEGORY_LABELS", () => {
    const categories: ObservationCategory[] = [
      "files-read", "files-written", "file-search", "tool-calls", "git-changes",
      "tasks", "plan-changes", "errors", "error-resolution", "iteration-loop",
      "decisions", "constraints", "rejected-approaches", "user-prompts", "intent",
      "goal", "role", "blocked-on", "rules", "skills-invoked", "subagents-spawned",
      "env-changes", "cwd-changes", "session-settings", "external-refs", "web-fetch",
      "searches", "memories-stored", "compaction-snapshots", "mcp-calls",
      "agent-findings", "cost-telemetry", "lifecycle-raw",
    ];
    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
    }
  });
});