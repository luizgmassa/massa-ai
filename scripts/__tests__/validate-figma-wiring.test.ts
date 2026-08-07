/**
 * Discriminating tests for `skills/massa-ai/scripts/validate_figma_wiring.ts`
 * (T11, FIGMA-07, design D11b). Spawns the real script against fixture
 * `.specs/<type>/<slug>/figma/*.md` trees built in `mkdtemp` temp dirs -- no
 * PostgreSQL, no Ollama, deterministic. Mirrors the fixture-spawning pattern
 * in `scripts/__tests__/spec-driven-validators.test.ts`.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(REPO_ROOT, "skills", "massa-ai", "scripts", "validate_figma_wiring.ts");

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  cleanupDirs.push(dir);
  return dir;
}

/** Writes `<root>/.specs/<type>/<slug>/figma/<name>` with `content`. */
function writeFigmaFile(
  root: string,
  slug: string,
  name: string,
  content: string,
  type: string = "features",
): string {
  const dir = join(root, ".specs", type, slug, "figma");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

const TABLE_HEADER = [
  "| Number | Figma node id(s) | Category | Spec(s) ID | Task(s) ID | Design(s) ID | Explanation | Notes |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
].join("\n");

describe("validate_figma_wiring.ts: wired table", () => {
  test("every row wired (Spec/Task/Design ID present) exits 0 and prints the parsed population", () => {
    const root = makeTempRoot("figma-wiring-wired");
    const content = [
      "# Home screen",
      "",
      TABLE_HEADER,
      "| 1 | 123:456 | Structure | REQ-01 |  |  | Top-level layout |  |",
      "| 2 | 123:789 | Components |  | T3 |  | Primary button |  |",
      "",
    ].join("\n");
    writeFigmaFile(root, "my-feature", "01-home.md", content);
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("scanned 1 file(s), parsed 2 row(s), 0 unwired, 0 error(s)");
  });

  test("multiple figma files aggregate into one population count", () => {
    const root = makeTempRoot("figma-wiring-multi-file");
    writeFigmaFile(
      root,
      "my-feature",
      "01-home.md",
      [TABLE_HEADER, "| 1 | 1:1 | Structure | REQ-01 |  |  | x |  |"].join("\n"),
    );
    writeFigmaFile(
      root,
      "my-feature",
      "02-profile.md",
      [TABLE_HEADER, "| 1 | 2:1 | Flows |  |  | D-01 | y |  |"].join("\n"),
    );
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("scanned 2 file(s), parsed 2 row(s), 0 unwired, 0 error(s)");
  });
});

describe("validate_figma_wiring.ts: unwired row", () => {
  test("a row with all three ID columns empty exits 1 and names the row", () => {
    const root = makeTempRoot("figma-wiring-unwired");
    const content = [
      TABLE_HEADER,
      "| 1 | 123:456 | Structure | REQ-01 |  |  | wired row |  |",
      "| 2 | 123:789 | Components |  |  |  | unwired row |  |",
    ].join("\n");
    writeFigmaFile(root, "my-feature", "01-home.md", content);
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("#2: unwired");
    expect(r.stdout).toContain("scanned 1 file(s), parsed 2 row(s), 1 unwired, 1 error(s)");
  });

  test("a bare dash or em-dash placeholder in every ID column still counts as unwired", () => {
    const root = makeTempRoot("figma-wiring-dash-placeholder");
    const content = [TABLE_HEADER, "| 1 | 1:1 | Structure | - | — |  | x |  |"].join("\n");
    writeFigmaFile(root, "my-feature", "01-home.md", content);
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("#1: unwired");
  });
});

describe("validate_figma_wiring.ts: empty/zero-population fails loudly", () => {
  test("figma/ directory present but zero wiring-table rows parsed exits 1, not a silent 0", () => {
    const root = makeTempRoot("figma-wiring-zero-rows");
    writeFigmaFile(root, "my-feature", "01-home.md", TABLE_HEADER + "\n");
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("zero wiring-table rows were parsed");
    expect(r.stdout).toContain("scanned 1 file(s), parsed 0 row(s)");
  });

  test("figma/ directory present with no .md files at all exits 1", () => {
    const root = makeTempRoot("figma-wiring-no-md-files");
    mkdirSync(join(root, ".specs", "features", "my-feature", "figma"), { recursive: true });
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("zero wiring-table rows were parsed");
    expect(r.stdout).toContain("scanned 0 file(s), parsed 0 row(s)");
  });

  test("no figma/ directory at all (Figma ingestion never enabled) exits 0 -- nothing to check", () => {
    const root = makeTempRoot("figma-wiring-no-dir");
    mkdirSync(join(root, ".specs", "features", "my-feature"), { recursive: true });
    const r = run(["my-feature", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("scanned 0 file(s), parsed 0 row(s), 0 unwired, 0 error(s)");
  });
});

describe("validate_figma_wiring.ts: --type routing", () => {
  test("--type quick scans .specs/quick/<slug>/figma/ instead of features", () => {
    const root = makeTempRoot("figma-wiring-type-quick");
    writeFigmaFile(
      root,
      "001-fix-typo",
      "01.md",
      [TABLE_HEADER, "| 1 | 1:1 | Structure | REQ-01 |  |  | x |  |"].join("\n"),
      "quick",
    );
    const r = run(["001-fix-typo", "--root", root, "--type", "quick"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("(type: quick)");
    expect(r.stdout).toContain("scanned 1 file(s), parsed 1 row(s)");
  });

  test("an unknown --type is a usage error (exit 2)", () => {
    const root = makeTempRoot("figma-wiring-type-bad");
    const r = run(["my-feature", "--root", root, "--type", "nonsense"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("invalid choice: 'nonsense'");
  });
});

describe("validate_figma_wiring.ts: usage errors", () => {
  test("missing slug is a usage error (exit 2)", () => {
    const r = run(["--root", "."]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("the following arguments are required: slug");
  });
});
