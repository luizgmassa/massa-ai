#!/usr/bin/env bun
/**
 * Bootstrap render entry point for `scripts/install-skills.sh` (T12 / TASK-012,
 * BST-01, BST-10).
 *
 * The installer is bash and the renderer is TypeScript in `packages/shared`
 * (design.md "R1"), so something has to bridge them. This file is that bridge:
 * given a target home, a host and the marked-up source, it resolves the
 * persisted rule state, renders the contract and the pointer, and writes each
 * one already wrapped in the `<!-- massa-ai:bootstrap:start|end -->` pair that
 * `bootstrap_op` compares against (`scripts/install-skills.sh:486`, `:578-581`).
 * Emitting the bare body instead would make every run report a change, because
 * the engine slices marker-to-marker before comparing.
 *
 * Two contracts are load-bearing here and both are asserted by
 * `scripts/__tests__/render-bootstrap.test.ts` rather than left to review:
 *
 *   - **The module ladder is keyed on bun, and its failure is loud.**
 *     `installer_detect_runner` (`scripts/lib/installer-shared.sh:23-33`)
 *     returns `node` first whenever node is on PATH, and node is always on PATH
 *     in this repository as the node-gyp build helper — so a ladder keyed on
 *     `$RUNNER` would take the bun branch on no machine at all. The order is
 *     bun-plus-TypeScript-source, then the built `dist`, then a named refusal
 *     quoting `bun run build`. There is no fourth branch: rendering the
 *     registry defaults because the module could not be found would ship a
 *     contract that silently ignores every toggle the user set.
 *   - **An unreadable rule state degrades; it never blocks and never writes.**
 *     BST-10 AC-10b. `--apply` runs on every repo install, every
 *     `install-harness.sh` run and every plugin upgrade, so a malformed
 *     `config.json` must not start aborting harness installation — a failure
 *     mode that does not exist today (design.md:215-231). The registry defaults
 *     are rendered, a named warning identifies the file and the parse failure,
 *     and `config.json` is not written in any branch.
 *
 * The warning goes through an `onWarning` callback rather than a bare
 * `process.stderr.write`, mirroring `applyBootstrapState`'s own sink
 * (`packages/shared/src/bootstrap/engine.ts:123-130`). A caller can only
 * surface what a channel carries, and the CLI front (T17) and the shared
 * formatter (T16) are callers.
 *
 * Test: bun test scripts/__tests__/render-bootstrap.test.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Relative location of the TypeScript barrel, from the repository root. */
export const BOOTSTRAP_SOURCE_ENTRY = path.join(
  "packages",
  "shared",
  "src",
  "bootstrap",
  "index.ts",
);

/** Relative location of the built barrel, from the repository root. */
export const BOOTSTRAP_DIST_ENTRY = path.join(
  "packages",
  "shared",
  "dist",
  "bootstrap",
  "index.js",
);

/** The command the third ladder branch names. Exported so the suite asserts the
 *  literal the message must carry rather than a paraphrase of it. */
export const BUILD_COMMAND = "bun run build";

/**
 * Named error for every refusal this entry point raises, so the installer's
 * caller branches on `err.name` instead of on a message substring — the shape
 * `BootstrapRenderError` (`render.ts:121`) and `BootstrapEngineError`
 * (`engine.ts:89`) already use.
 */
export class RenderBootstrapError extends Error {
  readonly details: readonly string[];
  constructor(name: string, message: string, details: readonly string[] = []) {
    super(message);
    this.name = name;
    this.details = details;
  }
}

export interface RendererEntry {
  readonly kind: "source" | "dist";
  /** Absolute path of the module to import. */
  readonly specifier: string;
}

export interface ResolveRendererOptions {
  readonly repoRoot: string;
  /** Whether `command -v bun` succeeded. Injected rather than read from
   *  `process.versions.bun`, because the installer decides which runner starts
   *  this process and the suite has to exercise both answers. */
  readonly hasBun: boolean;
  readonly exists?: (candidate: string) => boolean;
}

