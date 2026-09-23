import { Elysia, t } from "elysia";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { configDir } from "@massa-ai/shared/config";
import { getDeploymentRoot, deploymentUnavailableMessage } from "./model-registry-deployment.js";

// scripts/lib is outside tools-api's rootDir and is not copied into the
// production Docker image (only apps/ + packages/ are). We use a dynamic
// require with a non-literal path so the bundler (bun build) treats it as
// external and leaves it for runtime resolution. In the deployed image the
// route is not exercised (admin-portal is a local-operator surface); locally
// and in tests the path resolves to the dev checkout. Lazy: resolved on first
// call, so mock.module() in tests can intercept before this runs. Every
// caller checks getDeploymentRoot() first and returns 501 before reaching
// this, so the throw below is a defensive backstop, not the primary path.
let _profilesLib: Record<string, unknown> | null = null;
function profilesLib(): Record<string, unknown> {
  if (!_profilesLib) {
    const root = getDeploymentRoot();
    if (!root) {
      throw new Error(deploymentUnavailableMessage("scripts/lib/model-profiles.ts"));
    }
    const libPath = path.join(root, "scripts", "lib", "model-profiles.ts");
    _profilesLib = (typeof require === "function" ? require : (globalThis as any).require)(libPath);
  }
  return _profilesLib!;
}

// Same lazy dynamic-require pattern as profilesLib() above, for the same reasons: the
// generator lives outside tools-api's rootDir, is not copied into the production Docker
// image, and the non-literal require path keeps the bundler from trying to resolve it at
// build time. Reuses the generator's own real charter parser (loadAllCharters) rather than
// a second frontmatter parser that could drift from it (design D-3).
let _generatorLib: Record<string, unknown> | null = null;
function generatorLib(): Record<string, unknown> {
  if (!_generatorLib) {
    const root = getDeploymentRoot();
    if (!root) {
      throw new Error(deploymentUnavailableMessage("scripts/generate-subagent-artifacts.ts"));
    }
    const libPath = path.join(root, "scripts", "generate-subagent-artifacts.ts");
    _generatorLib = (typeof require === "function" ? require : (globalThis as any).require)(libPath);
  }
  return _generatorLib!;
}

/**
 * Best-effort `agents` inventory for the Model Catalog's per-agent overrides table
 * (spec AC6). A plain charter-directory scan (`scanCharterNames`, the same inventory the
 * generator itself uses) rather than a full charter parse — the UI only needs names. Any
 * throw — missing checkout, an unreadable directory — degrades to an empty list plus
 * `agentsError` rather than failing the GET; the caller has already run the shared 501
 * off-checkout gate before this is reached, so this is a second, narrower failure surface
 * on top of that one.
 */
async function loadAgentsInventory(): Promise<{
  agents: Array<{ name: string }>;
  agentsError?: string;
}> {
  try {
    const gen = generatorLib();
    const names = (await (gen.scanCharterNames as () => Promise<string[]>)()) as string[];
    return { agents: names.map((name) => ({ name })) };
  } catch (e) {
    return { agents: [], agentsError: (e as Error).message };
  }
}

const ALLOWED_OVERLAY_KEYS = new Set(["models", "profiles"]);
const LEGACY_OVERLAY_KEYS = new Set(["tiers", "hostDefaults", "workflowTiers", "agentTiers"]);

/**
 * AC1/AC9: a v1-shaped PUT body (the four removed registry keys) is rejected outright
 * rather than silently merged and dropped — `mergeOverlay` only reads `overlay.models`/
 * `overlay.profiles`, so an unrecognized top-level key would otherwise vanish without
 * telling the operator their edit did nothing.
 */
