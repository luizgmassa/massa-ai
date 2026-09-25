import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PLUGIN_ROOT, "../..");
const MCP_BIN = path.join(REPO_ROOT, "apps/mcp-client/dist/index.js");
const CLAUDE_BIN = Bun.which("claude");
const UNREACHABLE_API = "http://127.0.0.1:9";

const PLUGIN_VERSION: string = JSON.parse(
  readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf8"),
).version;
const MARKETPLACE_NAME: string = JSON.parse(
  readFileSync(path.join(REPO_ROOT, ".claude-plugin/marketplace.json"), "utf8"),
).name;
const CHARTERS = readdirSync(path.join(REPO_ROOT, "skills/agents"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(REPO_ROOT, "skills/agents", d.name, "SKILL.md")))
  .map((d) => d.name)
  .sort();
const HOOK_EVENTS = Object.keys(
  JSON.parse(readFileSync(path.join(PLUGIN_ROOT, "hooks/hooks.json"), "utf8")).hooks,
).sort();

function bundledSkills(): string[] {
  const commands = readdirSync(path.join(PLUGIN_ROOT, "commands"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3));
  const skills = readdirSync(path.join(PLUGIN_ROOT, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(PLUGIN_ROOT, "skills", d.name, "SKILL.md")))
    .map((d) => d.name);
  return [...commands, ...skills].sort();
}

const scratchRoots: string[] = [];

type Scratch = { root: string; home: string; config: string; tmp: string };

function newScratch(label: string): Scratch {
  const root = mkdtempSync(path.join(tmpdir(), `massa-ai-claude-e2e-${label}-`));
  scratchRoots.push(root);
  const home = path.join(root, "home");
  const config = path.join(root, "config");
  const tmp = path.join(root, "tmp");
  mkdirSync(home);
  mkdirSync(config);
  mkdirSync(tmp);
  return { root, home, config, tmp };
}

function isolatedEnv(scratch: Scratch): Record<string, string> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(MASSA_AI_|CLAUDE_CODE_)/.test(key)) delete env[key];
  }
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDECODE", "DATABASE_URL", "XDG_CONFIG_HOME"]) {
    delete env[key];
  }
  return {
    ...env,
    HOME: scratch.home,
    TMPDIR: scratch.tmp,
    CLAUDE_CONFIG_DIR: scratch.config,
    ANTHROPIC_BASE_URL: UNREACHABLE_API,
    MASSA_AI_API_BASE: UNREACHABLE_API,
  } as Record<string, string>;
}