/**
 * Pick the module the render runs against.
 *
 * @throws {RenderBootstrapError} `BootstrapRendererUnavailableError` when
 * neither branch is reachable. The message names both candidate paths and the
 * exact build command, because the machine that hits this has no build and the
 * user needs to know which command produces one.
 */
export function resolveRendererEntry(options: ResolveRendererOptions): RendererEntry {
  const { repoRoot, hasBun } = options;
  const exists = options.exists ?? ((candidate: string) => fs.existsSync(candidate));

  const sourceEntry = path.join(repoRoot, BOOTSTRAP_SOURCE_ENTRY);
  const distEntry = path.join(repoRoot, BOOTSTRAP_DIST_ENTRY);

  // Source first, and only under bun: node cannot load the sibling modules'
  // extensionless relative specifiers, so "the file is there" is not the same
  // question as "this runner can import it".
  if (hasBun && exists(sourceEntry)) return { kind: "source", specifier: sourceEntry };
  if (exists(distEntry)) return { kind: "dist", specifier: distEntry };

  throw new RenderBootstrapError(
    "BootstrapRendererUnavailableError",
    `cannot render the bootstrap contract: no bootstrap renderer is reachable. ` +
      `Looked for ${sourceEntry} (needs bun on PATH) and ${distEntry}. ` +
      `Run \`${BUILD_COMMAND}\` in ${repoRoot} to produce the built renderer.`,
    [sourceEntry, distEntry],
  );
}

/** The subset of the bootstrap barrel this entry point uses. Structural rather
 *  than `typeof import(...)`, because the module arrives through a dynamic
 *  import whose specifier is only known at run time. */
export interface BootstrapApi {
  resolveBootstrapState(doc?: Record<string, unknown>): {
    state: Readonly<Record<string, boolean>>;
    ignoredStateKeys: readonly string[];
  };
  renderBootstrap(options: {
    source: string;
    state: Readonly<Record<string, boolean>>;
    host: string;
    targetHome: string;
    hostRoot?: string;
  }): { contract: string; pointer: string };
  wrapBootstrapBlock(body: string): string;
  bootstrapStateFilePath(targetHome: string): string;
  ConfigParseError: new (filePath: string, cause: unknown) => Error;
}

/**
 * Import the module the ladder picked, turning a load failure into a named
 * refusal rather than letting a raw module-resolution stack reach the
 * installer's per-host error line.
 *
 * The dist branch is where this matters and the reason is measured, not
 * hypothetical: `packages/shared/src/bootstrap/{state,render,engine}.ts` import
 * their siblings with extensionless relative specifiers (`../config/config-loader`),
 * which bun resolves and node's ESM loader does not — `node -e "import('.../dist/bootstrap/index.js')"`
 * fails `ERR_MODULE_NOT_FOUND` on `dist/config/config-loader`. So on a machine
 * with no bun, "the build exists" and "this runner can load it" are different
 * questions, and only the second one decides whether a contract can be
 * rendered. Repointing those specifiers is a change across five modules that
 * this task does not own; making the failure loud and named is what design.md's
 * error table ("Renderer unreachable … abort that host with a named error")
 * asks for either way.
 */
export async function loadBootstrapApi(entry: RendererEntry): Promise<BootstrapApi> {
  try {
    return (await import(entry.specifier)) as unknown as BootstrapApi;
  } catch (error) {
    throw new RenderBootstrapError(
      "BootstrapRendererUnloadableError",
      `cannot render the bootstrap contract: the ${entry.kind} renderer at ${entry.specifier} ` +
        `could not be loaded by this runtime (${(error as Error).message}). ` +
        `Re-run with bun on PATH, or run \`${BUILD_COMMAND}\` if the build is stale.`,
      [entry.specifier],
    );
  }
}