function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function overlayShapeViolations(overlay: Record<string, unknown>): string[] {
  const violations: string[] = [];
  for (const key of Object.keys(overlay)) {
    if (ALLOWED_OVERLAY_KEYS.has(key)) continue;
    violations.push(
      LEGACY_OVERLAY_KEYS.has(key)
        ? `overlay key "${key}" is a v1 registry key removed in v2 — only "models" and "profiles" are supported overlay sections`
        : `overlay has unknown top-level key "${key}" — only "models" and "profiles" are supported`,
    );
  }
  // A non-object profile entry is silently skipped by mergeOverlay (isOverlayProfile guard),
  // so without this check it never reaches validateRegistry and the write would succeed with
  // dead cruft persisted to the overlay file (profiles have no null tombstone — that is what
  // `_delete: true` is for).
  if (isPlainObj(overlay.profiles)) {
    for (const [name, val] of Object.entries(overlay.profiles)) {
      if (!isPlainObj(val)) {
        violations.push(`overlay.profiles.${name} must be an object, got ${JSON.stringify(val)}`);
      }
    }
  }
  // A models entry may legitimately be `null` (tombstone); anything else non-object is rejected
  // here rather than left to surface as a confusing "is not an object" error deep inside the
  // merged registry's validation output.
  if (isPlainObj(overlay.models)) {
    for (const [id, val] of Object.entries(overlay.models)) {
      if (val !== null && !isPlainObj(val)) {
        violations.push(`overlay.models.${id} must be an object or null (tombstone), got ${JSON.stringify(val)}`);
      }
    }
  }
  return violations;
}

const REGISTRY_DETAIL = {
  tags: ["model-registry"],
};

const OVERLAY_PATH = path.join(configDir("massa-ai"), "model-profiles.json");

// WUT-17: mirrors scripts/lib/model-profiles.ts's zeroBreakdown() shape — this route reaches
// the lib only through the dynamic-require profilesLib() above, so the zero fallback below
// (matching the existing `?? 0` pattern for overlayOverrideCount) cannot import the type.
const ZERO_OVERLAY_OVERRIDE_BREAKDOWN = {
  models: 0,
  profiles: 0,
} as const;

