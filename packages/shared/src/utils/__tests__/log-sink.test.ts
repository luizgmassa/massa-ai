/**
 * `log-sink.ts` append + rotation (T10 — LOG-07, LOG-08).
 *
 * Uses real temp dirs (`fs.mkdtempSync`), never a real config dir. Covers:
 * an absent parent directory is created and the line lands (pre-mortem #2);
 * rotation at the cap; `maxFiles` never exceeded, oldest dropped; an
 * unwritable path is swallowed and sets `lastError`; `sinkFiles` ordering.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { appendLine, sinkFiles, getLastError, _resetForTesting } from "../log-sink";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-log-sink-"));
  _resetForTesting();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("appendLine", () => {
  test("an absent parent directory is created and the line lands (pre-mortem #2)", () => {
    const filePath = path.join(tmpDir, "nested", "sub", "massa-ai.log");
    expect(fs.existsSync(path.dirname(filePath))).toBe(false);

    appendLine({ filePath, maxFileSizeBytes: 1024 * 1024, maxFiles: 5 }, "hello sink");

    expect(fs.existsSync(path.dirname(filePath))).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("hello sink\n");
    expect(getLastError()).toBeUndefined();
  });

  test("uses O_APPEND semantics: multiple writes append rather than overwrite", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    appendLine({ filePath, maxFileSizeBytes: 1024 * 1024, maxFiles: 5 }, "line one");
    appendLine({ filePath, maxFileSizeBytes: 1024 * 1024, maxFiles: 5 }, "line two");
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toBe("line one\nline two\n");
  });

  test("never throws even against an unwritable path, and sets lastError", () => {
    // A path whose "directory" is actually a file — mkdirSync must fail.
    const blocker = path.join(tmpDir, "blocker");
    fs.writeFileSync(blocker, "not a directory");
    const filePath = path.join(blocker, "massa-ai.log");

    expect(() =>
      appendLine({ filePath, maxFileSizeBytes: 1024 * 1024, maxFiles: 5 }, "should not throw"),
    ).not.toThrow();
    expect(getLastError()).toBeDefined();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test("rotation at the cap: exceeding maxFileSizeBytes rotates the live file to .1", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    const opts = { filePath, maxFileSizeBytes: 20, maxFiles: 5 };
    appendLine(opts, "0123456789"); // 11 bytes with newline -> under cap
    appendLine(opts, "0123456789"); // now over 20 bytes tracked
    // A further write should observe the tracked size crossing the cap and
    // rotate before appending.
    appendLine(opts, "next-file-line");

    expect(fs.existsSync(`${filePath}.1`)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    const rotatedContent = fs.readFileSync(`${filePath}.1`, "utf8");
    expect(rotatedContent).toContain("0123456789");
    const liveContent = fs.readFileSync(filePath, "utf8");
    expect(liveContent).toBe("next-file-line\n");
  });

  test("maxFiles is never exceeded — the oldest rotated file is dropped", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    const opts = { filePath, maxFileSizeBytes: 5, maxFiles: 2 };

    // Each append exceeds the tiny cap, forcing a rotation every time.
    for (let i = 0; i < 6; i++) {
      appendLine(opts, `entry-${i}-padding-to-exceed-cap`);
    }

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.1`)).toBe(true);
    expect(fs.existsSync(`${filePath}.2`)).toBe(true);
    expect(fs.existsSync(`${filePath}.3`)).toBe(false);
  });

  test("rotation shifts files newest-last: .1 becomes .2 on the next rotation", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    const opts = { filePath, maxFileSizeBytes: 5, maxFiles: 3 };

    appendLine(opts, "first-entry-padding");
    appendLine(opts, "second-entry-padding"); // rotates: first -> .1
    expect(fs.readFileSync(`${filePath}.1`, "utf8")).toContain("first-entry-padding");

    appendLine(opts, "third-entry-padding"); // rotates: second -> .1, first(.1) -> .2
    expect(fs.readFileSync(`${filePath}.1`, "utf8")).toContain("second-entry-padding");
    expect(fs.readFileSync(`${filePath}.2`, "utf8")).toContain("first-entry-padding");
  });
});

describe("sinkFiles", () => {
  test("returns newest-first existing files: [file, file.1, ..., file.<maxFiles>]", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    fs.writeFileSync(filePath, "live");
    fs.writeFileSync(`${filePath}.1`, "rotated-1");
    fs.writeFileSync(`${filePath}.2`, "rotated-2");

    expect(sinkFiles(filePath, 5)).toEqual([filePath, `${filePath}.1`, `${filePath}.2`]);
  });

  test("stops enumerating past maxFiles even if a stray extra file exists", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    fs.writeFileSync(filePath, "live");
    fs.writeFileSync(`${filePath}.1`, "rotated-1");
    fs.writeFileSync(`${filePath}.2`, "rotated-2");
    fs.writeFileSync(`${filePath}.3`, "stray");

    expect(sinkFiles(filePath, 2)).toEqual([filePath, `${filePath}.1`, `${filePath}.2`]);
  });

  test("absent live file but rotated files present: live entry omitted", () => {
    const filePath = path.join(tmpDir, "massa-ai.log");
    fs.writeFileSync(`${filePath}.1`, "rotated-1");

    expect(sinkFiles(filePath, 5)).toEqual([`${filePath}.1`]);
  });

  test("nothing exists: empty array", () => {
    const filePath = path.join(tmpDir, "nonexistent.log");
    expect(sinkFiles(filePath, 5)).toEqual([]);
  });
});