export interface ResolvedRuleState {
  readonly state: Readonly<Record<string, boolean>>;
  readonly ignoredStateKeys: readonly string[];
  /** True when the persisted state could not be read and the registry defaults
   *  were rendered instead (BST-10 AC-10b). */
  readonly degraded: boolean;
}

/**
 * Read `configPath` and merge it over the registry defaults, degrading to those
 * defaults with a named warning when the file cannot be read as a JSON object.
 *
 * An absent file is the ordinary "nothing configured yet" state and warns
 * nothing. Nothing here writes: the offending bytes are left exactly as they
 * are, so a failed read of a preference is never what destroys it.
 *
 * The warning is composed from the barrel's own `ConfigParseError`, not from a
 * fresh template, so the "Failed to parse <file>: <reason>" phrasing the
 * installer prints is the same one the strict write path raises.
 */
export function resolveRuleStateForRender(
  api: BootstrapApi,
  configPath: string,
  onWarning: (message: string) => void,
): ResolvedRuleState {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    const resolved = api.resolveBootstrapState({});
    return { state: resolved.state, ignoredStateKeys: resolved.ignoredStateKeys, degraded: false };
  }

  const degrade = (cause: unknown): ResolvedRuleState => {
    const error = new api.ConfigParseError(configPath, cause);
    onWarning(
      `${error.name}: ${error.message} — rendering the registry bootstrap defaults; ` +
        `${configPath} was not written`,
    );
    const resolved = api.resolveBootstrapState({});
    return { state: resolved.state, ignoredStateKeys: resolved.ignoredStateKeys, degraded: true };
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return degrade(error);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return degrade(new Error("parsed value is not a JSON object"));
  }

  const resolved = api.resolveBootstrapState(parsed as Record<string, unknown>);
  return { state: resolved.state, ignoredStateKeys: resolved.ignoredStateKeys, degraded: false };
}

export interface RenderRequest {
  readonly repoRoot: string;
  readonly targetHome: string;
  readonly host: string;
  /** File holding the marked-up source — `skills/AGENTS.md`, or the block the
   *  installer already extracted from it. Either carries exactly one bootstrap
   *  marker pair, which is all `renderBootstrap` reads. */
  readonly sourcePath: string;
  /**
   * The directory the caller writes this host's `MASSA-AI.md` into —
   * `install-skills.sh`'s `platform_root`. Threaded rather than re-derived
   * because only bash resolves Codex's `~/.codex` vs `~/.config/codex` split
   * (`install-skills.sh:139-145`), and the pointer must name the file that was
   * actually written (BST-04 AC-6, T26). Omitted leaves the renderer on its
   * default per-host map.
   */
  readonly hostRoot?: string;
  readonly hasBun?: boolean;
  readonly onWarning?: (message: string) => void;
}

export interface RenderResult {
  readonly entry: RendererEntry;
  /** The `MASSA-AI.md` document: the contract body inside the managed marker
   *  pair, ready for `bootstrap_op`'s body-file argument. */
  readonly contract: string;
  /** The Codex/Cursor `AGENTS.md` block, wrapped in the same pair. */
  readonly pointer: string;
  readonly ignoredStateKeys: readonly string[];
  readonly degraded: boolean;
}

/**
 * Resolve the renderer, resolve the rule state, and render both documents.
 *
 * @throws {RenderBootstrapError} `BootstrapRendererUnavailableError` when no
 * renderer is reachable; `BootstrapSourceUnreadableError` when `sourcePath`
 * cannot be read. A render refusal from the module itself
 * (`BootstrapRenderError`) propagates unchanged — it already names itself.
 */
