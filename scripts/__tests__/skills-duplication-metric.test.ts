/**
 * Gate for the skills/ duplication metric and reference graph.
 *
 * Each describe block below discriminates against one way a duplication metric
 * silently reports the wrong thing:
 *
 *   1. Detection      — a block shared by two files is found; a block repeated
 *                       inside ONE file is not. Single-file repetition is a
 *                       different defect class and this metric does not claim it.
 *   2. Arithmetic     — `excessLines` (removable) is strictly below
 *                       `duplicatedLines` (footprint) whenever anything is
 *                       duplicated. The first implementation of this script
 *                       documented "counted once per occurrence beyond the
 *                       first" while the code counted every copy, so the number
 *                       quoted as a saving overstated it by roughly 2x. That
 *                       defect passed every test that only checked the number
 *                       was stable.
 *   3. Normalization  — blank lines and indentation never change the reading,
 *                       and fenced code blocks are IN scope (duplicated dispatch
 *                       packets and policy blocks are fenced here).
 *   4. Window         — a shared run shorter than the window is not reported.
 *                       Without this the metric would find noise in any two
 *                       files that share a heading.
 *   5. Ceiling        — the live `skills/` tree stays at or below its recorded
 *                       excess. A ceiling, not an equality: an unrelated edit
 *                       must not go red, but regrowth must.
 *   6. Reachability   — nothing under `skills/` is orphaned.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { measure } from '../skills-duplication-metric.ts';
import { analyzeReferences } from '../skills-reference-graph.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '../..');

/**
 * The excess recorded for the live tree at the close of
 * .specs/features/skills-directive-dedup/. Raising this number is a deliberate
 * edit that needs a reason in the commit message — that friction is the point.
 */
// 331 since ALLWF-03 (tlc-330-harness-update): pinning the 8 remaining
// read-only charters to `model_tier: deep` (14/17 now deep) made their
// frontmatter runs identical across files — +18 excess of mandated
// uniformity, not prose drift. Measured differentially: main 313 → branch
// 331, every new block is charter frontmatter around the shared tier line.
//
// 471 since WMH-01/02 (workflow-metadata-headers): prepending Agent Skills
// YAML frontmatter to all 36 skills/massa-ai/workflows/**/*.md files gave
// every file the same `license: MIT` / `metadata:` / `version: "1.0.0"` /
// `---` structural shape — +140 excess of mandated frontmatter uniformity,
// not prose drift. Measured differentially against the pre-header tree
// (f414cdbf, the pre-WMH activation commit): 331 → 471.
const EXCESS_CEILING = 471;
const CEILING_WINDOW = 4;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'dupmetric-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a fixture file, creating parent directories. */
function write(rel: string, body: string): void {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
}

/** Six distinct lines — long enough to exceed any window used in these tests. */
const BLOCK = ['alpha one', 'beta two', 'gamma three', 'delta four', 'epsilon five', 'zeta six'].join('\n');

// ── 1. Detection ───────────────────────────────────────────────────────────

describe('detection', () => {
  test('a block shared by two files is reported with both occurrences', () => {
    write('a.md', `# A\n\n${BLOCK}\n\nunique to a\n`);
    write('b.md', `# B\n\n${BLOCK}\n\nunique to b\n`);

    const r = measure(dir, 4);

    expect(r.filesScanned).toBe(2);
    const shared = r.duplicatedBlocks.filter((b) => b.occurrences.length >= 2);
    expect(shared.length).toBe(1);
    expect(shared[0]!.length).toBe(6);
    expect(shared[0]!.occurrences.map((o) => path.basename(o.path)).sort()).toEqual(['a.md', 'b.md']);
  });

  test('a block repeated inside ONE file is not counted', () => {
    write('only.md', `# Only\n\n${BLOCK}\n\nmiddle\n\n${BLOCK}\n`);

    const r = measure(dir, 4);

    expect(r.duplicatedLines).toBe(0);
    expect(r.excessLines).toBe(0);
  });

  test('two files sharing nothing report zero duplication', () => {
    write('a.md', 'alpha\nbeta\ngamma\ndelta\nepsilon\n');
    write('b.md', 'one\ntwo\nthree\nfour\nfive\n');

    expect(measure(dir, 4).duplicatedLines).toBe(0);
  });

  test('non-markdown files are not scanned', () => {
    write('a.md', `${BLOCK}\n`);
    write('b.txt', `${BLOCK}\n`);
    write('c.json', `${BLOCK}\n`);

    expect(measure(dir, 4).filesScanned).toBe(1);
  });
});

// ── 2. Arithmetic: excess vs footprint ─────────────────────────────────────

describe('arithmetic', () => {
  test('excessLines is length x (copies - 1), not the full footprint', () => {
    write('a.md', `${BLOCK}\n`);
    write('b.md', `${BLOCK}\n`);
    write('c.md', `${BLOCK}\n`);

    const r = measure(dir, 4);

    // 6 lines present in 3 files: footprint 18, removable 12.
    expect(r.duplicatedLines).toBe(18);
    expect(r.excessLines).toBe(12);
  });

  test('excessLines is strictly below duplicatedLines whenever anything is duplicated', () => {
    write('a.md', `${BLOCK}\n`);
    write('b.md', `${BLOCK}\n`);

    const r = measure(dir, 4);

    expect(r.duplicatedLines).toBeGreaterThan(0);
    expect(r.excessLines).toBeLessThan(r.duplicatedLines);
  });

  test('one canonical copy always survives the excess arithmetic', () => {
    write('a.md', `${BLOCK}\n`);
    write('b.md', `${BLOCK}\n`);
    write('c.md', `${BLOCK}\n`);
    write('d.md', `${BLOCK}\n`);

    const r = measure(dir, 4);

    expect(r.duplicatedLines - r.excessLines).toBe(6);
  });

  test('the live tree obeys the same invariant', () => {
    const r = measure(path.join(REPO_ROOT, 'skills'), CEILING_WINDOW);
    expect(r.excessLines).toBeLessThan(r.duplicatedLines);
    expect(r.excessLines).toBeGreaterThan(0);
  });
});

