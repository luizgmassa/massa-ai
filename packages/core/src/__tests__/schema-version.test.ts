import { describe, expect, test } from "bun:test";
import {
  SchemaAheadError,
  assertSchemaSupported,
} from "../services/structural/schema-version.js";

describe("assertSchemaSupported", () => {
  describe("throws only on strictly-newer stored version", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["2.0.0", "1.0.0"],
      ["1.1.0", "1.0.0"],
      ["1.0.1", "1.0.0"],
      ["2.0.0", "1.1.9"],
      ["10.0.0", "9.99.99"],
    ];
    for (const [stored, supported] of cases) {
      test(`${stored} vs ${supported} throws SchemaAheadError`, () => {
        try {
          assertSchemaSupported("fqn", stored, supported);
          throw new Error("expected throw");
        } catch (e) {
          expect(e).toBeInstanceOf(SchemaAheadError);
          const err = e as SchemaAheadError;
          expect(err.code).toBe("schema_ahead");
          expect(err.name).toBe("SchemaAheadError");
          expect(err.context.kind).toBe("fqn");
          expect(err.context.stored).toBe(stored);
          expect(err.context.supported).toBe(supported);
          expect(err.message).toContain(stored);
          expect(err.message).toContain(supported);
        }
      });
    }
  });

  describe("does NOT throw for equal / older / malformed / missing", () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ["equal", "1.0.0", "1.0.0"],
      ["older major", "0.9.0", "1.0.0"],
      ["older minor", "1.0.0", "1.1.0"],
      ["older patch", "1.0.0", "1.0.1"],
      ["malformed stored", "abc", "1.0.0"],
      ["missing stored", "", "1.0.0"],
      ["malformed supported", "1.0.0", "abc"],
      ["both malformed", "abc", "xyz"],
      ["stored partial semver", "1.0", "1.0.0"],
      ["stored with prerelease", "1.0.0-rc1", "1.0.0"],
    ];
    for (const [label, stored, supported] of cases) {
      test(`${label}: ${stored} vs ${supported} passes`, () => {
        expect(() => assertSchemaSupported("fqn", stored, supported)).not.toThrow();
      });
    }
  });

  test("kind label is carried through to the error context", () => {
    try {
      assertSchemaSupported("checkpoint", "2.0.0", "1.0.0");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as SchemaAheadError).context.kind).toBe("checkpoint");
    }
  });
});
