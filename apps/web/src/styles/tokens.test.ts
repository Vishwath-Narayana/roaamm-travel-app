import { color, effect, font, layout, motion, radius, shadow, size, space, type } from "@roaamm/design-tokens";
import css from "./tokens.css?raw";

/** Returns the declarations inside the first block whose selector matches. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing block ${selector}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe("tokens.css mirrors @roaamm/design-tokens", () => {
  it("light colours", () => {
    const root = block(":root");
    for (const [k, v] of Object.entries(color.light)) expect(root[k]).toBe(v);
  });

  it("dark colours, both for the OS preference and the explicit toggle", () => {
    for (const sel of [':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      const dark = block(sel);
      for (const [k, v] of Object.entries(color.dark)) expect(dark[k]).toBe(v);
    }
  });

  it("radius, sizes, shadow and spacing", () => {
    const root = block(":root");
    for (const [k, v] of Object.entries(radius)) expect(root[`radius-${k}`]).toBe(v);
    for (const [k, v] of Object.entries(size)) expect(root[`size-${k}`]).toBe(v);
    expect(root["shadow-elevated"]).toBe(shadow.elevated);
    space.slice(1).forEach((px, i) => expect(root[`space-${i + 1}`]).toBe(`${px}px`));
  });

  it("fonts, type scale, grid and effects", () => {
    const root = block(":root");
    for (const k of ["display", "sans", "serif", "mono"] as const) {
      expect(root[`font-${k}`]).toBe(font[k]);
    }
    for (const [k, v] of Object.entries(type)) expect(root[`type-${k}`]).toBe(v);
    for (const [k, v] of Object.entries(layout)) expect(root[`layout-${k}`]).toBe(v);
    for (const [k, v] of Object.entries(effect)) expect(root[`effect-${k}`]).toBe(v);
    for (const [k, v] of Object.entries(motion)) expect(root[k]).toBe(v);
  });
});
