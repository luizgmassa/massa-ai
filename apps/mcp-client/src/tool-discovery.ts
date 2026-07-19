import { createHash } from "node:crypto";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "./tool-definitions.js";

export const TOOL_DISCOVERY_PAGE_SIZE = 100;

type PublicTool = Pick<ToolDefinition, "name" | "description" | "inputSchema">;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function publicTools(registry: ToolDefinition[]): PublicTool[] {
  return registry.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

function registryFingerprint(tools: PublicTool[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(tools)))
    .digest("hex");
}

function invalidCursor(): never {
  throw new McpError(ErrorCode.InvalidParams, "Invalid or stale tools cursor");
}

function encodeCursor(fingerprint: string, offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, fingerprint, offset }), "utf8")
    .toString("base64url");
}

function decodeCursor(cursor: string, fingerprint: string, registrySize: number): number {
  try {
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) invalidCursor();
    const value = JSON.parse(decoded.toString("utf8")) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) invalidCursor();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(",") !== "fingerprint,offset,v" ||
      record.v !== 1 ||
      record.fingerprint !== fingerprint ||
      !Number.isInteger(record.offset) ||
      (record.offset as number) < TOOL_DISCOVERY_PAGE_SIZE ||
      (record.offset as number) % TOOL_DISCOVERY_PAGE_SIZE !== 0 ||
      (record.offset as number) >= registrySize
    ) invalidCursor();
    return record.offset as number;
  } catch (error) {
    if (error instanceof McpError) throw error;
    return invalidCursor();
  }
}

export function pageToolDefinitions(
  registry: ToolDefinition[],
  cursor?: string,
): { tools: PublicTool[]; nextCursor?: string } {
  const tools = publicTools(registry);
  if (tools.length === 0) {
    if (cursor !== undefined) invalidCursor();
    return { tools: [] };
  }

  const fingerprint = registryFingerprint(tools);
  const offset = cursor === undefined
    ? 0
    : decodeCursor(cursor, fingerprint, tools.length);
  const page = tools.slice(offset, offset + TOOL_DISCOVERY_PAGE_SIZE);
  const nextOffset = offset + page.length;
  return nextOffset < tools.length
    ? { tools: page, nextCursor: encodeCursor(fingerprint, nextOffset) }
    : { tools: page };
}
