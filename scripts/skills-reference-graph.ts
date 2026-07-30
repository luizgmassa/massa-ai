#!/usr/bin/env bun
/**
 * skills-reference-graph.ts
 *
 * Two questions the line-level duplication metric cannot answer:
 *
 *   1. ORPHANS — which files under `skills/` are never named by any other file
 *      under `skills/`, by an installer, by a generator, or by a doc? An
 *      unreachable reference file is pure context cost: it ships in four plugin
 *      bundles and no routing path can ever load it.
 *
 *   2. NEAR-TWINS — which file pairs share most of their normalized lines
 *      without being literal copies? Paraphrased directives are invisible to
 *      shingle matching but carry the same drift hazard.
 *
 * Both are evidence, not verdicts. A high-similarity pair may be two
 * legitimately parallel domain workflows; the metric only says where to look.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Everything outside `skills/` that may legitimately name a skills file. */
const EXTERNAL_ROOTS = ['scripts', 'apps', 'packages', 'docs', '.specs'];
const EXTERNAL_TOP_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'CONTRIBUTING.md', 'FEATURES.md'];
const NEAR_TWIN_FLOOR = 0.2;
/** Below this many normalized lines a Jaccard score is noise, not signal. */
const MIN_LINES_FOR_SIMILARITY = 15;

export interface NearTwin {
  a: string;
  b: string;
  jaccard: number;
  shared: number;
}

export interface ReferenceGraphReport {
  /** Number of files under `skills/` that were examined. */
  scanned: number;
  orphans: string[];
  /** Named only by generated bundles or historical `.specs/` records. */
  weaklyReferenced: string[];
  nearTwins: NearTwin[];
}

function walk(dir: string, exts: string[], acc: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, acc);
    else if (exts.some((e) => entry.endsWith(e))) acc.push(full);
  }
  return acc;
}

function normalizedLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length > 0);
}

/**
 * The path forms a human or generator would plausibly write for a target:
 * repo-relative, skills-relative, and `skills/massa-ai/`-relative.
 *
 * Bare basenames are deliberately excluded. `lessons.md` exists twice in this
 * tree, and a basename match would mark both reachable on a single mention —
 * the metric would then report zero orphans for the wrong reason.
 */
function referenceForms(repoRelative: string): string[] {
  const forms = new Set<string>([repoRelative]);
  if (repoRelative.startsWith('skills/')) forms.add(repoRelative.slice('skills/'.length));
  const maPrefix = 'skills/massa-ai/';
  if (repoRelative.startsWith(maPrefix)) forms.add(repoRelative.slice(maPrefix.length));
  return [...forms];
}

/**
 * Builds the reachability and similarity report for one repository root.
 *
 * @param repoRoot - Directory holding `skills/` and the external roots.
 */
export function analyzeReferences(repoRoot: string): ReferenceGraphReport {
  const skillsDir = join(repoRoot, 'skills');
  const skillFiles = walk(skillsDir, ['.md', '.json', '.py']).sort();

  const corpusPaths = [
    ...skillFiles,
    ...EXTERNAL_ROOTS.flatMap((r) => walk(join(repoRoot, r), ['.md', '.ts', '.json', '.sh', '.js'])),
    ...EXTERNAL_TOP_FILES.map((f) => join(repoRoot, f)).filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    }),
  ];

  const corpus = new Map<string, string>();
  for (const f of corpusPaths) {
    try {
      corpus.set(f, readFileSync(f, 'utf8'));
    } catch {
      /* unreadable — cannot meaningfully contain a reference */
    }
  }

  const orphans: string[] = [];
  const weaklyReferenced: string[] = [];

  for (const target of skillFiles) {
    const rel = relative(repoRoot, target).split('\\').join('/');
    const forms = referenceForms(rel);
    // A directory-level pointer (`references/the-fool/`) reaches every member.
    //
    // Only pointers naming a SUBdirectory count. The first implementation
    // accepted every parent, including the bare container `references/` — a
    // string that appears in nearly every workflow file — so every reference
    // was marked reachable by any mention of any reference, and the scan
    // reported zero orphans for a reason unrelated to reachability. A
    // container form must therefore have at least two segments, which
    // `references/the-fool/` has and `references/` does not.
    const dirForms = forms
      .filter((f) => f.split('/').length >= 3)
      .map((f) => `${f.split('/').slice(0, -1).join('/')}/`);

    const referents: string[] = [];
    for (const [source, text] of corpus) {
      if (source === target) continue;
      if (forms.some((f) => text.includes(f)) || dirForms.some((d) => text.includes(d))) {
        referents.push(relative(repoRoot, source).split('\\').join('/'));
      }
    }

    if (referents.length === 0) orphans.push(rel);
    else if (referents.every((h) => h.startsWith('apps/') || h.startsWith('.specs/'))) {
      // Named only by its own generated copy or by a historical record — still
      // unreachable from any live routing path.
      weaklyReferenced.push(rel);
    }
  }

  const mdFiles = skillFiles.filter((f) => f.endsWith('.md'));
  const sets = new Map<string, Set<string>>();
  for (const f of mdFiles) sets.set(f, new Set(normalizedLines(f)));

  const nearTwins: NearTwin[] = [];
  for (let i = 0; i < mdFiles.length; i++) {
    for (let j = i + 1; j < mdFiles.length; j++) {
      const A = sets.get(mdFiles[i]!)!;
      const B = sets.get(mdFiles[j]!)!;
      if (A.size < MIN_LINES_FOR_SIMILARITY || B.size < MIN_LINES_FOR_SIMILARITY) continue;
      let shared = 0;
      for (const l of A) if (B.has(l)) shared++;
      const jaccard = shared / (A.size + B.size - shared);
      if (jaccard >= NEAR_TWIN_FLOOR) {
        nearTwins.push({
          a: relative(repoRoot, mdFiles[i]!).split('\\').join('/'),
          b: relative(repoRoot, mdFiles[j]!).split('\\').join('/'),
          jaccard,
          shared,
        });
      }
    }
  }
  nearTwins.sort((x, y) => y.jaccard - x.jaccard);

  return { scanned: skillFiles.length, orphans, weaklyReferenced, nearTwins };
}

function main(): void {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  const report = analyzeReferences(root);

  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  process.stdout.write(`scanned ${report.scanned} files under skills/\n\n`);
  process.stdout.write(`=== ORPHANS (named by nothing) — ${report.orphans.length} ===\n`);
  for (const o of report.orphans) process.stdout.write(`  ${o}\n`);
  process.stdout.write(
    `\n=== WEAKLY REFERENCED (only generated bundles or .specs) — ${report.weaklyReferenced.length} ===\n`,
  );
  for (const o of report.weaklyReferenced) process.stdout.write(`  ${o}\n`);
  process.stdout.write(`\n=== NEAR-TWIN PAIRS (jaccard >= ${NEAR_TWIN_FLOOR}) — ${report.nearTwins.length} ===\n`);
  for (const p of report.nearTwins.slice(0, 40)) {
    process.stdout.write(`  ${p.jaccard.toFixed(3)} shared=${String(p.shared).padStart(3)}\n`);
    process.stdout.write(`        ${p.a}\n        ${p.b}\n`);
  }
}

if (import.meta.main) main();
