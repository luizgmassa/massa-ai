/**
 * LIP-01 — provider list parity + the `cohere` gap
 * (.specs/features/local-inference-provider-abstraction/spec.md)
 *
 * `embedding.provider` has to agree across four independent consumers:
 * the type union in `massa-ai-config.ts`, `config-writer.ts`'s validation
 * allowlist, the web-ui config-form enum, and core's `SELECTABLE_PROVIDERS`.
 * Before this task the fourth (`SELECTABLE_PROVIDERS`, 9 members) silently
 * omitted `cohere`, which the other three accepted and wrote to config.json
 * — a value core could never select. This sensor asserts membership
 * EQUALITY between the derived consumers (not the absence of array
 * literals, which cannot tell a fourth copy from the three sanctioned
 * ones), same shape as `embedding-defaults-parity.test.ts:290`.
 *
 * `config-sections.ts` cannot be a derived (importing) consumer: apps/web-ui
 * builds with plain `tsc`, no bundler, and loads a raw
 * `<script type="module">` with no import map — a value import there would
 * emit an unresolvable bare specifier and break `/ui` at load
 * (design.md §1 "Correction"). Its enum stays a literal, pinned here by
 * reading the file as text, mirroring the bash/TypeScript dialect split
 * `embedding-defaults-parity.test.ts` already uses.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_INFERENCE_IDS } from "../../packages/shared/src/config/inference-providers";
import {
  API_PROVIDER_IDS,
  EMBEDDING_PROVIDER_IDS,
} from "../../packages/shared/src/config/massa-ai-config";
import { VALID_EMBEDDING_PROVIDERS } from "../../packages/shared/src/config/config-writer";
import { SELECTABLE_PROVIDERS } from "../../packages/core/src/services/embeddings/config";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const sorted = (xs: Iterable<string>) => [...xs].sort();

// Internal-only ids: never appear in config.json, so they are not part of
// the writable union — only of core's larger SELECTABLE_PROVIDERS.
const INTERNAL_ONLY_IDS = ["vercel", "litellm", "custom", "transformers", "local"];

describe("provider list parity (LIP-01)", () => {
  const writableUnion = sorted(new Set([...LOCAL_INFERENCE_IDS, ...API_PROVIDER_IDS]));
  console.log(`[parity] writable embedding.provider union: ${writableUnion.join(", ")}`);

  test("EMBEDDING_PROVIDER_IDS equals LOCAL_INFERENCE_IDS ∪ API_PROVIDER_IDS", () => {
    expect(sorted(EMBEDDING_PROVIDER_IDS)).toEqual(writableUnion);
  });

  test("massa-ai-config.ts embedding.provider type derives from EMBEDDING_PROVIDER_IDS, not a hand-written union", () => {
    // TS unions erase at runtime, so this is a text-pinned guard against the
    // type quietly reverting to a hardcoded literal that could drift from
    // the runtime set checked below.
    const text = read("packages/shared/src/config/massa-ai-config.ts");
    expect(text).toContain("provider: (typeof EMBEDDING_PROVIDER_IDS)[number];");
  });

  test("config-writer.ts VALID_EMBEDDING_PROVIDERS matches the writable union", () => {
    expect(sorted(VALID_EMBEDDING_PROVIDERS)).toEqual(writableUnion);
  });

  test("config-sections.ts provider enum (text-pinned — no value import, browser constraint) matches the writable union", () => {
    const text = read("apps/web-ui/src/static/views/config-sections.ts");
    const matches = [
      ...text.matchAll(/name:\s*"provider",\s*type:\s*"enum"[^}]*?enum:\s*\[([^\]]+)\]/g),
    ];
    if (matches.length !== 1) {
      throw new Error(
        `config-sections.ts: expected exactly 1 provider-enum match, got ${matches.length} — ` +
          (matches.length === 0 ? "extractor rotted or field removed" : "ambiguous match"),
      );
    }
    const ids = [...matches[0]![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    console.log(`[parity] config-sections.ts enum: ${ids.join(", ")}`);
    expect(sorted(ids)).toEqual(writableUnion);
  });

  test("SELECTABLE_PROVIDERS equals the writable union ∪ internal-only ids", () => {
    const expected = sorted(new Set([...writableUnion, ...INTERNAL_ONLY_IDS]));
    console.log(`[parity] SELECTABLE_PROVIDERS: ${sorted(SELECTABLE_PROVIDERS).join(", ")}`);
    expect(sorted(SELECTABLE_PROVIDERS)).toEqual(expected);
  });

  test("cohere is selectable at runtime (the gap LIP-01 closes)", () => {
    // Runtime check against the real Set object embeddings/config.ts
    // exports — not a text scan — so this fails if the closing edit is ever
    // reverted even when every list above still happens to agree elsewhere.
    expect(SELECTABLE_PROVIDERS.has("cohere")).toBe(true);
  });

  // G10 — the two config-CLI copies gate `use <provider>` on a hand-edited
  // `WRITABLE_PROVIDERS` literal that this file pinned for every *other*
  // consumer of the same union. Unpinned, a seventh provider would leave both
  // CLIs silently rejecting it while every assertion above stayed green.
  // Text-pinned rather than imported for the same reason config-sections.ts
  // is: the const is module-private, and importing config-cli.ts from here
  // would drag each app's whole runtime in to read one array literal.
  for (const cliPath of [
    "apps/mcp-client/src/config-cli.ts",
    "apps/opencode-plugin/src/config-cli.ts",
  ]) {
    test(`${cliPath} WRITABLE_PROVIDERS matches the writable union`, () => {
      const text = read(cliPath);
      const matches = [...text.matchAll(/const WRITABLE_PROVIDERS\s*=\s*\[([^\]]+)\]/g)];
      if (matches.length !== 1) {
        throw new Error(
          `${cliPath}: expected exactly 1 WRITABLE_PROVIDERS match, got ${matches.length} — ` +
            (matches.length === 0 ? "extractor rotted or const renamed" : "ambiguous match"),
        );
      }
      const ids = [...matches[0]![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
      console.log(`[parity] ${cliPath} WRITABLE_PROVIDERS: ${ids.join(", ")}`);
      expect(sorted(ids)).toEqual(writableUnion);
    });
  }

  test("lmstudio reaches every config-writable consumer end to end", () => {
    expect(EMBEDDING_PROVIDER_IDS).toContain("lmstudio");
    expect(VALID_EMBEDDING_PROVIDERS).toContain("lmstudio");
    expect(SELECTABLE_PROVIDERS.has("lmstudio")).toBe(true);
    const text = read("apps/web-ui/src/static/views/config-sections.ts");
    expect(text).toMatch(/enum:\s*\[[^\]]*"lmstudio"[^\]]*\]/);
  });
});
