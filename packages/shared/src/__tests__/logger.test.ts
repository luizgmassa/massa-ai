/**
 * Logger unit tests.
 * Mocks ../config/index so the Logger's lazy init reads a controlled config.
 * Covers: levels, filtering, formatting, write streams, error meta, metric,
 * child logger, fallback when config throws.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── Config mock (resilient: handles all keys any utils module may call,
//    so cross-file mock contamination cannot throw) ──
let configState: { level: string; enableMetrics: boolean; file?: string } = {
  level: "info",
  enableMetrics: false,
};
let configGetShouldThrow = false;
let securityState = { sanitizeInputs: true, maxInputLength: 100000 };
let rateLimitState = { requestsPerMinute: 60, tokensPerMinute: 100000 };

mock.module("../config/index.js", () => ({
  config: {
    get: (key: string) => {
      if (configGetShouldThrow) throw new Error("config not ready");
      if (key === "logging") return configState;
      if (key === "security") return securityState;
      if (key === "rateLimit") return rateLimitState;
      return undefined;
    },
  },
}));

import { Logger, logger } from "../utils/logger";

describe("Logger", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errSpy: ReturnType<typeof spyOn>;
  let loggerInstance: Logger;

  beforeEach(() => {
    loggerInstance = new Logger();
    configState = { level: "info", enableMetrics: false };
    configGetShouldThrow = false;
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  describe("level parsing & filtering", () => {
    test("DEBUG level logs debug/info/warn/error", () => {
      configState = { level: "debug", enableMetrics: false };
      loggerInstance.debug("d");
      loggerInstance.info("i");
      loggerInstance.warn("w");
      loggerInstance.error("e");
      expect(logSpy).toHaveBeenCalledTimes(0); // all go to stderr
      expect(errSpy).toHaveBeenCalledTimes(4); // all 4 to stderr
    });

    test("INFO level suppresses debug, logs info/warn/error", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.debug("d");
      loggerInstance.info("i");
      loggerInstance.warn("w");
      loggerInstance.error("e");
      expect(logSpy).toHaveBeenCalledTimes(0);
      expect(errSpy).toHaveBeenCalledTimes(3); // info, warn, error
    });

    test("WARN level suppresses debug/info, logs warn/error", () => {
      configState = { level: "warn", enableMetrics: false };
      loggerInstance.debug("d");
      loggerInstance.info("i");
      loggerInstance.warn("w");
      loggerInstance.error("e");
      expect(logSpy).toHaveBeenCalledTimes(0);
      expect(errSpy).toHaveBeenCalledTimes(2);
    });

    test("ERROR level suppresses debug/info/warn, logs error", () => {
      configState = { level: "error", enableMetrics: false };
      loggerInstance.debug("d");
      loggerInstance.info("i");
      loggerInstance.warn("w");
      loggerInstance.error("e");
      expect(logSpy).toHaveBeenCalledTimes(0);
      expect(errSpy).toHaveBeenCalledTimes(1);
    });

    test("unknown level string falls back to INFO", () => {
      configState = { level: "nonexistent", enableMetrics: false };
      loggerInstance.debug("d");
      loggerInstance.info("i");
      expect(logSpy).toHaveBeenCalledTimes(0); // all to stderr
      expect(errSpy).toHaveBeenCalledTimes(1); // info only
    });

    test("level string is case-insensitive", () => {
      configState = { level: "DEBUG", enableMetrics: false };
      loggerInstance.debug("d");
      expect(logSpy).toHaveBeenCalledTimes(0);
      expect(errSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("formatting", () => {
    test("info message includes timestamp, level, message", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.info("hello");
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] \[INFO\] hello$/);
    });

    test("meta is JSON-appended when provided", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.info("msg", { a: 1 });
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toContain('msg {"a":1}');
    });

    test("no metaStr when meta omitted", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.info("plain");
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).not.toContain("{");
    });
  });

  describe("write stream routing", () => {
    test("debug -> console.error (stderr)", () => {
      configState = { level: "debug", enableMetrics: false };
      loggerInstance.debug("d");
      expect(logSpy).toHaveBeenCalledTimes(0);
      expect(errSpy).toHaveBeenCalledTimes(1);
    });

    test("info -> console.error (stderr)", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.info("i");
      expect(logSpy).toHaveBeenCalledTimes(0);
      expect(errSpy).toHaveBeenCalledTimes(1);
    });

    test("warn -> console.error (stderr)", () => {
      configState = { level: "warn", enableMetrics: false };
      loggerInstance.warn("w");
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(0);
    });

    test("error -> console.error (stderr)", () => {
      configState = { level: "error", enableMetrics: false };
      loggerInstance.error("e");
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("error() with Error object", () => {
    test("includes error name/message/stack in meta", () => {
      configState = { level: "error", enableMetrics: false };
      const err = new Error("boom");
      err.stack = "Error: boom\n  at x";
      loggerInstance.error("op failed", err);
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toContain('"error"');
      expect(out).toContain('"name":"Error"');
      expect(out).toContain('"message":"boom"');
      expect(out).toContain('"stack"');
    });

    test("merges provided meta with error block", () => {
      configState = { level: "error", enableMetrics: false };
      const err = new Error("x");
      err.stack = "s";
      loggerInstance.error("op", err, { code: 42 });
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toContain('"code":42');
      expect(out).toContain('"error"');
    });

    test("error without Error object uses meta only", () => {
      configState = { level: "error", enableMetrics: false };
      loggerInstance.error("op", undefined, { code: 7 });
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toContain('"code":7');
      expect(out).not.toContain('"error"');
    });
  });

  describe("metric()", () => {
    test("no-op when enableMetrics=false", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.metric("m", 1, "ms");
      expect(errSpy).toHaveBeenCalledTimes(0);
    });

    test("emits info-level METRIC line when enableMetrics=true", () => {
      configState = { level: "info", enableMetrics: true };
      loggerInstance.metric("my_metric", 42, "%");
      expect(errSpy).toHaveBeenCalledTimes(1);
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toContain("METRIC: my_metric");
      expect(out).toContain('"value":42');
      expect(out).toContain('"unit":"%"');
    });
  });

  describe("config fallback", () => {
    test("falls back to INFO / metrics off when config.get throws", () => {
      configGetShouldThrow = true;
      loggerInstance.info("should log at info fallback");
      loggerInstance.debug("should be suppressed");
      loggerInstance.metric("m", 1, "x"); // should be no-op (metrics off fallback)
      expect(errSpy).toHaveBeenCalledTimes(1); // info only
    });
  });

  describe("child()", () => {
    test("wraps methods to merge context into meta", () => {
      configState = { level: "debug", enableMetrics: false };
      const child = loggerInstance.child({ reqId: "abc" });
      child.debug("d", { extra: 1 });
      child.info("i", { extra: 2 });
      child.warn("w", { extra: 3 });
      child.error("e", undefined, { extra: 4 });

      const debugOut = errSpy.mock.calls[0][0] as string;
      expect(debugOut).toContain('"reqId":"abc"');
      expect(debugOut).toContain('"extra":1');

      const infoOut = errSpy.mock.calls[1][0] as string;
      expect(infoOut).toContain('"reqId":"abc"');

      const warnOut = errSpy.mock.calls[2][0] as string;
      expect(warnOut).toContain('"reqId":"abc"');

      const errOut = errSpy.mock.calls[3][0] as string;
      expect(errOut).toContain('"reqId":"abc"');
      expect(errOut).toContain('"extra":4');
    });

    test("child error with Error object still merges context", () => {
      configState = { level: "error", enableMetrics: false };
      const child = loggerInstance.child({ ctx: 1 });
      const e = new Error("z");
      e.stack = "s";
      child.error("op", e, { extra: 2 });
      const out = errSpy.mock.calls[0][0] as string;
      expect(out).toContain('"ctx":1');
      expect(out).toContain('"error"');
      expect(out).toContain('"extra":2');
    });
  });

  describe("global logger instance", () => {
    test("exported logger exposes the ILogger methods", () => {
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });
  });

  describe("file sink (opt-in, additive)", () => {
    let tmpDir: string;
    let logFile: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-logger-test-"));
      logFile = path.join(tmpDir, "massa-ai.log");
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("sink off (file undefined): stderr-only regression, no file created", () => {
      configState = { level: "info", enableMetrics: false };
      loggerInstance.info("no sink configured");
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(logFile)).toBe(false);
    });

    test("sink on: file receives the line AND stderr is unchanged", () => {
      configState = { level: "info", enableMetrics: false, file: logFile };
      loggerInstance.info("hello sink");
      expect(errSpy).toHaveBeenCalledTimes(1);
      const errOut = errSpy.mock.calls[0][0] as string;
      expect(errOut).toContain("hello sink");

      const fileContent = fs.readFileSync(logFile, "utf-8");
      expect(fileContent).toContain("hello sink");
      // File content is the identical formatted line stderr received.
      expect(fileContent.trimEnd()).toBe(errOut);
    });

    test("sink on: multiple writes append rather than overwrite", () => {
      configState = { level: "info", enableMetrics: false, file: logFile };
      loggerInstance.info("first line");
      loggerInstance.warn("second line");
      const fileContent = fs.readFileSync(logFile, "utf-8");
      const lines = fileContent.trimEnd().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("first line");
      expect(lines[1]).toContain("second line");
    });

    test("sink on but path unwritable: does not throw and stderr still emits", () => {
      configState = {
        level: "info",
        enableMetrics: false,
        file: path.join(tmpDir, "no-such-dir", "nested", "massa-ai.log"),
      };
      expect(() => loggerInstance.info("resilient")).not.toThrow();
      expect(errSpy).toHaveBeenCalledTimes(1);
    });
  });
});