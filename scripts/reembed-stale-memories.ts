#!/usr/bin/env bun
/**
 * reembed-stale-memories.ts — re-embed `memories` rows whose stored
 * embedding no longer matches the currently configured embedding
 * dimensions.
 *
 * Track 3 (embedding pin qwen3-embedding:4b, 2560d) context: `memories.embedding`
 * is a raw `Float32Array` byte buffer (see `memory-repository-pg.ts`'s
 * `Buffer.from(new Float32Array(embedding).buffer)`), so a row's dimension
 * count is always `embedding.byteLength / 4`. A stale `embedding.dimensions`
 * beside a re-pulled model (the exact defect Track 3 fixes at the provider
 * layer) leaves old rows embedded at the previous dimensionality even after
 * the config is corrected — those rows are invisible to cosine search against
 * the new dimensionality until they are re-embedded. This script is that
 * one-off backfill, run once after the config fix and `prisma migrate deploy`
 * land (see CLAUDE.md's Track 3 operational sequence).
 *
 * `embedding_cache` is NOT touched here — it is already namespaced by
 * sha256(provider\0model) and length-checked on read, so a dimension change
 * cannot silently serve a stale cached vector.
 *
 * Requires the `@massa-ai/core` package to be built (`bun run build`) since
 * it imports the real Prisma client + embedding-provider selection chain
 * rather than re-implementing either.
 *
 * Usage:
 *   bun scripts/reembed-stale-memories.ts                # re-embed stale rows
 *   bun scripts/reembed-stale-memories.ts --dry-run       # report only, no writes
 *   bun scripts/reembed-stale-memories.ts --batch-size 50
 *   bun scripts/reembed-stale-memories.ts --dimensions 2560  # override auto-detection
 *
 * Exit codes:
 *   0  completed (including "0 stale rows found")
 *   1  a re-embed or update failed for at least one row
 *   2  usage error
 */

/**
 * A row shape wide enough to test the selection predicate below without a
 * database — only the two fields the predicate reads.
 */
export interface StaleCheckRow {
  id: string;
  embedding: Buffer | Uint8Array | null;
}

/**
 * True when `embedding` is present but its dimension count (byteLength / 4,
 * since embeddings are stored as raw Float32 bytes) does not match
 * `configuredDimensions`. A `null` embedding (a memory that was never
 * embedded) is not "stale" in this script's sense — that is a different,
 * pre-existing condition this backfill does not attempt to fix. A byte
 * length that is not a multiple of 4 is also flagged (a corrupt/foreign
 * buffer can never equal any valid dimension count).
 */
export function isEmbeddingStale(
  embedding: Buffer | Uint8Array | null,
  configuredDimensions: number,
): boolean {
  if (!embedding) return false;
  if (embedding.byteLength % 4 !== 0) return true;
  return embedding.byteLength / 4 !== configuredDimensions;
}

/**
 * Filter a page of rows down to the ones this script needs to re-embed.
 * Exported so the selection logic is testable independently of the database
 * connection and the embedding provider.
 */
export function selectStaleMemoryRows<T extends StaleCheckRow>(
  rows: T[],
  configuredDimensions: number,
): T[] {
  return rows.filter((row) => isEmbeddingStale(row.embedding, configuredDimensions));
}

interface Args {
  dryRun: boolean;
  batchSize: number;
  dimensions: number | null;
}

const USAGE = "usage: reembed-stale-memories.ts [-h] [--dry-run] [--batch-size N] [--dimensions N]";

