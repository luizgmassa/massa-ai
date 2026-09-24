/** Shared PostgreSQL Prisma client. */
import { logger } from "@massa-ai/shared";
import { requirePostgresDatabaseUrl } from "@massa-ai/shared/config";
import { PrismaClient } from "../generated/prisma/index.js";
import { resolveConnectionTimeoutMs } from "./db-connection.js";

let prismaInstance: PrismaClient | null = null;
let prismaPool: import("pg").Pool | null = null;

/** @internal test seam for adapter-load failures. */
export const _adapters = {
  loadPg(): typeof import("pg") { return require("pg") as typeof import("pg"); },
  loadPrismaPg(): typeof import("@prisma/adapter-pg") { return require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg"); },
};

export function _resetPrismaForTesting(): void { prismaInstance = null; prismaPool = null; }

/** @internal test seam — inspect the underlying pg Pool's construction options. */
export function _getPrismaPoolForTesting(): import("pg").Pool | null { return prismaPool; }

export function getPrismaClient(): PrismaClient {
  if (prismaInstance) return prismaInstance;
  const databaseUrl = requirePostgresDatabaseUrl();
  try {
    const pg = _adapters.loadPg();
    const { PrismaPg } = _adapters.loadPrismaPg();
    // connectionTimeoutMs shares db-connection.ts's DB_CONNECTION_TIMEOUT_MS
    // knob — a hardcoded 5s here was observed timing out this pool's
    // interactive transactions during normal concurrent-reindex load
    // (see db-connection.ts for the incident this fixes).
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: resolveConnectionTimeoutMs(),
    });
    pool.on("error", (error) => logger.error("prisma-client: unexpected PG pool error", error as Error, { poolMax: 10 }));
    prismaPool = pool;
    prismaInstance = new PrismaClient({ adapter: new PrismaPg(pool as any) as any });
    logger.info("Prisma Client initialized with PostgreSQL");
    return prismaInstance;
  } catch (error) {
    throw new Error(`pg and @prisma/adapter-pg are required for PostgreSQL: ${(error as Error).message}`);
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prismaInstance?.$disconnect(); prismaInstance = null;
  await prismaPool?.end(); prismaPool = null;
}
