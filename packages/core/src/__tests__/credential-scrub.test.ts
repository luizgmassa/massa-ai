/**
 * XP-02 / TASK-XP-003 — kernel credential scrubber.
 *
 * Per rule: a redact-case (the shape is caught) and a near-miss pass-through
 * case (byte-identical output — spec AC-2, the llm-env-prefix precedent's
 * both-direction shape), plus the non-growth invariant, purity, an escaped-
 * `\n` PEM case, and a 64 KiB adversarial-input timing case.
 */

import { describe, expect, test } from "bun:test";
import { RULE_IDS, scrubCredentials } from "../kernel/sanitize/credential-scrub.js";

function markerFor(id: string): string {
  return `[REDACTED:${id}]`;
}

describe("credential-scrub — per-rule both-direction", () => {
  test("clean input passes through byte-identical with a 0-map", () => {
    const input = JSON.stringify({ note: "nothing sensitive here at all" });
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.total).toBe(0);
    for (const id of RULE_IDS) expect(result.redactions[id]).toBe(0);
  });

  test("pem: a real PEM block is redacted", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\n" +
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\n" +
      "-----END PRIVATE KEY-----";
    const input = `payload: ${pem}`;
    const result = scrubCredentials(input);
    expect(result.redactions.pem).toBe(1);
    expect(result.sanitized as string).toContain(markerFor("pem"));
    expect(result.sanitized as string).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj");
  });

  test("pem near-miss: mentioning 'PRIVATE KEY' without a full block passes through", () => {
    const input = "please rotate the PRIVATE KEY on the staging box soon";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions.pem).toBe(0);
  });

  test("jwt: a well-formed three-segment token is redacted", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const input = `Authorization token: ${jwt}`;
    const result = scrubCredentials(input);
    expect(result.redactions.jwt).toBe(1);
    expect(result.sanitized as string).toContain(markerFor("jwt"));
    expect(result.sanitized as string).not.toContain(jwt);
  });

  test("jwt near-miss: too-short segments pass through", () => {
    const input = "config value: eyJ.abc.def";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions.jwt).toBe(0);
  });

  test("aws-key: a well-formed access-key id is redacted", () => {
    const key = "AKIAABCDEFGHIJKLMNOP";
    expect(key.length).toBe(20);
    const input = `AWS_ACCESS_KEY_ID=${key}`;
    const result = scrubCredentials(input);
    expect(result.redactions["aws-key"]).toBe(1);
    expect(result.sanitized as string).toContain(markerFor("aws-key"));
    expect(result.sanitized as string).not.toContain(key);
  });

  test("aws-key near-miss: a short AKIA-prefixed string passes through", () => {
    const input = "example id: AKIA123";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions["aws-key"]).toBe(0);
  });

  test("sk-key: an OpenAI-style key is redacted", () => {
    const key = "sk-abcdefghijklmnopqrstuvwxyz012345";
    const input = `OPENAI_API_KEY=${key}`;
    const result = scrubCredentials(input);
    expect(result.redactions["sk-key"]).toBe(1);
    expect(result.sanitized as string).toContain(markerFor("sk-key"));
    expect(result.sanitized as string).not.toContain(key);
  });

  test("sk-key near-miss: a short id and a skColor-shaped identifier pass through", () => {
    const input = "const skColor = theme.sk-abc; // sk-abc is too short to be a key";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions["sk-key"]).toBe(0);
  });

  test("github-token: a ghp_ token and a github_pat_ token are both redacted", () => {
    const ghp = "ghp_" + "a".repeat(36);
    const pat = "github_pat_" + "b".repeat(22);
    const input = `first ${ghp} second ${pat}`;
    const result = scrubCredentials(input);
    expect(result.redactions["github-token"]).toBe(2);
    expect(result.sanitized as string).not.toContain(ghp);
    expect(result.sanitized as string).not.toContain(pat);
  });

  test("github-token near-miss: too-short tokens pass through", () => {
    const input = "ghp_short github_pat_short";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions["github-token"]).toBe(0);
  });

  test("slack-token: a well-formed xoxb- token is redacted", () => {
    const token = "xoxb-" + "1".repeat(24);
    const input = `SLACK_BOT_TOKEN=${token}`;
    const result = scrubCredentials(input);
    expect(result.redactions["slack-token"]).toBe(1);
    expect(result.sanitized as string).toContain(markerFor("slack-token"));
    expect(result.sanitized as string).not.toContain(token);
  });

  test("slack-token near-miss: a short xoxb- string passes through", () => {
    const input = "example: xoxb-123";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions["slack-token"]).toBe(0);
  });

  test("bearer: a Bearer-scheme token is redacted, prefix kept literal", () => {
    const token = "a".repeat(40);
    const input = `Authorization: Bearer ${token}`;
    const result = scrubCredentials(input);
    expect(result.redactions.bearer).toBe(1);
    expect(result.sanitized as string).toContain(`Bearer ${markerFor("bearer")}`);
    expect(result.sanitized as string).not.toContain(token);
  });

  test("bearer near-miss: lowercase 'bearer' in prose passes through", () => {
    const input = "please pass a bearer token in the Authorization header";
    const result = scrubCredentials(input);
    expect(result.sanitized as string).toBe(input);
    expect(result.redactions.bearer).toBe(0);
  });
});

