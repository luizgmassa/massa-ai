/**
 * Graph Store — PostgreSQL implementation.
 *
 * CRUD operations for memory edges in the knowledge graph using Prisma ORM.
 * Natively async.
 *
 * Implements the backend-agnostic `IGraphStore` contract (structural gap #14).
 * Method names are normalized to match the SQLite store so `getGraphStore()`
 * can return an `IGraphStore` without backend-specific dispatch.
 */

import { getPrismaClient } from "../query/prisma-client.js";
import {
  MemoryEdge,
  MemoryRelationType,
  logger,
} from "@massa-th0th/shared";
import type { PrismaClient } from "../../generated/prisma/index.js";
import type { EdgeCreateInput, EdgeFilter, IGraphStore } from "./types.js";

/**
 * Lazily-initialized Prisma client proxy.
 *
 * The original `const prisma = getPrismaClient()` ran at module-eval, which
 * forced every importer of this module (transitively, of graph-store-factory)
 * to construct a Prisma client — and that throws in environments where the
 * PG/Bun-SQLite prisma adapter isn't installed (e.g. SQLite-only test/dev).
 * The Proxy defers construction to first actual use, so merely importing the
 * module is side-effect-free.
 */
const prisma: PrismaClient = new Proxy(
  {} as PrismaClient,
  {
    get(_target, prop) {
      const client = getPrismaClient();
      const value = Reflect.get(client, prop);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

export class GraphStorePg implements IGraphStore {
  private static instance: GraphStorePg | null = null;

  static getInstance(): GraphStorePg {
    if (!GraphStorePg.instance) {
      GraphStorePg.instance = new GraphStorePg();
    }
    return GraphStorePg.instance;
  }

  constructor() {
    logger.info("GraphStorePg initialized (PostgreSQL)");
  }

  // ── CRUD ──────────────────────────────────────────────────────

  /**
   * Create a new edge between two memories.
   * Automatically updates weight if edge already exists.
   *
   * Accepts the canonical `EdgeCreateInput` (single object) so it satisfies
   * `IGraphStore.createEdge` exactly like the SQLite store.
   */
  async createEdge(edge: EdgeCreateInput): Promise<MemoryEdge | null> {
    if (edge.sourceId === edge.targetId) {
      logger.warn("Cannot create self-referencing edge", { sourceId: edge.sourceId });
      return null;
    }

    // Parse evidence string to JSON if provided, otherwise null
    let metadataJson = null;
    if (edge.evidence) {
      try {
        metadataJson = JSON.parse(edge.evidence);
      } catch {
        // If parsing fails, store the string as-is in a wrapper object
        metadataJson = { evidence: edge.evidence };
      }
    }

    const result = await prisma.memoryEdge.upsert({
      where: {
        fromId_toId_edgeType: {
          fromId: edge.sourceId,
          toId: edge.targetId,
          edgeType: edge.relationType,
        },
      },
      create: {
        fromId: edge.sourceId,
        toId: edge.targetId,
        edgeType: edge.relationType,
        weight: edge.weight || 1.0,
        metadata: metadataJson,
      },
      update: {
        weight: edge.weight || 1.0,
        metadata: metadataJson,
      },
    });

    return {
      id: result.id.toString(),
      sourceId: result.fromId,
      targetId: result.toId,
      relationType: result.edgeType as MemoryRelationType,
      weight: result.weight,
      evidence: result.metadata ? JSON.stringify(result.metadata) : undefined,
      autoExtracted: false, // PostgreSQL doesn't store this field yet
      createdAt: result.createdAt,
    };
  }

  /**
   * Get edge by (sourceId, targetId, relationType) triple.
   * IGraphStore-conformant alias; the PG schema stores edges by from/to/type.
   */
  async getEdge(
    sourceId: string,
    targetId: string,
    relationType: MemoryRelationType,
  ): Promise<MemoryEdge | null> {
    const edge = await prisma.memoryEdge.findFirst({
      where: {
        fromId: sourceId,
        toId: targetId,
        edgeType: relationType,
      },
    });

    if (!edge) return null;

    return {
      id: edge.id.toString(),
      sourceId: edge.fromId,
      targetId: edge.toId,
      relationType: edge.edgeType as MemoryRelationType,
      weight: edge.weight,
      evidence: edge.metadata ? JSON.stringify(edge.metadata) : undefined,
      autoExtracted: false,
      createdAt: edge.createdAt,
    };
  }

  /**
   * Find edges matching filters.
   * Kept as a non-contract helper (contract callers use getAllEdges).
   */
  async findEdges(filter: EdgeFilter): Promise<MemoryEdge[]> {
    const where: any = {};

    if (filter.sourceId) {
      where.fromId = filter.sourceId;
    }

    if (filter.targetId) {
      where.toId = filter.targetId;
    }

    if (filter.relationTypes && filter.relationTypes.length > 0) {
      where.edgeType = { in: filter.relationTypes };
    }

    if (filter.minWeight !== undefined) {
      where.weight = { gte: filter.minWeight };
    }

    const edges = await prisma.memoryEdge.findMany({
      where,
      orderBy: { weight: 'desc' },
      take: filter.limit || 100,
    });

    return edges.map(edge => ({
      id: edge.id.toString(),
      sourceId: edge.fromId,
      targetId: edge.toId,
      relationType: edge.edgeType as MemoryRelationType,
      weight: edge.weight,
      evidence: edge.metadata ? JSON.stringify(edge.metadata) : undefined,
      autoExtracted: false,
      createdAt: edge.createdAt,
    }));
  }

  /**
   * Get all edges from a source memory.
   * Not on the contract; used internally by bfsNeighbors.
   */
  async getOutgoingEdges(sourceId: string, limit: number = 100): Promise<MemoryEdge[]> {
    return this.findEdges({ sourceId, limit });
  }

  /**
   * Get all edges to a target memory.
   */
  async getIncomingEdges(targetId: string, limit: number = 100): Promise<MemoryEdge[]> {
    return this.findEdges({ targetId, limit });
  }

  /**
   * Phase 7c: async BFS over outgoing edges (mirror of GraphStore.bfsNeighbors).
   */
  async bfsNeighbors(seedIds: string[], depth: number): Promise<string[]> {
    const d = Math.max(1, Math.floor(depth));
    const visited = new Set<string>(seedIds);
    const out = new Set<string>();
    let frontier: string[] = seedIds.filter((id) => id != null && id !== "");

    for (let hop = 0; hop < d && frontier.length > 0; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        try {
          const edges = await this.getOutgoingEdges(id);
          for (const e of edges) {
            const t = e.targetId;
            if (!visited.has(t)) {
              visited.add(t);
              out.add(t);
              next.push(t);
            }
          }
        } catch {
          // Defensive: a single broken seed never aborts the whole BFS.
        }
      }
      frontier = next;
    }
    return [...out];
  }

  /**
   * Get all edges connected to a memory (both incoming and outgoing).
   * IGraphStore-conformant; replaces the legacy `getConnectedEdges` name.
   */
  async getAllEdges(memoryId: string, filter?: EdgeFilter): Promise<MemoryEdge[]> {
    const edges = await prisma.memoryEdge.findMany({
      where: {
        OR: [
          { fromId: memoryId },
          { toId: memoryId },
        ],
      },
      orderBy: { weight: 'desc' },
      take: filter?.limit || 100,
    });

    return edges.map(edge => ({
      id: edge.id.toString(),
      sourceId: edge.fromId,
      targetId: edge.toId,
      relationType: edge.edgeType as MemoryRelationType,
      weight: edge.weight,
      evidence: edge.metadata ? JSON.stringify(edge.metadata) : undefined,
      autoExtracted: false,
      createdAt: edge.createdAt,
    }));
  }

  /**
   * Update edge weight (set). IGraphStore-conformant alias for updateEdgeWeight.
   */
  async updateWeight(id: string, weight: number): Promise<boolean> {
    return this.updateEdgeWeight(id, weight);
  }

  /**
   * Legacy alias kept for callers that used the PG-specific name.
   */
  async updateEdgeWeight(id: string, weight: number): Promise<boolean> {
    try {
      await prisma.memoryEdge.update({
        where: { id: parseInt(id) },
        data: { weight },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomically increment edge weight by delta, capped at maxWeight.
   * IGraphStore-conformant; PG implementation uses a read-modify-write
   * guarded by the unique (fromId,toId,edgeType) constraint.
   */
  async incrementEdgeWeight(
    sourceId: string,
    targetId: string,
    relationType: MemoryRelationType,
    delta: number,
    maxWeight = 1.0,
  ): Promise<boolean> {
    const existing = await this.getEdge(sourceId, targetId, relationType);
    if (!existing) return false;
    const newWeight = Math.min(maxWeight, existing.weight + delta);
    return this.updateEdgeWeight(existing.id, newWeight);
  }

  /**
   * Delete an edge by ID.
   */
  async deleteEdge(id: string): Promise<boolean> {
    try {
      await prisma.memoryEdge.delete({
        where: { id: parseInt(id) },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all edges connected to a memory.
   * IGraphStore-conformant alias; replaces the legacy `deleteEdgesByMemory` name.
   */
  async deleteEdgesForMemory(memoryId: string): Promise<number> {
    const result = await prisma.memoryEdge.deleteMany({
      where: {
        OR: [
          { fromId: memoryId },
          { toId: memoryId },
        ],
      },
    });

    return result.count;
  }

  /**
   * Legacy alias kept for callers that used the PG-specific name.
   */
  async deleteEdgesByMemory(memoryId: string): Promise<number> {
    return this.deleteEdgesForMemory(memoryId);
  }

  /**
   * Batch create edges.
   */
  async batchCreateEdges(edges: EdgeCreateInput[]): Promise<number> {
    const results = await Promise.all(
      edges.map(edge => this.createEdge(edge))
    );
    return results.length;
  }

  // ── Analytics ──────────────────────────────────────────────────

  /**
   * Degree centrality for a memory (in + out + total).
   * IGraphStore-conformant.
   */
  async getDegree(memoryId: string): Promise<{ in: number; out: number; total: number }> {
    const outCount = await prisma.memoryEdge.count({ where: { fromId: memoryId } });
    const inCount = await prisma.memoryEdge.count({ where: { toId: memoryId } });
    return { in: inCount, out: outCount, total: inCount + outCount };
  }

  /**
   * Find memories with the most connections (hub nodes).
   * IGraphStore-conformant. Uses raw grouping since Prisma has no direct
   * UNION+GROUP BY helper; falls back to client-side aggregation over a
   * bounded scan.
   */
  async getHubMemories(limit: number = 10): Promise<{ memoryId: string; degree: number }[]> {
    const edges = await prisma.memoryEdge.findMany({
      select: { fromId: true, toId: true },
      take: 5000,
    });
    const counts = new Map<string, number>();
    for (const e of edges) {
      counts.set(e.fromId, (counts.get(e.fromId) ?? 0) + 1);
      counts.set(e.toId, (counts.get(e.toId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([memoryId, degree]) => ({ memoryId, degree }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, limit);
  }

  /**
   * Get statistics about the graph.
   * IGraphStore-conformant alias for getGraphStats, normalizing the return
   * shape to match the SQLite store (byRelation/autoExtracted/avgWeight).
   */
  async getStats(): Promise<{
    totalEdges: number;
    byRelation: Record<string, number>;
    autoExtracted: number;
    avgWeight: number;
  }> {
    const totalEdges = await prisma.memoryEdge.count();

    const edgesByTypeRaw = await prisma.memoryEdge.groupBy({
      by: ['edgeType'],
      _count: { edgeType: true },
    });

    const byRelation: Record<string, number> = {};
    for (const group of edgesByTypeRaw) {
      byRelation[group.edgeType] = group._count.edgeType;
    }

    const avgWeightResult = await prisma.memoryEdge.aggregate({
      _avg: { weight: true },
    });

    return {
      totalEdges,
      byRelation,
      // PG schema doesn't track auto-extraction yet; report 0 for parity.
      autoExtracted: 0,
      avgWeight: avgWeightResult._avg.weight || 0,
    };
  }

  /**
   * Find paths between two memories (BFS, up to maxDepth)
   */
  async findPaths(
    fromId: string,
    toId: string,
    maxDepth: number = 3
  ): Promise<Array<{ path: string[]; weight: number }>> {
    // For PostgreSQL, we can use recursive CTE
    const result = await prisma.$queryRaw<Array<{ path: string; total_weight: number }>>`
      WITH RECURSIVE paths AS (
        -- Base case: direct edges
        SELECT
          from_id,
          to_id,
          ARRAY[from_id, to_id]::text[] as path,
          weight as total_weight,
          1 as depth
        FROM memory_edges
        WHERE from_id = ${fromId}

        UNION

        -- Recursive case: extend paths
        SELECT
          p.from_id,
          e.to_id,
          p.path || e.to_id,
          p.total_weight * e.weight,
          p.depth + 1
        FROM paths p
        JOIN memory_edges e ON p.to_id = e.from_id
        WHERE e.to_id != ALL(p.path)  -- Avoid cycles
          AND p.depth < ${maxDepth}
      )
      SELECT
        array_to_string(path, ',') as path,
        total_weight
      FROM paths
      WHERE to_id = ${toId}
      ORDER BY total_weight DESC
      LIMIT 10
    `;

    return result.map(row => ({
      path: row.path.split(','),
      weight: row.total_weight,
    }));
  }

  /**
   * Clear all edges (for testing)
   */
  async clear(): Promise<void> {
    await prisma.memoryEdge.deleteMany();
    logger.info("GraphStore cleared");
  }
}

export const graphStorePg = GraphStorePg.getInstance();
