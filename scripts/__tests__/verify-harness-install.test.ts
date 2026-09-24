import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(import.meta.dir, "..", "verify-harness-install.ts");
const MD_MARKER = "<!-- massa-ai-owned: true -->";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "verify-harness-install-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function write(rel: string, content: string): string {
  const file = path.join(home, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function subagentStatus(): Record<string, string> {
  const res = spawnSync("bun", [SCRIPT, "--home", home, "--json"], { encoding: "utf8", timeout: 30_000 });
  const rows = JSON.parse(res.stdout) as { host: string; artifact: string; status: string }[];
  return Object.fromEntries(rows.filter((r) => r.artifact === "subagents").map((r) => [r.host, r.status]));
}

// NAM AC-7: owned-agent detection is by marker, never by name or presence.
describe("verify-harness-install owned-agent detection (NAM AC-7)", () => {
  test("an unmarked user agent is not counted as an installed subagent", () => {
    write(".cursor/agents/builder.md", "---\nname: builder\n---\nmine\n");
    write(".codex/agents/builder.toml", 'name = "builder"\n');
    const target = write("user/builder.md", "---\nname: builder\n---\nmine\n");
    fs.mkdirSync(path.join(home, ".config/opencode/agents"), { recursive: true });
    fs.symlinkSync(target, path.join(home, ".config/opencode/agents/builder.md"));

    const status = subagentStatus();
    expect(status.cursor).toBe("missing");
    expect(status.codex).toBe("missing");
    expect(status.opencode).toBe("missing");
  }, 30_000);

  test("a marked agent is counted", () => {
    write(".cursor/agents/builder.md", `---\nname: builder\n---\n${MD_MARKER}\nbody\n`);
    write(".codex/agents/builder.toml", '# massa-ai-owned\nname = "builder"\n');
    const target = write("user/builder.md", `---\nname: builder\n---\n${MD_MARKER}\nbody\n`);
    fs.mkdirSync(path.join(home, ".config/opencode/agents"), { recursive: true });
    fs.symlinkSync(target, path.join(home, ".config/opencode/agents/builder.md"));

    const status = subagentStatus();
    expect(status.cursor).toBe("partial");
    expect(status.codex).toBe("partial");
    expect(status.opencode).toBe("partial");
  }, 30_000);
});
