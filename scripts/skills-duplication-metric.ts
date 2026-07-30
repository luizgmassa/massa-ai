#!/usr/bin/env bun
/**
 * skills-duplication-metric.ts
 *
 * Measures literal cross-file duplication inside the `skills/` harness prose.
 *
 * Why this exists: `skills/` is ~14k lines of agent-facing Markdown spread over
 * 152 files. Duplicated directives there are not cosmetic — every copy is a
 * separate place a policy can drift, and a drifted copy is indistinguishable
 * from an authoritative one to a future agent reading with limited context.
 * Line counts do not detect this; only cross-file block matching does.
 *
 * Method: each Markdown file is normalized to non-empty trimmed lines with
 * collapsed internal whitespace. Every window of K consecutive normalized lines
 * is hashed. A hash appearing in two or more distinct files is a duplicated
 * shingle; adjacent duplicated shingles are merged into maximal blocks.
 *
 * Two figures are reported and they are NOT interchangeable:
 *
 *   duplicatedLines — every normalized line covered by a cross-file duplicated
 *     block, counted in EVERY file it appears in. This is the total footprint
 *     of duplication, not the amount of text a cleanup could delete.
 *
 *   excessLines — duplicatedLines minus one canonical copy of each distinct
 *     block. This is the removable figure: what disappears if each duplicated
 *     block is stated once and pointed at from everywhere else. Quote this one
 *     when claiming a saving.
 *
 * Both are floors, not totals — semantic paraphrase is invisible to shingle
 * matching by construction, and this repository's harness is mostly paraphrase.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DEFAULT_WINDOW = 5;
const DEFAULT_ROOT = 'skills';

interface NormalizedFile {
  path: string;
  /** normalized line text, empty lines dropped */
  lines: string[];
  /** original 1-based line number for each normalized line */
  origin: number[];
}

interface DuplicatedBlock {
  hash: string;
  /** number of normalized lines in the block */
  length: number;
  occurrences: Array<{ path: string; startLine: number; endLine: number }>;
  sample: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.md')) acc.push(full);
  }
  return acc;
}

/**
 * Drop fenced code blocks? No. A duplicated fenced block is exactly the kind of
 * copied directive this metric exists to find (dispatch packets, YAML policy
 * blocks, report templates are all fenced here). They stay in.
 */
function normalize(path: string): NormalizedFile {
  const raw = readFileSync(path, 'utf8').split('\n');
  const lines: string[] = [];
  const origin: number[] = [];
  raw.forEach((line, i) => {
    const t = line.trim().replace(/\s+/g, ' ');
    if (t.length === 0) return;
    lines.push(t);
    origin.push(i + 1);
  });
  return { path, lines, origin };
}

function hashWindow(window: string[]): string {
  return createHash('sha1').update(window.join('\n')).digest('hex').slice(0, 16);
}

export interface DuplicationReport {
  root: string;
  window: number;
  filesScanned: number;
  normalizedLines: number;
  /** Every covered line, counted in every file it appears in. */
  duplicatedLines: number;
  /** duplicatedLines minus one canonical copy per distinct block — removable. */
  excessLines: number;
  duplicatedBlocks: DuplicatedBlock[];
  /** per-file duplicated normalized line count, descending */
  perFile: Array<{ path: string; duplicated: number; total: number }>;
}

