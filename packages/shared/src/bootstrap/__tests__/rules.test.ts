/**
 * Bootstrap rule registry unit tests (T4 / TASK-004, BST-08, BST-09).
 *
 * Every assertion here is deliberately set/id-shaped rather than
 * count-shaped: a count assertion (`expect(ids).toHaveLength(9)`) passes
 * unchanged if one id is swapped for another, which is exactly the class of
 * regression this registry exists to prevent (see the task's "Done when":
 * "asserted as a set, so adding or removing one reddens").
 */

import { describe, test, expect } from "bun:test";
import {
  BOOTSTRAP_RULE_IDS,
  BOOTSTRAP_RULES,
  type BootstrapRuleId,
  isBootstrapRuleId,
  getBootstrapRuleDefinition,
  bootstrapRuleDefaults,
  UnknownRuleError,
  BootstrapRuleError,
  BootstrapRuleValidationError,
  assertKnownRuleId,
  validateRuleIds,
} from "../rules";

const EXPECTED_IDS: readonly string[] = [
  "caveman",
  "massa-ai-router",
  "persona-router",
  "dedupe-guardrails",
  "plan-challenge",
  "conversation-feedback",
  "indexing-hygiene",
  "english-code",
  "code-comments",
];

describe("BOOTSTRAP_RULE_IDS — id set", () => {
  test("is exactly the nine spec ids, as a set", () => {
    expect(new Set(BOOTSTRAP_RULE_IDS)).toEqual(new Set(EXPECTED_IDS));
  });

  test("has no duplicate ids", () => {
    expect(new Set(BOOTSTRAP_RULE_IDS).size).toBe(BOOTSTRAP_RULE_IDS.length);
  });

  test("BOOTSTRAP_RULES carries exactly the same id set as BOOTSTRAP_RULE_IDS", () => {
    const ruleIds = new Set(BOOTSTRAP_RULES.map((r) => r.id));
    expect(ruleIds).toEqual(new Set(BOOTSTRAP_RULE_IDS));
  });

  test("renders in the fixed source order (BST-10 AC-7 depends on this)", () => {
    expect(BOOTSTRAP_RULE_IDS).toEqual(EXPECTED_IDS as readonly BootstrapRuleId[]);
    expect(BOOTSTRAP_RULES.map((r) => r.id)).toEqual(EXPECTED_IDS as readonly BootstrapRuleId[]);
  });
});

describe("isBootstrapRuleId", () => {
  for (const id of EXPECTED_IDS) {
    test(`accepts "${id}"`, () => {
      expect(isBootstrapRuleId(id)).toBe(true);
    });
  }

  test("rejects an unknown id", () => {
    expect(isBootstrapRuleId("not-a-real-rule")).toBe(false);
  });

  test("rejects non-string values", () => {
    expect(isBootstrapRuleId(undefined)).toBe(false);
    expect(isBootstrapRuleId(null)).toBe(false);
    expect(isBootstrapRuleId(42)).toBe(false);
    expect(isBootstrapRuleId({})).toBe(false);
  });
});

describe("defaults — every rule enabled except code-comments (BST-08 AC-2)", () => {
  const defaults = bootstrapRuleDefaults();

  // Asserted per id, not by count: this table would still be 9 entries long
  // if `code-comments` accidentally defaulted true and some other rule
  // defaulted false instead.
  const expectedDefaults: Record<string, boolean> = {
    caveman: true,
    "massa-ai-router": true,
    "persona-router": true,
    "dedupe-guardrails": true,
    "plan-challenge": true,
    "conversation-feedback": true,
    "indexing-hygiene": true,
    "english-code": true,
    "code-comments": false,
  };

  for (const [id, expected] of Object.entries(expectedDefaults)) {
    test(`"${id}" defaults to ${expected}`, () => {
      expect(defaults[id as BootstrapRuleId]).toBe(expected);
      expect(getBootstrapRuleDefinition(id as BootstrapRuleId).defaultEnabled).toBe(expected);
    });
  }

  test("bootstrapRuleDefaults covers every registry id and no others", () => {
    expect(new Set(Object.keys(defaults))).toEqual(new Set(BOOTSTRAP_RULE_IDS));
  });

  test("code-comments is the only rule defaulting to disabled", () => {
    const disabled = BOOTSTRAP_RULES.filter((r) => !r.defaultEnabled).map((r) => r.id);
    expect(disabled).toEqual(["code-comments"]);
  });
});

describe("getBootstrapRuleDefinition", () => {
  test("returns the matching definition for every id", () => {
    for (const id of BOOTSTRAP_RULE_IDS) {
      const def = getBootstrapRuleDefinition(id);
      expect(def.id).toBe(id);
      expect(typeof def.description).toBe("string");
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});

describe("UnknownRuleError / assertKnownRuleId (BST-09 AC-8)", () => {
  test("UnknownRuleError names the bad id and lists all nine valid ids", () => {
    const err = UnknownRuleError("bogus-rule");
    expect(err.name).toBe("UnknownRuleError");
    expect(err.message).toContain("bogus-rule");
    for (const id of EXPECTED_IDS) {
      expect(err.message).toContain(id);
    }
  });

  test("UnknownRuleError is a BootstrapRuleError", () => {
    expect(UnknownRuleError("bogus-rule")).toBeInstanceOf(BootstrapRuleError);
  });

  test("assertKnownRuleId throws UnknownRuleError for an unknown id", () => {
    expect(() => assertKnownRuleId("bogus-rule")).toThrow(BootstrapRuleError);
    let caught: unknown;
    try {
      assertKnownRuleId("bogus-rule");
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).name).toBe("UnknownRuleError");
  });

  test("assertKnownRuleId does not throw for any of the nine real ids", () => {
    for (const id of BOOTSTRAP_RULE_IDS) {
      expect(() => assertKnownRuleId(id)).not.toThrow();
    }
  });
});

describe("both enable and disable accept every id — no protected id (BST-09 AC-3)", () => {
  // There is no separate "enable" vs "disable" gate in this registry module;
  // both operations are expected to route through the same
  // assertKnownRuleId/isBootstrapRuleId checks, so proving those checks are
  // symmetric across all nine ids is what BST-09 AC-3 requires at this layer.
  for (const id of BOOTSTRAP_RULE_IDS) {
    test(`"${id}" is accepted identically regardless of intended direction`, () => {
      expect(isBootstrapRuleId(id)).toBe(true);
      expect(() => assertKnownRuleId(id)).not.toThrow();
    });
  }

  test("no id is excluded from validateRuleIds when passed alone", () => {
    for (const id of BOOTSTRAP_RULE_IDS) {
      expect(() => validateRuleIds([id])).not.toThrow();
    }
  });
});

describe("validateRuleIds — accumulate-then-throw-once", () => {
  test("passes silently when every id is known", () => {
    expect(() => validateRuleIds([...BOOTSTRAP_RULE_IDS])).not.toThrow();
  });

  test("passes silently for an empty list", () => {
    expect(() => validateRuleIds([])).not.toThrow();
  });

  test("reports every unknown id in one throw, not just the first", () => {
    let caught: unknown;
    try {
      validateRuleIds(["caveman", "typo-one", "typo-two", "english-code"]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BootstrapRuleValidationError);
    const err = caught as BootstrapRuleValidationError;
    expect(err.unknownIds).toEqual(["typo-one", "typo-two"]);
    expect(err.message).toContain("typo-one");
    expect(err.message).toContain("typo-two");
    // The known-good ids in the same batch must not appear as violations.
    expect(err.message).not.toContain("unknown bootstrap rule id(s): caveman");
  });
});
