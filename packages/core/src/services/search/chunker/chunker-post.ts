/**
 * SmartChunker — post-processing + fixed chunker (Wave 6 N31, T15/T16)
 *
 * T15: chunkFixed (needed by markdown/json-yaml fallbacks).
 * T16 will add postProcess, splitOversizedChunk, splitLineByChars.
 */

import type { Chunk, ChunkerConfig } from "./chunker-types.js";

export function chunkFixed(content: string, cfg: ChunkerConfig): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  const size = cfg.fixedChunkSize;

  for (let i = 0; i < lines.length; i += size) {
    const chunkLines = lines.slice(i, Math.min(i + size, lines.length));
    if (chunkLines.some((l) => l.trim())) {
      chunks.push({
        content: chunkLines.join("\n"),
        lineStart: i + 1,
        lineEnd: Math.min(i + size, lines.length),
        type: "fixed",
      });
    }
  }

  return chunks;
}