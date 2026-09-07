/**
 * Bootstrap source contract gate (TASK-001, BST-06 / BST-09).
 *
 * `skills/AGENTS.md` is the single source `renderBootstrap` reads. This suite
 * guards its raw markup, independent of the renderer that does not exist yet:
 * exactly the 9 registry rule ids, each wrapped in a well-formed
 * `<!-- massa-ai:rule:<id>:start|end -->` pair nested inside the existing
 * `<!-- massa-ai:bootstrap:start|end -->` pair, in registry render order; the
 * `code-comments` rule additionally carries a nested
 * `<!-- massa-ai:rule:code-comments:off -->` / `:off-end -->` span; and the
 * file contains no occurrence of `rtk` in any form (case-insensitive), which
 * is also how the deleted `### Conditional RTK Rules` section is guarded.
 *
 * It also owns the prose-side source contracts the toggles depend on: the
 * `references/code-annotation.md` toggle-scope statement (TASK-022, BST-08)
 * and the `references/naming-standards.md` §Language ownership split against
 * the `english-code` rule (TASK-023, BST-07).
 *
 * Every assertion reads the file once as a single string and scans that
 * string directly (`matchAll` / `indexOf`), never by splitting into lines
 * first — a line-oriented scan cannot see a claim spanning a newline, and
 * that exact blind spot has shipped silently in this repository before.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const AGENTS_MD = path.join(REPO_ROOT, "skills", "AGENTS.md");
const CODE_ANNOTATION_MD = path.join(
  REPO_ROOT,
  "skills",
  "massa-ai",
  "references",
  "code-annotation.md",
);
const NAMING_STANDARDS_MD = path.join(
  REPO_ROOT,
  "skills",
  "massa-ai",
  "references",
  "naming-standards.md",
);

/** The 9 registry rule ids, in fixed render order (design.md § Rule registry). */
const RULE_IDS = [
  "caveman",
  "massa-ai-router",
  "persona-router",
  "dedupe-guardrails",
  "plan-challenge",
  "conversation-feedback",
  "indexing-hygiene",
  "english-code",
  "code-comments",
] as const;

const BOOTSTRAP_START = "<!-- massa-ai:bootstrap:start -->";
const BOOTSTRAP_END = "<!-- massa-ai:bootstrap:end -->";

async function read(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

interface MarkerInfo {
  starts: number[];
  ends: number[];
}

/**
 * Scans the whole source string for `<!-- massa-ai:rule:<id>:start|end -->`
 * markers and returns every occurrence's character offset, keyed by id. A
 * single pass over the full string, not a per-line search.
 */
function collectRuleMarkers(content: string): Map<string, MarkerInfo> {
  const map = new Map<string, MarkerInfo>();
  const re = /<!--\s*massa-ai:rule:([a-z0-9-]+):(start|end)\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const [, id, kind] = m;
    if (!map.has(id)) map.set(id, { starts: [], ends: [] });
    const info = map.get(id)!;
    if (kind === "start") info.starts.push(m.index);
    else info.ends.push(m.index);
  }
  return map;
}

