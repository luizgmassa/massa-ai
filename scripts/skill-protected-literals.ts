/**
 * skill-protected-literals.ts — STO-4 guard (Plan Challenge F1).
 *
 * Builds the protected-span inventory for the skill markdown surface: every
 * string literal AND regex-literal fragment (≥ MIN_LEN chars) found in the
 * content-coupled TypeScript sources (scripts/__tests__/, scripts/lib/,
 * scripts/*.ts, skills/massa-ai/scripts/) that also occurs in a skill `.md`
 * file. Compression/extraction must not alter these spans.
 *
 * Regex literals are decomposed into their literal word runs (escapes and
 * quantifiers reduced to spaces) because tests anchor prose with
 * `.toMatch(/two consecutive failed fix attempts/i)`-style patterns that a
 * string-literal-only scan cannot see.
 *
 * Modes:
 *   bun scripts/skill-protected-literals.ts [--root <dir>]          → emit inventory JSON to stdout
 *   bun scripts/skill-protected-literals.ts --verify <inventory.json> → re-check every span, exit 1 listing losses
 *
 * Matching is case-insensitive (tests commonly use the `i` flag).
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MIN_LEN = 12;

function walk(dir: string, ext: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, ext, out);
    else if (entry.endsWith(ext)) out.push(p);
  }
}

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  walk(join(root, "scripts", "__tests__"), ".ts", out);
  walk(join(root, "scripts", "lib"), ".ts", out);
  walk(join(root, "skills", "massa-ai", "scripts"), ".ts", out);
  for (const entry of readdirSync(join(root, "scripts"))) {
    if (entry.endsWith(".ts")) out.push(join(root, "scripts", entry));
  }
  return out;
}

function listSkillMd(root: string): string[] {
  const out: string[] = [];
  walk(join(root, "skills", "massa-ai"), ".md", out);
  walk(join(root, "skills", "agents"), ".md", out);
  walk(join(root, "skills", "persona-router"), ".md", out);
  return out;
}

// String literals: '…', "…", and `…` without interpolation.
const STRING_RE = /'((?:[^'\\\n]|\\.)+)'|"((?:[^"\\\n]|\\.)+)"|`((?:[^`\\$]|\\.)+)`/g;
// Regex literals: a conservative match — slash-delimited, no newlines, at
// least one non-slash char, followed by flags. Division noise is filtered by
// requiring an alphabetic run afterwards during decomposition.
const REGEX_RE = /\/((?:[^/\\\n]|\\.){2,})\/[a-z]*/g;

function unescape(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/** Reduce regex source to literal word runs: escapes/classes/quantifiers → space. */
function regexWordRuns(source: string): string[] {
  const flattened = source
    .replace(/\\[sSdDwWbB]|\\[nrt]/g, " ")
    .replace(/\[(?:[^\]\\]|\\.)*\]/g, " ")
    .replace(/\((?:\?[:=!<]+)?|\)/g, " ")
    .replace(/[.*+?^$|{}\d,]/g, " ")
    .replace(/\\(.)/g, "$1");
  return flattened
    .split(/\s{1,}/)
    .join(" ")
    .split(/\s+/)
    .reduce<string[]>((runs, word) => {
      if (word) {
        const last = runs.length - 1;
        if (last >= 0) runs[last] = `${runs[last]} ${word}`;
        else runs.push(word);
      }
      return runs;
    }, []);
}

function collectCandidates(sources: string[]): Set<string> {
  const candidates = new Set<string>();
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(STRING_RE)) {
      const raw = unescape(m[1] ?? m[2] ?? m[3] ?? "");
      if (raw.trim().length >= MIN_LEN) candidates.add(raw.trim());
    }
    for (const m of text.matchAll(REGEX_RE)) {
      for (const run of regexWordRuns(m[1]!)) {
        if (run.length >= MIN_LEN && /[a-z]{3}/i.test(run)) candidates.add(run);
      }
    }
  }
  return candidates;
}

function buildInventory(root: string): Record<string, string[]> {
  const candidates = [...collectCandidates(listSourceFiles(root))];
  const inventory: Record<string, string[]> = {};
  for (const md of listSkillMd(root)) {
    const body = readFileSync(md, "utf8").toLowerCase().replace(/\s+/g, " ");
    const hits = candidates
      .filter((c) => body.includes(c.toLowerCase().replace(/\s+/g, " ")))
      .sort();
    if (hits.length > 0) inventory[md.slice(root.length + 1)] = hits;
  }
  return inventory;
}

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = resolve(rootIdx >= 0 && argv[rootIdx + 1] ? argv[rootIdx + 1]! : ".");
const verifyIdx = argv.indexOf("--verify");

if (verifyIdx >= 0) {
  const invPath = argv[verifyIdx + 1];
  if (!invPath) {
    console.error("usage: --verify <inventory.json>");
    process.exit(2);
  }
  const inventory = JSON.parse(readFileSync(invPath, "utf8")) as Record<string, string[]>;
  const losses: string[] = [];
  let spans = 0;
  for (const [file, literals] of Object.entries(inventory)) {
    const p = join(root, file);
    const body = existsSync(p)
      ? readFileSync(p, "utf8").toLowerCase().replace(/\s+/g, " ")
      : "";
    for (const lit of literals) {
      spans++;
      if (!body.includes(lit.toLowerCase().replace(/\s+/g, " "))) {
        losses.push(`${file}: LOST "${lit}"`);
      }
    }
  }
  console.log(`verified ${Object.keys(inventory).length} files, ${spans} spans, ${losses.length} losses`);
  for (const loss of losses) console.error(loss);
  process.exit(losses.length === 0 ? 0 : 1);
}

const inventory = buildInventory(root);
const fileCount = Object.keys(inventory).length;
const spanCount = Object.values(inventory).reduce((n, l) => n + l.length, 0);
console.error(`inventory: ${fileCount} protected files, ${spanCount} spans`);
console.log(JSON.stringify(inventory, null, 2));
