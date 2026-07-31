#!/usr/bin/env bun
/**
 * GMS-04 AC-3's sensor, replacing a criterion that was unsatisfiable twice.
 *
 * ## Why this is not a `rlm-` counter
 *
 * AC-3 as written says `rg 'rlm-'` returns only CHANGELOG and `.specs/`. That was
 * measured unsatisfiable at Phase 0 (320 occurrences in three tracked, generated
 * `.ua/` artifacts) and the resolution — "zero hits outside CHANGELOG.md, .specs/
 * and .ua/" — was measured unsatisfiable again at T15, for two reasons the plan
 * states elsewhere itself:
 *
 *   1. `contextual-search-rlm-coverage.test.ts` carries `rlm-` in its own
 *      filename, and design.md §6 deliberately keeps `contextual-search-rlm.ts`.
 *   2. Every PR-B extraction deliberately added a provenance comment naming the
 *      `rlm-*.ts` source its body moved out of. Six files carry nothing else.
 *      Driving that to zero deletes the record on purpose.
 *
 * Counting occurrences of a string is a measurement of a **population**. What
 * the requirement is actually about is a **shape**: a pointer that misleads a
 * reader because it names a path that is not there. So this checks pointers, and
 * it is exact rather than heuristic — no keyword sniffing for "historical".
 *
 * ## The three categories
 *
 * Every path token in a tracked, non-excluded file whose basename starts with one
 * of `STEMS` is one of:
 *
 * | category | test | verdict |
 * |---|---|---|
 * | `RESOLVES`   | a tracked file has that basename | fine |
 * | `HISTORICAL` | does not resolve, but the path existed somewhere in history | allowed, **counted**, and the count is pinned |
 * | `BROKEN`     | does not resolve and never existed | **always fails** |
 *
 * Pinning the `HISTORICAL` count is what makes this discriminating rather than
 * permissive. A rename whose citations are not updated turns each stale citation
 * into a new `HISTORICAL` entry, moving the count and failing the gate — which is
 * precisely the failure mode T15's own renames could introduce. A typo lands in
 * `BROKEN` and fails on its own.
 *
 * ## Two corrections measured at T15, after the first version of this file
 *
 * Both are the defect class this whole feature is about, found in the sensor
 * written to replace a criterion about it. The fourteenth plan defect.
 *
 * 1. **The pin is exact (`===`), not a ceiling (`<=`).** As first written the
 *    check was `historical.length <= HISTORICAL_FLOOR`, which catches a stale
 *    citation being *added* and is structurally blind to a provenance comment
 *    being *deleted* — and keeping those comments is the whole reason the
 *    category exists. One direction of a two-directional requirement, under an
 *    identifier that named the other one. Ratcheting the number down is now an
 *    explicit edit, which is what it always should have been.
 * 2. **`STEMS` is a list, not the literal `rlm`.** T15 renamed four suites to
 *    `search-facade-*.test.ts` and thereby minted 17 fresh citations across 10
 *    files that an `rlm`-only pattern could never see, in either direction — so
 *    the gate would have gone green on exactly the failure its docblock claims
 *    to catch, for the names the task had just created. Adding the stem also
 *    picks up 14 citations of Phase 0's `search-facade-{matrix,metrics}`
 *    scripts, which PR-C moves again.
 *
 * ## What this does NOT police, deliberately
 *
 * A bare-word mention with no extension — `` `rlm-admin` ``, a
 * `describe("rlm-search — …")` title, a `rlm-*.test.ts` glob. Those have no
 * filename to resolve against, so classifying them would mean a banned-word
 * list rather than a pointer check: a different sensor with a different failure
 * mode. T15 fixed every such site it found by hand; none of them is under a
 * gate, and no reading of this script should be quoted as if they were.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Repo-relative paths whose pointer-shaped content is out of scope, and why.
 *
 * The last entry was forced by measurement and is the Phase 0 lesson repeating:
 * *verify a measurement in the state it ships in.* This gate enumerates
 * `git ls-files`, so it is blind to itself until its own files are tracked — and
 * the moment they were staged it went from **PASS 31/26/0** to **FAIL 36/46/15**.
 * Every one of those 15 `BROKEN` hits is a **fixture literal** inside a string in
 * its own test file — a misspelled `rlm-serch` and a pair of `rlm-gone-*`
 * stems, deliberately non-existent inputs that must use a real stem, because the
 * whole point is to exercise this `POINTER`. Calling them stale pointers is the
 * same category error as the 14-false-positive bug: a fact about the checker
 * reported as a fact about the subject. (Named here without extensions for the
 * reason `POINTER`'s docblock gives — spelled in full they are `BROKEN` tokens
 * in a file this gate scans, which is the same trap one level up, and it fired.)
 *
 * Only the test file is excluded. **This script is not**, so its own prose stays
 * inside the corpus and its two genuine references to the deleted `rlm-search`
 * are counted in the pin like anyone else's.
 */
