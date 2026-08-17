/**
 * IPT-03 AC-03.4 / IPT-05 AC-05.3a — installer removal-derivation sweep.
 *
 * Two defects motivated this file, and both were invisible to every gate the
 * repository had:
 *
 *   1. Five install-path copy loops never removed a retired member, so an agent
 *      or command deleted from the bundle stayed installed forever.
 *   2. Two removal loops derived their population from the SOURCE BUNDLE
 *      instead of the installed directory. Under AD-016 the bundle is
 *      generated on demand and normally absent, so one of them removed nothing
 *      at all.
 *
 * The invariant, stated once (design.md D2):
 *
 *     The removal population is the destination directory.
 *     The bundle supplies only a keep-predicate.
 *
 * That distinction is why this sweep classifies a loop by its ITERATION
 * EXPRESSION ALONE and never by its body. Every correct copy-then-prune loop
 * mentions the bundle inside its body — that is exactly the keep-predicate
 * (`[[ -f "$ACTIVE_AGENTS_SRC/$name" ]] && continue`). A body-level scan would
 * flag all six correct fixes as violations and be useless.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");

const INSTALLERS = [
  "apps/claude-plugin/install.sh",
  "apps/codex-plugin/install.sh",
  "apps/cursor-plugin/install.sh",
  "apps/opencode-plugin/install.sh",
  "scripts/install-skills.sh",
];

/** Variables naming the SOURCE BUNDLE. Iterating one of these to decide a removal is the defect. */
const SOURCE_VARS = [
  "SCRIPT_DIR",
  "ACTIVE_AGENTS_SRC",
  "VARIANTS_SRC",
  "PLUGIN_SOURCE_ROOT",
  "SKILLS_ROOT",
  "variant_dir",
];

/** Variables naming an INSTALLED DESTINATION. */
const DEST_VARS = [
  "TARGET",
  "AGENTS_DIR",
  "CURSOR_AGENTS_DIR",
  "COMMANDS_DIR",
  "CODEX_DIR",
  "CURSOR_DIR",
  "HARNESS_SKILLS_DIR",
  "VARIANTS_DEST",
  "skills_dir",
  "install_path",
];

/**
 * State-derived: the loop iterates install-state.json's record of what this
 * installer previously put on disk. That is a faithful proxy for the
 * destination — arguably a better one, since it cannot see a foreign file —
 * so it satisfies D2. Named as its own class rather than folded into
 * "destination" so the distinction stays visible to the next reader.
 */
const STATE_DERIVED = ["state_skills_for"];

type Loop = {
  file: string;
  line: number;
  iter: string;
  removes: boolean;
  purpose: "prune" | "refresh";
  kind: "source" | "destination" | "state" | "literal" | "unclassified";
};

/**
 * Two operations both contain `rm`, and only ONE is subject to the D2 rule.
 * Conflating them makes this sweep useless in both directions.
 *
 *   PRUNE   — removes members that are NOT being reinstalled. Its population
 *             must be the destination, because the entire point is to reach a
 *             member the source no longer has.
 *
 *   REFRESH — removes a member it is about to write straight back, e.g.
 *             `rm -rf "$target"; cp -R "$source" "$target"`. Iterating the
 *             install list here is not merely allowed, it is required: the
 *             loop's job is to install exactly those names.
 *
 * The discriminator is whether the body also performs an install action. This
 * distinction was absent from the original design — the sweep discovered it by
 * flagging nine legitimate refresh loops on its first run.
 */
function purposeOf(bodyText: string): "prune" | "refresh" {
  const installs = /\bcp\s+-|\bln\s+-s|\binstall\s+-/.test(bodyText);
  return installs ? "refresh" : "prune";
}