describe("bootstrap source contract: skills/AGENTS.md rule markers", () => {
  test("declares exactly the 9 registry rule ids, each with a well-formed marker pair", async () => {
    const content = await read(AGENTS_MD);
    const markers = collectRuleMarkers(content);

    const missing = RULE_IDS.filter((id) => !markers.has(id));
    expect(missing).toEqual([]);

    const malformed = RULE_IDS.filter((id) => {
      const info = markers.get(id);
      return !info || info.starts.length !== 1 || info.ends.length !== 1;
    }).map((id) => {
      const info = markers.get(id);
      return `${id}: starts=${info?.starts.length ?? 0} ends=${info?.ends.length ?? 0}`;
    });
    expect(malformed).toEqual([]);

    const unknownIds = [...markers.keys()].filter(
      (id) => !(RULE_IDS as readonly string[]).includes(id),
    );
    expect(unknownIds).toEqual([]);
  });

  test("rule markers render in registry order and sit inside the bootstrap block", async () => {
    const content = await read(AGENTS_MD);
    const bootstrapStart = content.indexOf(BOOTSTRAP_START);
    const bootstrapEnd = content.indexOf(BOOTSTRAP_END);
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(bootstrapEnd).toBeGreaterThan(bootstrapStart);

    const markers = collectRuleMarkers(content);
    const present = RULE_IDS.filter((id) => markers.has(id));
    expect(present).toEqual([...RULE_IDS]);

    const starts = present.map((id) => markers.get(id)!.starts[0]);
    const sortedStarts = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sortedStarts);

    const outOfOrder: string[] = [];
    for (const id of present) {
      const info = markers.get(id)!;
      const start = info.starts[0];
      const end = info.ends[0];
      if (!(start < end)) outOfOrder.push(id);
      expect(start).toBeGreaterThan(bootstrapStart);
      expect(end).toBeLessThan(bootstrapEnd);
    }
    expect(outOfOrder).toEqual([]);
  });

  test("code-comments carries an off-span nested inside its own rule span", async () => {
    const content = await read(AGENTS_MD);
    const markers = collectRuleMarkers(content);
    const codeComments = markers.get("code-comments");
    expect(codeComments).toBeDefined();

    const offStarts = [
      ...content.matchAll(/<!--\s*massa-ai:rule:code-comments:off\s*-->/g),
    ];
    const offEnds = [
      ...content.matchAll(/<!--\s*massa-ai:rule:code-comments:off-end\s*-->/g),
    ];
    expect(offStarts.length).toBe(1);
    expect(offEnds.length).toBe(1);

    const offStart = offStarts[0].index ?? -1;
    const offEnd = offEnds[0].index ?? -1;
    expect(offStart).toBeGreaterThanOrEqual(0);
    expect(offEnd).toBeGreaterThan(offStart);

    if (codeComments) {
      expect(offStart).toBeGreaterThan(codeComments.starts[0]);
      expect(offEnd).toBeLessThan(codeComments.ends[0]);
    }
  });

  test("contains no occurrence of rtk, in any case, anywhere in the file", async () => {
    const content = await read(AGENTS_MD);
    const matches = [...content.matchAll(/rtk/gi)];
    const contexts = matches.map((m) => {
      const idx = m.index ?? 0;
      return content.slice(Math.max(0, idx - 24), idx + 24).replace(/\s+/g, " ");
    });
    expect(contexts).toEqual([]);
  });
});

/**
 * Removes every rule's own span (start marker through end marker, inclusive)
 * from the bootstrap block, in one pass over the whole string. What remains
 * is prose no toggle state can ever hide — the always-rendered residue. A
 * rule that reasserts itself there (an activation instruction outside every
 * span) survives being disabled: the same defect class the design already
 * solved for `code-comments` with an explicit off-text, but never
 * generalized to the activation stack.
 */
function stripAllRuleSpans(content: string): string {
  const startRe = /<!--\s*massa-ai:rule:([a-z0-9-]+):start\s*-->/g;
  let out = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(content)) !== null) {
    if (m.index < cursor) continue; // already consumed by a prior span
    const id = m[1];
    const endTag = `<!-- massa-ai:rule:${id}:end -->`;
    const endIdx = content.indexOf(endTag, m.index);
    if (endIdx === -1) continue; // malformed pair; the marker-pair test above already fails this
    out += content.slice(cursor, m.index);
    cursor = endIdx + endTag.length;
  }
  out += content.slice(cursor);
  return out;
}

