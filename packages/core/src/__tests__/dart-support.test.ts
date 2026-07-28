import { describe, expect, test } from "bun:test";
import { CodeCompressor, type CompressLlmComplete } from "../services/compression/code-compressor.js";
import { smartChunk } from "../services/search/smart-chunker.js";

/**
 * These tests are about language *detection*, which `CodeCompressor` derives
 * from the original content by regex — it is unaffected by the LLM branch.
 *
 * A bare `new CodeCompressor()` uses the real `llmComplete`, gated on
 * `config.get("llm").enabled`, which is read from `~/.config/massa-ai/config.json`.
 * On a developer machine with a local Ollama configured that is `true`, so both
 * tests below made a real network call: measured at 42030 ms cold (model load)
 * and 690 ms warm, against `bunfig.toml`'s 5 s per-test budget. They passed on a
 * warm model and failed cold, which is why this looked like flakiness. CI has no
 * config file, so `enabled` defaults false and CI never saw it.
 *
 * Injecting the seam the constructor already exposes (same idiom as
 * `code-compressor.test.ts:152`) makes the outcome independent of the machine.
 * A raised timeout would not: 42 s exceeds any sane per-test budget, and a unit
 * test asserting a regex result has no business reaching the network at all.
 */
const noLlm: CompressLlmComplete = async () => ({ ok: false, error: "disabled in test" });

describe("Dart support", () => {
  test("smart chunker treats .dart files as code", () => {
    const dartCode = `import 'package:flutter/widgets.dart';

class Counter {
  int value = 0;

  void increment() {
    value++;
  }
}
`;

    const chunks = smartChunk(dartCode, "lib/counter.dart");

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.type === "code_block")).toBe(true);
  });

  test("code compressor detects dart language", async () => {
    const compressor = new CodeCompressor(noLlm);
    const dartCode = `import 'dart:convert';

class User {
  final String name;
  User(this.name);
}
`;

    const compressed = await compressor.compress(dartCode);

    expect(compressed.metadata.language).toBe("dart");
  });

  test("JS side-effect import with class is not detected as Dart", async () => {
    const compressor = new CodeCompressor(noLlm);
    const jsCode = `import "polyfill";

class Counter {
  count = 0;
  increment() { this.count++; }
}

enum Direction { Up, Down }
`;

    const compressed = await compressor.compress(jsCode);

    expect(compressed.metadata.language).not.toBe("dart");
  });
});
