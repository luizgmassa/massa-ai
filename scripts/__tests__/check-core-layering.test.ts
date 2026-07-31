/**
 * GMS-01 AC-1 — tests for the core layer contract check (PR-C T5).
 *
 * The discipline these encode, from tasks.md T5 and §7's precedent: a gate is
 * not quotable until it has been observed **red on purpose**, in both
 * directions. A check that resolved nothing also reports zero violations, so
 * every green assertion below is paired with a red one over the same shape, and
 * `edgesExamined` is asserted non-zero wherever a PASS is claimed.
 *
 * The other half is that the check must be *discriminating*, not merely strict.
 * `data → kernel` is the edge the whole tier exists to make legal; a check that
 * rejected it would pass every violation test above and still be wrong.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  CORE_SRC,
  TIERS,
  FORBIDDEN,
  tierOf,
  scan,
  resolveSpecifier,
  trackedFiles,
} from "../check-core-layering.ts";

/** A throwaway git repo, so `git ls-files` is real rather than stubbed. */
function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "core-layering-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Scan a fixture tree and return the result, always cleaning up. */
function check(files: Record<string, string>) {
  const { root, cleanup } = repo(files);
  try {
    return scan(root, trackedFiles(root));
  } finally {
    cleanup();
  }
}

const S = `${CORE_SRC}`;

describe("tierOf — the tier set is exactly {kernel, tools, controllers, services, data}", () => {
  test("classifies every tier by path prefix", () => {
    expect(tierOf(`${S}kernel/db-connection.ts`)).toBe("kernel");
    expect(tierOf(`${S}tools/search_project.ts`)).toBe("tools");
    // `controllers/index.ts` rather than a real `<x>-controller` filename: this is
    // a fixture, not a reference, and T6's reshaped `check-stale-pointers` POINTER
    // matches suffix-shaped controller names. Spelled realistically it became the
    // 83rd suffix-branch pointer against an expected 82.
    expect(tierOf(`${S}controllers/index.ts`)).toBe("controllers");
    expect(tierOf(`${S}services/search/hybrid-search.ts`)).toBe("services");
    expect(tierOf(`${S}data/vector/base-vector-store.ts`)).toBe("data");
  });

  test("everything else under packages/core/src/ is UNTIERED", () => {
    // This is the clause whose absence rejects a legal tree. `generated/` is the
    // load-bearing one: kernel/prisma-client.ts imports ../generated/prisma, and
    // that single module closes 12 of AC-4's 26 edges.
    expect(tierOf(`${S}generated/prisma/index.js`)).toBeNull();
    expect(tierOf(`${S}models/memory.ts`)).toBeNull();
    expect(tierOf(`${S}scripts/create-3072d-table.ts`)).toBeNull();
    expect(tierOf(`${S}__tests__/base-vector-store.test.ts`)).toBeNull();
    expect(tierOf(`${S}index.ts`)).toBeNull();
  });

  test("paths outside packages/core/src/ are untiered", () => {
    expect(tierOf("packages/shared/src/types/interfaces.ts")).toBeNull();
    expect(tierOf("packages/core/scripts/create-3072d-table.ts")).toBeNull();
    expect(tierOf("apps/tools-api/src/routes/project.ts")).toBeNull();
  });

  test("a directory that merely starts with a tier name is not that tier", () => {
    expect(tierOf(`${S}datasets/fixture.ts`)).toBeNull();
    expect(tierOf(`${S}kernels/experimental.ts`)).toBeNull();
  });
});

