/**
 * T7 / SEC-06 — Docker remote-address probe.
 *
 * TASK-000 established that `ctx.request.ip` is the only readable source of a
 * caller's address under `adapter: node()`, and that it reports the *true*
 * peer. design.md's `web-ui.ts` component then recorded an open consequence:
 * `docker-compose.yml` publishes the API through a bridge port mapping, so a
 * host browser should present a bridge-gateway address rather than loopback,
 * which is why `MASSA_AI_WEB_UI_TRUST_LOCAL` exists at all. That was a
 * confirmed mechanism with an *unmeasured value* — reasoned from how Docker
 * networking works, never observed.
 *
 * This is the instrument that observes it. It is deliberately not the API
 * image: the address a request presents is a property of the network path and
 * of srvx's `NodeRequest.ip` getter, not of any route in this repo, and the
 * API image needs PostgreSQL, migrations and Ollama before it will answer
 * anything. Pinning the same elysia + @elysiajs/node majors the API uses keeps
 * the measured mechanism identical.
 *
 * Run through scripts/tests/test-docker-remote-address.sh — never directly.
 */

import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const PORT = Number(process.env.PROBE_PORT ?? 3333);

new Elysia({ adapter: node() })
  .get("/whoami", (ctx) => {
    // Same read the real trust check performs in
    // apps/tools-api/src/web-ui-trust.ts. `ip` is an undocumented srvx
    // implementation detail, so it is typed defensively here for the same
    // reason the production code is: a dependency bump can remove it, and the
    // probe must report that as `null` rather than crash.
    const ip = (ctx.request as unknown as { ip?: string }).ip ?? null;
    return {
      ip,
      forwardedFor: ctx.request.headers.get("x-forwarded-for"),
      host: ctx.request.headers.get("host"),
    };
  })
  .listen(PORT, () => {
    // stderr: stdout is reserved so the harness can capture clean JSON if it
    // ever pipes this directly.
    console.error(`[remote-address-probe] listening on ${PORT}`);
  });
