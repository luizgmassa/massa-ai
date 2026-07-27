/**
 * Who may receive the API key embedded in the /ui page (SEC-05).
 *
 * The dashboard is a static bundle with no login. Rather than add one, the
 * server stamps the key into `index.html` — but only for a caller it can
 * establish is local. Everyone else gets the shell with no key and a
 * configure-access message, and issues no authenticated call.
 *
 * TASK-000 verified the mechanism against a booted `adapter: node()` server:
 * `ctx.request.ip` is the only readable source of the peer address. `ctx.server`
 * is absent under this adapter, so Elysia's documented `server.requestIP()` is
 * `undefined` there. Observed values: `::ffff:127.0.0.1` from `127.0.0.1`,
 * `::1` from `localhost`, `::ffff:192.168.15.12` from a LAN interface.
 */

/**
 * Loopback in every spelling the stack actually produces.
 *
 * All three forms are required: `localhost` resolves to `::1` while an explicit
 * `127.0.0.1` arrives IPv4-mapped as `::ffff:127.0.0.1`. A check written against
 * the literal "127.0.0.1" would deny the key to anyone using the URL the README
 * prints. The whole `127.0.0.0/8` block counts, not just `127.0.0.1`.
 *
 * Anything unrecognized — including the rarely-seen hex-mapped `::ffff:7f00:1`
 * form and an absent address — is NOT loopback. The failure direction is
 * deliberate: an unknown peer gets no key.
 */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;

  // Strip an IPv6 zone index (fe80::1%en0) and any surrounding brackets.
  let value = address.trim().replace(/^\[|\]$/g, "");
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  if (!value) return false;

  if (value === "::1") return true;

  const mapped = value.toLowerCase().startsWith("::ffff:")
    ? value.slice("::ffff:".length)
    : value;

  // 127.0.0.0/8 — every octet must be a real 0-255 number, so "127.0.0.1.evil"
  // and "127.0.0.999" do not pass.
  const parts = mapped.split(".");
  if (parts.length !== 4) return false;
  if (!parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return false;
  return parts[0] === "127";
}

/**
 * Explicit operator override for deployments where the peer address can never
 * be loopback (SEC-05, user decision during T6).
 *
 * A container reached through a bridge port mapping sees the host browser as a
 * bridge address, so the loopback check can never pass there and the dashboard
 * would be permanently unusable in Docker. This flag opts that deployment in.
 *
 * It is off by default and set only by the Docker image. Turning it on means
 * every caller that can reach the port receives the key in the page — with the
 * `0.0.0.0` bind that is the whole network, so it belongs only on a port that
 * untrusted clients cannot reach. `warnIfTrustOverrideEnabled` says so at
 * startup.
 */
export function trustLocalOverrideEnabled(): boolean {
  return process.env.MASSA_AI_WEB_UI_TRUST_LOCAL === "true";
}

/** True when this caller may receive the injected key. */
export function isTrustedWebUiCaller(address: string | undefined | null): boolean {
  return trustLocalOverrideEnabled() || isLoopbackAddress(address);
}

let warnedAboutTrustOverride = false;

/**
 * One warn line per process when the override is on. Without it the weakest
 * configuration in the system is also the quietest.
 */
export function warnIfTrustOverrideEnabled(
  warn: (message: string) => void = console.warn,
): boolean {
  if (!trustLocalOverrideEnabled() || warnedAboutTrustOverride) return false;
  warnedAboutTrustOverride = true;
  warn(
    `[massa-ai] MASSA_AI_WEB_UI_TRUST_LOCAL=true: every caller that can reach ` +
      `/ui receives the API key embedded in the page, regardless of address. ` +
      `Only use this where the port is unreachable by untrusted clients.`,
  );
  return true;
}

/** Test-only seam for the one-shot warn guard. */
export function __resetTrustWarningForTests(): void {
  warnedAboutTrustOverride = false;
}
