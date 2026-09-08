/**
 * Bootstrap rule state: resolution and persistence (T5 / TASK-005, BST-10).
 *
 * Two halves of one contract. `resolveBootstrapState` merges the persisted
 * `bootstrap.rules` object over the registry defaults and yields a total map —
 * every registry id present, no `undefined` for a caller to interpret.
 * `setBootstrapRuleEnabled` persists a single flip through the T3 seam
 * (`readRawConfigStrict` / `writeRawConfig`), never through
 * `loadConfig`+`saveConfig`.
 *
 * That seam choice is the whole point of the module and is not stylistic:
 * `loadConfig` catches a `JSON.parse` failure and returns
 * `defaultMassaAiConfig`, and `saveConfig` replaces the whole document — so
 * the pair destroys a malformed `config.json`, including `security.apiKey` and
 * `database.url`, the moment anything round-trips it
 * (`config-loader.ts:190-207`). A rule toggle must never be the operation that
 * silently erases a user's database URL.
 *
 * This module owns no rendering and no host iteration. The renderer (T6) and
 * the apply engine (T8) consume `BootstrapState`; the two CLIs (T17/T18)
 * consume the writer.
 */

import fs from "fs";
import {
  ConfigParseError,
  getConfigPath,
  readRawConfigStrict,
  writeRawConfig,
} from "../config/config-loader";
import {
  type BootstrapRuleId,
  assertKnownRuleId,
  bootstrapRuleDefaults,
  isBootstrapRuleId,
} from "./rules";

/** Resolved state: every registry id present, defaults filled in. */
export type BootstrapState = Readonly<Record<BootstrapRuleId, boolean>>;

/**
 * The `config.json` key path this module owns, and the only subtree it writes.
 * Exported so the CLIs and the installer can name the same path in their
 * messages without a second literal drifting from this one.
 */
export const BOOTSTRAP_STATE_KEY = "bootstrap";
export const BOOTSTRAP_RULES_KEY = "rules";
/** Dotted form, for user-facing messages that name where state lives. */
export const BOOTSTRAP_STATE_PATH = `${BOOTSTRAP_STATE_KEY}.${BOOTSTRAP_RULES_KEY}`;

export interface ResolvedBootstrapState {
  readonly state: BootstrapState;
  /**
   * Persisted entries that were read and deliberately not applied, sorted so
   * two resolutions of the same document report them in the same order —
   * `BootstrapReport` is rendered to a user and a set-shaped field that
   * reordered between runs would look like churn.
   *
   * BST-10 AC-12 names one member of this class: an id absent from the
   * registry. Two further shapes are reported through the same field rather
   * than dropped silently, because "ignored" is the honest description of all
   * three and inventing a second channel for them would leave
   * `BootstrapReport` unable to carry them at all:
   *
   *   - a known id whose persisted value is not a boolean (`"true"`, `1`,
   *     `null`) — coercing it would invent a preference the user never
   *     expressed, so the registry default applies and the key is named here;
   *   - `bootstrap.rules` itself present but not a plain object, reported as
   *     the dotted path `bootstrap.rules`.
   *
   * Empty means every persisted entry was applied.
   */
  readonly ignoredStateKeys: readonly string[];
}

/** A plain (non-array, non-null) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge a raw config document's `bootstrap.rules` over the registry defaults.
 *
 * `doc` is the literal parsed `config.json`. Pass it explicitly on the write
 * path, where the caller has already read the bytes it intends to
 * compare-and-swap against — resolving from a second, independent read there
 * would let the two disagree. Omit it for a read-only resolution, which reads
 * through {@link readRawConfigStrict} and therefore **throws**
 * {@link ConfigParseError} on a malformed file rather than treating it as
 * empty.
 *
 * A caller that must not fail on an unreadable file — the install-time render,
 * BST-10 AC-10b — catches that throw, renders these same defaults, and warns;
 * it does not get a silent degrade from this function.
 */
