import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  OWNED_MARKER_MD,
  hasOwnedMarker,
  isLegacyAgentName,
  isOwnedAgentFile,
  isOwnedAgentLink,
} from "../ownership.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-ownership-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const MARKED = `---\nname: builder\n---\n${OWNED_MARKER_MD}\nbody\n`;
const UNMARKED = "---\nname: builder\n---\nmy own builder\n";

function write(name: string, content: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

describe("isLegacyAgentName", () => {
  test("exactly massa-ai-<one of the 18 pre-rename names>", () => {
    expect(isLegacyAgentName("massa-ai-reviewer.md")).toBe(true);
    expect(isLegacyAgentName("/x/massa-ai-verification-agent.toml")).toBe(true);
    expect(isLegacyAgentName("massa-ai-mine.md")).toBe(false);
    expect(isLegacyAgentName("reviewer.md")).toBe(false);
  });
});

describe("hasOwnedMarker", () => {
  test("only the first body line after the closing fence counts", () => {
    expect(hasOwnedMarker(MARKED)).toBe(true);
    expect(hasOwnedMarker(UNMARKED)).toBe(false);
    expect(hasOwnedMarker(`---\na: b\n---\nintro\n${OWNED_MARKER_MD}\n`)).toBe(false);
    expect(hasOwnedMarker(`${OWNED_MARKER_MD}\nbody\n`)).toBe(false);
    expect(hasOwnedMarker(`---\na: b\n${OWNED_MARKER_MD}\n`)).toBe(false);
  });
});

describe("isOwnedAgentFile", () => {
  test("md: marker or legacy name; never a symlink or a missing path", () => {
    expect(isOwnedAgentFile(write("builder.md", MARKED))).toBe(true);
    expect(isOwnedAgentFile(write("mine.md", UNMARKED))).toBe(false);
    expect(isOwnedAgentFile(write("massa-ai-reviewer.md", UNMARKED))).toBe(true);
    expect(isOwnedAgentFile(write("massa-ai-mine.md", UNMARKED))).toBe(false);
    const link = path.join(dir, "linked.md");
    fs.symlinkSync(write("target/linked.md", MARKED), link);
    expect(isOwnedAgentFile(link)).toBe(false);
    expect(isOwnedAgentFile(path.join(dir, "absent.md"))).toBe(false);
  });

  test("toml: first line is the marker; a legacy name alone is not enough", () => {
    expect(isOwnedAgentFile(write("builder.toml", '# massa-ai-owned\nname = "builder"\n'))).toBe(true);
    expect(isOwnedAgentFile(write("massa-ai-builder.toml", 'name = "builder"\n'))).toBe(false);
  });
});

describe("isOwnedAgentLink", () => {
  function link(name: string, target: string): string {
    const p = path.join(dir, "agents", name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.symlinkSync(target, p);
    return p;
  }

  test("bundle-path link text counts even when dangling", () => {
    expect(isOwnedAgentLink(link("builder.md", "/gone/apps/opencode-plugin/agents/builder.md"))).toBe(true);
    expect(
      isOwnedAgentLink(link("judge.md", "/h/.config/opencode/plugins/massa-ai/agent-profiles/work/judge.md")),
    ).toBe(true);
    expect(isOwnedAgentLink(link("designer.md", "/gone/apps/opencode-plugin/agents/other.md"))).toBe(false);
  });

  test("a link to a marked file elsewhere is owned; to an unmarked one is not", () => {
    expect(isOwnedAgentLink(link("builder.md", write("dotfiles/builder.md", MARKED)))).toBe(true);
    expect(isOwnedAgentLink(link("planner.md", write("dotfiles/planner.md", UNMARKED)))).toBe(false);
    expect(isOwnedAgentLink(link("ghost.md", path.join(dir, "missing.md")))).toBe(false);
  });

  test("a legacy-named link is owned; a regular file never is", () => {
    expect(isOwnedAgentLink(link("massa-ai-navigator.md", "/anywhere/x.md"))).toBe(true);
    expect(isOwnedAgentLink(write("agents/regular.md", MARKED))).toBe(false);
    expect(isOwnedAgentLink(path.join(dir, "agents", "absent.md"))).toBe(false);
  });
});
