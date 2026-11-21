import { currentTheme, initTheme, readStoredTheme, setTheme } from "./theme";

describe("theme", () => {
  const storage = () => Object.getPrototypeOf(window.localStorage);

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("initTheme applies a saved choice", () => {
    window.localStorage.setItem("roaamm-theme", "dark");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(currentTheme()).toBe("dark");
  });

  it("ignores junk in storage and follows the system", () => {
    window.localStorage.setItem("roaamm-theme", "purple");
    initTheme();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(currentTheme()).toBe("light"); // jsdom has no matchMedia: light by default
  });

  it("survives storage that throws on read and write", () => {
    vi.spyOn(storage(), "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(storage(), "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStoredTheme()).toBeNull();
    expect(() => initTheme()).not.toThrow();
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
