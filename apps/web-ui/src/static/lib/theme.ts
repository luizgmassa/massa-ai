/**
 * Light/dark theme persistence.
 *
 * `index.html` reads the same `massa-ai-ui-theme` key in an inline script
 * before the stylesheet paints (no-FOUC bootstrap), so this key is duplicated
 * there literally and the two must stay in sync.
 */

const THEME_STORAGE_KEY = "massa-ai-ui-theme";

type Theme = "light" | "dark";

export function initTheme(doc?: Document | null, store?: Storage | null): Theme {
  doc = doc || (typeof document !== "undefined" ? document : null);
  store = store || (typeof localStorage !== "undefined" ? localStorage : null);
  let theme: Theme = "light";
  try {
    if (store) {
      const t = store.getItem(THEME_STORAGE_KEY);
      if (t === "dark" || t === "light") theme = t;
    }
  } catch {}
  if (doc && doc.documentElement) {
    doc.documentElement.setAttribute("data-theme", theme);
  }
  return theme;
}

export function toggleTheme(doc?: Document | null, store?: Storage | null): Theme {
  doc = doc || (typeof document !== "undefined" ? document : null);
  store = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!doc || !doc.documentElement) return "light";
  const current: Theme = doc.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next: Theme = current === "dark" ? "light" : "dark";
  doc.documentElement.setAttribute("data-theme", next);
  try {
    if (store) store.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  return next;
}
