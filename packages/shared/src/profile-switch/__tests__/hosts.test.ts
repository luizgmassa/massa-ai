/**
 * hosts.ts unit tests — per-host active/variant path resolution + route
 * detection (design F1). Covers MPS-02, MPS-09, MPS-10.
 */
import { describe, test, expect } from "bun:test";
import path from "node:path";
import { resolveHostLayout, detectRoute, HOSTS } from "../hosts.js";
import type { PlatformRecord } from "../state.js";

const targetHome = "/home/tester";

describe("resolveHostLayout — cursor always skips", () => {
  test("cursor returns a skip layout with an explicit reason, regardless of overrides", () => {
    const layout = resolveHostLayout("cursor", { targetHome });
    expect(layout.route).toBe("skip");
    if (layout.route === "skip") {
      expect(layout.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveHostLayout — path table matches design exactly", () => {
  test("claude: active ~/.claude/agents, variants ~/.claude/massa-ai/agent-profiles/<p>", () => {
    const layout = resolveHostLayout("claude", { targetHome });
    expect(layout.route).toBe("files");
    if (layout.route !== "files") throw new Error("expected files route");
    expect(layout.activeDir).toBe(path.join(targetHome, ".claude", "agents"));
    expect(layout.activeGlob).toBe("massa-ai-*.md");
    expect(layout.variantDir("work")).toBe(
      path.join(targetHome, ".claude", "massa-ai", "agent-profiles", "work"),
    );
  });

  test("codex: active ~/.codex/agents, variants ~/.codex/massa-ai/agent-profiles/<p>", () => {
    const layout = resolveHostLayout("codex", { targetHome });
    expect(layout.route).toBe("files");
    if (layout.route !== "files") throw new Error("expected files route");
    expect(layout.activeDir).toBe(path.join(targetHome, ".codex", "agents"));
    expect(layout.activeGlob).toBe("massa-ai-*.toml");
    expect(layout.variantDir("cheap")).toBe(
      path.join(targetHome, ".codex", "massa-ai", "agent-profiles", "cheap"),
    );
  });

  test("opencode: active ~/.config/opencode/agents, variants .../plugins/massa-ai/agent-profiles/<p>", () => {
    const layout = resolveHostLayout("opencode", { targetHome });
    expect(layout.route).toBe("files");
    if (layout.route !== "files") throw new Error("expected files route");
    expect(layout.activeDir).toBe(path.join(targetHome, ".config", "opencode", "agents"));
    expect(layout.activeGlob).toBe("massa-ai-*.md");
    expect(layout.variantDir("balanced")).toBe(
      path.join(targetHome, ".config", "opencode", "plugins", "massa-ai", "agent-profiles", "balanced"),
    );
  });

  test("project-local root override replaces the $HOME-derived root (installer --project convention)", () => {
    const layout = resolveHostLayout("codex", {
      targetHome,
      projectRoot: { codex: "/proj/.codex" },
    });
    expect(layout.route).toBe("files");
    if (layout.route !== "files") throw new Error("expected files route");
    expect(layout.activeDir).toBe(path.join("/proj/.codex", "agents"));
  });

  test("HOSTS lists exactly claude, codex, cursor, opencode", () => {
    expect([...HOSTS].sort()).toEqual(["claude", "codex", "cursor", "opencode"]);
  });
});

describe("detectRoute (F1) — the route-absent fixture refuses, never guesses", () => {
  test("refuses with a named error when installRoute is absent (deliberate fault: pre-feature install)", () => {
    const platform: PlatformRecord = { root: "/x", skills: [], skillsOwner: "plugin" };
    const decision = detectRoute(platform);
    expect(decision.kind).toBe("refuse");
    if (decision.kind === "refuse") {
      expect(decision.reason.toLowerCase()).toContain("install route");
    }
  });

  test("refuses when the platform record is undefined (host never installed)", () => {
    const decision = detectRoute(undefined);
    expect(decision.kind).toBe("refuse");
  });

  test('refuses with dev-path guidance when installRoute is "marketplace"', () => {
    const platform: PlatformRecord = { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" };
    const decision = detectRoute(platform);
    expect(decision.kind).toBe("refuse");
    if (decision.kind === "refuse") {
      expect(decision.reason).toMatch(/marketplace/i);
    }
  });

  test('proceeds when installRoute is "file"', () => {
    const platform: PlatformRecord = { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" };
    const decision = detectRoute(platform);
    expect(decision.kind).toBe("proceed");
  });
});
