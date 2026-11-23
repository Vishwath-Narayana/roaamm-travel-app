// The hero preload lives in an inline script in index.html so that only the
// landing page preloads the LCP image (docs/adr/0007-landing-only-hero-preload.md).
import { IMAGES } from "./images.gen";
import html from "../index.html?raw";
import adr from "../../../docs/adr/0007-landing-only-hero-preload.md?raw";

const INLINE = /<script>([\s\S]*?)<\/script>/g;
const scripts = [...html.matchAll(INLINE)].map((m) => m[1]!);

/** The CSP source for an inline script: base64 SHA-256 of its exact text. */
async function cspHash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
}

function runAt(path: string): HTMLLinkElement[] {
  document.head.querySelectorAll('link[rel="preload"]').forEach((l) => l.remove());
  window.history.replaceState(null, "", path);
  new Function(scripts[0]!)();
  return [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')];
}

describe("index.html hero preload", () => {
  afterAll(() => window.history.replaceState(null, "", "/"));

  it("has exactly one inline script and no static image preload", () => {
    expect(scripts).toHaveLength(1);
    expect(html).not.toMatch(/<link[^>]*rel="preload"[^>]*as="image"/);
  });

  it("pins the inline script's CSP hash in the ADR", async () => {
    expect(adr).toContain(await cspHash(scripts[0]!));
  });

  it("preloads exactly the hero-1 AVIF widths the optimiser produced, on / only", () => {
    const [link, ...rest] = runAt("/?utm_source=x");
    expect(rest).toHaveLength(0);
    const expected = IMAGES["hero-1"].widths
      .map((w) => `/images/hero-1-${w}.avif ${w}w`)
      .join(", ");
    expect(link!.getAttribute("imagesrcset")).toBe(expected);
    expect(link!.getAttribute("imagesizes")).toBe("100vw");
    expect(link!.getAttribute("as")).toBe("image");
    expect(link!.getAttribute("fetchpriority")).toBe("high");
  });

  it.each(["/demo", "/login", "/signup", "/account", "/app/traveller", "/app/admin", "/nope"])(
    "does not preload the hero on %s",
    (path) => {
      expect(runAt(path)).toHaveLength(0);
    },
  );

  it("still preloads the hero headline font", () => {
    expect(html).toMatch(/rel="preload"\s+as="font"[\s\S]*inter-tight-latin-wght-normal\.woff2/);
  });
});
