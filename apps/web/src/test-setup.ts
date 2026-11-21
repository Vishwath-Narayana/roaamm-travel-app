import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrolling; the router calls it on route changes.
window.scrollTo = () => {};

// Newer Node versions define their own `localStorage` global, which hides
// jsdom's and is undefined unless Node is started with a storage file.
// Fall back to a simple in-memory Storage so tests behave the same everywhere.
if (!window.localStorage) {
  class MemoryStorage {
    #data = new Map<string, string>();
    get length() {
      return this.#data.size;
    }
    clear() {
      this.#data.clear();
    }
    getItem(key: string) {
      return this.#data.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      this.#data.set(key, String(value));
    }
    removeItem(key: string) {
      this.#data.delete(key);
    }
    key(i: number) {
      return [...this.#data.keys()][i] ?? null;
    }
  }
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
}