describe("kernel leaf-ness — observed red in every forbidden direction", () => {
  const kernelImporting = (spec: string) => ({
    [`${S}kernel/fqn-codec.ts`]: `import { x } from "${spec}";\nexport const y = 1;\n`,
    [`${S}tools/t.ts`]: "export const x = 1;\n",
    [`${S}controllers/c.ts`]: "export const x = 1;\n",
    [`${S}services/s.ts`]: "export const x = 1;\n",
    [`${S}data/d.ts`]: "export const x = 1;\n",
  });

  for (const [tier, spec] of [
    ["tools", "../tools/t.js"],
    ["controllers", "../controllers/c.js"],
    ["services", "../services/s.js"],
    ["data", "../data/d.js"],
  ] as const) {
    test(`kernel -> ${tier} is a violation`, () => {
      const r = check(kernelImporting(spec));
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0]!.from).toBe("kernel");
      expect(r.violations[0]!.to).toBe(tier);
    });
  }

  test("kernel -> kernel is legal, and edges are actually examined", () => {
    const r = check({
      [`${S}kernel/fqn-codec.ts`]: 'import { x } from "./types.js";\nexport const y = 1;\n',
      [`${S}kernel/types.ts`]: "export const x = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
    // Without this, a check that resolved nothing would pass this test.
    expect(r.edgesExamined).toBe(1);
  });

  test("kernel -> untiered (the prisma-client shape) is legal", () => {
    const r = check({
      [`${S}kernel/prisma-client.ts`]:
        'import { PrismaClient } from "../generated/prisma/index.js";\nexport const p = PrismaClient;\n',
      [`${S}generated/prisma/index.ts`]: "export const PrismaClient = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
  });
});

describe("data -> services — AC-4's rule, red and green over the same shape", () => {
  test("data -> services is a violation", () => {
    const r = check({
      [`${S}data/vector/base-vector-store.ts`]:
        'import { createEmbeddingProvider } from "../../services/embeddings/index.js";\nexport const x = 1;\n',
      [`${S}services/embeddings/index.ts`]: "export const createEmbeddingProvider = 1;\n",
    });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.from).toBe("data");
    expect(r.violations[0]!.to).toBe("services");
  });

  test("data -> kernel is LEGAL — the edge the tier exists to permit", () => {
    // The discriminating case. A check that merely forbade "data importing
    // upward" would fail here and still pass every violation test above.
    const r = check({
      [`${S}data/vector/base-vector-store.ts`]:
        'import { getDb } from "../../kernel/db-connection.js";\nexport const x = getDb;\n',
      [`${S}kernel/db-connection.ts`]: "export const getDb = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
    expect(r.edgesExamined).toBe(1);
  });

  test("services -> data and services -> kernel stay legal", () => {
    const r = check({
      [`${S}services/etl/pipeline.ts`]:
        'import { a } from "../../data/d.js";\nimport { b } from "../../kernel/k.js";\nexport const x = [a, b];\n',
      [`${S}data/d.ts`]: "export const a = 1;\n",
      [`${S}kernel/k.ts`]: "export const b = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
    expect(r.edgesExamined).toBe(2);
  });
});

describe("what counts as an edge", () => {
  test("the specifier pattern is quote-agnostic (C15)", () => {
    // AC-4's stated 24 was a property of a double-quote-anchored pattern rather
    // than of the tree. A single-quoted violation must not be invisible.
    const r = check({
      [`${S}kernel/k.ts`]: "import { x } from '../services/s.js';\nexport const y = 1;\n",
      [`${S}services/s.ts`]: "export const x = 1;\n",
    });
    expect(r.violations).toHaveLength(1);
  });

  test("mock.module is an edge — Bun resolves it at runtime", () => {
    const r = check({
      [`${S}data/d.ts`]: 'mock.module("../services/s.js", () => ({}));\nexport const x = 1;\n',
      [`${S}services/s.ts`]: "export const x = 1;\n",
    });
    expect(r.violations).toHaveLength(1);
  });

  test("dynamic import() and require() are edges", () => {
    const r = check({
      [`${S}data/a.ts`]: 'export const f = () => import("../services/s.js");\n',
      [`${S}data/b.ts`]: 'const m = require("../services/s.js");\nexport const x = m;\n',
      [`${S}services/s.ts`]: "export const x = 1;\n",
    });
    expect(r.violations).toHaveLength(2);
  });

  test("an import statement inside a string literal is fixture text, not an edge (C17)", () => {
    const r = check({
      [`${S}data/d.ts`]:
        'export const fixture = `import { x } from "../services/s.js";`;\n',
      [`${S}services/s.ts`]: "export const x = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
  });

  test("a commented-out import is not an edge", () => {
    const r = check({
      [`${S}data/d.ts`]: '// import { x } from "../services/s.js";\nexport const y = 1;\n',
      [`${S}services/s.ts`]: "export const x = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
  });

  test("bare specifiers are never tier edges", () => {
    const r = check({
      [`${S}kernel/k.ts`]: 'import { logger } from "@massa-ai/shared";\nexport const x = logger;\n',
    });
    expect(r.violations).toHaveLength(0);
    expect(r.edgesExamined).toBe(0);
  });

  test("an untiered importer is unconstrained in every direction", () => {
    const r = check({
      [`${S}__tests__/x.test.ts`]:
        'import { a } from "../services/s.js";\nimport { b } from "../data/d.js";\nexport const z = [a, b];\n',
      [`${S}index.ts`]: 'export { a } from "./services/s.js";\n',
      [`${S}services/s.ts`]: "export const a = 1;\n",
      [`${S}data/d.ts`]: "export const b = 1;\n",
    });
    expect(r.violations).toHaveLength(0);
  });
});

describe("no allowlist — the property that keeps the check discriminating", () => {
  test("the rule table exposes no exemption entries", () => {
    // design.md §1 chose a tier *over* an allowlist because an allowlist stops
    // the check discriminating. If an `ALLOWLIST`/`EXEMPT` export ever appears
    // here, that argument has been quietly reversed.
    const exported = Object.keys(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../check-core-layering.ts") as Record<string, unknown>,
    ).map((k) => k.toUpperCase());
    expect(exported.some((k) => k.includes("ALLOW") || k.includes("EXEMPT") || k.includes("IGNORE")))
      .toBe(false);
  });

  test("scan() offers no parameter that could suppress a violation", () => {
    // (root, files) and nothing else.
    expect(scan.length).toBeLessThanOrEqual(2);
  });

  test("FORBIDDEN covers every tier, so a new tier cannot be silently unruled", () => {
    for (const t of TIERS) expect(FORBIDDEN[t]).toBeDefined();
  });
});

describe("resolveSpecifier — .js specifiers point at .ts sources", () => {
  test("resolves the TS ESM convention and directory indexes", () => {
    const { root, cleanup } = repo({
      [`${S}data/d.ts`]: "export const x = 1;\n",
      [`${S}services/sub/index.ts`]: "export const y = 1;\n",
    });
    try {
      expect(resolveSpecifier(root, `${S}kernel/k.ts`, "../data/d.js")).toBe(`${S}data/d.ts`);
      expect(resolveSpecifier(root, `${S}kernel/k.ts`, "../services/sub")).toBe(
        `${S}services/sub/index.ts`,
      );
      expect(resolveSpecifier(root, `${S}kernel/k.ts`, "@massa-ai/shared")).toBeNull();
      expect(resolveSpecifier(root, `${S}kernel/k.ts`, "../nope/missing.js")).toBeNull();
    } finally {
      cleanup();
    }
  });
});
