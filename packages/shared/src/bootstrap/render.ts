/**
 * Bootstrap contract renderer (T6 / TASK-006, BST-01, BST-04, BST-06, BST-07,
 * BST-08, BST-10).
 *
 * `renderBootstrap` turns the marked-up single source — `skills/AGENTS.md`,
 * whose bootstrap block is delimited by `<!-- massa-ai:bootstrap:start -->` /
 * `<!-- massa-ai:bootstrap:end -->` — plus a resolved {@link BootstrapState}
 * into the two texts the installer delivers: `contract`, the `MASSA-AI.md`
 * body, and `pointer`, the Codex/Cursor `AGENTS.md` block.
 *
 * Three properties are load-bearing and each is asserted by the co-located
 * suite rather than left to review:
 *
 *   - **Determinism** (BST-10 AC-7). Nothing here reads the clock, the
 *     environment, or the filesystem, and rule iteration walks
 *     `BOOTSTRAP_RULES` (`rules.ts:71`) in registry order — never
 *     `Object.keys(state)`, whose order is a property of how the caller built
 *     the object rather than of the contract.
 *   - **No marker survives the render.** `contract` is the block *body* with
 *     every marker comment stripped: the installer's `bootstrap_op` re-adds
 *     the `massa-ai:bootstrap` pair when it writes the file (design.md:193-197,
 *     tasks.md T10 promotes the block body to that engine's third argument),
 *     so emitting them here would double them.
 *   - **The header region is emitted in every state.** With `massa-ai-router`
 *     disabled the rendered file is the only place a user can still read how to
 *     switch it back on, so the recovery command and the state file path are
 *     generated here rather than taken from a source span that a toggle can
 *     remove (spec.md Edge Cases; BST-10 AC-9).
 *
 * A disabled rule's span is dropped (assumption A5). One shape needs more than
 * omission: a span may carry a nested `:off` / `:off-end` pair whose text is
 * emitted *instead of* the span when the rule is disabled (assumption A6).
 * `skills/AGENTS.md:292-304` is the only span carrying one today
 * (`code-comments`), but the mechanism keys on the markers, not on that id —
 * a renderer that special-cased the id would make the second off-text a code
 * change instead of a source change.
 *
 * This module owns no filesystem access: `source` arrives as a string and both
 * outputs are returned, never written. That is what lets the suite render the
 * real repository source without touching the developer's home.
 */

import path from "path";

import { type Host } from "../profile-switch/hosts";
import { BOOTSTRAP_RULES } from "./rules";
import { BOOTSTRAP_STATE_PATH, type BootstrapState } from "./state";

/** The block delimiters `scripts/install-skills.sh:74-75` already owns. They
 *  bound the region of the source this renderer reads; they are deliberately
 *  absent from the returned `contract` (see the module doc block). */
export const BOOTSTRAP_BLOCK_START = "<!-- massa-ai:bootstrap:start -->";
export const BOOTSTRAP_BLOCK_END = "<!-- massa-ai:bootstrap:end -->";

/** The per-host contract file name (BST-01 AC-1). */
export const CONTRACT_FILENAME = "MASSA-AI.md";

/** Marker suffixes a rule span can carry. `off`/`off-end` bound the text
 *  rendered when the rule is disabled. */
export type RuleMarkerSuffix = "start" | "end" | "off" | "off-end";

/** The literal marker comment for one rule id and suffix. Exported so a test
 *  or a future generator builds the same string this parser matches, instead
 *  of a second copy of the format drifting from this one. */
export function ruleMarker(id: string, suffix: RuleMarkerSuffix): string {
  return `<!-- massa-ai:rule:${id}:${suffix} -->`;
}

/** Any marker comment of either family. Used for the post-render sweep that
 *  refuses to emit a marker the rule loop did not consume. */
const ANY_MASSA_AI_MARKER = /<!--\s*massa-ai:(?:rule|bootstrap):[^>]*-->/;

/**
 * Named error for every render refusal. One class with a distinct `name` per
 * case mirrors `rules.ts`'s `namedError` shape, so a caller branches on
 * `err.name` rather than on a message substring; `details` carries the
 * offending ids or markers so a fix does not need a second run to enumerate
 * them.
 */
export class BootstrapRenderError extends Error {
  readonly details: readonly string[];
  constructor(name: string, message: string, details: readonly string[] = []) {
    super(message);
    this.name = name;
    this.details = details;
  }
}

/**
 * Each host's user config directory relative to the target home, mirroring
 * `installer_host_config_dir` (`scripts/lib/installer-shared.sh:192-200`),
 * which is the installer's own destination map for exactly these four hosts.
 */
