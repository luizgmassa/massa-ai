/**
 * SEC-05 trust decision and shell injection (T6 / TASK-006).
 *
 * Pure-function coverage. The wire behavior lives in web-ui-key-http.test.ts,
 * which boots a server, because `request.ip` only exists on a real connection.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  isLoopbackAddress,
  isTrustedWebUiCaller,
  trustLocalOverrideEnabled,
  warnIfTrustOverrideEnabled,
  __resetTrustWarningForTests,
} from "../web-ui-trust.js";
import { injectAccessMarkup, API_KEY_META_NAME, ACCESS_META_NAME } from "../routes/web-ui.js";

const savedFlag = process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;

afterEach(() => {
  if (savedFlag === undefined) delete process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;
  else process.env.MASSA_AI_WEB_UI_TRUST_LOCAL = savedFlag;
  __resetTrustWarningForTests();
});

describe("isLoopbackAddress", () => {
  test.each([
    // Every form TASK-000 observed from a booted node-adapter server.
    "::1",
    "::ffff:127.0.0.1",
    "127.0.0.1",
    // 127.0.0.0/8 is loopback in full, not just .0.0.1.
    "127.0.0.2",
    "127.1.2.3",
    "::ffff:127.255.255.254",
    // Brackets and zone indexes must not defeat the match.
    "[::1]",
    "::1%lo0",
  ])("%s is loopback", (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  test.each([
    // The LAN address the spike actually observed.
    "::ffff:192.168.15.12",
    "192.168.15.12",
    // The Docker bridge shape that motivated the override flag.
    "::ffff:172.17.0.1",
    "172.17.0.1",
    "10.0.0.5",
    "::",
    "0.0.0.0",
    // Near-misses that a substring or prefix check would wave through.
    "127.0.0.1.evil.test",
    "1127.0.0.1",
    "127.0.0.999",
    "not-an-address",
    "",
  ])("%s is not loopback", (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });

  test("an absent address is not loopback — an unknown peer gets no key", () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
  });
});

describe("MASSA_AI_WEB_UI_TRUST_LOCAL override", () => {
  test("is off unless set to exactly 'true'", () => {
    delete process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;
    expect(trustLocalOverrideEnabled()).toBe(false);
    for (const value of ["", "false", "0", "1", "yes", "TRUE", "True"]) {
      process.env.MASSA_AI_WEB_UI_TRUST_LOCAL = value;
      expect(trustLocalOverrideEnabled()).toBe(false);
    }
  });

  test("when on, a non-loopback caller becomes trusted", () => {
    // This is the Docker bridge case the flag exists for.
    expect(isTrustedWebUiCaller("::ffff:172.17.0.1")).toBe(false);
    process.env.MASSA_AI_WEB_UI_TRUST_LOCAL = "true";
    expect(isTrustedWebUiCaller("::ffff:172.17.0.1")).toBe(true);
    // And so does a caller whose address could not be read at all.
    expect(isTrustedWebUiCaller(undefined)).toBe(true);
  });

  test("when off, only loopback is trusted", () => {
    delete process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;
    expect(isTrustedWebUiCaller("::1")).toBe(true);
    expect(isTrustedWebUiCaller("::ffff:127.0.0.1")).toBe(true);
    expect(isTrustedWebUiCaller("::ffff:192.168.15.12")).toBe(false);
    expect(isTrustedWebUiCaller(undefined)).toBe(false);
  });

  test("warns once, naming the exposure, only while the override is on", () => {
    const seen: string[] = [];
    delete process.env.MASSA_AI_WEB_UI_TRUST_LOCAL;
    expect(warnIfTrustOverrideEnabled((m) => seen.push(m))).toBe(false);
    expect(seen).toHaveLength(0);

    process.env.MASSA_AI_WEB_UI_TRUST_LOCAL = "true";
    expect(warnIfTrustOverrideEnabled((m) => seen.push(m))).toBe(true);
    expect(warnIfTrustOverrideEnabled((m) => seen.push(m))).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("MASSA_AI_WEB_UI_TRUST_LOCAL");
    expect(seen[0]).toContain("regardless of address");
  });
});

const SHELL = `<!DOCTYPE html><html><head><title>t</title></head><body><main id="app"></main></body></html>`;

describe("injectAccessMarkup", () => {
  test("a trusted caller's shell carries the key meta and no banner", () => {
    const out = injectAccessMarkup(SHELL, "secret-key", true);
    expect(out).toContain(`<meta name="${API_KEY_META_NAME}" content="secret-key" />`);
    expect(out).not.toContain("massa-ai-configure-access");
    expect(out).not.toContain(ACCESS_META_NAME);
    // The shell itself is untouched.
    expect(out).toContain('id="app"');
  });

  test("an untrusted caller's shell carries no key, a marker, and a banner", () => {
    const out = injectAccessMarkup(SHELL, "secret-key", false);
    expect(out).not.toContain("secret-key");
    expect(out).not.toContain(API_KEY_META_NAME + '" content="secret');
    expect(out).toContain(`<meta name="${ACCESS_META_NAME}" content="configure" />`);
    expect(out).toContain("massa-ai-configure-access");
    expect(out).toContain('id="app"');
  });

  test("a trusted caller with no key resolved falls back to the untrusted shell", () => {
    // initAuth() has not run. Emitting `content=""` would tell the client a key
    // exists and send an empty header on every call.
    const out = injectAccessMarkup(SHELL, undefined, true);
    expect(out).not.toContain(`name="${API_KEY_META_NAME}"`);
    expect(out).toContain(`<meta name="${ACCESS_META_NAME}" content="configure" />`);
  });

  test("a key containing quotes cannot break out of the attribute", () => {
    const out = injectAccessMarkup(SHELL, `a"><script>alert(1)</script>`, true);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&quot;&gt;&lt;script&gt;");
  });

  test("markup is injected even when the shell has no head or body tag", () => {
    expect(injectAccessMarkup("<p>bare</p>", "k", true)).toContain(API_KEY_META_NAME);
    expect(injectAccessMarkup("<p>bare</p>", "k", false)).toContain("massa-ai-configure-access");
  });
});
