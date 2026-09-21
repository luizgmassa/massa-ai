/**
 * agent-runtime-drift T06 — the session-start doctor line.
 *
 * Unit tests over the exported builder (temp fixtures, injected env) plus one
 * cross-side pin: the hook's dependency-frozen `^model:` regex must extract
 * the same model the SHARED parser extracts from a shipped-shaped agent file
 * (spec INV B3) — the writer (generator, shared parser) and this reader
 * cannot silently disagree.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { buildSessionStartDoctorLine, getInstallStatePath } from "../hooks/massa-ai-hook.ts";
import { parseFrontmatter } from "../../../packages/shared/src/profile-switch/frontmatter.ts";

let home: string;
let pluginRoot: string;

const OLD_ENV_XDG = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-hook-doctor-home-"));
  pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-hook-doctor-plugin-"));
  process.env.XDG_CONFIG_HOME = home;
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(pluginRoot, { recursive: true, force: true });
  if (OLD_ENV_XDG === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = OLD_ENV_XDG;
});

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const ENV = (model?: string): Record<string, string | undefined> =>
  model === undefined ? {} : { CLAUDE_CODE_SUBAGENT_MODEL: model };

describe("buildSessionStartDoctorLine", () => {
  test("healthy install (versions agree, no agent drift, no override) → null", () => {
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), { version: "1.57.0" });
    writeJson(getInstallStatePath(), {
      version: 2,
      platforms: { claude: { plugin: { version: "1.57.0" }, modelProfile: { profile: "work" } } },
    });
    const agent = "---\nname: massa-ai-investigator\nmodel: glm-5.3-flash\neffort: max\n---\nbody";
    writeText(path.join(pluginRoot, "agents", "massa-ai-investigator.md"), agent);
    writeText(path.join(pluginRoot, "agent-profiles", "work", "massa-ai-investigator.md"), agent);

    expect(buildSessionStartDoctorLine(pluginRoot, ENV())).toBeNull();
  });

  test("live bundle version ≠ recorded state version → version drift line", () => {
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), { version: "1.57.0" });
    writeJson(getInstallStatePath(), {
      version: 2,
      platforms: { claude: { plugin: { version: "1.56.0" } } },
    });

    const line = buildSessionStartDoctorLine(pluginRoot, ENV());
    expect(line).toContain("version drift");
    expect(line).toContain("1.57.0");
    expect(line).toContain("1.56.0");
  });

  test("active investigator model ≠ recorded profile variant → agent drift line", () => {
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), { version: "1.57.0" });
    writeJson(getInstallStatePath(), {
      version: 2,
      platforms: { claude: { plugin: { version: "1.57.0" }, modelProfile: { profile: "work" } } },
    });
    writeText(path.join(pluginRoot, "agents", "massa-ai-investigator.md"), "---\nmodel: glm-5.3-flash\n---\n");
    writeText(path.join(pluginRoot, "agent-profiles", "work", "massa-ai-investigator.md"), "---\nmodel: glm-5.2\n---\n");

    const line = buildSessionStartDoctorLine(pluginRoot, ENV());
    expect(line).toContain("agent drift");
    expect(line).toContain("glm-5.3-flash");
    expect(line).toContain("glm-5.2");
  });

  test("the env override is reported — it wins at runtime over every frontmatter", () => {
    const line = buildSessionStartDoctorLine(pluginRoot, ENV("minimax-m3"));
    expect(line).toContain("CLAUDE_CODE_SUBAGENT_MODEL=minimax-m3");
    expect(line).toContain("overrides every per-agent model");
  });

  test("report is capped at 2 lines even when everything drifts at once", () => {
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), { version: "1.57.0" });
    writeJson(getInstallStatePath(), {
      version: 2,
      platforms: { claude: { plugin: { version: "1.56.0" }, modelProfile: { profile: "work" } } },
    });
    writeText(path.join(pluginRoot, "agents", "massa-ai-investigator.md"), "---\nmodel: glm-5.3-flash\n---\n");
    writeText(path.join(pluginRoot, "agent-profiles", "work", "massa-ai-investigator.md"), "---\nmodel: glm-5.2\n---\n");

    const line = buildSessionStartDoctorLine(pluginRoot, ENV("minimax-m3"));
    expect(line).not.toBeNull();
    expect(line!.split("\n")).toHaveLength(2);
  });

  test("missing/unreadable sources degrade to null, never throw", () => {
    expect(buildSessionStartDoctorLine(path.join(pluginRoot, "absent"), ENV())).toBeNull();
  });
});

describe("cross-side pin (INV B3): hook regex == shared parser for `model:`", () => {
  test("both readers extract the same model from a shipped-shaped agent file", () => {
    const raw = "---\nname: massa-ai-investigator\nmodel: glm-5.3-flash-tencent-claude[1m]\neffort: max\n---\nbody";
    const shared = parseFrontmatter(raw).frontmatter.model;
    writeText(path.join(pluginRoot, "agents", "massa-ai-investigator.md"), raw);
    // Exercise the hook's pinned read through the builder: a work variant
    // carrying the SAME model must yield no agent-drift line.
    writeText(path.join(pluginRoot, "agent-profiles", "work", "massa-ai-investigator.md"), raw);
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), { version: "1.0.0" });
    writeJson(getInstallStatePath(), {
      version: 2,
      platforms: { claude: { plugin: { version: "1.0.0" }, modelProfile: { profile: "work" } } },
    });

    expect(shared).toBe("glm-5.3-flash-tencent-claude[1m]");
    expect(buildSessionStartDoctorLine(pluginRoot, ENV())).toBeNull();
  });

  test("a quoted model value reads identically through both readers", () => {
    const raw = "---\nmodel: \"glm-5.3-flash\"\n---\nbody";
    expect(parseFrontmatter(raw).frontmatter.model).toBe("glm-5.3-flash");
    writeText(path.join(pluginRoot, "agents", "massa-ai-investigator.md"), raw);
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), { version: "1.0.0" });
    writeJson(getInstallStatePath(), {
      version: 2,
      platforms: { claude: { plugin: { version: "1.0.0" }, modelProfile: { profile: "work" } } },
    });
    writeText(path.join(pluginRoot, "agent-profiles", "work", "massa-ai-investigator.md"), "---\nmodel: other\n---\n");
    const line = buildSessionStartDoctorLine(pluginRoot, ENV());
    expect(line).toContain("glm-5.3-flash");
  });
});