const HELP = `${USAGE}

Re-embed memories.embedding rows whose stored dimension count no longer
matches the currently configured embedding provider's dimensions.

options:
  -h, --help            show this help message and exit
  --dry-run             report stale rows without re-embedding or writing
  --batch-size N        rows fetched per page (default: 100)
  --dimensions N        override the configured-dimensions check instead of
                         asking the live embedding provider`;

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nreembed-stale-memories.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let dryRun = false;
  let batchSize = 100;
  let dimensions: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--batch-size") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --batch-size: expected one argument");
        return null;
      }
      const raw = argv[++i]!;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printUsageError(`argument --batch-size: invalid positive int value: '${raw}'`);
        return null;
      }
      batchSize = parsed;
    } else if (a.startsWith("--batch-size=")) {
      const raw = a.slice("--batch-size=".length);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printUsageError(`argument --batch-size: invalid positive int value: '${raw}'`);
        return null;
      }
      batchSize = parsed;
    } else if (a === "--dimensions") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --dimensions: expected one argument");
        return null;
      }
      const raw = argv[++i]!;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printUsageError(`argument --dimensions: invalid positive int value: '${raw}'`);
        return null;
      }
      dimensions = parsed;
    } else if (a.startsWith("--dimensions=")) {
      const raw = a.slice("--dimensions=".length);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printUsageError(`argument --dimensions: invalid positive int value: '${raw}'`);
        return null;
      }
      dimensions = parsed;
    } else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else {
      printUsageError(`unrecognized arguments: ${a}`);
      return null;
    }
  }

  return { dryRun, batchSize, dimensions };
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args === null) return 2;

  // Dynamic import: keeps `parseArgs`/the exported predicate importable (and
  // unit-testable) without pulling in the real Prisma client / embedding
  // providers, which touch the network and a live database at import time.
  const {
    MemoryRepositoryPg,
    createEmbeddingProvider,
    getPrismaClient,
    disconnectPrisma,
  } = await import("@massa-ai/core");

  // Ensures the connection is live before doing any work, and surfaces a
  // clear error immediately if DATABASE_URL is missing/unreachable.
  getPrismaClient();

  // Created lazily and memoized: a `--dimensions` override + `--dry-run`
  // never needs a live provider at all (pure DB scan, no network touched);
  // every other path creates it once and reuses it for every re-embed call
  // rather than re-running the provider's health check per row.
  type Provider = Awaited<ReturnType<typeof createEmbeddingProvider>>;
  let cachedProvider: Provider | null = null;
  async function getProvider(): Promise<Provider> {
    if (!cachedProvider) cachedProvider = await createEmbeddingProvider({ cache: false });
    return cachedProvider;
  }

  let configuredDimensions: number;
  if (args.dimensions !== null) {
    configuredDimensions = args.dimensions;
    console.log(`[reembed] Using --dimensions override: ${configuredDimensions}`);
  } else {
    const provider = await getProvider();
    configuredDimensions = provider.dimensions;
    console.log(
      `[reembed] Configured provider: ${provider.id} (model: ${provider.model}, dimensions: ${provider.dimensions})`,
    );
  }

  console.log(
    `[reembed] Scanning memories for embeddings whose dimension count != ${configuredDimensions}` +
      (args.dryRun ? " (dry-run, no writes)" : ""),
  );

  const repo = MemoryRepositoryPg.getInstance();

  let offset = 0;
  let scanned = 0;
  let staleFound = 0;
  let reembedded = 0;
  let failed = 0;

  for (;;) {
    const page = await repo.list(args.batchSize, offset);
    if (page.length === 0) break;
    scanned += page.length;

    const stale = selectStaleMemoryRows(page, configuredDimensions);
    staleFound += stale.length;

    for (const row of stale) {
      const gotDimensions = row.embedding ? row.embedding.byteLength / 4 : 0;
      if (args.dryRun) {
        console.log(`[reembed] would re-embed ${row.id} (had ${gotDimensions}d, want ${configuredDimensions}d)`);
        continue;
      }

      try {
        const activeProvider = await getProvider();
        const embedding = await activeProvider.embedQuery(row.content);
        const updated = await repo.update(row.id, { embedding });
        if (updated) {
          reembedded++;
          console.log(`[reembed] re-embedded ${row.id} (${gotDimensions}d -> ${embedding.length}d)`);
        } else {
          failed++;
          console.error(`[reembed] update reported no row for ${row.id} (deleted mid-run?)`);
        }
      } catch (error) {
        failed++;
        console.error(`[reembed] failed to re-embed ${row.id}: ${(error as Error).message}`);
      }
    }

    offset += page.length;
  }

  console.log(
    `[reembed] scanned=${scanned} stale=${staleFound} ` +
      (args.dryRun ? `would_reembed=${staleFound}` : `reembedded=${reembedded} failed=${failed}`),
  );

  await disconnectPrisma();

  return failed > 0 ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[reembed] fatal: ${(error as Error).message}`);
      process.exit(1);
    },
  );
}
