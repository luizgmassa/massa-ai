/**
 * Profiles tab — the Active Profile / Model Catalog sub-tab switcher, the
 * per-host profile cards, and the switch action.
 */

import { escapeHtml } from "../lib/html.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { showBanner } from "../lib/banner.js";
import { renderModelRegistry } from "./registry.js";

/**
 * Profiles view renderer. Reads GET /api/v1/profiles → { hosts: HostProfileState[] }.
 * Renders profile cards grouped by host with active marked, plus a Switch button
 * per profile calling POST /api/v1/profiles/switch when write mode is on.
 */
export function renderProfiles(data, opts) {
  const payload = data || {};
  const hosts = payload.hosts || [];
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();

  if (hosts.length === 0) {
    return '<section class="view"><h2>Profiles</h2><p class="empty">No profiles.</p></section>';
  }

  const cards = hosts.map((hostState) => {
    const hostName = hostState.host || "unknown";
    const installed = hostState.installed;
    const skipped = hostState.skipped;
    const activeProfile = hostState.activeProfile;
    const available = hostState.availableProfiles || [];
    const version = hostState.bundleVersion;

    if (skipped) {
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + ' <span class="badge muted">skipped</span></h3>' +
        '<p class="muted">' + escapeHtml(hostState.skipReason || "skipped") + "</p>" +
        "</div>"
      );
    }

    if (!installed) {
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + "</h3> <p class=\"muted\">Not installed.</p>" +
        "</div>"
      );
    }

    if (available.length === 0) {
      // T20 (CPP-09, design § 4e): this copy must NOT assert that a
      // marketplace install can't switch profiles — that claim is false for
      // Claude since AD-020 (T16-T19 gave Claude a marketplace-aware
      // resolver). A host can legitimately have no variant directories for
      // other reasons too (e.g. the installer never ran the variant-sync
      // step), so the message stays host-route-agnostic and just names the
      // MASSA_AI_MODEL_PROFILE + Save & Apply path.
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + "</h3>" +
        '<p class="muted">No profile variants are installed for this host. Re-run the installer, or use <code>MASSA_AI_MODEL_PROFILE</code> with Save &amp; Apply on the Model Catalog tab.</p>' +
        "</div>"
      );
    }

    const profileCards = available.map((profile) => {
      const isActive = profile === activeProfile;
      const switchBtn = writeMode && !isActive
        ? '<button type="button" class="switch-btn" data-action="profile-switch" data-profile="' + escapeHtml(profile) + '" data-host="' + escapeHtml(hostName) + '">Switch</button>'
        : isActive
          ? '<span class="badge active-badge">active</span>'
          : "";
      return (
        '<div class="profile-card' + (isActive ? " active" : "") + '" data-profile="' + escapeHtml(profile) + '">' +
        "<h4>" + escapeHtml(profile) + "</h4>" +
        switchBtn +
        "</div>"
      );
    }).join("");

    const versionBadge = version
      ? ' <span class="badge muted">v' + escapeHtml(version) + "</span>"
      : "";

    return (
      '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
      "<h3>" + escapeHtml(hostName) + versionBadge + "</h3>" +
      '<div class="profile-cards">' + profileCards + "</div>" +
      "</div>"
    );
  }).join("");

  return '<section class="view"><h2>Profiles</h2>' + cards + "</section>";
}

export const PROFILES_TAB_STORAGE_KEY = "massa-ai-profiles-tab";

export function renderProfilesView(profilesData, registryData, opts) {
  opts = opts || {};
  const tab = opts.profilesTab || "switch";
  const writeMode = opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();

  const switcher =
    '<div class="tab-switcher">' +
    '<button type="button" class="tab' + (tab === "switch" ? " active" : "") + '" data-action="profiles-tab" data-tab="switch">Active Profile</button>' +
    '<button type="button" class="tab' + (tab === "registry" ? " active" : "") + '" data-action="profiles-tab" data-tab="registry">Model Catalog</button>' +
    "</div>";

  let body;
  if (tab === "registry") {
    body = renderModelRegistry(registryData, { writeMode, unsaved: opts.unsaved, registryForm: opts.registryForm });
  } else {
    body = renderProfiles(profilesData, { writeMode });
  }

  return '<section class="view"><h2>Profiles</h2>' + switcher + body + "</section>";
}

export function handleProfilesTabSwitch(ctx, tab) {
  ctx.state.profilesTab = tab;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PROFILES_TAB_STORAGE_KEY, tab);
  } catch {
    // localStorage unavailable — non-fatal
  }
  ctx.render();
}

export async function handleProfileSwitch(ctx, profile, host) {
  if (!confirm("Switch " + host + " to profile " + profile + "? Replaces installed agent files. Session restart required.")) return;
  const body = { profile };
  if (host) body.host = host;
  try {
    const res = await ctx.api.request("/api/v1/profiles/switch", { method: "POST", body });
    if (res && res.success === false) {
      const errInfo = res.error || {};
      const code = (errInfo && errInfo.code) || "error";
      const message = (errInfo && errInfo.message) || "switch failed";
      showBanner(ctx.root, "error", "Switch failed (" + code + "): " + message);
      return;
    }
    const data = (res && res.data) || {};
    const switched = (data.switched || []).join(", ") || "none";
    const skipped = (data.skipped || []).join(", ") || "none";
    const failed = (data.failed || []).map((f) => f.host + ": " + (f.reason || "unknown")).join("; ") || "none";
    showBanner(ctx.root, "success", "Switched: " + switched + " | Skipped: " + skipped + " | Failed: " + failed);
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Switch failed: " + String((e && e.message) || e));
  }
}
