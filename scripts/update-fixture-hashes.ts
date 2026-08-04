#!/usr/bin/env bun
/**
 * update-fixture-hashes.ts - update SHA-256 hashes in every fixture/manifest
 * file that pins source hashes.
 *
 * The repo has more than one manifest that pins SHA-256 hashes of source
 * files. This script is the single entry point for refreshing all of them so
 * the corresponding integrity checks stop failing after a source change.
 *
 * Currently handled manifests:
 *
 *   corpus   benchmarks/parser/corpus/corpus-manifest.json
 *            Top-level `files` array of {name, extension, bytes, sha256}.
 *            Files are rooted at benchmarks/parser/corpus/. Also refreshes
 *            the derived top-level `corpusChecksum` (SHA-256 of the manifest
 *            payload with the checksum field removed) and the `fileCount` /
 *            `totalBytes` counters, exactly like
 *            benchmarks/parser/generate-corpus.ts and
 *            benchmarks/parser/harness.ts's computeCorpusChecksum() do.
 *
 * Bun builtins only, no new dependencies (D2/D8).
 *
 * Usage:
 *   bun run update-fixture-hashes             # update stale hashes in place
 *   bun run update-fixture-hashes -- --check  # dry-run: report mismatches only
 *   bun scripts/update-fixture-hashes.ts --root /path/to/repo
 *   bun scripts/update-fixture-hashes.ts --manifest corpus --check
 *
 * Exit codes:
 *   0  at least one hash was updated (or, in --check mode, a mismatch found)
 *   1  all hashes were already current (or, in --check mode, no mismatches)
 *   2  manifest missing or unreadable / file listed in manifest missing / usage error
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

function defaultRoot(): string {
  return resolve(import.meta.dir, "..");
}

interface CorpusFileEntry {
  name: string;
  extension: string;
  bytes: number;
  sha256: string;
  [key: string]: unknown;
}

interface CorpusManifest {
  version?: number;
  generatedBy?: string;
  fileCount?: number;
  totalBytes?: number;
  files?: CorpusFileEntry[];
  corpusChecksum?: string;
  [key: string]: unknown;
}

function loadManifest(path: string): CorpusManifest {
  return JSON.parse(readFileSync(path, "utf-8")) as CorpusManifest;
}

function writeManifest(path: string, manifest: CorpusManifest): void {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

interface HandlerResult {
  code: number;
  changed: string[];
}

interface ManifestHandler {
  name: string;
  relPath: string;
  update(manifestPath: string, root: string, check: boolean): HandlerResult;
}

/**
 * Handler for benchmarks/parser/corpus/corpus-manifest.json.
 *
 * Mirrors the deterministic scheme in benchmarks/parser/generate-corpus.ts:
 * file entries live under benchmarks/parser/corpus/, and the top-level
 * `corpusChecksum` is SHA-256 of the manifest payload with the checksum
 * field removed (JSON.stringify with indent=2).
 */
