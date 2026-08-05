/**
 * check-skill-doc-paths.ts — STO-7 guard.
 *
 * Resolves every relative path citation (`references/…`, `workflows/…`,
 * `scripts/…`, `skills/…`) found in the skill markdown surface
 * (skills/massa-ai/**, skills/agents/**, skills/persona-router/**) against
 * the repository. A citation resolves if it exists relative to the citing
 * file's skill root (skills/massa-ai/) or the repository root.
 *
 * Exit 0: all citations resolve. Exit 1: prints `file:line -> citation` for
 * every miss. Always prints the scanned/citation population so a dead scan is
 * distinguishable from a clean tree.
 *
 * Usage: bun scripts/check-skill-doc-paths.ts [--root <dir>]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function args(): { root: string } {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--root");
  return { root: resolve(i >= 0 && argv[i + 1] ? argv[i + 1]! : ".") };
}

function walkMd(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walkMd(p, out);
    else if (entry.endsWith(".md")) out.push(p);
  }
}

// A citation: one of the four prefixes followed by a plausible relative path,
// ending in a known extension or a trailing slash (directory citation).
const CITE_RE =
  /(?:^|[\s`("'[])((?:references|workflows|scripts|skills)\/[A-Za-z0-9_./-]*(?:\.(?:md|ts|sh|json|py)|\/))(?=$|[\s`)"'\],.:;])/g;

// Template/placeholder citations are not resolvable paths.
function isTemplate(cite: string): boolean {
  return /[<>*{}[\]$]|NNN-|<slug>|\.\.\./.test(cite);
}

const { root } = args();
const skillRoot = join(root, "skills", "massa-ai");
const files: string[] = [];
walkMd(skillRoot, files);
walkMd(join(root, "skills", "agents"), files);
walkMd(join(root, "skills", "persona-router"), files);

let citations = 0;
const misses: string[] = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(CITE_RE)) {
      const cite = m[1]!;
      if (isTemplate(cite)) continue;
      citations++;
      const bare = cite.endsWith("/") ? cite.slice(0, -1) : cite;
      // Own-skill-first: a citation resolves against the citing file's own
      // skills/<name>/ root before the massa-ai root and the repo root.
      const rel = file.slice(root.length + 1).split("/");
      const ownRoot = rel[0] === "skills" && rel[1] ? join(root, "skills", rel[1]!) : root;
      const candidates = [join(ownRoot, bare), join(skillRoot, bare), join(root, bare)];
      if (!candidates.some((c) => existsSync(c))) {
        misses.push(`${file.slice(root.length + 1)}:${idx + 1} -> ${cite}`);
      }
    }
  });
}

console.log(`scanned ${files.length} md files, ${citations} citations, ${misses.length} misses`);
for (const miss of misses) console.error(`MISS ${miss}`);
process.exit(misses.length === 0 ? 0 : 1);
