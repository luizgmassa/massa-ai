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
 * ## Two resolution modes, one category set — PR-C T10b, and this is C26
 *
 * A token is categorised against a **basename** when it is cited bare, and
 * against its **full path** when it is cited with a directory segment. Same
 * three verdicts either way; only the thing being resolved differs.
 *
 * The path mode exists because the basename mode cannot see a **move**. T7's
 * note on `HISTORICAL_PINNED` predicted the pin would move in PR-C phase 3
 * "when the controllers are retired". It did not, and could not: `POINTER`
 * captures no directory segment, so a citation naming the old directory keeps
 * resolving from the new one — same basename, different home. Measured after
 * PR-C T10 relocated three orchestrators: **31** path-shaped citations had
 * become wrong and this gate reported `PASS — 0 broken, historical exactly at
 * its pin of 28`. That is R-09's own premise — *"61 controller pointers strand
 * silently"* — reproducing against the remedy adopted to prevent it. The T6
 * reshape closed the half of R-09 about a token being **visible**; this closes
 * the half about a path being **correct**.
 *
 * Path resolution tries four roots, because prose in this repo cites from all
 * four and resolving only one would report a fact about the resolver:
 *
 * | root | base |
 * |---|---|
 * | repo-root | the citation as written |
 * | importer-relative | `dirname()` of the citing file |
 * | core-src | `packages/core/src/` |
 * | core-package | `packages/core/` |
 *
 * Any root resolving is enough. **Path resolution is a subset of basename
 * resolution** — if a full path is tracked, its basename necessarily is — so
 * this branch is strictly stricter and cannot produce a false PASS. That says
 * nothing about whether it can *match*, which is the trap the first remedy for
 * R-09 fell into, so it was measured rather than claimed: at adoption **87** of
 * the 142 pointers are path-shaped, **82** resolve, and **5** move. Both
 * directions are observed red in this gate's suite.
 *
 * What it deliberately does **not** cover: a stem outside `PREFIX_STEMS` /
 * `SUFFIX_STEMS`. The alphabet is unchanged, so C21's class — a citation of a
 * moved module whose name carries no stem at all — is as uncovered as before
 * and is not this gate's to close. Two of T10's 31 are in that class already:
 * synthetic tier fixtures naming `controllers/c` and `controllers/index`, which
 * match neither branch.
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
import { basename, dirname, join, normalize } from "node:path";

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
 * This script is **not** excluded, so its own prose stays inside the corpus and
 * its two genuine references to the deleted `rlm-search` are counted in the pin
 * like anyone else's.
 *
 * ## The fifth entry — PR-C T10b, and it is the same class as the fourth
 *
 * The recorded-response fixtures the test-seam suites import are **data**, not
 * references: JSON whose string fields carry a synthesised search result, an
 * impact-analysis payload, and a whole synthetic source file. They named a
 * `controllers/` path, and while only basenames were resolved that read as
 * `RESOLVES` — a wrong classification that happened to produce the right
 * verdict, which is why it survived T6 unnoticed.
 *
 * The path branch made it decidable, and one of the three is decidable *only*
 * as an exclusion. The synthetic file's content carries a relative specifier
 * written from the point of view of a `tools/` handler that does not exist. A
 * relative specifier resolves against the directory of the file citing it, and
 * here the citing file is imaginary — so no resolution root can be right, and
 * the token lands in `BROKEN`, which by design can never be pinned. It is not
 * a stale pointer that wants repointing; repointing it to the orchestrator's
 * real home does not resolve either, because the fixture is not where the
 * fictional importer would live.
 *
 * That is `check-core-layering`'s C17 rule arriving here: *an import statement
 * inside a string literal is fixture text, not an edge.* That gate masks string
 * content to honour it. This one has no code to mask — the whole file is
 * content — so the file is what gets excluded.
 *
 * **Consequence to carry, because T6's acceptance figure is quoted in four
 * places:** the corpus total drops **142 -> 137** and `RESOLVES` **114 -> 109**.
 * `HISTORICAL` is **unchanged at 28** — none of the five was ever historical.
 * T6's reading was correct for the corpus it measured; this narrows the corpus
 * and says why.
 */
