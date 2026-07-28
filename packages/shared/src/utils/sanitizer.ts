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
 * Validate email format (basic)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
 */
export function sanitizeFilePath(filePath: string): string {
  // Remove ../ and ..\
  return filePath
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/^\/+/, ''); // Remove leading slashes
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
