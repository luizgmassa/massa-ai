import { Elysia, t } from "elysia";
import {
  loadConfig,
  savePartialConfig,
  maskSensitive,
  restartNeededSections,
} from "@massa-ai/shared";

const CONFIG_DETAIL = {
  tags: ["config"],
};

export const configRoutes = new Elysia({ prefix: "/api/v1/config" })
  .get(
    "/",
    ({ set }) => {
      const config = loadConfig();
      const masked = maskSensitive(config);
      const restart = restartNeededSections(config);
      set.status = 200;
      return {
        success: true as const,
        data: { config: masked, restartNeededSections: restart },
      };
    },
    {
      detail: {
        ...CONFIG_DETAIL,
        summary: "Get current config with sensitive fields masked",
        description:
          "Returns the current config.json with security.apiKey, llm.apiKey, embedding.apiKey, and database.url masked to '***'. Includes restartNeededSections — the subset of [database, embedding, llm, security] present in the config.",
      },
    },
  )
  .put(
    "/",
    ({ body, set }) => {
      const result = savePartialConfig(body as Record<string, unknown>);
      if (!result.success) {
        set.status = 400;
        return {
          success: false as const,
          error: "validation failed",
          details: result.details,
        };
      }
      const masked = maskSensitive(result.config);
      set.status = 200;
      return {
        success: true as const,
        data: { config: masked, restartNeededSections: result.restartNeededSections },
      };
    },
    {
      body: t.Object({}, { additionalProperties: true }),
      detail: {
        ...CONFIG_DETAIL,
        summary: "Update config sections (partial, validated, atomic)",
        description:
          "Accepts one or more top-level config sections. Validates each provided section, backs up to config.json.bak.<timestamp>, merges shallowly per top-level key, writes atomically. Returns the updated masked config + restartNeededSections. A sensitive field equal to '***' preserves the existing value.",
      },
    },
  );