export const EXCLUDED = [
  "CHANGELOG.md", // release history; naming a deleted file is the point
  ".specs/", // the plan's own record of what moved where
  ".ua/", // generated understand-anything artifacts; regeneration deferred past PR-C
  "scripts/__tests__/check-stale-pointers.test.ts", // this gate's own fixtures, not references
] as const;

/**
 * The filename stems whose citations this gate polices. `rlm` is GMS-04's own
 * subject; `search-facade` is the population T15's rename created. Keep this the
 * single source — `POINTER` is derived from it, so adding a stem cannot leave a
 * hand-written alternation behind to drift.
 */
export const PREFIX_STEMS = ["rlm", "search-facade"] as const;

/**
 * Stems that sit at the **end** of a filename, as every controller module does.
 *
 * Examples are written without their extensions throughout this docblock, for the
 * same reason `candidateNames`' one is: spelled in full they would themselves be
 * pointers in a file this gate scans, and the first draft of this comment pushed
 * HISTORICAL from 28 to 29 and failed the gate on its own prose.
 *
 * R-09, and the twenty-second plan defect. The first remedy for the controller
 * gap was "add `controller` to the stem list", which is strictly stricter and
 * therefore could only find more — except that it found exactly nothing. The
 * stem was interpolated as a **prefix**, `<stem>-<rest>`, and every real
 * controller file is suffix-shaped. Measured over `git ls-files`: files shaped
 * `controller-<rest>` = **0**, files shaped `<rest>-controller` = **6**. Patching
 * the subject list and re-running produced a byte-identical report.
 *
 * **A subject-list entry cannot fix a positional assumption baked into the
 * pattern**, which is why this is a second alternation branch and not a third
 * entry above.
 */
export const SUFFIX_STEMS = ["controller"] as const;

/**
 * A path-shaped token for one of `PREFIX_STEMS` or `SUFFIX_STEMS`. Deliberately does not match a glob such
 * as `rlm-*.ts`, which names a set rather than a file and cannot dangle.
 *
 * The lookbehind is load-bearing and was found by measurement, not by reading:
 * `\b` matches *inside* `contextual-search-rlm-coverage.test.ts`, because `-` is
 * not a word character, so `\brlm-…` extracted a phantom `rlm-coverage` pointer
 * and the first run of this script reported **14 BROKEN pointers that do not
 * exist** — a checker reporting a fact about its own pattern as a fact about the
 * subject, which is the defect class this whole feature is about. (That phantom
 * is written here without its extension on purpose: spelled in full it is itself
 * a `BROKEN` token in a file this gate scans.) Anchor on "not
 * preceded by a word character or a hyphen" instead. That anchor is what also
 * keeps a multi-word stem honest: `search-facade` must match at a path boundary,
 * never inside some longer `…-search-facade-…` name.
 *
 * The body is lazy and admits hyphens, because a stem is no longer a single
 * segment: `search-facade-admin.test.ts` has two after the stem.
 */
