import { describe, expect, test } from "bun:test";
import {
  assertCanonicalSignatureSupported,
  canonicalizeStructuralSignature,
  decodeCanonicalSignatureVersion,
} from "../services/structural/fqn-codec.js";
import { STRUCTURAL_FQN_SCHEMA_VERSION } from "../services/structural/types.js";
import { SchemaAheadError } from "../services/structural/schema-version.js";

const SAMPLE_INPUT = {
  language: "typescript",
  dialect: "default",
  qualifiedName: "mod.foo",
  kind: "function" as const,
  arity: 1,
  typeTokens: ["string"],
  modifiers: ["exported"],
};

describe("decodeCanonicalSignatureVersion", () => {
  test("extracts the embedded version from a real canonical signature", () => {
    const sig = canonicalizeStructuralSignature(SAMPLE_INPUT);
    expect(decodeCanonicalSignatureVersion(sig)).toBe(STRUCTURAL_FQN_SCHEMA_VERSION);
  });

  test("returns empty string for legacy / non-JSON payloads", () => {
    expect(decodeCanonicalSignatureVersion("")).toBe("");
    expect(decodeCanonicalSignatureVersion("persisted:sym_123")).toBe("");
    expect(decodeCanonicalSignatureVersion("not json at all")).toBe("");
  });

  test("returns empty string for JSON without a string version field", () => {
    expect(decodeCanonicalSignatureVersion(JSON.stringify({ a: 1 }))).toBe("");
    expect(decodeCanonicalSignatureVersion(JSON.stringify({ version: 2 }))).toBe("");
  });
});

describe("assertCanonicalSignatureSupported", () => {
  test("current-version signature passes", () => {
    const sig = canonicalizeStructuralSignature(SAMPLE_INPUT);
    expect(() => assertCanonicalSignatureSupported(sig)).not.toThrow();
  });

  test("future-version signature throws SchemaAheadError", () => {
    // Re-encode with a bumped version to simulate a row written by newer code.
    const futureSig = canonicalizeStructuralSignature(SAMPLE_INPUT).replace(
      `"version":"${STRUCTURAL_FQN_SCHEMA_VERSION}"`,
      `"version":"2.0.0"`,
    );
    expect(futureSig).not.toBe(canonicalizeStructuralSignature(SAMPLE_INPUT));
    try {
      assertCanonicalSignatureSupported(futureSig);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaAheadError);
      const err = e as SchemaAheadError;
      expect(err.context.kind).toBe("fqn");
      expect(err.context.stored).toBe("2.0.0");
      expect(err.context.supported).toBe(STRUCTURAL_FQN_SCHEMA_VERSION);
    }
  });

  test("legacy no-version signature passes (forward-compat)", () => {
    expect(() => assertCanonicalSignatureSupported("")).not.toThrow();
    expect(() => assertCanonicalSignatureSupported("persisted:sym_1")).not.toThrow();
    expect(() =>
      assertCanonicalSignatureSupported(JSON.stringify({ no: "version" })),
    ).not.toThrow();
  });

  test("malformed version value passes (treated as legacy/unknown)", () => {
    const malformed = canonicalizeStructuralSignature(SAMPLE_INPUT).replace(
      `"version":"${STRUCTURAL_FQN_SCHEMA_VERSION}"`,
      `"version":"abc"`,
    );
    expect(() => assertCanonicalSignatureSupported(malformed)).not.toThrow();
  });
});
