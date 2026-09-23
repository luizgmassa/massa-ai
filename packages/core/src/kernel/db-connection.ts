/** PostgreSQL connection pool shared by persistence services. */

import { Pool, type PoolConfig } from "pg";
import { logger } from "@massa-ai/shared";
import { requirePostgresDatabaseUrl } from "@massa-ai/shared/config";

export interface DbConfig {
  connectionString: string;
  poolSize: number;
  connectionTimeoutMs: number;
}

let pgPool: Pool | null = null;

export function getDbConfig(): DbConfig {
  return {
    connectionString: requirePostgresDatabaseUrl(),
    poolSize: Number.parseInt(process.env.DB_POOL_SIZE || "10", 10),
    // 5s was tight enough to fail new-connection handshakes under normal
    // concurrent-reindex load on a shared local Postgres (observed:
    // "Connection terminated due to connection timeout" at 97-98% of a
    // ~30min job, with the server otherwise healthy). 15s keeps a real
    // outage detectable without treating routine contention as fatal.
    connectionTimeoutMs: Number.parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "15000", 10),
  };
}

export async function getPgPool(): Promise<Pool> {
  if (pgPool) return pgPool;
  const config = getDbConfig();
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: Number.isFinite(config.poolSize) && config.poolSize > 0 ? config.poolSize : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: Number.isFinite(config.connectionTimeoutMs) && config.connectionTimeoutMs > 0
      ? config.connectionTimeoutMs
      : 15_000,
  };
  pgPool = new Pool(poolConfig);
  logger.info("PostgreSQL pool initialized", { poolSize: poolConfig.max });
  return pgPool;
}

export async function closeConnections(): Promise<void> {
  if (!pgPool) return;
  await pgPool.end();
  pgPool = null;
  logger.info("PostgreSQL pool closed");
}
