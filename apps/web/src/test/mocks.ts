// Test helpers: a controllable IntersectionObserver and a matchMedia stub.

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

export class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(readonly callback: IOCallback) {
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
}

/** Fires an intersection change for `el` on every observer watching it. */
export function intersect(el: Element, isIntersecting = true) {
  for (const io of MockIntersectionObserver.instances) {
    if (io.targets.has(el)) {
      io.callback([{ target: el, isIntersecting } as unknown as IntersectionObserverEntry]);
    }
  }
}

/** True if any observer is currently watching `el`. */
export function isObserved(el: Element) {
  return MockIntersectionObserver.instances.some((io) => io.targets.has(el));
}

export function installIntersectionObserver() {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
}

const originalMatchMedia = window.matchMedia;

/** matchMedia stub; `reduce` controls prefers-reduced-motion. */
export function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

export function restoreMatchMedia() {
  window.matchMedia = originalMatchMedia;
}
