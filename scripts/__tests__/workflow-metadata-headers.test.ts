/**
 * Workflow metadata-header gate (workflow-metadata-headers, WMH-03).
 *
 * The 36 workflow files under `skills/massa-ai/workflows/` carry Agent
 * Skills-style YAML frontmatter (`name` / `description` / `license` /
 * `metadata.version`), mirroring the convention already used by every
 * SKILL.md in this repo. `skills.yml` CI validates only `SKILL.md`
 * frontmatter — this test is the sole backstop for `workflows/*.md`.
 *
 * Two structural rules (memory-lesson classes this repo has hit):
 * - The resolved file population is printed beside the verdict — a glob
 *   that resolves to nothing would otherwise be indistinguishable from a
 *   passing gate.
 * - An empty population FAILS, and the population is asserted to be
 *   exactly 36 (locked count) so a silently added/removed workflow file is
 *   caught here rather than discovered elsewhere.
 *
 * Frontmatter is parsed with Bun's built-in real YAML parser
 * (`Bun.YAML.parse`) — never a key-presence regex. Plan Challenge F1/F2:
 * regex-green + parse-broken is the failure mode this test exists to catch.
 */

import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, "skills/massa-ai/workflows");

const EXPECTED_WORKFLOW_COUNT = 36;

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;

function findMarkdownFiles(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out = out.concat(findMarkdownFiles(abs));
    } else if (entry.endsWith(".md")) {
      out.push(abs);
    }
  }
  return out;
}

type FileCheck = {
  relPath: string;
  stem: string;
  errors: string[];
};

function checkFile(abs: string): FileCheck {
  const relPath = path.relative(REPO_ROOT, abs);
  const stem = path.basename(abs, ".md");
  const errors: string[] = [];

  const content = readFileSync(abs, "utf8");
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    errors.push("no leading frontmatter block (must start with '---\\n' and close with '\\n---\\n')");
    return { relPath, stem, errors };
  }

  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(match[1]);
  } catch (err) {
    errors.push(`YAML parse error: ${(err as Error).message}`);
    return { relPath, stem, errors };
  }

  if (typeof parsed !== "object" || parsed === null) {
    errors.push("frontmatter did not parse to an object");
    return { relPath, stem, errors };
  }
  const fm = parsed as Record<string, unknown>;

  // name
  if (typeof fm.name !== "string") {
    errors.push(`name: expected string, got ${typeof fm.name}`);
  } else {
    if (fm.name !== stem) {
      errors.push(`name mismatch: frontmatter="${fm.name}" stem="${stem}"`);
    }
    if (!NAME_RE.test(fm.name)) {
      errors.push(`name fails charset /^[a-z0-9]+(-[a-z0-9]+)*$/: "${fm.name}"`);
    }
    if (fm.name.length > 64) {
      errors.push(`name exceeds 64 chars: ${fm.name.length}`);
    }
  }

  // description
  if (typeof fm.description !== "string") {
    errors.push(`description: expected string, got ${typeof fm.description}`);
  } else {
    if (fm.description.includes("\n")) {
      errors.push("description is not single-line");
    }
    if (fm.description.length < 20 || fm.description.length > 1024) {
      errors.push(`description length ${fm.description.length} outside [20, 1024]`);
    }
  }

  // license
  if (fm.license !== "MIT") {
    errors.push(`license: expected "MIT", got ${JSON.stringify(fm.license)}`);
  }

  // metadata.version
  const metadata = fm.metadata as Record<string, unknown> | undefined;
  if (typeof metadata !== "object" || metadata === null) {
    errors.push(`metadata: expected object, got ${typeof metadata}`);
  } else if (typeof metadata.version !== "string") {
    errors.push(`metadata.version: expected string, got ${typeof metadata.version}`);
  } else if (!SEMVER_RE.test(metadata.version)) {
    errors.push(`metadata.version fails semver /^\\d+\\.\\d+\\.\\d+$/: "${metadata.version}"`);
  } else if (metadata.version !== "1.0.0") {
    errors.push(`metadata.version: expected "1.0.0", got "${metadata.version}"`);
  }

  return { relPath, stem, errors };
}

describe("workflow metadata headers (WMH-03)", () => {
  test(`all workflow .md files carry valid Agent Skills frontmatter (population == ${EXPECTED_WORKFLOW_COUNT})`, () => {
    const files = findMarkdownFiles(WORKFLOWS_DIR).sort();

    // Dead-subject guard: an empty population is a failure, not a pass.
    expect(files.length).toBeGreaterThan(0);

    const results = files.map((f) => checkFile(f));

    // Population print: visible in failure output and via --verbose runs.
    console.log(
      `[workflow-metadata-headers] checked ${results.length} file(s): ` +
        results.map((r) => `${r.relPath}${r.errors.length ? ` (${r.errors.length} error(s))` : ""}`).join(", "),
    );

    // Locked population — a silently added/removed workflow file fails here.
    expect(results.length).toBe(EXPECTED_WORKFLOW_COUNT);

    const failures = results
      .filter((r) => r.errors.length > 0)
      .map((r) => `${r.relPath}:\n  - ${r.errors.join("\n  - ")}`);
    expect(failures).toEqual([]);
  });
});
