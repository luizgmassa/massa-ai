/**
 * The one-at-a-time success/error banner every write handler reports through.
 */

const BANNER_AUTOHIDE_MS = 6000;

/** @param {object} [opts] - `{ persist: true }` (T8, P1-C AC2) skips the 6 s
 *  auto-hide for a success banner — used for the Save & Apply completion
 *  banner, which must stay visible until the operator dismisses/navigates. */
export function showBanner(root, type, message, opts) {
  const persist = !!(opts && opts.persist);
  // Clear existing banner(s) — only one at a time.
  const existing = root.querySelectorAll ? root.querySelectorAll(".success, .error") : [];
  existing.forEach((b) => { if (b.remove) b.remove(); });
  const div = {
    className: (type === "success" ? "success" : "error") + (persist ? " banner-persist" : ""),
    textContent: message,
    style: {},
    remove: () => {},
    addEventListener: () => {},
  };
  // Prepend to root (top of view). Use insertBefore if firstChild exists.
  try {
    if (root.insertBefore) root.insertBefore(div, root.firstChild || null);
    else if (root.children) root.children.unshift(div);
  } catch {
    // best effort
  }
  if (type === "success" && !persist && typeof setTimeout !== "undefined") {
    setTimeout(() => { if (div.remove) div.remove(); }, BANNER_AUTOHIDE_MS);
  }
  return div;
}
