#!/usr/bin/env bun
/**
 * Assert that no model name is hand-authored outside the registry (MPR-R1).
 *
 *   bun scripts/verify-model-tokens.ts
 *   bun scripts/verify-model-tokens.ts --json
 *
 * MPR-R1's acceptance criterion is "a scripted scan for model tokens returns 0 hits in
 * charter sources, mirrored charters, generated agent bodies, and the generator". Nothing
 * enforced it before this script existed. `loadCharter` rejects the retired
 * `metadata.model_hint` KEY, and every emitter takes a resolved `{model, effort}` pair
 * rather than a literal — but neither notices a model name typed into a charter's PROSE,
 * which then propagates byte-identically into 4 host artifacts and 4 mirrored skill
 * bundles with every gate still green. That was a live hole, reproduced before this was
 * written.
 *
 * THE TOKEN LIST IS DERIVED, NEVER TYPED. Hand-listing the models to search for would
 * recreate the duplication this feature removes, one layer out, and would silently stop
 * covering a model added to the registry later. Two derived sources, unioned:
 *
 *   - every non-null `model` in `skills/model-profiles.json` — what ships now;
 *   - every `model` in the frozen `baseline-main.json` fixture — what shipped on the base
 *     commit, so a reverted display name like a Cursor one is still caught.
 *
 * Provider-qualified ids also contribute their bare segment (`p/glm-x` -> `glm-x`), so a
 * charter naming the model without its provider is a hit too.
 *
 * WHERE A MODEL VALUE IS LEGITIMATE, and therefore excluded by construction:
 *
 *   - the registry itself, and the frozen fixture;
 *   - the `model` / `model_reasoning_effort` assignment in a GENERATED artifact — that is
 *     the emitted value, and `subagent-parity.test.ts` already checks it against the
 *     registry and the frozen baseline. Only the artifact BODY is scanned here;
 *   - `subagent-parity.test.ts`'s frozen-baseline literals — MPR-R1's ONE declared
 *     exception, and deliberately so: a fixture test derived entirely from the registry
 *     would pass whatever the registry contained. The literal is what gives it teeth;
 *   - `.specs/`, `CHANGELOG.md`, and `.ua/` — history and design records, not sources.
 *
 * COVERAGE BOUNDARY: `FEATURES.md` is NOT scanned here. The MPR-R11 doc-drift test in
 * `subagent-parity.test.ts` already asserts no registry model id appears in it, and owns
 * that surface. This script owns the four surfaces MPR-R1 enumerates.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import path from "path";
import { loadRegistry } from "./lib/model-profiles.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const FIXTURE = ".specs/features/model-profile-registry/fixtures/baseline-main.json";
const HOST_PLUGINS = ["claude-plugin", "codex-plugin", "cursor-plugin", "opencode-plugin"] as const;

export interface Hit {
  readonly file: string;
  readonly line: number;
  readonly token: string;
  readonly text: string;
}

/** Every model name this repository has ever pinned, derived from two files. */
export function modelTokens(root = REPO_ROOT): readonly string[] {
  const tokens = new Set<string>();
  const add = (id: string): void => {
    tokens.add(id);
    const bare = id.split("/").pop();
    if (bare && bare !== id) tokens.add(bare);
  };

  const registry = loadRegistry(path.join(root, "skills/model-profiles.json"));
  for (const profile of Object.values(registry.profiles)) {
    for (const tiers of Object.values(profile.hosts)) {
      for (const resolved of Object.values(tiers)) {
        if (resolved.model !== null) add(resolved.model);
      }
    }
  }

  // The frozen fixture is read-only input here. It is pinned to the base commit and must
  // never be regenerated from the live tree — that is what keeps retired names covered.
  const fixture = JSON.parse(readFileSync(path.join(root, FIXTURE), "utf8")) as {
    agents: Record<string, Record<string, { model: string | null }>>;
  };
  for (const hosts of Object.values(fixture.agents)) {
    for (const entry of Object.values(hosts)) {
      if (entry.model !== null) add(entry.model);
    }
  }

  // Longest first, so a provider-qualified id is reported instead of its bare segment.
  return [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * Boundary chars that make a token part of a longer identifier rather than a mention.
 * `-` and `/` are included so `deepseek-v4-pro` does not fire inside
 * `opencode-go/deepseek-v4-pro` (the full id fires instead), and `.` so a version-suffixed
 * id is not split. Whitespace is deliberately absent — see `tokenRegex`.
 */
const EDGE = "A-Za-z0-9/.:_-";

/**
 * A token matches across separator and whitespace variation, and across a LINE BREAK.
 *
 * Matching each line against the literal token was the first version, and it missed the
 * commonest realistic case in this repo: prose wraps at ~95 columns, so a multi-word display
 * name is as likely to be typed `DeepSeek V4\nPro` as on one line. `-`, `_` and whitespace are
 * therefore interchangeable separators inside a token, which also catches a name written with
 * a space where the id has a hyphen — a paraphrase of a registry fact is still that fact.
 *
 * Deliberately NOT covered: a model name that appears nowhere in the registry or the frozen
 * fixture, and homoglyph substitution. The first is out of scope by construction — this checks
 * for facts that DUPLICATE the registry, and a string naming a model nothing resolves is a
 * different problem. The second is evasion, and the failure mode here is a well-meaning
 * engineer pasting a value, not someone hiding one.
 */
function tokenRegex(token: string): RegExp {
  const escaped = token
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[-_ ]+/g, "[-_\\s]+");
  return new RegExp(`(?<![${EDGE}])${escaped}(?![${EDGE}])`, "gi");
}

/** Body of a generated `.md` artifact — everything after the frontmatter block. */
function mdBody(raw: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}

/**
 * A generated `.toml` artifact minus the lines that legitimately hold the emitted value.
 * Everything that survives is charter prose carried into `developer_instructions`.
 */
function tomlWithoutModelAssignments(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((l) => (/^\s*(model|model_reasoning_effort)\s*=/.test(l) ? "" : l))
    .join("\n");
}

interface Target {
  readonly file: string;
  readonly content: string;
}

function charterDirs(root: string, base: string): string[] {
  const dir = path.join(root, base);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((n) => path.join(base, n))
    .filter((rel) => statSync(path.join(root, rel)).isDirectory());
}

/** The four surfaces MPR-R1 enumerates, resolved to concrete files + scannable content. */
export function collectTargets(root = REPO_ROOT): readonly Target[] {
  const out: Target[] = [];
  const read = (rel: string): string => readFileSync(path.join(root, rel), "utf8");

  // 1. charter sources — whole file. A charter declares a tier, never a model.
  for (const dir of charterDirs(root, "skills/agents")) {
    const rel = path.join(dir, "SKILL.md");
    if (existsSync(path.join(root, rel))) out.push({ file: rel, content: read(rel) });
  }

  for (const host of HOST_PLUGINS) {
    // 2. mirrored charters — byte copies, so a hit here means the source drifted.
    for (const dir of charterDirs(root, `apps/${host}/skills/agents`)) {
      const rel = path.join(dir, "SKILL.md");
      if (existsSync(path.join(root, rel))) out.push({ file: rel, content: read(rel) });
    }

    // 3. generated agent bodies — the emitted `model` assignment is excluded, the prose is not.
    const agentsDir = path.join(root, "apps", host, "agents");
    if (!existsSync(agentsDir)) continue;
    for (const name of readdirSync(agentsDir).sort()) {
      const rel = path.join("apps", host, "agents", name);
      const raw = read(rel);
      if (name.endsWith(".toml")) out.push({ file: rel, content: tomlWithoutModelAssignments(raw) });
      else if (name.endsWith(".md")) out.push({ file: rel, content: mdBody(raw) });
    }
  }

  // 4. the generator — it resolves values, so it must not contain one.
  const gen = "scripts/generate-subagent-artifacts.ts";
  if (existsSync(path.join(root, gen))) out.push({ file: gen, content: read(gen) });

  return out;
}

export function scan(
  targets: readonly Target[],
  tokens: readonly string[] = modelTokens(),
): readonly Hit[] {
  const hits: Hit[] = [];
  for (const { file, content } of targets) {
    // Whole-content matching, not per-line: a token may straddle a line break.
    const seen = new Set<number>();
    for (const token of tokens) {
      const re = tokenRegex(token);
      for (const m of content.matchAll(re)) {
        const line = content.slice(0, m.index).split(/\r?\n/).length;
        // Longest tokens run first, so a full id claims the line before its bare segment.
        if (seen.has(line)) continue;
        seen.add(line);
        hits.push({ file, line, token, text: m[0].replace(/\s+/g, " ").slice(0, 120) });
      }
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const tokens = modelTokens();
  const targets = collectTargets();
  const hits = scan(targets, tokens);

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ tokens, scanned: targets.length, hits }, null, 2));
  } else if (hits.length === 0) {
    console.log(
      `OK  no model name outside the registry — scanned ${targets.length} file(s) ` +
        `for ${tokens.length} token(s).`,
    );
  } else {
    console.error(
      `FAIL  ${hits.length} hand-authored model name(s) found. The registry ` +
        `(skills/model-profiles.json) is the only place these belong (MPR-R1).\n`,
    );
    for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.token}\n      ${h.text}`);
  }

  // A scan that found nothing because it scanned nothing is a false pass.
  if (targets.length === 0) {
    console.error("FAIL  scan matched no files — the surface globs are wrong, not clean.");
    return 2;
  }
  return hits.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  const code = main();
  if (code !== 0) process.exit(code);
}
