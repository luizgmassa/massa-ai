#!/usr/bin/env bun
/**
 * massa-ai - Stack Diagnostic Tool
 *
 * Validates the entire local infrastructure in seconds:
 * 1. Local inference provider installation
 * 2. Local inference provider API connectivity
 * 3. Required embedding model
 * 4. Embedding generation test
 * 5. PostgreSQL connectivity
 * 6. pgvector extension
 * 7. Prisma schema / migrations
 *
 * Usage: bun scripts/diagnose.ts
 *
 * Environment variables:
 *   EMBEDDING_PROVIDER        - "ollama" (default) or "lmstudio"; falls back to
 *                               config.json's embedding.provider
 *   OLLAMA_BASE_URL           - Ollama API URL (default: http://localhost:11434)
 *   OLLAMA_EMBEDDING_MODEL    - Ollama model to test (default: qwen3-embedding:4b)
 *   LMSTUDIO_BASE_URL         - LM Studio API URL (default: http://localhost:1234/v1)
 *   LMSTUDIO_EMBEDDING_MODEL  - LM Studio model to test (default: text-embedding-nomic-embed-text-v1.5)
 *   DATABASE_URL              - Required PostgreSQL connection string
 */
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "bun";
import { loadConfigSafe, requirePostgresDatabaseUrl } from "../packages/shared/src/config/index.js";
import {
  INFERENCE_PROVIDERS,
  type InferenceProviderId,
  type InferenceProviderSpec,
} from "../packages/shared/src/config/inference-providers.js";
import { probeProvider } from "../packages/core/src/kernel/inference-probe.js";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

console.log(
  `\n${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}`,
);
console.log(
  `${BOLD}║            massa-ai - Stack Diagnostic Tool                      ║${NC}`,
);
console.log(
  `${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}\n`,
);

// ─── Helpers ──────────────────────────────────────────────────────────

/** Mask DATABASE_URL for safe logging — only shows host and database name */
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "unknown";
    const port = parsed.port ? `:${parsed.port}` : "";
    const db = parsed.pathname.replace(/^\//, "") || "unknown";
    return `postgres://****:****@${host}${port}/${db}`;
  } catch {
    // Fallback: mask everything between :// and @
    return url.replace(/\/\/.*@/, "//****:****@");
  }
}

/** Run a shell command and return stdout, or null on failure */
async function run(
  cmd: string[],
  timeoutMs = 5000,
): Promise<string | null> {
  try {
    const proc = spawn(cmd);
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    return out.trim() || null;
  } catch {
    return null;
  }
}

// ─── Provider selection ──────────────────────────────────────────────
// EMBEDDING_PROVIDER env > config.json's embedding.provider > "ollama" —
// the same precedence `embeddings/config.ts`'s `selectedProvider` and
// `LocalHealthChecker.resolveProviderId` use (LIP-10). Never a new knob.

interface FileEmbeddingConfig {
  provider?: string;
  baseURL?: string;
  model?: string;
}

/** `config.json`'s `embedding` block, or undefined on any read failure —
 *  an unconfigured install has no file and must fall back to Ollama. */
function fileEmbedding(): FileEmbeddingConfig | undefined {
  try {
    return loadConfigSafe().embedding;
  } catch {
    return undefined;
  }
}

export function resolveProviderId(
  env: Record<string, string | undefined>,
  file: FileEmbeddingConfig | undefined,
): InferenceProviderId {
  const provider = env.EMBEDDING_PROVIDER || file?.provider;
  return provider === "lmstudio" ? "lmstudio" : "ollama";
}

export function resolveProviderBaseUrl(
  id: InferenceProviderId,
  env: Record<string, string | undefined>,
  file: FileEmbeddingConfig | undefined,
): string {
  const spec = INFERENCE_PROVIDERS[id];
  const envUrl = env[spec.envNames.baseUrl];
  if (envUrl) return envUrl;
  if (file?.provider === id && file?.baseURL) return file.baseURL;
  return spec.defaultEmbeddingBaseUrl;
}