// ── 3. Normalization ───────────────────────────────────────────────────────

describe('normalization', () => {
  test('blank lines and indentation do not change the reading', () => {
    write('a.md', `${BLOCK}\n`);
    write('b.md', `${BLOCK}\n`);
    const plain = measure(dir, 4);

    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(path.join(tmpdir(), 'dupmetric-'));
    const spaced = BLOCK.split('\n')
      .map((l) => `   ${l}   `)
      .join('\n\n\n');
    write('a.md', `${spaced}\n`);
    write('b.md', `${spaced}\n`);

    expect(measure(dir, 4).duplicatedLines).toBe(plain.duplicatedLines);
  });

  test('normalizedLines excludes blank lines', () => {
    write('a.md', 'one\n\n\n\ntwo\n\n');

    expect(measure(dir, 4).normalizedLines).toBe(2);
  });

  test('fenced code blocks are in scope', () => {
    const fenced = '```yaml\nrole: judge\nrounds: 3\nconsensus: 0.5\nquorum: 2\n```';
    write('a.md', `intro a\n\n${fenced}\n`);
    write('b.md', `intro b\n\n${fenced}\n`);

    const r = measure(dir, 4);

    expect(r.duplicatedLines).toBeGreaterThan(0);
    expect(r.duplicatedBlocks.some((b) => b.sample.includes('```'))).toBe(true);
  });
});

// ── 4. Window ──────────────────────────────────────────────────────────────

describe('window', () => {
  test('a shared run shorter than the window is not reported', () => {
    const short = 'shared one\nshared two\nshared three';
    write('a.md', `${short}\nonly a\nmore a\n`);
    write('b.md', `${short}\nonly b\nmore b\n`);

    expect(measure(dir, 4).duplicatedLines).toBe(0);
    expect(measure(dir, 3).duplicatedLines).toBeGreaterThan(0);
  });

  test('a wider window never reports more than a narrower one', () => {
    write('a.md', `${BLOCK}\n`);
    write('b.md', `${BLOCK}\n`);

    const w3 = measure(dir, 3).duplicatedLines;
    const w5 = measure(dir, 5).duplicatedLines;

    expect(w5).toBeLessThanOrEqual(w3);
  });
});

// ── 5. Ceiling on the live tree ────────────────────────────────────────────

describe('ceiling', () => {
  test(`skills/ excess stays at or below ${EXCESS_CEILING} at window=${CEILING_WINDOW}`, () => {
    const r = measure(path.join(REPO_ROOT, 'skills'), CEILING_WINDOW);
    expect(r.excessLines).toBeLessThanOrEqual(EXCESS_CEILING);
  });

  test('the ceiling is measured against a tree that actually has files', () => {
    // Guard the guard: an empty or mis-rooted scan reports 0 excess and would
    // pass the ceiling vacuously.
    const r = measure(path.join(REPO_ROOT, 'skills'), CEILING_WINDOW);
    expect(r.filesScanned).toBeGreaterThan(100);
    expect(r.normalizedLines).toBeGreaterThan(10_000);
  });
});

// ── 6. Reachability ────────────────────────────────────────────────────────

describe('reachability', () => {
  test('nothing under skills/ is orphaned', () => {
    const r = analyzeReferences(REPO_ROOT);
    expect(r.orphans).toEqual([]);
  });

  test('the reachability scan actually enumerated the tree', () => {
    // Guard the guard: an empty file list yields zero orphans trivially.
    const r = analyzeReferences(REPO_ROOT);
    expect(r.scanned).toBeGreaterThan(100);
  });

  test('a file nothing names IS reported as an orphan', () => {
    // The live tree has zero orphans, so "orphans is empty" proves nothing on
    // its own — a scan that always returns [] would pass it. Detection is
    // proven on a synthetic tree that contains a real orphan.
    write('skills/hub.md', 'See `skills/leaf.md` for detail.\n');
    write('skills/leaf.md', 'Detail lives here.\n');
    write('skills/orphan.md', 'Nothing anywhere names this file.\n');

    const r = analyzeReferences(dir);

    expect(r.scanned).toBe(3);
    expect(r.orphans).toContain('skills/orphan.md');
    expect(r.orphans).not.toContain('skills/leaf.md');
  });

  test('a directory-level pointer reaches every member of that directory', () => {
    write('skills/index.md', 'Load `references/the-fool/` when challenging a plan.\n');
    write('skills/references/the-fool/red-team.md', 'Adversarial mode.\n');
    write('skills/references/the-fool/pre-mortem.md', 'Failure-narrative mode.\n');

    const r = analyzeReferences(dir);

    expect(r.orphans).not.toContain('skills/references/the-fool/red-team.md');
    expect(r.orphans).not.toContain('skills/references/the-fool/pre-mortem.md');
  });

  test('a bare basename mention does not count as a reference', () => {
    // Two files share a basename in the live tree (`lessons.md`). If a bare
    // basename counted, one mention would mark both reachable and the orphan
    // count would be zero for the wrong reason.
    write('skills/a/lessons.md', 'A copy.\n');
    write('skills/b/lessons.md', 'B copy.\n');
    write('skills/router.md', 'See `a/lessons.md`.\n');

    const r = analyzeReferences(dir);

    expect(r.orphans).toContain('skills/b/lessons.md');
    expect(r.orphans).not.toContain('skills/a/lessons.md');
  });
});