describe("credential-scrub — non-growth invariant", () => {
  const cases: Array<{ id: string; input: string }> = [
    {
      id: "pem",
      input:
        "-----BEGIN PRIVATE KEY-----\n" +
        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\n" +
        "-----END PRIVATE KEY-----",
    },
    {
      id: "jwt",
      input: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    },
    { id: "aws-key", input: "AKIAABCDEFGHIJKLMNOP" },
    { id: "sk-key", input: "sk-abcdefghijklmnopqrstuvwxyz012345" },
    { id: "github-token", input: "ghp_" + "a".repeat(36) },
    { id: "slack-token", input: "xoxb-" + "1".repeat(24) },
    { id: "bearer", input: `Bearer ${"a".repeat(40)}` },
  ];

  for (const { id, input } of cases) {
    test(`${id}: scrubbing a minimal real match never grows the payload`, () => {
      const result = scrubCredentials(input);
      expect((result.sanitized as string).length).toBeLessThanOrEqual(input.length);
      expect(result.redactions[id]).toBeGreaterThan(0);
    });
  }

  test("a realistic multi-credential payload never grows", () => {
    const input = JSON.stringify({
      awsKey: "AKIAABCDEFGHIJKLMNOP",
      openaiKey: "sk-abcdefghijklmnopqrstuvwxyz012345",
      auth: `Bearer ${"a".repeat(40)}`,
    });
    const result = scrubCredentials(input);
    expect((result.sanitized as string).length).toBeLessThanOrEqual(input.length);
  });
});

describe("credential-scrub — purity", () => {
  test("identical input always produces identical output", () => {
    const input = JSON.stringify({
      awsKey: "AKIAABCDEFGHIJKLMNOP",
      note: "nothing else sensitive",
    });
    const a = scrubCredentials(input);
    const b = scrubCredentials(input);
    expect(a.sanitized as string).toBe(b.sanitized as string);
    expect(a.redactions).toEqual(b.redactions);
    expect(a.total).toBe(b.total);
  });
});

describe("credential-scrub — escaped-\\n PEM (JSON-serialized boundary)", () => {
  test("a PEM whose newlines arrive JSON-escaped is still caught", () => {
    const realPem =
      "-----BEGIN PRIVATE KEY-----\n" +
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\n" +
      "MCFRiHXlYSNGjs6QhAtVn5FF6ISJvBLDCVoLzKI0AwhZ/RA7EO4KEuMEAM7XYqZP\n" +
      "-----END PRIVATE KEY-----";
    const payload = { secretKey: realPem };
    const serialized = JSON.stringify(payload);

    // Sanity: JSON.stringify escaped the real newlines to literal `\n`
    // two-character sequences — this is the shape scrubCredentials actually
    // receives at the production seam (hook-service.ts calls it on
    // JSON.stringify(ev.payload)).
    expect(serialized).not.toContain("\n");
    expect(serialized).toContain("\\n");

    const result = scrubCredentials(serialized);
    expect(result.redactions.pem).toBe(1);
    expect(result.sanitized as string).toContain(markerFor("pem"));
    expect(result.sanitized as string).not.toContain(
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
    );

    // The output stays valid JSON with the key redacted in place.
    const parsed = JSON.parse(result.sanitized as string) as { secretKey: string };
    expect(parsed.secretKey).toBe(markerFor("pem"));
  });
});

describe("credential-scrub — adversarial 64 KiB input stays under budget", () => {
  test("a 64 KiB payload with many unterminated PEM headers scrubs quickly", () => {
    const chunk = "-----BEGIN PRIVATE KEY----- some filler text that is not a real key body ";
    const repeats = Math.ceil((64 * 1024) / chunk.length);
    const input = chunk.repeat(repeats).slice(0, 64 * 1024);
    expect(input.length).toBe(64 * 1024);

    const start = performance.now();
    const result = scrubCredentials(input);
    const elapsedMs = performance.now() - start;

    // Generous budget well under bunfig.toml's 5 s per-test default.
    expect(elapsedMs).toBeLessThan(4000);
    // None of the unterminated headers has a matching END within the bound,
    // so nothing should be classified as a PEM match here — this asserts the
    // scan terminates cleanly rather than hanging, not that it redacts.
    expect(result.redactions.pem).toBe(0);
    expect((result.sanitized as string).length).toBe(input.length);
  });
});