export async function renderBootstrapForInstaller(
  request: RenderRequest,
): Promise<RenderResult> {
  const warn = request.onWarning ?? ((message: string) => process.stderr.write(`${message}\n`));
  const hasBun = request.hasBun ?? typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

  const entry = resolveRendererEntry({ repoRoot: request.repoRoot, hasBun });
  const api = await loadBootstrapApi(entry);

  let source: string;
  try {
    source = fs.readFileSync(request.sourcePath, "utf-8");
  } catch (error) {
    throw new RenderBootstrapError(
      "BootstrapSourceUnreadableError",
      `could not read the bootstrap source at ${request.sourcePath}: ${(error as Error).message}`,
      [request.sourcePath],
    );
  }

  const configPath = api.bootstrapStateFilePath(request.targetHome);
  const resolved = resolveRuleStateForRender(api, configPath, warn);

  const rendered = api.renderBootstrap({
    source,
    state: resolved.state,
    host: request.host,
    targetHome: request.targetHome,
    hostRoot: request.hostRoot,
  });

  return {
    entry,
    contract: api.wrapBootstrapBlock(rendered.contract),
    pointer: api.wrapBootstrapBlock(rendered.pointer),
    ignoredStateKeys: resolved.ignoredStateKeys,
    degraded: resolved.degraded,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = `Usage: render-bootstrap.ts --target-home <dir> --host <host> --source <file>
                            [--host-root <dir>]
                            [--contract-out <file>] [--pointer-out <file>]
                            [--repo-root <dir>]`;

export interface ParsedArgs {
  readonly targetHome: string;
  readonly host: string;
  readonly sourcePath: string;
  /** See {@link RenderRequest.hostRoot}. */
  readonly hostRoot?: string;
  readonly contractOut?: string;
  readonly pointerOut?: string;
  readonly repoRoot: string;
}

export function parseArgs(argv: readonly string[], defaultRepoRoot: string): ParsedArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] ?? "";
    if (!flag.startsWith("--")) {
      throw new RenderBootstrapError("BootstrapArgsError", `unexpected argument: ${flag}\n${USAGE}`);
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new RenderBootstrapError("BootstrapArgsError", `${flag} needs a value\n${USAGE}`);
    }
    values[flag] = value;
    i += 1;
  }

  const required = ["--target-home", "--host", "--source"];
  const missing = required.filter((flag) => values[flag] === undefined);
  if (missing.length > 0) {
    throw new RenderBootstrapError(
      "BootstrapArgsError",
      `missing required flag(s): ${missing.join(", ")}\n${USAGE}`,
      missing,
    );
  }

  return {
    targetHome: values["--target-home"] as string,
    host: values["--host"] as string,
    sourcePath: values["--source"] as string,
    hostRoot: values["--host-root"],
    contractOut: values["--contract-out"],
    pointerOut: values["--pointer-out"],
    repoRoot: values["--repo-root"] ?? defaultRepoRoot,
  };
}

export async function main(argv: readonly string[], defaultRepoRoot: string): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv, defaultRepoRoot);
  } catch (error) {
    process.stderr.write(`ERROR: ${(error as Error).message}\n`);
    return 2;
  }

  let result: RenderResult;
  try {
    result = await renderBootstrapForInstaller({
      repoRoot: args.repoRoot,
      targetHome: args.targetHome,
      host: args.host,
      sourcePath: args.sourcePath,
      hostRoot: args.hostRoot,
    });
  } catch (error) {
    process.stderr.write(`ERROR: ${(error as Error).message}\n`);
    return 1;
  }

  for (const key of result.ignoredStateKeys) {
    process.stderr.write(`WARN: ignoring unknown bootstrap rule state key: ${key}\n`);
  }

  try {
    if (args.contractOut !== undefined) writeOut(args.contractOut, result.contract);
    if (args.pointerOut !== undefined) writeOut(args.pointerOut, result.pointer);
  } catch (error) {
    process.stderr.write(`ERROR: ${(error as Error).message}\n`);
    return 1;
  }

  if (args.contractOut === undefined && args.pointerOut === undefined) {
    process.stdout.write(result.contract);
  }
  return 0;
}

function writeOut(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

const thisFile = fileURLToPath(import.meta.url);
const repoRootFromHere = path.dirname(path.dirname(thisFile));
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === thisFile) {
  main(process.argv.slice(2), repoRootFromHere).then((code) => {
    process.exitCode = code;
  });
}