const HOST_CONFIG_DIR: Readonly<Record<Host, readonly string[]>> = {
  claude: [".claude"],
  codex: [".codex"],
  cursor: [".cursor"],
  opencode: [".config", "opencode"],
};

/** Absolute path of `host`'s `MASSA-AI.md` under `targetHome` (BST-01 AC-1). */
export function bootstrapContractPath(host: Host, targetHome: string): string {
  requireAbsoluteTargetHome(targetHome);
  return path.join(targetHome, ...HOST_CONFIG_DIR[host], CONTRACT_FILENAME);
}

/**
 * Absolute path of the file holding the rule state, scoped to `targetHome`.
 *
 * Mirrors `configDir("massa-ai")`'s default — `xdgConfigHome()` is
 * `XDG_CONFIG_HOME` or `~/.config` (`packages/shared/src/config/xdg.ts:32,57`)
 * — with `targetHome` in place of the real home, because reading the real
 * `os.homedir()` here would make the rendered text differ between an install
 * into a scratch home and the same install into `$HOME`. A machine that sets
 * `XDG_CONFIG_HOME` moves the real file; the header names the default location
 * and the `bootstrap.rules` key, which is what a reader needs to find it.
 */
export function bootstrapStateFilePath(targetHome: string): string {
  requireAbsoluteTargetHome(targetHome);
  return path.join(targetHome, ".config", "massa-ai", "config.json");
}

export interface RenderBootstrapOptions {
  /** The whole `skills/AGENTS.md` text, or any text carrying exactly one
   *  bootstrap block. Only the block is read; bytes outside it are ignored. */
  readonly source: string;
  /** A resolved state — every registry id present. `resolveBootstrapState`
   *  (`state.ts:96`) is what produces one; a partial object is refused rather
   *  than silently rendering the missing rules as disabled. */
  readonly state: BootstrapState;
  /** Which host this render is for. Selects the `MASSA-AI.md` path the
   *  pointer names; the contract body is host-independent (assumption A4:
   *  one global rule state applied to every host). */
  readonly host: Host;
  /** Absolute home the install is scoped to — `install-skills.sh`'s
   *  `TARGET_HOME`. */
  readonly targetHome: string;
}

export interface BootstrapRender {
  /** The `MASSA-AI.md` body: generated header region, then the source block
   *  with disabled spans removed, off-texts substituted and every marker
   *  stripped. Ends with exactly one newline. */
  readonly contract: string;
  /**
   * The managed `AGENTS.md` pointer block for Codex and Cursor (BST-04): a
   * fixed template naming the absolute `MASSA-AI.md` path, at most 10 lines,
   * with no policy text of its own. Returned for every host — the caller
   * decides which hosts deliver it (design.md:204-209 gives Claude and
   * OpenCode native loaders instead), and returning it unconditionally keeps
   * this function's result total rather than making the field optional at
   * every call site.
   */
  readonly pointer: string;
}

/**
 * Render the contract and the pointer for one host from the source and a
 * resolved rule state.
 *
 * @throws {BootstrapRenderError} `TargetHomeNotAbsoluteError` when
 * `targetHome` is relative; `IncompleteBootstrapStateError` when a registry id
 * has no entry in `state`; `BootstrapSourceError` when the source carries
 * anything but exactly one well-formed bootstrap block;
 * `MissingRuleSpanError` when a registry id has no well-formed span;
 * `MalformedOffSpanError` when a span's `:off` pair is incomplete or
 * inverted; `UnknownRuleMarkerError` when a marker survives the rule loop.
 */
export function renderBootstrap(options: RenderBootstrapOptions): BootstrapRender {
  const { source, state, host, targetHome } = options;

  requireAbsoluteTargetHome(targetHome);
  requireTotalState(state);

  const body = applyRuleState(extractBootstrapBlock(source), state);
  const contract = `${renderHeader(state, targetHome)}\n\n${body}`;

  return { contract, pointer: renderPointer(host, targetHome) };
}

function requireAbsoluteTargetHome(targetHome: string): void {
  if (!path.isAbsolute(targetHome)) {
    // A relative home would make the pointer's path depend on the process cwd,
    // so two renders of the same state from two directories would disagree —
    // the failure BST-10 AC-7 forbids, surfacing as installer drift rather
    // than as an error.
    throw new BootstrapRenderError(
      "TargetHomeNotAbsoluteError",
      `targetHome must be an absolute path, got "${targetHome}"`,
      [targetHome],
    );
  }
}