const corpusHandler: ManifestHandler = {
  name: "corpus",
  relPath: "benchmarks/parser/corpus/corpus-manifest.json",
  update(manifestPath: string, root: string, check: boolean): HandlerResult {
    const corpusDirRel = "benchmarks/parser/corpus";
    const manifest = loadManifest(manifestPath);
    const corpusDir = resolve(root, corpusDirRel);
    const changed: string[] = [];
    const missing: string[] = [];

    let totalBytes = 0;
    for (const entry of manifest.files ?? []) {
      const name = entry.name;
      const target = resolve(corpusDir, name);
      if (!existsSync(target)) {
        missing.push(name);
        process.stderr.write(`[corpus] error: missing file: ${name}\n`);
        continue;
      }
      const stat = statSync(target);
      const actualSha = sha256File(target);
      const actualBytes = stat.size;

      let fileChanged = false;
      const oldSha = entry.sha256 ?? "";
      const oldBytes = entry.bytes;
      if (oldSha !== actualSha) {
        fileChanged = true;
        if (check) {
          console.log(`[corpus] mismatch: ${name}\n  expected ${oldSha}\n  got      ${actualSha}`);
        } else {
          entry.sha256 = actualSha;
          console.log(`[corpus] updated:  ${name}\n  was ${oldSha}\n  now ${actualSha}`);
        }
      }
      if (oldBytes !== actualBytes) {
        fileChanged = true;
        if (check) {
          console.log(`[corpus] bytes mismatch: ${name}\n  expected ${oldBytes}\n  got      ${actualBytes}`);
        } else {
          entry.bytes = actualBytes;
          console.log(`[corpus] bytes updated: ${name}\n  was ${oldBytes}\n  now ${actualBytes}`);
        }
      }

      if (fileChanged) changed.push(name);
      totalBytes += actualBytes;
    }

    if (missing.length > 0) {
      return { code: 2, changed };
    }

    // Refresh derived counters + corpusChecksum exactly like the generator.
    manifest.fileCount = (manifest.files ?? []).length;
    manifest.totalBytes = totalBytes;
    manifest.version = manifest.version ?? 1;
    manifest.generatedBy = manifest.generatedBy ?? "benchmarks/parser/generate-corpus.ts";

    // Compute checksum over the payload with the checksum field removed,
    // matching computeCorpusChecksum() in benchmarks/parser/harness.ts.
    const { corpusChecksum: _omitted, ...payload } = manifest;
    void _omitted;
    const payloadJson = JSON.stringify(payload, null, 2);
    const computedChecksum = sha256Text(payloadJson);
    const recordedChecksum = manifest.corpusChecksum ?? "";

    const checksumChanged = computedChecksum !== recordedChecksum;
    if (checksumChanged) {
      if (check) {
        console.log(`[corpus] checksum mismatch:\n  expected ${recordedChecksum}\n  got      ${computedChecksum}`);
      } else {
        manifest.corpusChecksum = computedChecksum;
        console.log(`[corpus] checksum updated:\n  was ${recordedChecksum}\n  now ${computedChecksum}`);
      }
      if (changed.length === 0) changed.push("corpusChecksum");
    }

    if (changed.length > 0 && !check) {
      writeManifest(manifestPath, manifest);
      console.log(`[corpus] ${changed.length} field(s) updated in ${relative(root, manifestPath)}`);
      return { code: 0, changed };
    }

    if (changed.length > 0 && check) {
      console.log(`[corpus] ${changed.length} mismatch(es) found (dry-run, no writes)`);
      return { code: 0, changed };
    }

    console.log("[corpus] all hashes current");
    return { code: 1, changed };
  },
};

const HANDLERS: Record<string, ManifestHandler> = {
  corpus: corpusHandler,
};

const HANDLER_NAMES = Object.keys(HANDLERS).sort();

const USAGE = `usage: update-fixture-hashes.ts [-h] [--root ROOT] [--check] [--manifest {${HANDLER_NAMES.join(",")}}]`;

const HELP = `${USAGE}

Update SHA-256 hashes in every fixture/manifest file that pins source hashes.

options:
  -h, --help            show this help message and exit
  --root ROOT           repository root (default: script parent's parent)
  --check               dry-run: report mismatches without updating manifests
  --manifest {${HANDLER_NAMES.join(",")}}
                        update only the named manifest (default: all)`;

interface Args {
  root: string;
  check: boolean;
  manifest: string | null;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nupdate-fixture-hashes.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let root = defaultRoot();
  let check = false;
  let manifest: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--root") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --root: expected one argument");
        return null;
      }
      root = argv[++i]!;
    } else if (a.startsWith("--root=")) {
      root = a.slice("--root=".length);
    } else if (a === "--check") {
      check = true;
    } else if (a === "--manifest") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --manifest: expected one argument");
        return null;
      }
      manifest = argv[++i]!;
    } else if (a.startsWith("--manifest=")) {
      manifest = a.slice("--manifest=".length);
    } else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else {
      printUsageError(`unrecognized arguments: ${a}`);
      return null;
    }
  }

  if (manifest !== null && !(manifest in HANDLERS)) {
    printUsageError(`argument --manifest: invalid choice: '${manifest}' (choose from ${HANDLER_NAMES.map((n) => `'${n}'`).join(", ")})`);
    return null;
  }

  return { root, check, manifest };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;

  const root = resolve(args.root);
  const selected = args.manifest ? [HANDLERS[args.manifest]!] : Object.values(HANDLERS);

  let overallExit = 1; // start as "all current"
  const summary: string[] = [];

  for (const handler of selected) {
    const manifestPath = resolve(root, handler.relPath);
    if (!existsSync(manifestPath)) {
      process.stderr.write(`error: manifest not found: ${manifestPath}\n`);
      return 2;
    }

    const { code, changed } = handler.update(manifestPath, root, args.check);
    summary.push(`${handler.name}: ${changed.length} changed`);
    // Exit code precedence: hard error (2) > updated/mismatch (0) > current (1)
    if (code === 2) overallExit = 2;
    else if (code === 0 && overallExit !== 2) overallExit = 0;
    else if (overallExit === 1) overallExit = 1;
  }

  console.log(`\nSummary: ${summary.join(", ")}`);
  return overallExit;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
