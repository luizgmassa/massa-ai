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

const REGISTRY_DETAIL = {
  tags: ["model-registry"],
};

const OVERLAY_PATH = path.join(configDir("massa-ai"), "model-profiles.json");

export const modelRegistryRoutes = new Elysia({ prefix: "/api/v1/model-registry" })
  .get(
    "/",
    ({ set }) => {
      const root = getDeploymentRoot();
      if (!root) {
        set.status = 501;
        return { success: false as const, error: deploymentUnavailableMessage("scripts/lib/model-profiles.ts") };
      }
      const lib = profilesLib();
      const result = (lib.loadEffectiveRegistry as (opts?: { overlayPath?: string }) => any)({ overlayPath: OVERLAY_PATH });
      set.status = 200;
      return {
        success: true as const,
        data: {
          registry: result.registry,
          source: result.source,
          overlayOverrideCount: result.overlayOverrideCount ?? 0,
          ...(result.overlayError ? { overlayError: result.overlayError } : {}),
        },
      };
    },
    {
      detail: {
        ...REGISTRY_DETAIL,
        summary: "Get effective registry (builtin + overlay) with source attribution",
        description:
          "Returns the merged registry (builtin + overlay), source attribution (builtin, overlay, tombstoned), overlayOverrideCount (APCR-01.10 — count of overlay entries surviving normalization, so an operator can see how much of the registry their overlay is overriding), and overlayError if the overlay is corrupted (200 status, never fails).",
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
        },
      };
    },
    {
      body: t.Object({}, { additionalProperties: true }),
      detail: {
        ...REGISTRY_DETAIL,
        summary: "Write overlay (full-replace, validated, atomic)",
        description:
          "Accepts the full overlay object. Validates the merged result (builtin + overlay) via validateRegistry(). On success, writes atomically to ~/.config/massa-ai/model-profiles.json and returns the updated effective registry, including overlayOverrideCount (APCR-01.10). On failure, returns 400 with all violations.",
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