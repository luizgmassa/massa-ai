/**
 * Keyword Search - PostgreSQL Implementation
 *
 * Uses PostgreSQL full-text search with to_tsvector for FTS capabilities.
 */

import { SearchResult, SearchSource } from "@massa-th0th/shared";
import { logger } from "@massa-th0th/shared";
import { getPgPool } from "../db-connection.js";
import type { Pool } from "pg";
import {
  sanitizeTrigramQuery,
  levenshtein,
  maxEditDistance,
} from "../../services/search/lexical-search.js";

export class KeywordSearchPg {
  private pool: Pool | null = null;
  private initialized = false;
  private trigramAvailable = false;
  // Process-local LRU for fuzzyCorrect (parity with SQLite store).
  private fuzzyCache = new Map<string, string | null>();
  private static readonly FUZZY_CACHE_SIZE = 512;

  constructor() {}

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await getPgPool();
      if (!this.initialized) {
        await this.initTable();
        this.initialized = true;
      }
    }
    return this.pool;
  }

  private async initTable(): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS keyword_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        content_tsvector TSVECTOR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_keyword_project ON keyword_documents(project_id);
      CREATE INDEX IF NOT EXISTS idx_keyword_content_tsvector ON keyword_documents USING GIN(content_tsvector);

      CREATE OR REPLACE FUNCTION update_content_tsvector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.content_tsvector := to_tsvector('english', COALESCE(NEW.content, ''));
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_update_content_tsvector ON keyword_documents;
      CREATE TRIGGER trigger_update_content_tsvector
        BEFORE INSERT OR UPDATE ON keyword_documents
        FOR EACH ROW
        EXECUTE FUNCTION update_content_tsvector();

      -- Vocabulary table for Levenshtein fuzzy correction (PG parity with SQLite).
      CREATE TABLE IF NOT EXISTS keyword_vocabulary (
        word TEXT PRIMARY KEY
      );
    `);

    // pg_trgm extension for trigram similarity. Requires the extension to be
    // available; on managed PG (RDS, etc.) this is usually pre-installed. On
    // failure the trigram stream is disabled and RRF degrades to porter keyword.
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_keyword_content_trgm
        ON keyword_documents USING GIN (content gin_trgm_ops);
      `);
      this.trigramAvailable = true;
    } catch (error) {
      logger.warn(
        'pg_trgm unavailable — trigram RRF stream disabled on PG',
        { err: (error as Error).message },
      );
      this.trigramAvailable = false;
    }

    logger.info('PostgreSQL keyword search initialized', {
      trigram: this.trigramAvailable,
    });
  }

  async add(id: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    const pool = await this.getPool();
    const projectId = metadata?.projectId as string || 'default';

    await pool.query(
      `INSERT INTO keyword_documents (id, project_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [id, projectId, content, JSON.stringify(metadata || {})]
    );

    // Populate vocabulary for fuzzy correction (best-effort; never breaks add).
    try {
      const rawTokens = content.split(/[^a-zA-Z0-9]+/);
      const vocabWords = new Set<string>();
      for (const tok of rawTokens) {
        if (tok.length < 3) continue;
        vocabWords.add(tok.toLowerCase());
        for (const part of tok.split(/(?<=[a-z])(?=[A-Z])/)) {
          if (part.length >= 3) vocabWords.add(part.toLowerCase());
        }
      }
      const unique = [...vocabWords];
      if (unique.length > 0) {
        const values = unique
          .map((_, i) => `($${i + 1})`)
          .join(",");
        await pool.query(
          `INSERT INTO keyword_vocabulary (word)
           VALUES ${values}
           ON CONFLICT (word) DO NOTHING`,
          unique,
        );
      }
    } catch (err) {
      logger.debug('vocabulary population failed (non-fatal)', {
        id,
        err: (err as Error).message,
      });
    }
  }

  // Alias for compatibility
  async index(id: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.add(id, content, metadata);
  }

  async addBatch(documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>): Promise<void> {
    const pool = await this.getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const doc of documents) {
        const projectId = doc.metadata?.projectId as string || 'default';
        await client.query(
          `INSERT INTO keyword_documents (id, project_id, content, metadata)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
          [doc.id, projectId, doc.content, JSON.stringify(doc.metadata || {})]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async search(
    query: string,
    projectId?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const pool = await this.getPool();
    
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^a-z0-9_]/g, ''))
      .filter(t => t.length > 2)
      .map(t => `${t}:*`)
      .join(' | ');

    if (!searchTerms) return [];

    const queryText = projectId
      ? `SELECT id, content, metadata,
           ts_rank_cd(content_tsvector, to_tsquery('english', $1)) as rank
         FROM keyword_documents
         WHERE project_id = $2
           AND content_tsvector @@ to_tsquery('english', $1)
         ORDER BY rank DESC
         LIMIT $3`
      : `SELECT id, content, metadata,
           ts_rank_cd(content_tsvector, to_tsquery('english', $1)) as rank
         FROM keyword_documents
         WHERE content_tsvector @@ to_tsquery('english', $1)
         ORDER BY rank DESC
         LIMIT $2`;
    
    const params = projectId ? [searchTerms, projectId, limit] : [searchTerms, limit];
    
    const { rows } = await pool.query(queryText, params);
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      score: Math.min(1, parseFloat(row.rank) * 2),
      source: SearchSource.KEYWORD,
      metadata: row.metadata,
    }));
  }

  async searchWithFilter(
    query: string,
    filters: {
      userId?: string;
      projectId?: string;
      sessionId?: string;
      type?: string;
    },
    limit: number = 10
  ): Promise<SearchResult[]> {
    const pool = await this.getPool();
    
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^a-z0-9_]/g, ''))
      .filter(t => t.length > 2)
      .map(t => `${t}:*`)
      .join(' | ');

    if (!searchTerms) return [];

    const whereClauses: string[] = ["content_tsvector @@ to_tsquery('english', $1)"];
    const params: any[] = [searchTerms];
    let paramIndex = 2;
    
    if (filters.projectId) {
      whereClauses.push(`project_id = $${paramIndex}`);
      params.push(filters.projectId);
      paramIndex++;
    }
    
    if (filters.userId) {
      whereClauses.push(`metadata->>'userId' = $${paramIndex}`);
      params.push(filters.userId);
      paramIndex++;
    }
    
    if (filters.sessionId) {
      whereClauses.push(`metadata->>'sessionId' = $${paramIndex}`);
      params.push(filters.sessionId);
      paramIndex++;
    }
    
    if (filters.type) {
      whereClauses.push(`metadata->>'type' = $${paramIndex}`);
      params.push(filters.type);
      paramIndex++;
    }
    
    params.push(limit);
    
    const queryText = `
      SELECT id, content, metadata,
        ts_rank_cd(content_tsvector, to_tsquery('english', $1)) as rank
      FROM keyword_documents
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY rank DESC
      LIMIT $${paramIndex}
    `;
    
    const { rows } = await pool.query(queryText, params);

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      score: Math.min(1, parseFloat(row.rank) * 2),
      source: SearchSource.KEYWORD,
      metadata: row.metadata,
    }));
  }

  /**
   * Trigram similarity search using pg_trgm. Returns [] when pg_trgm is
   * unavailable or the sanitized query is empty.
   */
  async searchTrigram(
    query: string,
    filters: { projectId?: string },
    limit: number = 10,
  ): Promise<SearchResult[]> {
    if (!this.trigramAvailable) return [];
    const sanitized = sanitizeTrigramQuery(query, 'OR');
    if (!sanitized) return [];
    const pool = await this.getPool();
    // Drop FTS5-style quoting; pg_trgm uses raw substring via similarity/%.
    const trgmTerm = sanitized.replace(/["']/g, "").split(/\s+(?:OR|AND)\s+/)[0];
    if (!trgmTerm) return [];

    try {
      const text = filters.projectId
        ? `SELECT id, content, metadata,
                  similarity(content, $1) AS sim
           FROM keyword_documents
           WHERE project_id = $2 AND content % $1
           ORDER BY sim DESC
           LIMIT $3`
        : `SELECT id, content, metadata,
                  similarity(content, $1) AS sim
           FROM keyword_documents
           WHERE content % $1
           ORDER BY sim DESC
           LIMIT $2`;
      const params = filters.projectId
        ? [trgmTerm, filters.projectId, limit]
        : [trgmTerm, limit];
      const { rows } = await pool.query(text, params);
      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        score: Math.min(1, parseFloat(row.sim) || 0),
        source: SearchSource.KEYWORD,
        metadata: row.metadata,
      }));
    } catch (error) {
      logger.debug('trigram search failed (non-fatal)', {
        err: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Levenshtein fuzzy correction against keyword_vocabulary. Mirrors the
   * SQLite store's length-bounded, LRU-cached correction.
   */
  async fuzzyCorrect(word: string): Promise<string | null> {
    const w = word.toLowerCase().trim();
    if (w.length < 3) return null;

    if (this.fuzzyCache.has(w)) {
      const cached = this.fuzzyCache.get(w) ?? null;
      this.fuzzyCache.delete(w);
      this.fuzzyCache.set(w, cached);
      return cached;
    }

    const maxDist = maxEditDistance(w.length);
    const pool = await this.getPool();
    let rows: Array<{ word: string }> = [];
    try {
      const res = await pool.query(
        `SELECT word FROM keyword_vocabulary
         WHERE char_length(word) BETWEEN $1 AND $2`,
        [w.length - maxDist, w.length + maxDist],
      );
      rows = res.rows as Array<{ word: string }>;
    } catch (error) {
      logger.debug('fuzzy vocab lookup failed (non-fatal)', {
        err: (error as Error).message,
      });
      return null;
    }

    let bestWord: string | null = null;
    let bestDist = maxDist + 1;
    let exactMatch = false;

    for (const { word: candidate } of rows) {
      if (candidate === w) {
        exactMatch = true;
        break;
      }
      const dist = levenshtein(w, candidate);
      if (dist < bestDist) {
        bestDist = dist;
        bestWord = candidate;
      }
    }

    const result = exactMatch ? null : bestDist <= maxDist ? bestWord : null;

    if (this.fuzzyCache.size >= KeywordSearchPg.FUZZY_CACHE_SIZE) {
      const oldestKey = this.fuzzyCache.keys().next().value;
      if (oldestKey !== undefined) this.fuzzyCache.delete(oldestKey);
    }
    this.fuzzyCache.set(w, result);
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const pool = await this.getPool();
    const result = await pool.query('DELETE FROM keyword_documents WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByProject(projectId: string): Promise<number> {
    const pool = await this.getPool();
    const result = await pool.query('DELETE FROM keyword_documents WHERE project_id = $1', [projectId]);
    return result.rowCount ?? 0;
  }

  async clear(): Promise<void> {
    const pool = await this.getPool();
    await pool.query('DELETE FROM keyword_documents');
    logger.info('Keyword search cleared');
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
    }
  }
}