function claude(args: string[], scratch: Scratch) {
  const proc = Bun.spawnSync([CLAUDE_BIN as string, ...args], {
    cwd: REPO_ROOT,
    env: isolatedEnv(scratch),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

type StreamEvent = Record<string, any>;

function printSession(
  pluginDir: string,
  extraArgs: string[] = [],
): { init: StreamEvent; result: StreamEvent; scratch: Scratch } {
  const scratch = newScratch("session");
  const run = claude(
    ["-p", "--output-format", "stream-json", "--verbose", "--plugin-dir", pluginDir, ...extraArgs, "noop"],
    scratch,
  );
  const events: StreamEvent[] = run.stdout
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l));
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  const result = events.find((e) => e.type === "result");
  if (!init || !result) {
    throw new Error(`no init/result event (exit ${run.code}): ${run.stderr.slice(0, 500)}`);
  }
  return { init, result, scratch };
}

function detailsSection(details: string, heading: string): string[] {
  const line = details.split("\n").find((l) => l.trim().startsWith(`${heading} (`));
  if (!line) throw new Error(`plugin details has no "${heading}" line:\n${details}`);
  const list = line.trim().replace(/^\S+ \(\d+\)\s+/, "").replace(/\s+\(.*\)$/, "");
  return list.split(",").map((s) => s.trim()).filter(Boolean).sort();
}

afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!CLAUDE_BIN)("Tier D — claude CLI, credential-free (EB-CB-1..5)", () => {
  describe("EB-CB-1 manifests validate under --strict", () => {
    test("the plugin manifest passes", () => {
      const run = claude(["plugin", "validate", PLUGIN_ROOT, "--strict"], newScratch("validate"));
      expect(run.stdout).toContain("Validation passed");
      expect(run.code).toBe(0);
    }, 30_000);

    test("the repository marketplace manifest passes", () => {
      const run = claude(["plugin", "validate", REPO_ROOT, "--strict"], newScratch("validate"));
      expect(run.stdout).toContain("marketplace.json");
      expect(run.stdout).toContain("Validation passed");
      expect(run.code).toBe(0);
    }, 30_000);

    test("control: a corrupt manifest fails validation", () => {
      const scratch = newScratch("validate-control");
      const bad = path.join(scratch.root, "bad-plugin");
      mkdirSync(path.join(bad, ".claude-plugin"), { recursive: true });
      writeFileSync(path.join(bad, ".claude-plugin/plugin.json"), '{ "name": ');
      const run = claude(["plugin", "validate", bad, "--strict"], scratch);
      expect(run.code).not.toBe(0);
    }, 30_000);
  });

  describe("EB-CB-4 the installed inventory matches the bundle", () => {
    let scratch: { root: string; home: string; config: string };
    let details: string;

    beforeAll(() => {
      scratch = newScratch("install");
      expect(claude(["plugin", "marketplace", "add", REPO_ROOT], scratch).code).toBe(0);
      expect(claude(["plugin", "install", `massa-ai@${MARKETPLACE_NAME}`], scratch).code).toBe(0);
      const run = claude(["plugin", "details", "massa-ai"], scratch);
      expect(run.code).toBe(0);
      details = run.stdout;
    }, 60_000);

    test("the install lands in the scratch config, never the real one", () => {
      const listed = JSON.parse(claude(["plugin", "list", "--json"], scratch).stdout) as Array<Record<string, string>>;
      const entry = listed.find((p) => p.id === `massa-ai@${MARKETPLACE_NAME}`);
      expect(entry?.version).toBe(PLUGIN_VERSION);
      expect(entry?.installPath.startsWith(scratch.config)).toBe(true);
    }, 30_000);

    test("details reports this checkout's version", () => {
      expect(details.split("\n")[0]?.trim()).toBe(`massa-ai ${PLUGIN_VERSION}`);
    });

    test("agents are exactly the charter directories", () => {
      expect(detailsSection(details, "Agents")).toEqual(CHARTERS);
    });

    test("skills are exactly the bundled commands and skills", () => {
      expect(detailsSection(details, "Skills")).toEqual(bundledSkills());
    });

    test("hooks are exactly the events hooks.json registers", () => {
      expect(detailsSection(details, "Hooks")).toEqual(HOOK_EVENTS);
    });
  });

  describe("EB-CB-2/3/5 a print-mode session loads plugin, MCP server and agents", () => {
    let init: StreamEvent;
    let result: StreamEvent;
    let session: Scratch;

    beforeAll(() => {
      if (!existsSync(MCP_BIN)) throw new Error(`${MCP_BIN} is missing — run \`bun run build\` first`);
      const scratch = newScratch("mcp-config");
      const mcpConfig = path.join(scratch.root, "mcp.json");
      writeFileSync(
        mcpConfig,
        JSON.stringify({
          mcpServers: { "massa-ai-e2e": { type: "stdio", command: process.execPath, args: [MCP_BIN] } },
        }),
      );
      ({ init, result, scratch: session } = printSession(PLUGIN_ROOT, ["--mcp-config", mcpConfig, "--strict-mcp-config"]));
    }, 60_000);

    test("the session spends nothing: no credential, zero cost", () => {
      expect(init.apiKeySource).toBe("none");
      expect(result.total_cost_usd).toBe(0);
    });

    test("the plugin's hooks ran and wrote only inside the scratch TMPDIR", () => {
      expect(readdirSync(path.join(session.tmp, "massa-ai-hooks")).length).toBeGreaterThan(0);
    });

    test("EB-CB-2 the plugin loads at this checkout's version with no plugin errors", () => {
      const plugin = (init.plugins as StreamEvent[]).find((p) => p.name === "massa-ai");
      expect(plugin?.version).toBe(PLUGIN_VERSION);
      expect(plugin?.path).toBe(PLUGIN_ROOT);
      expect(init.plugin_errors ?? []).toEqual([]);
    });

    test("EB-CB-2 control: a corrupt hooks.json in a copy surfaces as a plugin error", () => {
      const scratch = newScratch("plugin-control");
      const copy = path.join(scratch.root, "claude-plugin");
      cpSync(PLUGIN_ROOT, copy, { recursive: true, filter: (src) => !src.includes("__tests__") });
      writeFileSync(path.join(copy, "hooks/hooks.json"), "{ not json");
      const control = printSession(copy);
      expect(control.init.plugin_errors?.length ?? 0).toBeGreaterThan(0);
    }, 60_000);

    test("EB-CB-3 the MCP server connects and exposes its tools", () => {
      const server = (init.mcp_servers as StreamEvent[]).find((s) => s.name === "massa-ai-e2e");
      expect(server?.status).toBe("connected");
      const tools = (init.tools as string[]).filter((t) => t.startsWith("mcp__massa-ai-e2e__"));
      expect(tools.length).toBeGreaterThan(0);
    });

    test("EB-CB-5 every charter is visible as a plugin agent", () => {
      const agents = (init.agents as string[])
        .filter((a) => a.startsWith("massa-ai:"))
        .map((a) => a.slice("massa-ai:".length))
        .sort();
      expect(agents).toEqual(CHARTERS);
    });
  });
});