export function resolveBootstrapState(doc?: Record<string, unknown>): ResolvedBootstrapState {
  const document = doc ?? readRawConfigStrict();
  const state = bootstrapRuleDefaults();
  const ignored: string[] = [];

  const bootstrap = document[BOOTSTRAP_STATE_KEY];
  if (bootstrap === undefined) return { state, ignoredStateKeys: [] };

  if (!isPlainObject(bootstrap)) {
    return { state, ignoredStateKeys: [BOOTSTRAP_STATE_KEY] };
  }

  const rules = bootstrap[BOOTSTRAP_RULES_KEY];
  if (rules === undefined) return { state, ignoredStateKeys: [] };

  if (!isPlainObject(rules)) {
    return { state, ignoredStateKeys: [BOOTSTRAP_STATE_PATH] };
  }

  for (const [key, value] of Object.entries(rules)) {
    if (!isBootstrapRuleId(key) || typeof value !== "boolean") {
      ignored.push(key);
      continue;
    }
    state[key] = value;
  }

  return { state, ignoredStateKeys: ignored.sort() };
}

/** Raw `config.json` bytes, or `""` when the file does not exist. */
function readConfigBytes(): string {
  try {
    return fs.readFileSync(getConfigPath(), "utf-8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

export interface SetBootstrapRuleResult {
  readonly id: BootstrapRuleId;
  readonly enabled: boolean;
  /** `false` when the resolved state already held this value — the write is
   *  still performed, so a first flip that matches the registry default
   *  materializes the key rather than leaving the preference implicit. */
  readonly changed: boolean;
  readonly state: BootstrapState;
  readonly ignoredStateKeys: readonly string[];
}

/**
 * Persist one rule's enabled flag, preserving every other key in the document.
 *
 * The id is validated **before** any read or write, so an unknown id can never
 * be the reason a file was touched: `assertKnownRuleId` throws
 * `UnknownRuleError` naming the bad id and listing all nine valid ones
 * (BST-09 AC-8).
 *
 * The bytes read here are handed to {@link writeRawConfig} as its
 * compare-and-swap baseline, and `next` is a spread of the document those
 * exact bytes parsed to. That is what makes the write preserve top-level keys
 * this module knows nothing about, and sibling keys under `bootstrap`, rather
 * than replacing the document.
 *
 * An absent `config.json` reads as `""` / `{}` and is created by the write —
 * a first-run toggle must not require the file to exist already.
 */
export function setBootstrapRuleEnabled(id: string, enabled: boolean): SetBootstrapRuleResult {
  assertKnownRuleId(id);

  const expectedBytes = readConfigBytes();
  let document: Record<string, unknown>;
  if (expectedBytes === "") {
    document = {};
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(expectedBytes);
    } catch (error) {
      throw new ConfigParseError(getConfigPath(), error);
    }
    if (!isPlainObject(parsed)) {
      throw new ConfigParseError(getConfigPath(), new Error("parsed value is not a JSON object"));
    }
    document = parsed;
  }

  const before = resolveBootstrapState(document);

  const bootstrap = document[BOOTSTRAP_STATE_KEY];
  const bootstrapSubtree = isPlainObject(bootstrap) ? bootstrap : {};
  const rules = bootstrapSubtree[BOOTSTRAP_RULES_KEY];
  const rulesSubtree = isPlainObject(rules) ? rules : {};

  const next: Record<string, unknown> = {
    ...document,
    [BOOTSTRAP_STATE_KEY]: {
      ...bootstrapSubtree,
      [BOOTSTRAP_RULES_KEY]: { ...rulesSubtree, [id]: enabled },
    },
  };

  writeRawConfig(next, { expectedBytes });

  const after = resolveBootstrapState(next);
  return {
    id,
    enabled,
    changed: before.state[id] !== enabled,
    state: after.state,
    ignoredStateKeys: after.ignoredStateKeys,
  };
}