function requireTotalState(state: BootstrapState): void {
  const missing = BOOTSTRAP_RULES.filter((rule) => typeof state[rule.id] !== "boolean").map(
    (rule) => rule.id,
  );
  if (missing.length > 0) {
    // Rendering a missing id as disabled would drop its span silently, which
    // is indistinguishable from the user having turned it off. Every violation
    // is reported in one throw, following `validateRuleIds` (`rules.ts:216`).
    throw new BootstrapRenderError(
      "IncompleteBootstrapStateError",
      `bootstrap state is missing a boolean for: ${missing.join(", ")} — pass a state resolved by resolveBootstrapState`,
      missing,
    );
  }
}

/** The text between the bootstrap delimiters, exclusive. */
function extractBootstrapBlock(source: string): string {
  const startCount = countOccurrences(source, BOOTSTRAP_BLOCK_START);
  const endCount = countOccurrences(source, BOOTSTRAP_BLOCK_END);
  const startIndex = source.indexOf(BOOTSTRAP_BLOCK_START);
  const endIndex = source.indexOf(BOOTSTRAP_BLOCK_END);

  if (startCount !== 1 || endCount !== 1 || startIndex > endIndex) {
    // Same refusal as the installer's duplicate-marker abort
    // (`scripts/install-skills.sh:472-477`, quoted as the spec's first edge
    // case): an ambiguous block is never guessed at.
    throw new BootstrapRenderError(
      "BootstrapSourceError",
      `source must contain exactly one well-formed bootstrap block — found ${startCount} start and ${endCount} end marker(s)`,
      [`start=${startCount}`, `end=${endCount}`],
    );
  }

  return source.slice(startIndex + BOOTSTRAP_BLOCK_START.length, endIndex);
}

interface MarkerMatch {
  readonly index: number;
  readonly count: number;
}

/**
 * Locate a marker by whole-line equality after trimming.
 *
 * Whole-line rather than substring, because `…:off -->` is a prefix of nothing
 * but `…:off-end -->` is a distinct marker whose line would otherwise also
 * match a naive `includes` for `…:off`.
 */
function findMarker(lines: readonly string[], marker: string): MarkerMatch {
  let index = -1;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === marker) {
      if (count === 0) index = i;
      count++;
    }
  }
  return { index, count };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/** The on-text and off-text halves of one span's inner lines. */
interface SpanText {
  readonly on: readonly string[];
  readonly off: readonly string[];
}

function splitOffSpan(inner: readonly string[], id: string): SpanText {
  const offStart = findMarker(inner, ruleMarker(id, "off"));
  const offEnd = findMarker(inner, ruleMarker(id, "off-end"));

  if (offStart.count === 0 && offEnd.count === 0) return { on: inner, off: [] };

  if (offStart.count !== 1 || offEnd.count !== 1 || offStart.index > offEnd.index) {
    throw new BootstrapRenderError(
      "MalformedOffSpanError",
      `rule "${id}" has a malformed off-text span — found ${offStart.count} ":off" and ${offEnd.count} ":off-end" marker(s)`,
      [id],
    );
  }

  return {
    on: [...inner.slice(0, offStart.index), ...inner.slice(offEnd.index + 1)],
    off: inner.slice(offStart.index + 1, offEnd.index),
  };
}

/**
 * Replace every rule span with the text its state selects.
 *
 * Iterates `BOOTSTRAP_RULES` in registry order and re-locates each span
 * against the array as it is being spliced, so one rule's removal cannot
 * invalidate the next one's indices. Span removal is commutative, so this
 * order does not change the output — it is the order the registry fixes for
 * every other consumer, and matching it keeps a single reading of "registry
 * order" across the module set.
 */
function applyRuleState(block: string, state: BootstrapState): string {
  const lines = block.split("\n");
  const missingSpans: string[] = [];

  for (const rule of BOOTSTRAP_RULES) {
    const start = findMarker(lines, ruleMarker(rule.id, "start"));
    const end = findMarker(lines, ruleMarker(rule.id, "end"));

    if (start.count !== 1 || end.count !== 1 || start.index > end.index) {
      missingSpans.push(rule.id);
      continue;
    }

    const span = splitOffSpan(lines.slice(start.index + 1, end.index), rule.id);
    const replacement = state[rule.id] ? span.on : span.off;
    lines.splice(start.index, end.index - start.index + 1, ...replacement);
  }

  if (missingSpans.length > 0) {
    // A registry id with no span is a rule the user can list and toggle but
    // that no render can ever change — the silent-wrong-state class the
    // wiring probe exists to prevent one layer up (design.md:237-253).
    throw new BootstrapRenderError(
      "MissingRuleSpanError",
      `source has no well-formed span for rule(s): ${missingSpans.join(", ")}`,
      missingSpans,
    );
  }

  const leftovers = lines.filter((line) => ANY_MASSA_AI_MARKER.test(line)).map((line) => line.trim());
  if (leftovers.length > 0) {
    // Reached when the source marks up an id the registry does not carry. The
    // alternative — stripping it silently — also satisfies "no marker in the
    // output" while leaving that section permanently un-toggleable, which is
    // the failure this refusal is here to make loud.
    throw new BootstrapRenderError(
      "UnknownRuleMarkerError",
      `source carries marker(s) no registry rule consumed: ${leftovers.join(", ")}`,
      leftovers,
    );
  }

  return normalizeBlankLines(lines);
}

