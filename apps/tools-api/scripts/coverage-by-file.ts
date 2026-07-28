#!/usr/bin/env bun
/**
 * Per-file line coverage aggregator for apps/tools-api/src.
 *
 * Runs each test file INDIVIDUALLY with `bun test --coverage` (zero
 * cross-file mock.module contamination), parses the per-file text table, and
 * reports per-src-file coverage by intersecting uncovered-line sets across
 * every run that loaded the file. A line counts as covered if ANY run covered
 * it. This mirrors the isolated test runner's grouping but yields accurate
 * union coverage.
 *
 * Usage: bun scripts/coverage-by-file.ts [extra bun test args...]
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dir, "..");
const testsRoot = path.join(packageRoot, "src");
const extraArgs = process.argv.slice(2);

async function findTestFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findTestFiles(p)));
    else if (e.isFile() && e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const files = (await findTestFiles(testsRoot)).sort((a, b) => a.localeCompare(b));

const ROW = /^\s*(\S[^|]*?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(.*?)\s*$/;
function parseUncovered(spec: string): Set<number> {
  const set = new Set<number>();
  if (!spec || !spec.trim()) return set;
  for (const part of spec.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      for (let i = lo; i <= hi; i++) set.add(i);
    } else if (/^\d+$/.test(token)) {
      set.add(Number(token));
    }
  }
  return set;
}

// srcFile -> { pct: number[], uncovered: Set<number>[], total: number[] }
type Agg = { pct: number[]; uncovered: Set<number>[]; total: number[] };
const agg = new Map<string, Agg>();

let anyFail = false;

for (const file of files) {
  await new Promise<void>((resolve) => {
    const child = spawn(
      process.execPath,
      ["test", "--coverage", file, ...extraArgs],
      { cwd: packageRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stdout += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) anyFail = true;
      for (const line of stdout.split("\n")) {
        const m = line.match(ROW);
        if (!m) continue;
        const fpath = m[1].trim();
        // Only track our owned source files.
        if (!/^src\/(routes|middleware|health|index|startup-config)/.test(fpath)) continue;
        const pct = Number(m[3]);
        const uncov = parseUncovered(m[4]);
        const uncovCount = uncov.size;
        let total = NaN;
        if (pct >= 100) {
          total = uncovCount; // all covered; total unknown but irrelevant
        } else {
          total = Math.round((uncovCount * 100) / (100 - pct));
        }
        let entry = agg.get(fpath);
        if (!entry) {
          entry = { pct: [], uncovered: [], total: [] };
          agg.set(fpath, entry);
        }
        entry.pct.push(pct);
        entry.uncovered.push(uncov);
        entry.total.push(total);
      }
      resolve();
    });
  });
}

function intersect(sets: Set<number>[]): Set<number> {
  if (sets.length === 0) return new Set();
  let result = sets[0];
  for (let i = 1; i < sets.length; i++) {
    const next = new Set<number>();
    for (const v of result) if (sets[i].has(v)) next.add(v);
    result = next;
  }
  return result;
}

const rows: { file: string; pct: number; uncov: number; total: number; lines: number[] }[] = [];
for (const [file, entry] of agg) {
  const finalUncov = intersect(entry.uncovered);
  // total executable lines: take max estimate (most inclusive)
  const total = Math.max(...entry.total.filter((n) => !Number.isNaN(n)), 0);
  const covered = Math.max(0, total - finalUncov.size);
  const pct = total > 0 ? (covered / total) * 100 : Math.max(...entry.pct, 0);
  rows.push({
    file,
    pct,
    uncov: finalUncov.size,
    total,
    lines: [...finalUncov].sort((a, b) => a - b),
  });
}
rows.sort((a, b) => a.file.localeCompare(b.file));

console.log("\n=== apps/tools-api/src per-file line coverage (union across individual runs) ===");
console.log(
  "%-9s %-45s %8s %8s %8s  %s".replace(/%\D/g, "%s"),
  "PCT",
  "FILE",
  "UNCOV",
  "TOTAL",
  "GAP",
  "UNCOVERED LINES",
);
let under = 0;
for (const r of rows) {
  const ok = r.pct >= 90;
  if (!ok) under++;
  console.log(
    "%s %-45s %8s %8s %8s  %s",
    ok ? "OK " : "LOW",
    r.file,
    r.pct.toFixed(2),
    r.uncov,
    r.total,
    ok ? "" : "<<<",
    r.lines.slice(0, 40).join(",") + (r.lines.length > 40 ? "..." : ""),
  );
}
console.log("\nfiles under 90%%: %d / %d", under, rows.length);
if (anyFail) console.log("WARNING: one or more individual runs had non-zero exit");
