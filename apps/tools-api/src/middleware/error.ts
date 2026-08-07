/**
 * Error Handler Middleware
 *
 * Captura erros não tratados e retorna JSON padronizado.
 */

import { Elysia } from "elysia";
import { SearchServiceError, safeErrorSummary } from "@massa-ai/core";
import { logger } from "@massa-ai/shared";

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  ({ code, error, set, path, request }) => {
    // No raw Error object passed to the logger: logger.error() would embed its
    // unscrubbed `error.message` verbatim. safeErrorSummary() is the only
    // source of the message field here, so credential-shaped substrings never
    // reach the log sink.
    logger.error("[massa-ai-api] Request failed", undefined, {
      ...safeErrorSummary(error),
      code,
      path,
      method: request.method,
    });

    if (error instanceof SearchServiceError) {
      set.status = error.statusCode;
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          component: error.component,
        },
      };
    }

    // Elysia body/query/param validation + parse failures (framework code,
    // 422-ish). Return a typed, sanitized envelope — never INTERNAL_ERROR for
    // a client mistake, never TypeBox internals (spec req 9 pattern).
    if (code === "VALIDATION" || code === "PARSE") {
      set.status = 400;
      return {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "The request failed validation",
        },
      };
    }

    // Unmatched route (framework code) — distinct from a 500 so clients can
    // tell "nothing here" from "the server broke".
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      };
    }

    // Default to 500 if no status set
    if (!set.status || set.status === 200) {
      set.status = 500;
    }

    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    };
  },
).as("global");