export const modelRegistryRoutes = new Elysia({ prefix: "/api/v1/model-registry" })
  .get(
    "/",
    async ({ set }) => {
      const root = getDeploymentRoot();
      if (!root) {
        set.status = 501;
        return { success: false as const, error: deploymentUnavailableMessage("scripts/lib/model-profiles.ts") };
      }
      const lib = profilesLib();
      const result = (lib.loadEffectiveRegistry as (opts?: { overlayPath?: string }) => any)({ overlayPath: OVERLAY_PATH });
      const { agents, agentsError } = await loadAgentsInventory();
      set.status = 200;
      return {
        success: true as const,
        data: {
          registry: result.registry,
          source: result.source,
          overlayOverrideCount: result.overlayOverrideCount ?? 0,
          overlayOverrideBreakdown: result.overlayOverrideBreakdown ?? ZERO_OVERLAY_OVERRIDE_BREAKDOWN,
          ...(result.overlayError ? { overlayError: result.overlayError } : {}),
          ...(result.v1BackupPath ? { v1BackupPath: result.v1BackupPath } : {}),
          agents,
          ...(agentsError ? { agentsError } : {}),
        },
      };
    },
    {
      detail: {
        ...REGISTRY_DETAIL,
        summary: "Get effective registry (builtin + overlay) with source attribution",
        description:
          "Returns the merged v2 registry (builtin + overlay: models catalog + profiles, each profile carrying a per-host default cell and optional per-agent overrides), source attribution (builtin, overlay, tombstoned), overlayOverrideCount (count of overlay entries surviving normalization, so an operator can see how much of the registry their overlay is overriding), overlayOverrideBreakdown (the same count broken down per category: models, profiles), overlayError if the overlay is corrupted, and agents (spec AC6 — {name} for every charter under skills/agents/, from a directory scan, best-effort with agentsError on failure) (200 status, never fails).",
      },
    },
  )
  .put(
    "/",
    ({ body, set }) => {
      const root = getDeploymentRoot();
      if (!root) {
        set.status = 501;
        return { success: false as const, error: deploymentUnavailableMessage("scripts/lib/model-profiles.ts") };
      }
      const lib = profilesLib();
      const overlay = body as Record<string, unknown>;

      const shapeViolations = overlayShapeViolations(overlay);
      if (shapeViolations.length > 0) {
        set.status = 400;
        return {
          success: false as const,
          error: "validation failed",
          details: shapeViolations,
        };
      }

      const builtin = (lib.loadRegistry as (file?: string) => any)(lib.DEFAULT_REGISTRY_PATH as string);
      const merged = (lib.mergeOverlay as (b: unknown, o: unknown) => Record<string, unknown>)(
        builtin,
        overlay,
      );

      try {
        (lib.validateRegistry as (raw: unknown) => void)(merged);
      } catch (e) {
        if (e instanceof (lib.RegistryValidationError as any)) {
          set.status = 400;
          return {
            success: false as const,
            error: "validation failed",
            details: (e as any).violations as string[],
          };
        }
        throw e;
      }

      try {
        writeOverlayAtomically(OVERLAY_PATH, overlay);
      } catch (e) {
        set.status = 500;
        return {
          success: false as const,
          error: `overlay write failed: ${(e as Error).message}`,
        };
      }

      const result = (lib.loadEffectiveRegistry as (opts?: { overlayPath?: string }) => any)({ overlayPath: OVERLAY_PATH });
      set.status = 200;
      return {
        success: true as const,
        data: {
          registry: result.registry,
          source: result.source,
          overlayOverrideCount: result.overlayOverrideCount ?? 0,
          overlayOverrideBreakdown: result.overlayOverrideBreakdown ?? ZERO_OVERLAY_OVERRIDE_BREAKDOWN,
        },
      };
    },
    {
      body: t.Object({}, { additionalProperties: true }),
      detail: {
        ...REGISTRY_DETAIL,
        summary: "Write overlay (full-replace, validated, atomic)",
        description:
          "Accepts the full v2 overlay object ({models?, profiles?} only — a v1 top-level key (tiers/hostDefaults/workflowTiers/agentTiers) or any other unknown key is rejected outright with 400 before merging). Validates the merged result (builtin + overlay) via validateRegistry(). On success, writes atomically to ~/.config/massa-ai/model-profiles.json and returns the updated effective registry, including overlayOverrideCount and overlayOverrideBreakdown (per-category: models, profiles). On failure, returns 400 with all violations.",
      },
    },
  )
  .post(
    "/regenerate",
    ({ set }) => {
      const root = getDeploymentRoot();
      if (!root) {
        set.status = 501;
        return { success: false as const, error: deploymentUnavailableMessage("scripts/generate-subagent-artifacts.ts") };
      }
      const generateScript = path.join(root, "scripts", "generate-subagent-artifacts.ts");
      try {
        const child = spawnSync("bun", [generateScript], {
          env: { ...process.env },
          stdio: ["pipe", "pipe", "pipe"],
        }) as unknown as { exitCode: number | null; stderr?: { toString(): string } };

        if (child.exitCode !== 0) {
          set.status = 500;
          return {
            success: false as const,
            error: `regeneration failed (exit ${child.exitCode}): ${child.stderr?.toString().trim()}`,
          };
        }

        set.status = 200;
        return {
          success: true as const,
          data: { regenerated: true },
        };
      } catch (e) {
        set.status = 500;
        return {
          success: false as const,
          error: `regeneration error: ${(e as Error).message}`,
        };
      }
    },
    {
      detail: {
        ...REGISTRY_DETAIL,
        summary: "Regenerate subagent artifacts (spawn child process)",
        description:
          "Spawns `bun scripts/generate-subagent-artifacts.ts` as a child process with inherited env. Returns {regenerated:true} on success or 500 on non-zero exit. Does not switch profiles.",
      },
    },
  )
  .delete(
    "/overlay",
    ({ set }) => {
      const root = getDeploymentRoot();
      if (!root) {
        set.status = 501;
        return { success: false as const, error: deploymentUnavailableMessage("scripts/lib/model-profiles.ts") };
      }
      const lib = profilesLib();
      try {
        if (fs.existsSync(OVERLAY_PATH)) {
          fs.unlinkSync(OVERLAY_PATH);
        }
        const builtin = (lib.loadRegistry as (file?: string) => any)(lib.DEFAULT_REGISTRY_PATH as string);
        set.status = 200;
        return {
          success: true as const,
          data: {
            registry: builtin,
            source: { builtin, overlay: null, tombstoned: [] },
          },
        };
      } catch (e) {
        set.status = 500;
        return {
          success: false as const,
          error: `failed to delete overlay: ${(e as Error).message}`,
        };
      }
    },
    {
      detail: {
        ...REGISTRY_DETAIL,
        summary: "Delete overlay (reset to built-in)",
        description:
          "Deletes the overlay file at ~/.config/massa-ai/model-profiles.json and returns the builtin registry.",
      },
    },
  );

function writeOverlayAtomically(overlayPath: string, data: unknown): void {
  const dir = path.dirname(overlayPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${overlayPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, overlayPath);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best effort
    }
    throw e;
  }
}