const DEFAULT_MODEL: Readonly<Record<InferenceProviderId, string>> = {
  ollama: "qwen3-embedding:4b",
  lmstudio: "text-embedding-nomic-embed-text-v1.5",
};

export function resolveModelName(
  id: InferenceProviderId,
  env: Record<string, string | undefined>,
  file: FileEmbeddingConfig | undefined,
): string {
  const spec = INFERENCE_PROVIDERS[id];
  const envModel = env[spec.envNames.model];
  if (envModel) return envModel;
  if (file?.provider === id && file?.model) return file.model;
  return DEFAULT_MODEL[id];
}

// ─── Provider URL auto-detection ─────────────────────────────────────

/** Candidate URLs to probe, in priority order */
export async function ollamaCandidates(envUrl: string): Promise<string[]> {
  const candidates: string[] = [envUrl];

  // When the env URL uses "localhost", also try the explicit IPv4 address.
  // In WSL2 with mirrored networking, "localhost" may resolve to ::1 (IPv6)
  // while the provider only listens on 127.0.0.1 (IPv4).
  if (envUrl.includes("localhost")) {
    candidates.push(envUrl.replace("localhost", "127.0.0.1"));
  }

  // Try the WSL2 Windows-host nameserver IP as a last resort
  try {
    const resolv = await Bun.file("/etc/resolv.conf").text();
    const match = resolv.match(/^nameserver\s+([\d.]+)/m);
    if (match) candidates.push(`http://${match[1]}:11434`);
  } catch { /* ignore */ }

  // Deduplicate while preserving order
  return [...new Set(candidates)];
}

/**
 * Probe each candidate URL with `probeProvider` (kernel/inference-probe.ts)
 * and return the first one that is reachable, or null. Discriminates by
 * response body shape, never by HTTP status — LM Studio answers 200 with
 * `{"error": "..."}` for an unknown endpoint, so a status-code check alone
 * would report a live provider that is not actually the configured one.
 */
export async function detectProviderUrl(
  spec: InferenceProviderSpec,
  candidates: string[],
): Promise<{ url: string; models: string[] } | null> {
  for (const url of candidates) {
    const result = await probeProvider(spec, url);
    if (result.reachable) return { url, models: result.models };
  }
  return null;
}

/** Exact model-name match — never a substring: a sibling tag or a longer
 *  model id must not satisfy the check (LIP-03). */
export function modelIsAvailable(models: string[], target: string): boolean {
  return models.some((name) => name === target);
}

/** Where to POST a single-input embedding request, per provider. Ollama
 *  serves its own `/api/embed`; LM Studio's base URL already ends in `/v1`
 *  and it speaks the OpenAI-compatible `/embeddings` endpoint. */
function embedPath(id: InferenceProviderId): string {
  return id === "lmstudio" ? "/embeddings" : "/api/embed";
}

/**
 * Parse a single embedding vector out of a provider's response body.
 * Ollama: `{embeddings: number[][]}` (batch shape) or `{embedding: number[]}`
 * (legacy singular). LM Studio: OpenAI-compatible `{data: [{embedding}]}`.
 * These shapes are incompatible — reading one against the other silently
 * returns undefined, which is exactly the LIP-03 defect this replaces.
 */
export function parseEmbeddingResponse(
  id: InferenceProviderId,
  body: unknown,
): number[] | null {
  if (typeof body !== "object" || body === null) return null;
  if (id === "lmstudio") {
    const data = (body as { data?: unknown }).data;
    const first = Array.isArray(data) ? (data[0] as { embedding?: unknown }) : undefined;
    const embedding = first?.embedding;
    return Array.isArray(embedding) ? (embedding as number[]) : null;
  }
  const b = body as { embeddings?: unknown; embedding?: unknown };
  const embedding = Array.isArray(b.embeddings) ? b.embeddings[0] : b.embedding;
  return Array.isArray(embedding) ? (embedding as number[]) : null;
}

