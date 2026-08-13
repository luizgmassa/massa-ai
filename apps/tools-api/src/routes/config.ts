import { Elysia, t } from "elysia";
import {
  loadConfig,
  savePartialConfig,
  maskSensitive,
  restartNeededSections,
  defaultMassaAiConfig,
} from "@massa-ai/shared";

const CONFIG_DETAIL = {
  tags: ["config"],
};

const SENSITIVE_FIELDS: Record<string, string[]> = {
  database: ["url"],
  embedding: ["apiKey"],
  llm: ["apiKey"],
  security: ["apiKey"],
};

function getFieldByPath(config: Record<string, unknown>, section: string, field: string): unknown {
  const sec = config[section];
  if (!sec || typeof sec !== "object") return undefined;
  const parts = field.split(".");
  let val: unknown = sec;
  for (const p of parts) {
    if (val && typeof val === "object") val = (val as Record<string, unknown>)[p];
    else return undefined;
  }
  return val;
}

export const configRoutes = new Elysia({ prefix: "/api/v1/config" })
  .get(
    "/",
    ({ set }) => {
      const config = loadConfig();
      const masked = maskSensitive(config);
      const restart = restartNeededSections(config);
      // WUT-18 (T43): the shipped defaults, masked the same way — lets the
      // Config tab show what is actually in force for a field the persisted
      // file never set, instead of rendering it blank. Computed independently
      // of `config`/`restart` above; those two stay byte-unchanged for a
      // given file (non-goal: do not repurpose restartNeededSections here —
      // its contract is "present in the config", which every default would
      // satisfy vacuously).
      const defaults = maskSensitive(defaultMassaAiConfig);
      set.status = 200;
      return {
        success: true as const,
        data: { config: masked, restartNeededSections: restart, defaults },
      };
    },
    {
      detail: {
        ...CONFIG_DETAIL,
        summary: "Get current config with sensitive fields masked",
        description:
          "Returns the current config.json with security.apiKey, llm.apiKey, embedding.apiKey, and database.url masked to '***'. Includes restartNeededSections — the subset of [database, embedding, llm, security] present in the config — and defaults, the shipped default config (also masked) the Config tab falls back to for any field the persisted file omits.",
      },
    },
  )
  .get(
    "/reveal",
    ({ query, set }) => {
      const section = (query as Record<string, string>).section;
      const field = (query as Record<string, string>).field;
      if (!section || !field) {
        set.status = 400;
        return { success: false as const, error: "section and field query params are required" };
      }
      const allowed = SENSITIVE_FIELDS[section];
      if (!allowed || !allowed.includes(field)) {
        set.status = 400;
        return { success: false as const, error: `field "${section}.${field}" is not a sensitive field` };
      }
      const config = loadConfig() as unknown as Record<string, unknown>;
      const value = getFieldByPath(config, section, field);
      set.status = 200;
      return { success: true as const, data: { section, field, value: value ?? "" } };
    },
    {
      query: t.Object({
        section: t.String(),
        field: t.String(),
      }),
      detail: {
        ...CONFIG_DETAIL,
        summary: "Reveal a single sensitive config field (unmasked)",
        description:
          "Returns the unmasked value for one sensitive field (database.url, embedding.apiKey, llm.apiKey, security.apiKey). Requires API key. Only sensitive fields can be revealed.",
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
        data: {
          config: masked,
          restartNeededSections: result.restartNeededSections,
          // Diff-based (APR-05): only sections whose stored value actually
          // changed in this save — drives the UI's restart proposal banner.
          changedRestartSections: result.changedRestartSections,
        },
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