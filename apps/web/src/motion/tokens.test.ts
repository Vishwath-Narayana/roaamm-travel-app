import { SPRING_LINEAR } from "@roaamm/design-tokens";
import css from "../styles/tokens.css?raw";
import { DUR, EASE, MAX_STAGGER_MS, STAGGER_MS, staggerDelay } from "./tokens";

function rootVar(name: string): string {
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} missing`);
  return m[1].trim();
}

describe("motion tokens: CSS and TS agree", () => {
  it("durations", () => {
    for (const [name, value] of Object.entries(DUR)) {
      expect(rootVar(`dur-${name}`)).toBe(`${value}ms`);
    }
    expect(rootVar("stagger")).toBe(`${STAGGER_MS}ms`);
  });

  it("easings, including the generated spring and its fallback", () => {
    expect(rootVar("ease-out")).toBe(EASE.out);
    expect(rootVar("ease-in-out")).toBe(EASE.inOut);
    expect(rootVar("ease-in")).toBe(EASE.in);
    expect(rootVar("ease-spring")).toBe(EASE.springFallback);
    // Browsers with linear() get the generated spring, verbatim.
    const supports = css.slice(css.indexOf("@supports (transition-timing-function: linear(0, 1))"));
    expect(supports).toContain(`--ease-spring: ${SPRING_LINEAR};`);
    expect(EASE.spring).toBe(SPRING_LINEAR);
  });

  it("follows the motion rules", () => {
    expect(DUR.press).toBeLessThan(DUR.hover);
    expect(DUR.content).toBeLessThanOrEqual(450); // nothing interactive is longer
    expect(DUR.hero).toBeLessThanOrEqual(1200);
    // A spring with one gentle overshoot: peaks a little above 1, ends at 1.
    const ys = SPRING_LINEAR.replace(/^linear\(|\)$/g, "").split(",").map((p) => Number.parseFloat(p));
    expect(ys[0]).toBe(0);
    expect(ys.at(-1)).toBe(1);
    expect(Math.max(...ys)).toBeGreaterThan(1);
    expect(Math.max(...ys)).toBeLessThan(1.06);
  });

  it("caps staggered groups at 600 ms in total", () => {
    expect(staggerDelay(3, 6)).toBe(3 * STAGGER_MS);
    expect(staggerDelay(19, 20)).toBeLessThanOrEqual(MAX_STAGGER_MS);
  });

  it("zeroes every duration under reduced motion (OS setting and footer toggle)", () => {
    for (const selector of ["@media (prefers-reduced-motion: reduce)", ':root[data-motion="reduced"]']) {
      const block = css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector) + selector.length + 12) + 1);
      for (const name of Object.keys(DUR)) expect(block).toContain(`--dur-${name}: 0ms;`);
    }
  });
});
