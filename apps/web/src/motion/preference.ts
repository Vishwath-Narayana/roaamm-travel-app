// The footer "Reduce motion" switch. It can only reduce: when the OS already
// asks for reduced motion, motion stays reduced whatever the switch says.
// Stored in localStorage (which can throw, so every access is guarded) and
// applied as data-motion="reduced" on <html>.

const KEY = "roaamm-motion";
export const MOTION_EVENT = "roaamm:motion";

export function readMotionPreference(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "reduced";
  } catch {
    return false;
  }
}

function apply(reduced: boolean) {
  if (reduced) document.documentElement.dataset.motion = "reduced";
  else delete document.documentElement.dataset.motion;
}

/** Run once before the first render so a saved choice applies immediately. */
export function initMotionPreference(): void {
  apply(readMotionPreference());
}

/** Turn the site's own motion reduction on or off, remember it, tell listeners. */
export function setMotionReduced(reduced: boolean): void {
  apply(reduced);
  try {
    if (reduced) window.localStorage.setItem(KEY, "reduced");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the choice lasts for this page view only.
  }
  window.dispatchEvent(new Event(MOTION_EVENT));
}

export function isMotionReducedBySite(): boolean {
  return document.documentElement.dataset.motion === "reduced";
}
