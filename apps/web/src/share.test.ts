import html from "../index.html?raw";
import manifestText from "../public/manifest.webmanifest?raw";

// Share previews and install metadata live in index.html; crawlers read it
// before any JavaScript runs, so these must be in the static file.
const doc = new DOMParser().parseFromString(html, "text/html");
const meta = (attr: "property" | "name", key: string) =>
  doc.head.querySelector(`meta[${attr}="${key}"]`)?.getAttribute("content");

describe("index.html share previews", () => {
  it("has the Open Graph tags", () => {
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:title")).toMatch(/ROAAMM/);
    expect(meta("property", "og:description")).toMatch(/simulated/);
    expect(meta("property", "og:url")).toBe("https://roaamm.plinthwell.com/");
    expect(meta("property", "og:image")).toBe("https://roaamm.plinthwell.com/og.jpg");
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("property", "og:image:alt")).toBeTruthy();
  });

  it("has a large Twitter / X card, a canonical link and icons", () => {
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(doc.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://roaamm.plinthwell.com/",
    );
    const touch = doc.head.querySelector('link[rel="apple-touch-icon"]');
    expect(touch?.getAttribute("href")).toBe("/apple-touch-icon.png");
    expect(touch?.getAttribute("sizes")).toBe("180x180");
    expect(doc.head.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
      "/manifest.webmanifest",
    );
  });

  it("has a web manifest with 192 and 512 icons", () => {
    const manifest = JSON.parse(manifestText) as { name: string; icons: { sizes: string }[] };
    expect(manifest.name).toBe("ROAAMM");
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("tells visitors without JavaScript what to do", () => {
    expect(html).toMatch(/<noscript>[\s\S]*needs JavaScript[\s\S]*<\/noscript>/);
  });

  it("never names Plinthwell as a brand in share copy", () => {
    for (const key of ["og:title", "og:description", "og:image:alt"]) {
      expect(meta("property", key)).not.toMatch(/Plinthwell/);
    }
  });
});
