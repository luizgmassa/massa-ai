/**
 * Bootstrap rule registry (design "Rule registry", BST-08, BST-09).
 *
 * The nine rules `skills/AGENTS.md` marks up with
 * `<!-- massa-ai:rule:<id>:start|end -->` pairs, in the fixed order the
 * renderer (T6) must reproduce — determinism there comes from iterating this
 * array in registry order, never from object key order. This module owns no
 * filesystem access and no rendering; it is the single source of truth for
 * which ids exist, what each defaults to, and what an unknown id's error
 * looks like, shared by the renderer, the state resolver (T5), the apply
 * engine (T8), and both CLIs (T17/T18).
 *
 * Id list shape follows `SCHEDULER_JOB_KINDS`
 * (`packages/shared/src/config/massa-ai-config.ts:7-13`): a plain `as const`
 * array, not an enum, so the id set stays a single literal union derivable
 * from one place. `UnknownRuleError`'s named-error factory and
 * `validateRuleIds`'s accumulate-every-violation-then-throw-once idiom follow
 * `scripts/lib/model-profiles.ts:97-107`, `:167-314`
 * (`RegistryValidationError`, `UnknownProfileError`) — reused as a pattern
 * only. This module may not import `scripts/lib/`: both published CLIs
 * (`apps/mcp-client/src/config-cli.ts:24-31`) document that a published
 * package cannot depend on the repo-local scripts tree, which is why
 * `profile-switch/hosts.ts:8-11` duplicates `HOSTS` instead of importing it
 * rather than a precedent to deviate from here.
 */

/**
 * The nine bootstrap rule ids, in the fixed order they render in
 * `skills/AGENTS.md` and in `MASSA-AI.md`. BST-09 AC-1 fixes this exact set;
 * BST-09 AC-3 requires every one of them to be individually switchable both
 * ways, so there is deliberately no separate "protected ids" list anywhere in
 * this module — `assertKnownRuleId` and `validateRuleIds` treat all nine
 * identically for both `enable` and `disable`.
 */
export const BOOTSTRAP_RULE_IDS = [
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

export type BootstrapRuleId = (typeof BOOTSTRAP_RULE_IDS)[number];

/** Type guard narrowing an arbitrary string to a known {@link BootstrapRuleId}. */
export function isBootstrapRuleId(value: unknown): value is BootstrapRuleId {
  return typeof value === "string" && (BOOTSTRAP_RULE_IDS as readonly string[]).includes(value);
}

export interface BootstrapRuleDefinition {
  readonly id: BootstrapRuleId;
  /** Whether a fresh install — or any state with no persisted entry for this
   *  id — renders this rule's span. Every rule defaults to `true` except
   *  `code-comments` (BST-08 AC-2), which ships disabled because turning it
   *  on changes every future generated diff's shape, unlike the other eight
   *  rules, which only change agent process. */
  readonly defaultEnabled: boolean;
  /** One-line description surfaced by `massa-ai-config bootstrap list`
   *  (BST-11 AC-3) — kept short, not a restatement of the full rule body. */
  readonly description: string;
}

/**
 * The registry itself, in render order. `BST-09 AC-1` fixes the id set;
 * `BST-08 AC-2` fixes every default except `code-comments`.
 */
export const BOOTSTRAP_RULES: readonly BootstrapRuleDefinition[] = [
  {
    id: "caveman",
    defaultEnabled: true,
    description: "Keep communication compressed while preserving technical accuracy.",
  },
  {
    id: "massa-ai-router",
    defaultEnabled: true,
    description: "Load the massa-ai skill as the workflow router before substantive work.",
  },
  {
    id: "persona-router",
    defaultEnabled: true,
    description: "Select one cataloged specialist persona after massa-ai context is available.",
  },
  {
    id: "dedupe-guardrails",
    defaultEnabled: true,
    description: "Reuse already-loaded massa-ai context instead of bulk-loading workflows or references.",
  },
  {
    id: "plan-challenge",
    defaultEnabled: true,
    description: "Run The Fool as a post-plan challenge gate per the configured policy.",
  },
  {
    id: "conversation-feedback",
    defaultEnabled: true,
    description: "Emit chat-visible status updates for massa-ai workflow progress.",
  },
  {
    id: "indexing-hygiene",
    defaultEnabled: true,
    description: "Ignore build output, dependency, and secret paths during indexing and context loading.",
  },
  {
    id: "english-code",
    defaultEnabled: true,
    description:
      "Write generated code, identifiers, comments, and commit-facing artifacts in English regardless of conversational language.",
  },
  {
    id: "code-comments",
    defaultEnabled: false,
    description:
      "Require API doc blocks and rationale comments on generated code, per code-annotation.md §1/§2.",
  },
];

/** `BOOTSTRAP_RULES` indexed by id, for O(1) lookup where render order does
 *  not matter (default resolution, CLI dispatch). */
const RULES_BY_ID: ReadonlyMap<BootstrapRuleId, BootstrapRuleDefinition> = new Map(
  BOOTSTRAP_RULES.map((rule) => [rule.id, rule]),
);

export function getBootstrapRuleDefinition(id: BootstrapRuleId): BootstrapRuleDefinition {
  const def = RULES_BY_ID.get(id);
  if (!def) {
    // Unreachable while BOOTSTRAP_RULE_IDS and BOOTSTRAP_RULES stay in sync —
    // guarded by the registry unit suite's set-equality assertion — but a
    // thrown error here is still cheaper than a silent `undefined` reaching a
    // caller that indexes into it.
    throw UnknownRuleError(id, BOOTSTRAP_RULE_IDS);
  }
  return def;
}

/**
 * The default enabled/disabled map, one entry per registry id, in the same
 * order as {@link BOOTSTRAP_RULES}. This is what a fresh install — or a
 * persisted state naming no rules at all — resolves to (T5).
 */
export function bootstrapRuleDefaults(): Record<BootstrapRuleId, boolean> {
  const defaults = {} as Record<BootstrapRuleId, boolean>;
  for (const rule of BOOTSTRAP_RULES) defaults[rule.id] = rule.defaultEnabled;
  return defaults;
}

/**
 * Named error base for this module, mirroring
 * `scripts/lib/model-profiles.ts`'s `RegistryError`/`namedError` shape so a
 * caller can `err.name === "UnknownRuleError"` without a message-string
 * match.
 */
export class BootstrapRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapRuleError";
  }
}

