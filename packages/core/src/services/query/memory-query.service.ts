/**
 * Memory Query Service
 *
 * Service centralizado para consultas em memórias usando Prisma.
 * Usado por MCP Server e Tools API.
 */

import { getPrismaClient } from "./prisma-client.js";

export interface MemoryQueryFilters {
  limit?: number;
  offset?: number;
  type?: string;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  minImportance?: number;
}

export interface MemoryQueryResult {
  memories: any[];
  total: number;
  limit?: number;
  offset?: number;
}

export class MemoryQueryService {
  private prisma = getPrismaClient();

  constructor() {
    // Prisma client singleton configurado com adapter
  }

  private formatMemory(memory: any) {
    return {
      ...memory,
      tags: memory.tags ? JSON.parse(memory.tags) : [],
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    };
  }

  async listMemories(filters: MemoryQueryFilters = {}): Promise<MemoryQueryResult> {
    const {
      limit = 50,
      offset = 0,
      type,
      userId,
      projectId,
      sessionId,
      agentId,
      minImportance = 0,
    } = filters;

    const where: any = {
      importance: { gte: minImportance },
      // Phase 1: never list soft-deleted (tombstoned) memories.
      deletedAt: { equals: null },
      // Phase 1: hide superseded memories (those with an incoming SUPERSEDES edge).
      NOT: { edgesTo: { some: { edgeType: "SUPERSEDES" } } },
    };

    if (type) where.type = type;
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;
    if (sessionId) where.sessionId = sessionId;
    if (agentId) where.agentId = agentId;

    const [memories, total] = await Promise.all([
      this.prisma.memory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.memory.count({ where }),
    ]);

    return {
      memories: memories.map(this.formatMemory),
      total,
      limit,
      offset,
    };
  }

  async getMemoryById(id: string): Promise<any | null> {
    const memory = await this.prisma.memory.findUnique({
      where: { id },
    });

    return memory ? this.formatMemory(memory) : null;
  }

  async getStats() {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const live = { deletedAt: { equals: null } };

    const [total, byType, avgImportance, recentCount] = await Promise.all([
      this.prisma.memory.count({ where: live }),
      this.prisma.memory.groupBy({
        by: ["type"],
        _count: true,
        where: live,
      }),
      this.prisma.memory.aggregate({
        _avg: { importance: true },
        where: live,
      }),
      this.prisma.memory.count({
        where: {
          ...live,
          createdAt: { gt: last24Hours },
        },
      }),
    ]);

    return {
      total,
      byType: byType.map((item: any) => ({
        type: item.type,
        count: item._count,
      })),
      averageImportance: avgImportance._avg.importance || 0,
      last24Hours: recentCount,
    };
  }

  async getRecentMemories(limit: number = 20, hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const memories = await this.prisma.memory.findMany({
      where: { createdAt: { gt: since }, deletedAt: { equals: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return {
      memories: memories.map(this.formatMemory),
      since: since.toISOString(),
    };
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}
