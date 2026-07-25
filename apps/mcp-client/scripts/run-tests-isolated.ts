import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dir, "..");
const testsRoot = path.join(packageRoot, "src");

type IsolationReason = "module mock" | "core singleton / DB" | "process-global state";

function isolationReason(file: string, source: string): IsolationReason | undefined {
  if (/^\s*mock\s*\.\s*module\s*\(/m.test(source)) return "module mock";

  const relativePath = path.relative(testsRoot, file);
  if (
    relativePath.startsWith(`__tests__${path.sep}`) &&
    /\b(?:embedded|EmbeddedApiClient|buildPrefetchPlan|core)\b/.test(source)
  ) {
    return "core singleton / DB";
  }

  if (
    /(?:delete\s+process\.env\b|process\.env(?:\.[A-Z0-9_]+|\[[^\]]+\])\s*=)/.test(source)
  ) {
    return "process-global state";
  }

  return undefined;
}

async function findTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [entryPath] : [];
    }),
  );
  return files.flat();
}

const discoveredFiles = (await findTestFiles(testsRoot)).sort((a, b) => a.localeCompare(b));

const classifiedFiles = await Promise.all(
  discoveredFiles.map(async (file) => {
    const source = await readFile(file, "utf8");
    return { file, isolationReason: isolationReason(file, source) };
  }),
);

const sharedProcessFiles = classifiedFiles
  .filter(({ isolationReason }) => isolationReason === undefined)
  .map(({ file }) => file);
const isolatedFiles = classifiedFiles.filter(
  (entry): entry is typeof entry & { isolationReason: IsolationReason } =>
    entry.isolationReason !== undefined,
);

const groups = [
  ...(sharedProcessFiles.length > 0
    ? [{ label: `shared (${sharedProcessFiles.length} files)`, files: sharedProcessFiles }]
    : []),
  ...isolatedFiles.map(({ file, isolationReason }) => ({
    label: `isolated (${isolationReason}): ${path.relative(packageRoot, file)}`,
    files: [file],
  })),
];

console.log(
  `[test-isolation] ${discoveredFiles.length} files: ${sharedProcessFiles.length} shared, ${isolatedFiles.length} isolated`,
);

let activeChild: ChildProcess | undefined;
let forwardedSignal: NodeJS.Signals | undefined;
const handledSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
const signalHandlers = new Map<NodeJS.Signals, () => void>();

for (const signal of handledSignals) {
  const handler = () => {
    forwardedSignal ??= signal;
    activeChild?.kill(signal);
  };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

function removeSignalHandlers(): void {
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
}

function runGroup(files: string[]): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    activeChild = spawn(process.execPath, ["test", ...files], {
      cwd: packageRoot,
      env: process.env,
      stdio: "inherit",
    });
    activeChild.once("error", reject);
    activeChild.once("close", (code, signal) => {
      activeChild = undefined;
      resolve({ code, signal });
    });
  });
}

const failures: string[] = [];

for (const group of groups) {
  console.log(`\n[test-isolation] RUN ${group.label}`);
  try {
    const result = await runGroup(group.files);
    if (forwardedSignal) break;
    if (result.signal) {
      console.error(`[test-isolation] SIGNAL ${result.signal}: ${group.label}`);
      removeSignalHandlers();
      process.kill(process.pid, result.signal);
      break;
    }
    if (result.code !== 0) {
      console.error(`[test-isolation] FAIL (${result.code}): ${group.label}`);
      failures.push(group.label);
    } else {
      console.log(`[test-isolation] PASS: ${group.label}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test-isolation] ERROR: ${group.label}: ${message}`);
    failures.push(group.label);
  }
}

removeSignalHandlers();

if (forwardedSignal) {
  process.kill(process.pid, forwardedSignal);
} else if (failures.length > 0) {
  console.error(`\n[test-isolation] ${failures.length} failed group(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\n[test-isolation] PASS: all ${groups.length} group(s)`);
}