function namedError(name: string, message: string): BootstrapRuleError {
  const err = new BootstrapRuleError(message);
  err.name = name;
  return err;
}

/**
 * BST-09 AC-8: naming the bad id and listing all nine valid ones. `known`
 * defaults to the full registry id list so every call site gets the complete
 * list without having to thread it through — a caller validating a batch
 * (e.g. {@link validateRuleIds}) can still override it, though every
 * violation in this registry names the same nine ids regardless.
 */
export const UnknownRuleError = (
  id: string,
  known: readonly string[] = BOOTSTRAP_RULE_IDS,
): BootstrapRuleError =>
  namedError("UnknownRuleError", `unknown bootstrap rule "${id}" — valid ids: ${known.join(", ")}`);

/**
 * Throws {@link UnknownRuleError} unless `id` is one of the nine registry
 * ids. BST-09 AC-3: this function — and therefore every caller that gates
 * `enable`/`disable` through it — draws no distinction between any of the
 * nine ids; there is no protected subset.
 */
export function assertKnownRuleId(id: string): asserts id is BootstrapRuleId {
  if (!isBootstrapRuleId(id)) throw UnknownRuleError(id, BOOTSTRAP_RULE_IDS);
}

/**
 * Aggregate error for {@link validateRuleIds}: every unknown id found, not
 * just the first — the accumulate-then-throw-once idiom from
 * `scripts/lib/model-profiles.ts`'s `validateRegistry` (`:167-314`), reused
 * here because a persisted `bootstrap.rules` object (T5) can carry more than
 * one stale or typo'd id at once, and reporting them one at a time would
 * make a multi-id typo take multiple fix-and-rerun cycles to fully surface.
 */
export class BootstrapRuleValidationError extends BootstrapRuleError {
  readonly unknownIds: readonly string[];
  constructor(unknownIds: readonly string[]) {
    super(
      `unknown bootstrap rule id(s): ${unknownIds.join(", ")} — valid ids: ${BOOTSTRAP_RULE_IDS.join(", ")}`,
    );
    this.name = "BootstrapRuleValidationError";
    this.unknownIds = unknownIds;
  }
}

/**
 * Validates every id in `ids` against the registry, collecting every
 * violation before throwing once. Passing — returns void — means every id in
 * `ids` is a known {@link BootstrapRuleId}.
 */
export function validateRuleIds(ids: readonly string[]): void {
  const unknown = ids.filter((id) => !isBootstrapRuleId(id));
  if (unknown.length > 0) throw new BootstrapRuleValidationError(unknown);
}