/** Openers that must be matched by a `done`. `if`/`case` close with fi/esac, not done. */
function opensLoop(line: string): boolean {
  const stripped = line.replace(/#.*$/, "");
  return /;\s*do\b/.test(stripped) || /\bdo\s*$/.test(stripped);
}

function closesLoop(line: string): boolean {
  return /^\s*done\b/.test(line.replace(/#.*$/, ""));
}

function classify(iter: string): Loop["kind"] {
  const vars = [...iter.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
  if (STATE_DERIVED.some((s) => iter.includes(s))) return "state";
  if (vars.some((v) => SOURCE_VARS.includes(v))) return "source";
  if (vars.some((v) => DEST_VARS.includes(v))) return "destination";
  if (vars.length === 0) return "literal"; // e.g. `for name in massa-ai persona-router profile`
  return "unclassified";
}

function parseLoops(file: string): Loop[] {
  const body = readFileSync(join(REPO, file), "utf8");
  const lines = body.split("\n");
  const loops: Loop[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+(.+?);?\s*do\s*$/.exec(
      lines[i].replace(/#.*$/, ""),
    );
    if (!m) continue;

    let depth = 1;
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length && depth > 0; j++) {
      if (closesLoop(lines[j])) {
        depth--;
        if (depth === 0) break;
      } else if (opensLoop(lines[j])) {
        depth++;
      }
      bodyLines.push(lines[j]);
    }

    const bodyText = bodyLines.join("\n");
    loops.push({
      file,
      line: i + 1,
      iter: m[1].trim(),
      removes: /\brm\s+-[rf]/.test(bodyText) || /\bunlink\b/.test(bodyText),
      purpose: purposeOf(bodyText),
      kind: classify(m[1].trim()),
    });
  }
  return loops;
}

describe("installer prune loops derive their population from the destination", () => {
  const all = INSTALLERS.flatMap(parseLoops);
  const removal = all.filter((l) => l.removes);
  const prune = removal.filter((l) => l.purpose === "prune");
  const refresh = removal.filter((l) => l.purpose === "refresh");

  /**
   * Floors, not exact counts. A parser that silently matches nothing reports
   * "zero violations" and looks identical to a clean tree — precisely the
   * failure mode this feature exists to eliminate. Pinned below the measured
   * values so ordinary edits do not churn them, but far above zero so a broken
   * parser fails loudly instead of passing vacuously.
   */
  const LOOP_FLOOR = 30;
  const PRUNE_FLOOR = 12;

  test("the sweep parses a real population", () => {
    console.log(
      `[removal-derivation] files=${INSTALLERS.length} for-loops=${all.length} ` +
        `removal-loops=${removal.length} (prune=${prune.length} refresh=${refresh.length})`,
    );
    for (const l of prune) {
      console.log(`  prune   ${l.kind.padEnd(12)} ${l.file}:${l.line}  for … in ${l.iter}`);
    }
    for (const l of refresh) {
      console.log(`  refresh ${l.kind.padEnd(12)} ${l.file}:${l.line}  for … in ${l.iter}`);
    }
    expect(all.length).toBeGreaterThanOrEqual(LOOP_FLOOR);
    expect(prune.length).toBeGreaterThanOrEqual(PRUNE_FLOOR);
  });

  test("no prune loop iterates the source bundle", () => {
    const offenders = prune
      .filter((l) => l.kind === "source")
      .map((l) => `${l.file}:${l.line}: for … in ${l.iter}`);
    expect(offenders).toEqual([]);
  });

  test("every prune loop is classified — an unknown population is a gap, not a pass", () => {
    const unknown = prune
      .filter((l) => l.kind === "unclassified")
      .map((l) => `${l.file}:${l.line}: for … in ${l.iter}`);
    expect(unknown).toEqual([]);
  });

  /**
   * A prune keyed on a hardcoded name list carries the same latent defect this
   * feature removed everywhere else: retire a harness skill and these four
   * `uninstall_bundled_skills` loops will not shed it, because the name is no
   * longer in the literal they iterate.
   *
   * Fixing it is out of scope (IPT-F6) — the four sites are uninstall paths,
   * not the install paths this feature was scoped to. Pinned exactly rather
   * than tolerated as a class, so a NEW literal-keyed prune cannot appear
   * without moving this and forcing the decision to be made again. A floor
   * would let the class grow silently.
   *
   * Pinned by FILE, not by file:line — a line number is a position, and any
   * edit above one of these loops would churn the gate without changing
   * anything it is meant to detect.
   */
  test("literal-keyed prunes stay frozen at the four known files (IPT-F6)", () => {
    const literalPrunes = prune.filter((l) => l.kind === "literal");
    console.log(
      `[removal-derivation] literal-keyed prunes (IPT-F6): ${literalPrunes.length} — ` +
        literalPrunes.map((l) => `${l.file}:${l.line}`).join(", "),
    );
    expect(literalPrunes.map((l) => l.file).sort()).toEqual([
      "apps/claude-plugin/install.sh",
      "apps/codex-plugin/install.sh",
      "apps/cursor-plugin/install.sh",
      "apps/opencode-plugin/install.sh",
    ]);
  });
});

describe("plugin installers install exactly the generator's harness skills", () => {
  /** AC-05.2a: the generator's own constant is the authority, never a copy of it. */
  const generator = readFileSync(
    join(REPO, "scripts/generate-skill-artifacts.ts"),
    "utf8",
  );
  const constMatch = /for \(const bundleName of \[([^\]]+)\] as const\)/.exec(generator);

  test("the generator's harness-skill constant is readable", () => {
    expect(constMatch).not.toBeNull();
  });

  const expected = (constMatch?.[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  test("the constant names a real, non-empty set", () => {
    console.log(`[harness-skills] generator constant = [${expected.join(", ")}]`);
    expect(expected.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of INSTALLERS.filter((f) => f.startsWith("apps/"))) {
    test(`${file} installs exactly [${expected.join(", ")}]`, () => {
      const body = readFileSync(join(REPO, file), "utf8");
      // A negated class (`[^;\n]+`) has exactly one way to match a given span, so
      // this can't backtrack ambiguously the way the prior nested-quantifier
      // pattern (`(?:[a-z0-9-]+\s*)+`) could — a long run of hyphens gave that
      // pattern exponentially many ways to split the match (CodeQL js/redos,
      // alert #39). The `$` filter keeps the original scope: only a literal,
      // space-separated name list counts as a loop, not a variable-driven one
      // like `for name in $SKILL_NAMES; do`.
      const loops = [...body.matchAll(/for name in ([^;\n]+); do/g)]
        .map((m) => m[1].trim())
        .filter((s) => !s.includes("$"))
        .map((s) => s.split(/\s+/));
      // Every literal skill-name loop in a plugin installer must name the full
      // set: the install path AND the uninstall path, or an uninstall leaves a
      // skill behind that the install just placed.
      expect(loops.length).toBeGreaterThanOrEqual(1);
      for (const loop of loops) {
        expect(loop).toEqual(expected);
      }
    });
  }
});
