/**
 * Graph Store Factory
 *
 * Provides a unified `IGraphStore` implementation based on database
 * configuration. Consumers call `getGraphStore()` and receive a
 * backend-agnostic store — they never depend on the concrete SQLite or
 * PostgreSQL class (structural gap #14).
 */

import { GraphStore } from "./graph-store.js";
import { GraphStorePg } from "./graph-store-pg.js";
import type { IGraphStore } from "./types.js";
import { logger } from "@massa-th0th/shared";

let cachedStore: IGraphStore | null = null;

export function getGraphStore(): IGraphStore {
  if (cachedStore) return cachedStore;

  const dbType = process.env.DATABASE_URL?.startsWith('postgresql') ? 'postgres' : 'sqlite';

  if (dbType === 'postgres') {
    cachedStore = GraphStorePg.getInstance();
    logger.info('Using PostgreSQL graph store');
  } else {
    cachedStore = GraphStore.getInstance();
    logger.info('Using SQLite graph store');
  }

  return cachedStore;
}

export async function resetGraphStore(): Promise<void> {
  if (cachedStore) {
    try {
      await cachedStore.clear();
    } catch {
      // Defensive: never block a reset on a clear failure.
    }
    cachedStore = null;
  }
}