describe("bootstrap source contract: no rule leaks outside every span", () => {
  // Scope note: this checks the always-rendered residue — content outside
  // EVERY rule span — for the 9 registry ids and the 3 literal
  // activation-stack names. It deliberately does not flag a rule's name
  // appearing inside a *different* rule's own span (e.g. dedupe-guardrails
  // or conversation-feedback prose mentioning `massa-ai` while describing
  // their own, unrelated behavior): that is a same-domain cross-reference
  // inside content that is itself already toggleable, not an instruction
  // that survives the referenced rule being disabled. A fully precise
  // "outside its own span specifically" check would also have to model
  // which cross-span mentions are load-bearing instructions versus
  // incidental prose, which is not mechanically expressible from the
  // markup alone; this narrower, defensible check is what is asserted here.
  test("the always-rendered residue names no rule id and no activation-stack name", async () => {
    const content = await read(AGENTS_MD);
    const bootstrapStart = content.indexOf(BOOTSTRAP_START);
    const bootstrapEnd = content.indexOf(BOOTSTRAP_END);
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(bootstrapEnd).toBeGreaterThan(bootstrapStart);

    const block = content.slice(bootstrapStart, bootstrapEnd + BOOTSTRAP_END.length);
    const residue = stripAllRuleSpans(block);

    const idLeaks = RULE_IDS.filter((id) => residue.includes(id));
    expect(idLeaks).toEqual([]);

    // Backtick-delimited so a path (`skills/massa-ai/SKILL.md`) or a
    // compound CLI token (`massa-ai-config bootstrap`) cannot match — only
    // the bare, standalone activation-stack name counts as a leak.
    const ACTIVATION_NAMES = ["`caveman full`", "`massa-ai`", "`persona-router`"];
    const nameLeaks = ACTIVATION_NAMES.filter((name) => residue.includes(name));
    expect(nameLeaks).toEqual([]);
  });
});

/**
 * Splits markdown prose into whitespace-normalized sentences, in one pass over
 * the whole string. Newlines collapse to single spaces *before* the split, so
 * a claim wrapped across two source lines is still one sentence here — the
 * same line-oriented blind spot this file's header calls out.
 */
function normalizedSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Toggle-scope contract for `references/code-annotation.md` (TASK-022,
 * BST-08 AC-5/AC-6, spec AC-5 at `spec.md:188`).
 *
 * The reference mandates doc blocks and rationale comments on its own
 * authority (design assumption A6), so a `code-comments` toggle that only
 * omitted bootstrap text would leave the reference winning and the toggle
 * reading as broken. These assertions pin *both* halves of the asymmetry —
 * §1/§2 gated on the rule and its off default, §3 explicitly outside the
 * gate — so neither half can drift out of the prose while the other stays.
 */
