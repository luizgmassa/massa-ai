/**
 * Input Sanitizer
 * 
 * Sanitizes user inputs for security
 */

import { config } from '../config/index.js';

/**
 * Sanitize string input
 */
export function sanitizeInput(input: string): string {
  if (!config.get('security').sanitizeInputs) {
    return input;
  }

  const maxLength = config.get('security').maxInputLength;
  
  // Remove potentially dangerous characters
  let sanitized = input
    .replace(/[<>]/g, '') // Remove HTML tags
    // oxlint-disable-next-line no-control-regex -- intentional: stripping control chars is this function's job
    .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control characters
    .slice(0, maxLength); // Enforce max length

  return sanitized;
}

/**
 * Sanitize query for SQL FTS5
 * 
 * Converts space-separated terms to OR logic for better recall.
 * Properly quotes terms that contain special characters.
 * Example: "cn() tailwind merge" -> "cn OR tailwind OR merge"
 * Example: "user-select caret-color" -> '"user-select" OR "caret-color"'
 */
export function sanitizeFTS5Query(query: string): string {
  // Remove parentheses and trim
  const sanitized = query
    .replace(/[()]/g, '') // Remove parentheses
    .trim();
  
  // If empty, return a wildcard or empty string
  if (!sanitized) {
    return '*';
  }
  
  // Split by whitespace and filter empty terms
  const terms = sanitized.split(/\s+/).filter(t => t.length > 0);
  
  // Quote each term and join with OR
  const quotedTerms = terms.map(term => {
    // Escape internal quotes
    const escaped = term.replace(/"/g, '""');
    // Always quote terms to handle special characters safely
    return `"${escaped}"`;
  });
  
  // If only one term, return it quoted
  if (quotedTerms.length === 1) {
    return quotedTerms[0];
  }
  
  // Multiple terms: join with OR for better recall
  return quotedTerms.join(' OR ');
}

/**
 * Validate user ID format
 */
export function isValidUserId(userId: string): boolean {
  // Alphanumeric, underscore, hyphen only
  const userIdRegex = /^[a-zA-Z0-9_-]+$/;
  return userIdRegex.test(userId) && userId.length <= 64;
}

/**
 * Sanitize file path (prevent directory traversal)
 *
 * @param filePath - Untrusted relative path from a tool caller.
 * @returns Path with every `../` / `..\` segment removed and no leading
 *   slashes. Repeated until fixpoint, so overlapping tokens cannot smuggle a
 *   traversal segment through a single pass.
 */
// Why: single-pass removal was bypassable — "....//etc/passwd" collapsed to
//      "../etc/passwd" after one replace (CodeQL
//      js/incomplete-multi-character-sanitization, SEC-4, alert #21). The
//      read_file tool's checkPathContainment still blocked escapes, but this
//      layer must not rely on downstream defense-in-depth.
// Impacts: MCP read_file path handling (read_file.ts).
// Test: bun test packages/shared/src/__tests__/sanitizer.test.ts -t sanitizeFilePath
export function sanitizeFilePath(filePath: string): string {
  let sanitized = filePath;
  while (sanitized.includes("../") || sanitized.includes("..\\")) {
    sanitized = sanitized.replace(/\.\.\//g, "").replace(/\.\.\\/g, "");
  }
  return sanitized.replace(/^\/+/, ""); // Remove leading slashes
}

/**
 * Validate JSON string
 */
export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