export const EXCLUDED = [
  "CHANGELOG.md", // release history; naming a deleted file is the point
  ".specs/", // the plan's own record of what moved where
  ".ua/", // generated understand-anything artifacts; regeneration deferred past PR-C
  "scripts/__tests__/check-stale-pointers.test.ts", // this gate's own fixtures, not references
  "packages/core/src/__tests__/test-seam/fixtures/", // recorded responses; content, not references
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
  /** The directory segment cited alongside the token, `""` for a bare citation. */
  prefix: string;
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
 * the change it is supposed to police.
 *
 * Those totals are T6's corpus. T10b narrows it to **137 / 109 / 28** by
 * excluding the recorded-response fixtures — see `EXCLUDED`'s fifth entry. The
 * pin is the one figure the narrowing does not touch.
 *
 * ## Corrected at T10, remedied at T10b — C26
 *
 * T7's paragraph above predicted *"phase 3 is when it will genuinely move:
 * retiring the six controllers converts their citations out of RESOLVES"*.
 * Measured after T10 relocated three orchestrators: **142 / 114 / 28,
 * unchanged.** The prediction assumed a **deletion**; phase 3 is a **move**,
 * and a basename check cannot represent the difference. **31** path-shaped
 * citations had become wrong and the gate reported `PASS — 0 broken`.
 *
 * T10b closes that with the path branch this file's header describes, and the
 * remedy was verified the only way a remedy for a silent failure can be —
 * against the tree that failed silently. Both readings taken on one mutated
 * corpus, T10's citation repoints reverted and nothing else touched:
 *
 *   basename-only (as shipped at T10)   PASS — 0 broken, historical at 28
 *   with the path branch                FAIL — 0 broken, **57** historical
 *
 * **+29** — the 24 prose citations T10 repointed by hand plus the 5 specifiers
 * it counted as importers. The remaining 2 of the 31 are outside the stem
 * alphabet and stay uncovered; the header says which and why.
 *
 * ## So why is this number still 28?
 *
 * Because on the tree T10b ships against, **no path citation is stale** — T10
 * repointed its own. A pin that did not move is the correct outcome here and
 * not an untouched line, exactly as at T7. What changed is that the number is
 * now load-bearing for a move as well as for a deletion: **T11, T12 and T13
 * each relocate a controller, and any citation of theirs left unrepointed
 * becomes a HISTORICAL entry and fails this gate.** That is the enforcement
 * R-09 asked for and did not get from the T6 reshape alone.
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

/**
 * The directory segment written immediately left of a `POINTER` match.
 *
 * Anchored at the end (`$`) so it is the run of path characters *touching* the
 * token, never an earlier path elsewhere on the line. `POINTER` itself is
 * untouched — deliberately. Folding an optional prefix group into that pattern
 * would put the C18 class back in play for no gain, and would silently change
 * the corpus total that T6's acceptance figure pins.
 */
export const PATH_PREFIX = /(?:\.\.?\/)+$|[\w.@-]+(?:\/[\w.@-]+)*\/$/;

/**
 * Every full path a prefixed citation could reasonably mean, under the four
 * roots named in this file's header, in both the `.js` and `.ts` spellings.
 *
 * More roots means more resolution means *fewer* failures, so the generosity
 * here is in the safe direction: a citation this cannot resolve under any root
 * is one no reader could follow either.
 */
export function pathCandidates(citingFile: string, prefix: string, token: string): string[] {
  const cited = `${prefix}${token}`;
  const roots = [
    cited,
    `${dirname(citingFile)}/${cited}`,
    `packages/core/src/${cited}`,
    `packages/core/${cited}`,
  ];
  return roots.flatMap((r) => candidateNames(normalize(r).replace(/^\.\//, "")));
}

/** `categorise`, resolving the whole path rather than the basename. */
export function categorisePath(
  citingFile: string,
  prefix: string,
  token: string,
  live: Set<string>,
  ever: Set<string>,
): Category {
  const paths = pathCandidates(citingFile, prefix, token);
  if (paths.some((p) => live.has(p))) return "RESOLVES";
  return paths.some((p) => ever.has(p)) ? "HISTORICAL" : "BROKEN";
}

export function scan(root: string, files = trackedFiles(root)): Pointer[] {
  const ever = everKnownPaths(root);
  const live = new Set(git(["ls-files"], root).split("\n").filter(Boolean));
  // `.map(basename)` would hand the array index to basename's `ext` parameter.
  const liveBase = new Set([...live].map((p) => basename(p)));
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
        // A citation carrying a directory is judged on that directory; a bare
        // one has none to judge, and demanding one would be a banned-word list.
        const prefix = text.slice(0, m.index).match(PATH_PREFIX)?.[0] ?? "";
        found.push({
          file,
          line: i + 1,
          token: m[0],
          prefix,
          category: prefix
            ? categorisePath(file, prefix, m[0], live, ever)
            : categorise(m[0], liveBase, everBase),
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

  // The citation is printed as written, prefix included: for a path-shaped one
  // the directory IS the thing that went wrong, and a bare basename in this list
  // would name a file that still exists and read as a false report.
  for (const p of historical) lines.push(`  historical  ${p.file}:${p.line}  ${p.prefix}${p.token}`);
  for (const p of broken) lines.push(`  BROKEN      ${p.file}:${p.line}  ${p.prefix}${p.token}`);

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
