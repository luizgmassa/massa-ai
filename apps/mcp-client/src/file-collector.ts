import fs from "fs/promises";
import path from "path";
import {
  config,
  DEFAULT_ALLOWED_EXTENSIONS,
} from "@massa-ai/shared/config";

export interface CollectedFile {
  relativePath: string;
  content: string;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage",
  "__pycache__", ".next", ".nuxt", "out", ".turbo",
  "generated", ".cache", "vendor", ".svn", ".hg",
  // CocoaPods checkouts: vendored binaries/licenses burn the MAX_FILES budget
  // before the walk reaches the repo's real source dirs (app/ sorts before
  // features/, so a Pods-heavy iOS tree once crowded out every Kotlin module).
  "Pods",
]);

const MAX_FILE_BYTES = 512 * 1024;    // 512 KB per file
// ponytail: caps sized for the driver-app-mobile repo after Pods exclusion —
// 3000 files/50MB silently truncated alphabetically-lucky dirs (promotion in,
// driver_get_driver out) because readdir order is filesystem order, not
// alphabetical. Raise further only if upload/index time becomes a problem.
const MAX_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB total
const MAX_FILES = 15000;

// ponytail: opt-in allow-list of top-level dirs to index. Default empty (walk
// everything under SKIP_DIRS exclusions); set via MASSA_AI_INDEX_INCLUDE=app,
// features/promotion,features/driver_get_driver to keep reindex time and RAM
// bounded for very large repos. Comma-separated, slash-prefixed entries match
// top-level dirs only; without it, any repo bigger than MAX_FILES would lose
// non-alphabetically-first modules to silent truncation.
function getIncludeDirs(): string[] {
  const raw = process.env.MASSA_AI_INDEX_INCLUDE;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

/**
 * Resolve the allow-list from the shared config (single source of truth).
 * Falls back to the canonical default if config is unavailable or empty.
 */
function getAllowedExtensions(): Set<string> {
  try {
    const list = config.get("security").allowedExtensions;
    if (list && list.length > 0) return new Set(list);
  } catch {
    // config unavailable — fall through to canonical default
  }
  return new Set(DEFAULT_ALLOWED_EXTENSIONS);
}

export async function collectFiles(projectPath: string): Promise<CollectedFile[]> {
  const files: CollectedFile[] = [];
  const state = { totalBytes: 0 };
  const allowed = getAllowedExtensions();
  const includeDirs = getIncludeDirs();
  if (includeDirs.length === 0) {
    await walk(projectPath, projectPath, files, state, allowed);
  } else {
    for (const top of includeDirs) {
      if (files.length >= MAX_FILES || state.totalBytes >= MAX_TOTAL_BYTES) break;
      await walk(projectPath, path.join(projectPath, top), files, state, allowed);
    }
  }
  return files;
}

async function walk(
  root: string,
  dir: string,
  files: CollectedFile[],
  state: { totalBytes: number },
  allowed: Set<string>,
): Promise<void> {
  if (files.length >= MAX_FILES || state.totalBytes >= MAX_TOTAL_BYTES) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILES || state.totalBytes >= MAX_TOTAL_BYTES) break;

    if (entry.isDirectory()) {
      // Top-level include-list enforcement lives in collectFiles(): walks only
      // enter an allowed top dir. Below the top, SKIP_DIRS gates descent.
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        await walk(root, path.join(dir, entry.name), files, state, allowed);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowed.has(ext)) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > MAX_FILE_BYTES) continue;
        if (state.totalBytes + stat.size > MAX_TOTAL_BYTES) continue;

        const content = await fs.readFile(fullPath, "utf-8");
        state.totalBytes += stat.size;
        const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
        files.push({ relativePath, content });
      } catch {
        // skip unreadable files
      }
    }
  }
}
