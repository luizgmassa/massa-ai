/**
 * The one-at-a-time success/error banner every write handler reports through.
 */

const BANNER_AUTOHIDE_MS = 6000;

interface BannerElement {
  remove?: () => void;
}

/** The subset of a DOM root `showBanner` needs. Structural, not a real DOM
 *  type: production passes a real element, the test suites pass a fake. */
interface BannerRoot {
  querySelectorAll?: (selectors: string) => { forEach(cb: (el: BannerElement) => void): void };
  insertBefore?: (node: unknown, ref: unknown) => unknown;
  firstChild?: unknown;
  children?: unknown[];
}

interface Banner {
  className: string;
  textContent: string;
  style: Record<string, unknown>;
  remove: () => void;
  addEventListener: () => void;
}

/** @param opts - `{ persist: true }` (T8, P1-C AC2) skips the 6 s
 *  auto-hide for a success banner — used for the Save & Apply completion
 *  banner, which must stay visible until the operator dismisses/navigates. */
export function showBanner(
  root: BannerRoot,
  type: string,
  message: string,
  opts?: { persist?: boolean },
): Banner {
  const persist = !!(opts && opts.persist);
  // Clear existing banner(s) — only one at a time.
  const existing = root.querySelectorAll ? root.querySelectorAll(".success, .error") : [];
  existing.forEach((b) => { if (b.remove) b.remove(); });
  const div: Banner = {
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
