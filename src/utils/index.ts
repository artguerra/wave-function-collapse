import type { RGBA } from "@/core/types";

// asserts a condition (with proper typing)
export function assert(
  condition: boolean,
  msg?: string | (() => string),
): asserts condition {
  if (!condition)
    throw new Error(msg && (typeof msg === "string" ? msg : msg()));
}

// from https://gist.github.com/mjackson/5311256
export function hslToRGB(h: number, s: number, l: number) {
  let r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;

    r = hue2rgb(p, q, h + 1.0/3.0);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1.0/3.0);
  }

  return [ Math.round(r * 255), Math.round(g * 255), Math.round(b * 255) ];
}

export function randomSRGBAColor(): RGBA {
  const hue = Math.random();
  const sat = 0.55 + 0.2 * Math.random();
  const lig = 0.7 + 0.1 * Math.random();

  const [r, g, b] = hslToRGB(hue, sat, lig);
  return [r, g, b, 255];
}