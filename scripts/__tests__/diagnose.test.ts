/**
 * diagnose.ts — pure-helper coverage.
 *
 * diagnose is a live-stack diagnostic (it probes Ollama + PostgreSQL at module
 * load). Those probes require a live Ollama API and a live database, so the
 * checkOllama / checkPostgres bodies are out of scope for the unit suite. The
 * clearly-pure helpers — DATABASE_URL credential masking and Ollama URL
 * candidate construction — are exported and tested here.
 */
import { describe, test, expect } from "bun:test";
import { maskDatabaseUrl, ollamaCandidates } from "../diagnose";

describe("maskDatabaseUrl", () => {
  test("masks credentials while preserving host, port, and database", () => {
    const masked = maskDatabaseUrl(
      "postgresql://user:secret@db.example.com:5433/massa_ai_test",
    );
    expect(masked).toBe("postgres://****:****@db.example.com:5433/massa_ai_test");
    // credentials never leak
    expect(masked).not.toContain("user");
    expect(masked).not.toContain("secret");
  });

  test("omits the port segment when none is present", () => {
    expect(maskDatabaseUrl("postgres://u:p@host/db")).toBe(
      "postgres://****:****@host/db",
    );
  });

  test("reports 'unknown' database when the URL has no path", () => {
    expect(maskDatabaseUrl("postgres://u:p@host:5433/")).toBe(
      "postgres://****:****@host:5433/unknown",
    );
  });

  test("falls back to regex masking for an un-parseable value", () => {
    const masked = maskDatabaseUrl("not a url //user:pass@host/");
    // invalid URL -> catch -> regex replace the //...@ segment
    expect(masked).toContain("****:****");
    expect(masked).not.toContain("user:pass");
  });
});

describe("ollamaCandidates", () => {
  test("a localhost URL yields both localhost and 127.0.0.1 variants", async () => {
    const candidates = await ollamaCandidates("http://localhost:11434");
    expect(candidates[0]).toBe("http://localhost:11434");
    expect(candidates).toContain("http://127.0.0.1:11434");
  });

  test("a non-localhost URL is returned as-is (plus any resolv.conf nameserver)", async () => {
    const candidates = await ollamaCandidates("http://ollama.example:11434");
    expect(candidates[0]).toBe("http://ollama.example:11434");
    // localhost variant must NOT be added for a non-localhost input
    expect(candidates).not.toContain("http://127.0.0.1:11434");
  });

  test("never throws and always returns at least the input URL", async () => {
    const candidates = await ollamaCandidates("http://localhost:11434");
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });
});
