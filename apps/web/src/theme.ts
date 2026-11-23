export type Theme = "light" | "dark";

const STORAGE_KEY = "roaamm-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

/** The saved choice, or null. Storage can throw (private mode, blocked cookies). */
export function readStoredTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

/** The theme on screen right now: the explicit choice, else the OS preference. */
export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  return isTheme(set) ? set : systemTheme();
}

/**
 * Points every <meta name="theme-color"> at the page colour actually shown
 * (--bg from tokens.css), so an explicit choice wins over the OS preference
 * that the static tags in index.html follow.
 */
function syncThemeColor(): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (!bg) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = bg;
}

/** Run once before the first render so a saved choice applies immediately. */
export function initTheme(): void {
  const saved = readStoredTheme();
  if (saved) {
    document.documentElement.dataset.theme = saved;
    syncThemeColor();
  }
}

/** Apply a theme and try to remember it. The page still switches if storage fails. */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  syncThemeColor();
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice lasts for this page view only.
  }
}

/** Calls back when the OS colour scheme changes. Returns an unsubscribe function. */
export function onSystemThemeChange(cb: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
