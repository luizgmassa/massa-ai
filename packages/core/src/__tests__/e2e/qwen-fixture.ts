import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface QwenFixtureFile {
  path: string;
  sha256: string;
}

export interface QwenFixtureManifest {
  version: number;
  provider: "ollama";
  model: "qwen3-embedding:8b";
  dimensions: 4096;
  needleTargets: QwenFixtureFile[];
  distractors: QwenFixtureFile[];
  supportFiles: QwenFixtureFile[];
}

export interface BuiltQwenFixture {
  sourceRoot: string;
  destination: string;
  head: string;
  files: string[];
}

export const QWEN_FIXTURE_MANIFEST_PATH = path.resolve(
  import.meta.dir,
  "./fixtures/qwen-profile.json",
);

function allFiles(manifest: QwenFixtureManifest): QwenFixtureFile[] {
  return [
    ...manifest.needleTargets,
    ...manifest.distractors,
    ...manifest.supportFiles,
  ];
}

function isForbiddenFixturePath(relativePath: string): boolean {
  if (path.isAbsolute(relativePath)) return true;
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const basename = segments.at(-1)?.toLowerCase() ?? "";
  if (!normalized || normalized !== path.posix.normalize(normalized)) return true;
  if (segments.includes("..") || segments.includes("adsads")) return true;
  if (basename.startsWith(".env") || basename.includes("secret")) return true;
  if (basename.endsWith(".pem") || basename.endsWith(".key")) return true;
  return segments.some((segment) => [
    "node_modules",
    "dist",
    "build",
    "generated",
    ".next",
    ".nuxt",
    "target",
    ".ssh",
  ].includes(segment));
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function materializedFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (directory === root && entry.name === ".git") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await materializedFiles(root, entryPath));
    else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(path.relative(root, entryPath).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

export async function loadQwenFixtureManifest(
  manifestPath: string = QWEN_FIXTURE_MANIFEST_PATH,
): Promise<QwenFixtureManifest> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as QwenFixtureManifest;
}

export async function validateQwenFixtureManifest(
  repositoryRoot: string,
  manifest: QwenFixtureManifest,
): Promise<string[]> {
  if (
    manifest.version !== 1 ||
    manifest.provider !== "ollama" ||
    manifest.model !== "qwen3-embedding:8b" ||
    manifest.dimensions !== 4096
  ) {
    throw new Error("qwen fixture profile must be version 1 / ollama / qwen3-embedding:8b / 4096");
  }
  if (manifest.needleTargets.length !== 5) {
    throw new Error("qwen fixture must contain exactly five unique needle target files");
  }
  if (manifest.distractors.length !== 20) {
    throw new Error("qwen fixture must contain exactly twenty tracked source distractors");
  }

  const files = allFiles(manifest);
  const paths = files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("qwen fixture paths must be unique across all manifest groups");
  }
  for (const entry of files) {
    if (isForbiddenFixturePath(entry.path)) {
      throw new Error(`qwen fixture rejects forbidden path: ${entry.path}`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`qwen fixture has invalid SHA-256 for ${entry.path}`);
    }
  }

  await git(repositoryRoot, ["ls-files", "--error-unmatch", "--", ...paths]);
  for (const entry of files) {
    const actual = await sha256(path.join(repositoryRoot, entry.path));
    if (actual !== entry.sha256) {
      throw new Error(
        `qwen fixture hash mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}`,
      );
    }
  }
  return paths;
}

async function validateCheckout(
  destination: string,
  head: string,
  manifest: QwenFixtureManifest,
  omitted: Set<string>,
): Promise<string[]> {
  const cloneHead = await git(destination, ["rev-parse", "HEAD"]);
  if (cloneHead !== head) {
    throw new Error(`qwen fixture clone HEAD ${cloneHead} does not equal tested commit ${head}`);
  }

  const expected = allFiles(manifest)
    .filter((entry) => !omitted.has(entry.path));
  for (const entry of expected) {
    const filePath = path.join(destination, entry.path);
    if (!await pathExists(filePath)) throw new Error(`qwen fixture clone is missing ${entry.path}`);
    const actual = await sha256(filePath);
    if (actual !== entry.sha256) {
      throw new Error(`qwen fixture clone hash mismatch for ${entry.path}`);
    }
  }
  for (const omittedPath of omitted) {
    if (await pathExists(path.join(destination, omittedPath))) {
      throw new Error(`qwen negative fixture unexpectedly materialized ${omittedPath}`);
    }
  }

  const actualFiles = await materializedFiles(destination);
  const expectedPaths = expected.map((entry) => entry.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `qwen fixture materialized unexpected paths: ${actualFiles.filter((file) => !expectedPaths.includes(file)).join(", ")}`,
    );
  }
  return expectedPaths;
}

export async function buildQwenFixture(options: {
  sourceRoot: string;
  destination: string;
  manifest?: QwenFixtureManifest;
  omitPaths?: string[];
}): Promise<BuiltQwenFixture> {
  const sourceRoot = await realpath(options.sourceRoot);
  const destination = path.resolve(options.destination);
  if (destination === sourceRoot || destination.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("qwen fixture destination must not mutate the source working tree");
  }
  const manifest = options.manifest ?? await loadQwenFixtureManifest();
  const paths = await validateQwenFixtureManifest(sourceRoot, manifest);
  const omitted = new Set(options.omitPaths ?? []);
  for (const omittedPath of omitted) {
    if (!manifest.needleTargets.some((entry) => entry.path === omittedPath)) {
      throw new Error(`qwen fixture may omit only a declared needle target: ${omittedPath}`);
    }
  }
  const selected = paths.filter((file) => !omitted.has(file));
  const head = await git(sourceRoot, ["rev-parse", "HEAD"]);

  if (await pathExists(destination)) {
    const stat = await lstat(destination);
    if (!stat.isDirectory() || !await pathExists(path.join(destination, ".git"))) {
      throw new Error(`qwen fixture destination already exists and is not an owned clone: ${destination}`);
    }
    const files = await validateCheckout(destination, head, manifest, omitted);
    return { sourceRoot, destination, head, files };
  }

  await git(path.dirname(destination), [
    "clone",
    "--no-checkout",
    "--no-hardlinks",
    "--",
    sourceRoot,
    destination,
  ]);
  await git(destination, ["sparse-checkout", "init", "--no-cone"]);
  await git(destination, [
    "sparse-checkout",
    "set",
    "--no-cone",
    "--skip-checks",
    "--",
    ...selected.map((file) => `/${file}`),
  ]);
  await git(destination, ["checkout", "--detach", head]);

  const files = await validateCheckout(destination, head, manifest, omitted);
  return { sourceRoot, destination, head, files };
}
