/**
 * Model-profile switch routes (design "Component 4 — MCP surface", first of
 * the three-place contract).
 *
 *   GET  /api/v1/profiles         — profile inventory (listProfiles)
 *   POST /api/v1/profiles/switch  — switch the installed agents to a profile
 *
 * Both routes sit behind the standard `authMiddleware` (AD-011) — they are
 * NOT in `PUBLIC_PATHS`, and `profile_set` mutates files on the machine the
 * server runs on (same local-dev trust model as the executor routes).
 * Responses are always a JSON object returned from the handler (never a bare
 * string) — a bare string body flips the wire content-type to `text/plain`
 * under the node adapter (documented trap; caught only by a real-HTTP test).
 *
 * Every MPS-09 error class the engine can throw is mapped to a structured
 * `{success:false, error:{code,message}}` JSON body with a distinct status
 * code, never a bare 500.
 */

import { Elysia, t } from "elysia";
import {
  listProfiles,
  switchProfile,
  isHost,
  type Host,
  InstallStateError,
  LockError,
} from "@massa-ai/shared";

const PROFILE_DETAIL = {
  tags: ["profiles"],
};

interface NamedError {
  name: string;
  message: string;
}

function isNamedError(e: unknown): e is NamedError {
  return e instanceof Error && typeof e.name === "string";
}

/** Maps every MPS-09 engine error class to an HTTP status. */
function statusFor(err: NamedError): number {
  switch (err.name) {
    case "UnknownProfileError":
      return 400;
    case "NoHostsDetectedError":
      return 404;
    default:
      break;
  }
  if (err instanceof LockError) return 409; // concurrent switch — fail loud, no queueing
  if (err instanceof InstallStateError) return 500; // corrupt/unwritable state — global precondition
  return 500;
}

function errorBody(err: NamedError) {
  return { success: false as const, error: { code: err.name, message: err.message } };
}

function validHost(value: unknown): Host | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && isHost(value)) return value;
  return undefined;
}

export const profileRoutes = new Elysia({ prefix: "/api/v1/profiles" })
  .get(
    "/",
    ({ query, set }) => {
      const hostParam = query.host as string | undefined;
      if (hostParam !== undefined && !isHost(hostParam)) {
        set.status = 400;
        return { success: false, error: { code: "InvalidHostError", message: `unknown host "${hostParam}"` } };
      }
      try {
        const inventory = listProfiles(hostParam ? { hosts: [hostParam as Host] } : {});
        set.status = 200;
        return { success: true, data: inventory };
      } catch (e) {
        const err = isNamedError(e) ? e : ({ name: "Error", message: String(e) } as NamedError);
        set.status = statusFor(err);
        return errorBody(err);
      }
    },
    {
      query: t.Object({ host: t.Optional(t.String()) }),
      detail: {
        ...PROFILE_DETAIL,
        summary: "List shipped profiles + per-host active profile",
        description:
          "Returns the shipped profile names, per-host active profile (from recorded state; 'balanced' shown when unrecorded), and per-host bundle version. Offline — reads on-disk variant directories only, never the registry.",
      },
    },
  )
  .post(
    "/switch",
    ({ body, set }) => {
      const { profile, host, dryRun } = body as { profile: string; host?: string; dryRun?: boolean };
      if (host !== undefined && !isHost(host)) {
        set.status = 400;
        return { success: false, error: { code: "InvalidHostError", message: `unknown host "${host}"` } };
      }
      try {
        const report = switchProfile({ profile, host: validHost(host), dryRun });
        set.status = 200;
        return { success: true, data: report };
      } catch (e) {
        const err = isNamedError(e) ? e : ({ name: "Error", message: String(e) } as NamedError);
        set.status = statusFor(err);
        return errorBody(err);
      }
    },
    {
      body: t.Object({
        profile: t.String({ description: "Target profile name" }),
        host: t.Optional(t.String({ description: "Limit the switch to a single host" })),
        dryRun: t.Optional(t.Boolean({ description: "Print the per-host plan; change nothing" })),
      }),
      detail: {
        ...PROFILE_DETAIL,
        summary: "Switch installed agents to a profile",
        description:
          "Mutates the machine this server runs on: replaces the active installed agent files for every detected, supported host with the chosen profile's variant, and reports per host: switched / skipped (reason) / failed (reason). A session restart is required for the change to take effect. Local trust model — same as the executor routes.",
      },
    },
  );