/**
 * Join rendered lines into a body whose blank-line spacing does not depend on
 * which rules were removed: no leading blank line, at most one blank line in a
 * row, one blank line before every heading, and exactly one trailing newline.
 *
 * Both halves are needed because the source spaces its spans inconsistently.
 * `skills/AGENTS.md:48-49` puts one rule's `:end` marker directly above the
 * next rule's `:start`, so stripping both markers would butt a heading against
 * the previous paragraph; `:112-114` separates them with a blank line, so
 * removing that span would leave two. Left alone, the same rule renders with
 * different surrounding whitespace depending on its neighbours' states.
 *
 * Fenced blocks are passed through untouched — the source ships four of them
 * (three `yaml`, one `text`), and a normalizer that reformatted their contents
 * would be editing policy data, not layout.
 */
function normalizeBlankLines(lines: readonly string[]): string {
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const previous = out[out.length - 1];
    const isBlank = line.trim() === "";
    if (isBlank && (previous === undefined || previous.trim() === "")) continue;
    if (/^#{1,6} /.test(line) && previous !== undefined && previous.trim() !== "") out.push("");
    out.push(line);
  }

  return `${out.join("\n").trimEnd()}\n`;
}

/**
 * The always-rendered header region (BST-10 AC-9, spec.md Edge Cases).
 *
 * Generated rather than sourced: every line of the source block sits inside
 * some rule's span or the intro, and a recovery instruction that a toggle can
 * delete is not a recovery instruction. It names the state file, the
 * `bootstrap.rules` key, and the exact command that switches a rule back on —
 * including the `massa-ai-router` case, which is the one state where this file
 * is the user's only remaining instruction (assumption A8, BST-11.5).
 *
 * Nothing here varies except the all-off notice, so two renders of one state
 * are byte-identical (BST-10 AC-7): no timestamp, no version, no host name.
 */
function renderHeader(state: BootstrapState, targetHome: string): string {
  const lines = [
    "> Generated by massa-ai from `skills/AGENTS.md`. Edits made here are lost on",
    "> the next `scripts/install-skills.sh --apply` or",
    "> `massa-ai-config bootstrap enable|disable <rule-id>` run.",
    ">",
    `> Rule state lives in \`${bootstrapStateFilePath(targetHome)}\` under the`,
    `> \`${BOOTSTRAP_STATE_PATH}\` key. List every rule and its state with`,
    "> `massa-ai-config bootstrap list`; switch one back on with",
    "> `massa-ai-config bootstrap enable <rule-id>`. That command is a binary and",
    "> not a rule, so it keeps working with every rule below disabled —",
    "> `massa-ai-config bootstrap enable massa-ai-router` is the way back when the",
    "> router rule itself is off.",
  ];

  if (BOOTSTRAP_RULES.every((rule) => !state[rule.id])) {
    lines.push(
      "",
      "**Every massa-ai bootstrap rule is disabled.** The contract below carries no",
      "rule to activate, and nothing in this file changes agent behavior until at",
      "least one rule is enabled again.",
    );
  }

  return lines.join("\n");
}

/**
 * The Codex/Cursor `AGENTS.md` pointer block (BST-04 AC-6, AC-7).
 *
 * Six lines, well under the 10-line cap, and deliberately state-independent:
 * it names where the contract is and says nothing the contract says, so
 * `AGENTS.md` never becomes a second copy of it. Neither host has an import
 * directive — Codex's `project_doc_fallback_filenames` renames the file it
 * searches rather than adding one, and Cursor reads no user-level file at all
 * (spec.md assumption A1) — so the load here is an instruction the model
 * follows, which is why it names the tool and the timing explicitly.
 */
function renderPointer(host: Host, targetHome: string): string {
  return [
    "## massa-ai Startup Contract",
    "",
    "Before substantive work in this session, read",
    `\`${bootstrapContractPath(host, targetHome)}\``,
    "with your Read tool and follow it. This block is a pointer only: it states no",
    "rule of its own, and massa-ai overwrites it on the next install.",
    "",
  ].join("\n");
}