export function measure(root: string, window: number): DuplicationReport {
  const files = walk(root).sort().map(normalize);

  // hash -> list of (fileIndex, startIndex)
  const index = new Map<string, Array<{ f: number; s: number }>>();
  files.forEach((file, f) => {
    for (let s = 0; s + window <= file.lines.length; s++) {
      const h = hashWindow(file.lines.slice(s, s + window));
      const bucket = index.get(h);
      if (bucket) bucket.push({ f, s });
      else index.set(h, [{ f, s }]);
    }
  });

  // A shingle counts only when it spans >= 2 DISTINCT files. Repetition inside
  // one file is a separate defect class (this metric does not claim it).
  const crossFile = new Set<string>();
  for (const [h, hits] of index) {
    if (new Set(hits.map((x) => x.f)).size >= 2) crossFile.add(h);
  }

  // Mark every normalized line covered by a cross-file shingle.
  const covered = files.map((f) =>
    Array.from({ length: f.lines.length }, () => false),
  );
  for (const h of crossFile) {
    for (const { f, s } of index.get(h)!) {
      for (let k = 0; k < window; k++) covered[f][s + k] = true;
    }
  }

  // Merge covered runs into maximal blocks, then group blocks by content hash so
  // the report names the copies of one directive together.
  const blocksByHash = new Map<string, DuplicatedBlock>();
  files.forEach((file, f) => {
    let s = 0;
    while (s < file.lines.length) {
      if (!covered[f][s]) {
        s++;
        continue;
      }
      let e = s;
      while (e + 1 < file.lines.length && covered[f][e + 1]) e++;
      const text = file.lines.slice(s, e + 1);
      const h = hashWindow(text);
      const occ = {
        path: file.path,
        startLine: file.origin[s],
        endLine: file.origin[e],
      };
      const existing = blocksByHash.get(h);
      if (existing) existing.occurrences.push(occ);
      else
        blocksByHash.set(h, {
          hash: h,
          length: text.length,
          occurrences: [occ],
          sample: text[0].slice(0, 110),
        });
      s = e + 1;
    }
  });

  // A merged run may be unique as a whole while its interior shingles are shared
  // (block boundaries differ between copies). Keep every run — the covered-line
  // count is the metric; the block list is a navigation aid.
  const duplicatedBlocks = [...blocksByHash.values()].sort(
    (a, b) => b.length * b.occurrences.length - a.length * a.occurrences.length,
  );

  const perFile = files
    .map((file, f) => ({
      path: file.path,
      duplicated: covered[f].filter(Boolean).length,
      total: file.lines.length,
    }))
    .filter((x) => x.duplicated > 0)
    .sort((a, b) => b.duplicated - a.duplicated);

  // Excess counts only blocks whose merged run is byte-identical in 2+ files.
  // A run that is unique as a whole while its interior shingles are shared —
  // the copies' block boundaries differ — contributes 0. That understates the
  // removable total, deliberately: those cases need a human to decide what the
  // canonical text is, so claiming them as savings would be claiming work that
  // has not been scoped.
  const excessLines = duplicatedBlocks
    .filter((b) => b.occurrences.length >= 2)
    .reduce((n, b) => n + b.length * (b.occurrences.length - 1), 0);

  return {
    root,
    window,
    filesScanned: files.length,
    normalizedLines: files.reduce((n, f) => n + f.lines.length, 0),
    duplicatedLines: perFile.reduce((n, x) => n + x.duplicated, 0),
    excessLines,
    duplicatedBlocks,
    perFile,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? DEFAULT_ROOT;
  const windowArg = args.find((a) => a.startsWith('--window='));
  const window = windowArg ? Number(windowArg.split('=')[1]) : DEFAULT_WINDOW;
  const asJson = args.includes('--json');
  const topArg = args.find((a) => a.startsWith('--top='));
  const top = topArg ? Number(topArg.split('=')[1]) : 40;

  const report = measure(root, window);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const pct = ((report.duplicatedLines / report.normalizedLines) * 100).toFixed(1);
  const excessPct = ((report.excessLines / report.normalizedLines) * 100).toFixed(1);
  process.stdout.write(
    `skills duplication — root=${report.root} window=${report.window}\n` +
      `files=${report.filesScanned} normalizedLines=${report.normalizedLines}\n` +
      `duplicatedLines=${report.duplicatedLines} (${pct}%)  ` +
      `excessLines=${report.excessLines} (${excessPct}%) <- removable\n\n`,
  );

  process.stdout.write(`TOP ${top} DUPLICATED BLOCKS (len x copies)\n`);
  for (const b of report.duplicatedBlocks.slice(0, top)) {
    if (b.occurrences.length < 2) continue;
    process.stdout.write(
      `\n  ${b.length}L x ${b.occurrences.length} copies — "${b.sample}"\n`,
    );
    for (const o of b.occurrences)
      process.stdout.write(`      ${o.path}:${o.startLine}-${o.endLine}\n`);
  }

  process.stdout.write(`\nTOP ${top} FILES BY DUPLICATED LINES\n`);
  for (const f of report.perFile.slice(0, top)) {
    const p = ((f.duplicated / f.total) * 100).toFixed(0);
    process.stdout.write(
      `  ${String(f.duplicated).padStart(4)} / ${String(f.total).padStart(4)} (${p.padStart(3)}%)  ${relative('.', f.path)}\n`,
    );
  }
}

if (import.meta.main) main();