describe("bootstrap source contract: code-annotation.md toggle scope", () => {
  test("a single sentence gates §1 and §2 on `code-comments` and names its off default", async () => {
    const content = await read(CODE_ANNOTATION_MD);
    const sentences = normalizedSentences(content);

    const gating = sentences.filter(
      (s) => s.includes("§1") && s.includes("§2") && s.includes("`code-comments`"),
    );
    const qualified = gating.filter((s) => /\benabled\b/.test(s) && /\boff\b/.test(s));

    const defects: string[] = [];
    if (gating.length === 0) {
      defects.push(
        `no sentence names §1, §2 and \`code-comments\` together (scanned ${sentences.length} sentences)`,
      );
    } else if (qualified.length === 0) {
      defects.push(
        `gating sentence(s) name neither "enabled" nor the "off" default: ${gating.join(" | ")}`,
      );
    }
    expect(defects).toEqual([]);
    expect(qualified.length).toBeGreaterThanOrEqual(1);
  });

  test("§3 is stated to sit outside the gate and apply unconditionally", async () => {
    const content = await read(CODE_ANNOTATION_MD);
    const sentences = normalizedSentences(content);

    const exclusion = sentences.filter(
      (s) => s.includes("§3") && /\boutside\b/.test(s) && /\bunconditional/.test(s),
    );

    const defects: string[] = [];
    if (exclusion.length === 0) {
      const mentioning = sentences.filter((s) => s.includes("§3"));
      defects.push(
        `no sentence places §3 outside the gate unconditionally; §3 sentences: ${
          mentioning.length === 0 ? "(none)" : mentioning.join(" | ")
        }`,
      );
    }
    expect(defects).toEqual([]);
    expect(exclusion.length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Returns the body of a top-level `## <heading>` markdown section, from just
 * after its heading line to just before the next top-level heading (or EOF).
 * Empty string when the heading is absent — callers assert on that.
 */
function markdownSection(content: string, heading: string): string {
  const headingRe = new RegExp(`^##[ \\t]+${heading}[ \\t]*$`, "m");
  const m = headingRe.exec(content);
  if (!m) return "";
  const rest = content.slice(m.index + m[0].length);
  const next = /^##[ \t]+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/**
 * Returns a rule's body from `skills/AGENTS.md` — the span between its
 * `:start` and `:end` markers — with heading lines dropped, so only the
 * rule's prose is compared.
 */
function ruleBody(content: string, id: string): string {
  const startTag = `<!-- massa-ai:rule:${id}:start -->`;
  const endTag = `<!-- massa-ai:rule:${id}:end -->`;
  const start = content.indexOf(startTag);
  const end = content.indexOf(endTag, start);
  if (start === -1 || end === -1) return "";
  return content
    .slice(start + startTag.length, end)
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");
}

/** Content words of a sentence — lowercased, punctuation-stripped, 3+ chars. */
function contentWords(sentence: string): Set<string> {
  return new Set(
    sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * One-normative-reference contract between `references/naming-standards.md`
 * §Language and the `english-code` bootstrap rule (TASK-023, BST-07 AC-6,
 * spec AC-6 at `spec.md:189`; design's "English rule ownership" row).
 *
 * §Language stays normative for *identifier* naming; the bootstrap rule owns
 * the wider class (comments, code documentation, commit-facing artifacts).
 * AD-019 forbids a second normative copy, so the two must cite rather than
 * restate each other.
 *
 * The no-duplication half is asserted lexically, by token-set Jaccard over
 * every cross-file sentence pair, because reading for a near-duplicate is
 * exactly what this guards against. Threshold calibration, measured against
 * the shipped rule body:
 *
 *   verbatim restatement of the rule's first sentence   1.00  (must fail)
 *   light paraphrase dropping two enumerated nouns      0.71  (must fail)
 *   restating the rule's conversational-replies clause  0.45  (must fail)
 *   the pre-TASK-023 §Language text (scope overlap,
 *     but not a sentence duplicate)                     0.19  (must pass)
 *   the shipped §Language text                          0.13  (must pass)
 *
 * `DUPLICATION_THRESHOLD` sits at 0.40 — above the two legitimate readings
 * with ~2x headroom, below all three restatement shapes. Limit worth stating:
 * a heavy paraphrase sharing few content words (measured 0.27) is invisible
 * to any token-overlap metric. The ownership half of this contract is carried
 * by the citation assertion below, not by this one.
 */
const DUPLICATION_THRESHOLD = 0.4;

describe("bootstrap source contract: naming-standards.md §Language ownership", () => {
  test("§Language stays normative for identifier naming and cites the `english-code` rule", async () => {
    const content = await read(NAMING_STANDARDS_MD);
    const section = markdownSection(content, "Language");

    const defects: string[] = [];
    if (section.trim().length === 0) defects.push("no `## Language` section in naming-standards.md");
    if (!section.includes("`english-code`")) {
      defects.push("§Language does not cite the `english-code` bootstrap rule");
    }
    if (!/\bnormative\b/.test(section) || !/\bidentifier\b/i.test(section)) {
      defects.push("§Language no longer claims to be normative for identifier naming");
    }
    expect(defects).toEqual([]);
  });

  test("no sentence in §Language duplicates a sentence of the `english-code` rule", async () => {
    const section = markdownSection(await read(NAMING_STANDARDS_MD), "Language");
    const rule = ruleBody(await read(AGENTS_MD), "english-code");

    const sectionSentences = normalizedSentences(section);
    const ruleSentences = normalizedSentences(rule);
    // A vacuous pass here would be indistinguishable from a clean one, so the
    // populations are asserted non-empty before the pairwise comparison.
    expect(sectionSentences.length).toBeGreaterThan(0);
    expect(ruleSentences.length).toBeGreaterThan(0);

    let worst = { score: 0, section: "", rule: "" };
    const duplicates: string[] = [];
    for (const s of sectionSentences) {
      for (const r of ruleSentences) {
        const score = jaccard(contentWords(s), contentWords(r));
        if (score > worst.score) worst = { score, section: s, rule: r };
        if (score >= DUPLICATION_THRESHOLD) {
          duplicates.push(`${score.toFixed(2)} :: "${s}" ~ "${r}"`);
        }
      }
    }

    expect({
      pairs: sectionSentences.length * ruleSentences.length,
      duplicates,
    }).toEqual({ pairs: sectionSentences.length * ruleSentences.length, duplicates: [] });
    expect(worst.score).toBeLessThan(DUPLICATION_THRESHOLD);
  });
});