/** Locate the provider's CLI, or null. LM Studio's `lms` is not on PATH
 *  until the app has bootstrapped it, so the bundled location is checked
 *  first (mirrors `lms_cli_path` in setup-local-first.sh). */
async function findProviderCli(id: InferenceProviderId): Promise<string | null> {
  if (id === "lmstudio") {
    const bundled = path.join(os.homedir(), ".lmstudio", "bin", "lms");
    if (existsSync(bundled)) return bundled;
    return run(["which", "lms"]);
  }
  return run(["which", "ollama"]);
}

// ─── Provider checks ──────────────────────────────────────────────────

async function checkProvider(): Promise<boolean> {
  const env = process.env;
  const file = fileEmbedding();
  const providerId = resolveProviderId(env, file);
  const spec = INFERENCE_PROVIDERS[providerId];
  const modelName = resolveModelName(providerId, env, file);
  const configuredUrl = resolveProviderBaseUrl(providerId, env, file);
  let ok = true;
  let resolvedUrl = configuredUrl;

  const installHint = providerId === "lmstudio"
    ? "curl -fsSL https://lmstudio.ai/install.sh | bash"
    : "curl -fsSL https://ollama.com/install.sh | sh";
  const startHint = providerId === "lmstudio"
    ? "lms daemon up"
    : "ollama serve  or  bash scripts/ensure-ollama.sh";
  const pullHint = providerId === "lmstudio"
    ? `lms get -y ${modelName}`
    : `ollama pull ${modelName}`;

  // 1. Check if the provider CLI is in PATH
  console.log(`${BOLD}[1/7] Checking ${spec.id} installation...${NC}`);
  const cliPath = await findProviderCli(providerId);
  if (cliPath) {
    console.log(`  ${GREEN}✓${NC} ${spec.id} found at: ${cliPath}`);
  } else {
    console.log(`  ${RED}✗${NC} ${spec.id} not found in PATH`);
    console.log(`  ${YELLOW}!${NC} Install: ${installHint}`);
    ok = false;
  }

  // 2. Check API connectivity — probe multiple candidates to handle WSL2 quirks
  console.log(`\n${BOLD}[2/7] Checking ${spec.id} API connectivity...${NC}`);
  const candidates = await ollamaCandidates(configuredUrl);
  let models: string[] | null = null;

  const start = Date.now();
  const detected = await detectProviderUrl(spec, candidates);
  const duration = Date.now() - start;

  if (detected) {
    resolvedUrl = detected.url;
    models = detected.models;
    const note = resolvedUrl !== configuredUrl
      ? `  ${DIM}(configured URL ${configuredUrl} didn't respond — using ${resolvedUrl})${NC}`
      : "";
    console.log(`  ${GREEN}✓${NC} API reachable at ${resolvedUrl} (${duration}ms)`);
    if (note) console.log(note);
    console.log(`  ${GREEN}✓${NC} Models available: ${models.length}`);
  } else {
    console.log(`  ${RED}✗${NC} API not responding (tried: ${candidates.join(", ")})`);
    console.log(`  ${YELLOW}!${NC} Start with: ${BOLD}${startHint}${NC}`);
    ok = false;
  }

  // 3. Check embedding model — exact match, never a substring
  console.log(`\n${BOLD}[3/7] Checking model: ${modelName}...${NC}`);
  if (models) {
    if (modelIsAvailable(models, modelName)) {
      console.log(`  ${GREEN}✓${NC} Model '${modelName}' is available`);
    } else {
      const available = models.join(", ") || "(none)";
      console.log(`  ${YELLOW}!${NC} Model '${modelName}' not found`);
      console.log(`  ${DIM}  Available: ${available}${NC}`);
      console.log(`  ${YELLOW}!${NC} Run: ${BOLD}${pullHint}${NC}`);
    }
  } else {
    console.log(`  ${YELLOW}!${NC} Skipped (API unreachable)`);
  }

  // 4. Test embedding generation — provider-dispatched request + response shape
  console.log(`\n${BOLD}[4/7] Testing embedding generation...${NC}`);
  if (models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const start = Date.now();
      const response = await fetch(`${resolvedUrl}${embedPath(providerId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelName,
          input: "massa-ai diagnostic test",
        }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const duration = Date.now() - start;
      const embedding = parseEmbeddingResponse(providerId, data);
      const dimensions = embedding?.length || 0;

      if (!embedding || dimensions === 0) {
        throw new Error("Empty embedding returned");
      }
      if (embedding.some((v) => isNaN(v) || !isFinite(v))) {
        throw new Error("Embedding contains NaN or Infinity values");
      }

      console.log(`  ${GREEN}✓${NC} Embedding OK!  dimensions=${dimensions}  latency=${duration}ms`);
    } catch (err) {
      console.log(`  ${RED}✗${NC} Embedding failed: ${(err as Error).message}`);
      console.log(`  ${YELLOW}!${NC} Ensure '${modelName}' is fully pulled.`);
      ok = false;
    }
  } else {
    console.log(`  ${YELLOW}!${NC} Skipped (API unreachable)`);
    ok = false;
  }

  return ok;
}

// ─── PostgreSQL Checks ───────────────────────────────────────────────

async function checkPostgres(): Promise<boolean> {
  let databaseUrl: string;

  // 5. Check DATABASE_URL configuration
  console.log(`\n${BOLD}[5/7] Checking PostgreSQL configuration...${NC}`);
  try {
    databaseUrl = requirePostgresDatabaseUrl();
  } catch (error) {
    console.log(`  ${RED}✗${NC} ${(error as Error).message}`);
    return false;
  }

  const masked = maskDatabaseUrl(databaseUrl);
  console.log(`  ${GREEN}✓${NC} DATABASE_URL configured`);
  console.log(`  ${DIM}  ${masked}${NC}`);

  // 6. Test PostgreSQL connectivity + pgvector
  console.log(`\n${BOLD}[6/7] Testing PostgreSQL connectivity...${NC}`);
  let pgOk = false;
  try {
    // pg is required for PostgreSQL diagnostics.
    const { default: pg } = (await import("pg")) as any;

    // In WSL2 with mirrored networking, "localhost" may resolve to ::1 (IPv6)
    // while PostgreSQL only listens on 127.0.0.1 (IPv4).
    // Try the original URL first; if it fails, retry with 127.0.0.1.
    const urlsToTry = [databaseUrl];
    if (databaseUrl.includes("localhost")) {
      urlsToTry.push(databaseUrl.replace("localhost", "127.0.0.1"));
    }

    let client: any = null;
    let connectedUrl = databaseUrl;
    for (const url of urlsToTry) {
      try {
        const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
        await c.connect();
        client = c;
        connectedUrl = url;
        break;
      } catch (e: any) {
        if (url === urlsToTry[urlsToTry.length - 1]) throw e;
      }
    }

    if (connectedUrl !== databaseUrl) {
      console.log(`  ${DIM}(DATABASE_URL uses 'localhost' which resolved to IPv6 — connected via 127.0.0.1)${NC}`);
    }

    const start = Date.now();
    // Basic connectivity
    const versionResult = await client.query("SELECT version()");
    const duration = Date.now() - start;
    const pgVersion = (versionResult.rows[0]?.version as string)?.split(" ").slice(0, 2).join(" ") || "unknown";
    console.log(`  ${GREEN}✓${NC} Connected to ${pgVersion} (${duration}ms)`);

    // Check database name
    const dbResult = await client.query("SELECT current_database()");
    console.log(`  ${GREEN}✓${NC} Database: ${dbResult.rows[0]?.current_database}`);

    // Check pgvector extension
    console.log(`\n${BOLD}[7/7] Checking pgvector extension...${NC}`);
    const extResult = await client.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'",
    );

    if (extResult.rows.length > 0) {
      const ext = extResult.rows[0] as { extname: string; extversion: string };
      console.log(`  ${GREEN}✓${NC} pgvector v${ext.extversion} installed`);
    } else {
      // Check if extension is available but not installed
      const availResult = await client.query(
        "SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector'",
      );
      if (availResult.rows.length > 0) {
        const avail = availResult.rows[0] as { name: string; default_version: string };
        console.log(`  ${YELLOW}!${NC} pgvector v${avail.default_version} available but not installed`);
        console.log(`  ${YELLOW}!${NC} Run: ${BOLD}CREATE EXTENSION vector;${NC}`);
      } else {
        console.log(`  ${RED}✗${NC} pgvector extension not available`);
        console.log(`  ${YELLOW}!${NC} Use the pgvector Docker image: ${BOLD}pgvector/pgvector:pg16${NC}`);
      }
    }

    // Check if massa-ai tables exist (Prisma migrations)
    const tablesResult = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const tables = tablesResult.rows.map((r: { tablename: string }) => r.tablename);
    const expectedTables = ["memories", "memory_edges", "projects", "code_chunks"];
    const foundTables = expectedTables.filter((t) => tables.includes(t));

    if (foundTables.length > 0) {
      console.log(`  ${GREEN}✓${NC} massa-ai tables found: ${foundTables.join(", ")}`);
    } else if (tables.length > 0) {
      console.log(`  ${YELLOW}!${NC} Database has ${tables.length} tables but no massa-ai tables`);
      console.log(`  ${YELLOW}!${NC} Run migrations: ${BOLD}cd packages/core && bunx prisma migrate deploy${NC}`);
    } else {
      console.log(`  ${YELLOW}!${NC} Database is empty (no tables)`);
      console.log(`  ${YELLOW}!${NC} Run migrations: ${BOLD}cd packages/core && bunx prisma migrate deploy${NC}`);
    }

    await client.end();
    pgOk = true;
  } catch (err) {
    const message = (err as Error).message;

    if (message.includes("Cannot find module") || message.includes("Cannot find package")) {
      console.log(`  ${RED}✗${NC} 'pg' module is required but unavailable`);
      console.log(`  ${YELLOW}!${NC} Install dependencies with: bun install`);
    } else if (message.includes("ECONNREFUSED")) {
      console.log(`  ${RED}✗${NC} Connection refused`);
      console.log(`  ${YELLOW}!${NC} Start PostgreSQL: ${BOLD}docker compose up -d postgres${NC}`);
      console.log(`\n${BOLD}[7/7] Checking pgvector extension...${NC}`);
      console.log(`  ${YELLOW}!${NC} Skipped (connection refused)`);
    } else if (message.includes("authentication failed") || message.includes("password")) {
      console.log(`  ${RED}✗${NC} Authentication failed`);
      console.log(`  ${YELLOW}!${NC} Check credentials in DATABASE_URL`);
      console.log(`\n${BOLD}[7/7] Checking pgvector extension...${NC}`);
      console.log(`  ${YELLOW}!${NC} Skipped (auth failed)`);
    } else {
      console.log(`  ${RED}✗${NC} ${message}`);
      console.log(`\n${BOLD}[7/7] Checking pgvector extension...${NC}`);
      console.log(`  ${YELLOW}!${NC} Skipped (connection error)`);
    }
  }

  return pgOk;
}

// ─── Main ────────────────────────────────────────────────────────────

if (import.meta.main) {
  const providerOk = await checkProvider();
  const pgOk = await checkPostgres();

  // Summary
  console.log(
    `\n${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}`,
  );
  console.log(
    `${BOLD}║                    Diagnosis Summary                          ║${NC}`,
  );
  console.log(
    `${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}`,
  );
  console.log(
    `  Inference:  ${providerOk ? `${GREEN}OK${NC}` : `${RED}FAILED${NC}`}`,
  );
  console.log(
    `  PostgreSQL: ${pgOk ? `${GREEN}OK${NC}` : `${RED}FAILED${NC}`}`,
  );
  console.log("");

  const allOk = providerOk && pgOk;
  process.exit(allOk ? 0 : 1);
}