export const POINTER = new RegExp(
  // Two branches, one shared extension tail. Examples are deliberately written
  // without extensions — spelled in full they are pointers in a file this gate
  // scans, and would move the HISTORICAL pin from this comment alone:
  //   prefix stems: rlm-search, search-facade-admin
  //   suffix stems: memory-controller, search-controller
  //
  // EVERY concatenated segment carries its own `String.raw` tag, and that is not
  // style — it is C18, the twenty-fifth plan defect, which shipped to `main` in
  // design.md §5.2. In an UNTAGGED template `\.` is an identity escape (a bare
  // `.`, i.e. a wildcard) and `\b` is the backspace control character U+0008, not
  // the two characters `\` and `b`. Because the alternation is one expression,
  // dropping the second tag does not merely fail to add suffix coverage — it
  // kills the untouched prefix branch too, taking this gate to
  // `FAIL — 0 broken, 0 historical against a pin of 28`.
  //
  // The prefix branch body below is byte-identical to the pre-reshape pattern, so
  // `rlm` and `search-facade` readings are unchanged BY CONSTRUCTION rather than
  // by measurement. The new branch is a pure alternation addition: it can only
  // add matches.
  String.raw`(?<![\w-])(?:(?:${PREFIX_STEMS.join("|")})-[a-z0-9-]+?` +
    String.raw`|[a-z0-9-]+?-(?:${SUFFIX_STEMS.join("|")}))\.(?:test\.)?(?:ts|js)\b`,
  "g",
);

export type Category = "RESOLVES" | "HISTORICAL" | "BROKEN";

export interface Pointer {
  file: string;
  line: number;
  token: string;
  category: Category;
}

/**
 * The exact number of dangling-but-real provenance pointers PR-B deliberately
 * keeps, measured at T15 **in the tracked state this ships in** and justified per
 * entry in `tasks.md`. Nine are the capability modules' "byte-preserved from
 * `rlm-<x>.ts`" notes, nine the root's account of which member each deleted
 * delegate used to read, three the coverage suite's record of the T6/T13
 * `mock.module` moves, five the frozen-anchor and needles-diff machinery
 * explaining why resolution is by content rather than path, and **two this file's
 * own** — `candidateNames`' docblock cites the deleted `rlm-search` in both its
 * `.js` and `.ts` spellings, which is exactly the case that function exists for.
 *
 * Moving this in **either** direction is a decision, not a formality. Up means a
 * new comment names a file a reader cannot open. Down means one of those 26
 * records was deleted, which is the thing the category exists to protect. Lower
 * it when `.ua/` regeneration or PR-C genuinely removes one, and say which.
 *
 * ## Re-verified against the T6 reshape — PR-C T7, and it did not move
 *
 * T6 widened `POINTER` with a suffix branch, taking the corpus from **60** to
 * **142** pointers. The pin **stays at 28**, and that is a measured result rather
 * than an untouched line:
 *
 *   HISTORICAL  28  — 28 from the prefix branch, **0 from the suffix branch**
 *   RESOLVES   114  — 32 prefix + 82 suffix
 *   BROKEN       0
 *
 * All 82 newly-visible pointers RESOLVE, because the controllers still exist at
 * this commit. That is the expected reading and also the trap: a flat HISTORICAL
 * across a widening looks identical to a widening that did nothing, so the
 * observable that had to move was the **total**, and it moved by exactly +82.
 *
 * This re-verification is its own commit, carrying no file move, because the one
 * edit shape this pin exists to make visible is a re-baseline riding along with
 * the change it is supposed to police. **Phase 3 is when it will genuinely move**:
 * retiring the six controllers converts their citations out of RESOLVES, and that
 * re-pin must again be its own commit and must say which records moved and why.
 */
export const HISTORICAL_PINNED = 28;

function git(args: string[], root: string): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

export function trackedFiles(root: string): string[] {
  return git(["ls-files"], root)
    .split("\n")
    .filter(Boolean)
    .filter((f) => !EXCLUDED.some((e) => (e.endsWith("/") ? f.startsWith(e) : f === e)));
}

/** Every path git has ever recorded, so "did this exist?" is answered exactly. */
export function everKnownPaths(root: string): Set<string> {
  const out = git(["log", "--all", "--pretty=format:", "--name-only"], root);
  const set = new Set<string>();
  for (const p of out.split("\n")) if (p) set.add(p);
  for (const p of git(["ls-files"], root).split("\n")) if (p) set.add(p);
  return set;
}

/**
 * The specifier a reference uses and the filename on disk are not the same string.
 * This project is `module: NodeNext`, so a `.ts` file is imported — and referred to
 * in comments about those imports — as `.js`. Resolving the literal token reported
 * `contextual-search-rlm-coverage.test.ts:174`'s `rlm-search.js` as BROKEN when it
 * is an ordinary reference to the deleted `rlm-search.ts`. Try both forms.
 */
export function candidateNames(token: string): string[] {
  return token.endsWith(".js") ? [token, `${token.slice(0, -3)}.ts`] : [token];
}

export function categorise(token: string, live: Set<string>, ever: Set<string>): Category {
  const names = candidateNames(token);
  if (names.some((n) => live.has(n))) return "RESOLVES";
  return names.some((n) => ever.has(n)) ? "HISTORICAL" : "BROKEN";
}

export function scan(root: string, files = trackedFiles(root)): Pointer[] {
  const ever = everKnownPaths(root);
  // `.map(basename)` would hand the array index to basename's `ext` parameter.
  const liveBase = new Set(git(["ls-files"], root).split("\n").filter(Boolean).map((p) => basename(p)));
  const everBase = new Set([...ever].map((p) => basename(p)));
  const found: Pointer[] = [];

  for (const file of files) {
    // Read the working tree, not `HEAD:`. A gate that judges the last commit
    // cannot see the edit it is gating, and would pass on a tree about to be
    // committed broken. Enumeration is still `git ls-files`, so the corpus is
    // tracked files and does not depend on which `grep` is on PATH.
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue; // deleted from the working tree but still indexed
    }
    source.split("\n").forEach((text, i) => {
      for (const m of text.matchAll(POINTER)) {
        found.push({
          file,
          line: i + 1,
          token: m[0],
          category: categorise(m[0], liveBase, everBase),
        });
      }
    });
  }
  return found;
}

/** `pinned` is a parameter so the gate's own tests can exercise it off a scratch repo. */
export function report(
  pointers: Pointer[],
  pinned: number = HISTORICAL_PINNED,
): { ok: boolean; lines: string[] } {
  const broken = pointers.filter((p) => p.category === "BROKEN");
  const historical = pointers.filter((p) => p.category === "HISTORICAL");
  const resolves = pointers.filter((p) => p.category === "RESOLVES");
  const stems = [
    ...PREFIX_STEMS.map((s) => `${s}-*`),
    ...SUFFIX_STEMS.map((s) => `*-${s}`),
  ].join(" / ");
  const lines: string[] = [];

  lines.push(`${pointers.length} ${stems} pointers in tracked files outside ${EXCLUDED.join(", ")}`);
  lines.push(`  RESOLVES   ${resolves.length}`);
  lines.push(`  HISTORICAL ${historical.length}  (pinned at ${pinned})`);
  lines.push(`  BROKEN     ${broken.length}`);

  for (const p of historical) lines.push(`  historical  ${p.file}:${p.line}  ${p.token}`);
  for (const p of broken) lines.push(`  BROKEN      ${p.file}:${p.line}  ${p.token}`);

  const ok = broken.length === 0 && historical.length === pinned;
  lines.push(
    ok
      ? `[stale-pointers] PASS — 0 broken, historical exactly at its pin of ${pinned}`
      : `[stale-pointers] FAIL — ${broken.length} broken, ${historical.length} historical against a pin of ${pinned}`,
  );
  return { ok, lines };
}

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd();
  const { ok, lines } = report(scan(root));
  for (const l of lines) (ok ? console.log : console.error)(l);
  process.exit(ok ? 0 : 1);
}
