/**
 * Color utilities: parse hex/rgb/rgba to normalized values, output rgba CSS.
 * All selectable colors use rgba(r,g,b,a) with r,g,b 0–255 and a 0–1.
 */

import { DEFAULT_FILL_COLOR } from './constants.js';

const RGBA_RE = /^rgba?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+)\s*)?\)\s*$/i;
const HEX6_RE = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const HEX3_RE = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

/**
 * Parse any supported color string to { r, g, b, a } with r,g,b,a in 0–1.
 * Accepts: rgba(r,g,b,a), rgb(r,g,b), #rrggbb, #rgb, "transparent".
 */
export function parseRgba(str) {
  if (!str || typeof str !== 'string') return { r: 0.3, g: 0.56, b: 0.85, a: 1 };
  const s = str.trim();
  if (s.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const rgba = RGBA_RE.exec(s);
  if (rgba) {
    return {
      r: Math.max(0, Math.min(1, Number(rgba[1]) / 255)),
      g: Math.max(0, Math.min(1, Number(rgba[2]) / 255)),
      b: Math.max(0, Math.min(1, Number(rgba[3]) / 255)),
      a: rgba[4] != null ? Math.max(0, Math.min(1, Number(rgba[4]))) : 1,
    };
  }

  let hex = HEX6_RE.exec(s);
  if (hex) {
    return {
      r: parseInt(hex[1], 16) / 255,
      g: parseInt(hex[2], 16) / 255,
      b: parseInt(hex[3], 16) / 255,
      a: 1,
    };
  }
  hex = HEX3_RE.exec(s);
  if (hex) {
    return {
      r: parseInt(hex[1] + hex[1], 16) / 255,
      g: parseInt(hex[2] + hex[2], 16) / 255,
      b: parseInt(hex[3] + hex[3], 16) / 255,
      a: 1,
    };
  }

  return { r: 0.3, g: 0.56, b: 0.85, a: 1 };
}

/**
 * Format normalized r,g,b,a (0–1) as CSS rgba(R,G,B,A) with R,G,B 0–255.
 */
export function toRgbaCss(r, g, b, a = 1) {
  const R = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const G = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const B = Math.round(Math.max(0, Math.min(1, b)) * 255);
  const A = typeof a === 'number' ? Math.max(0, Math.min(1, a)) : 1;
  return `rgba(${R},${G},${B},${A})`;
}

/** r,g,b in 0–1 → #rrggbb for native color input */
export function rgbToHex(r, g, b) {
  const R = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const G = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const B = Math.round(Math.max(0, Math.min(1, b)) * 255);
  return '#' + [R, G, B].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize any color string to rgba(...). Accepts hex or rgba/rgb; returns rgba CSS.
 */
export function normalizeToRgba(str) {
  if (!str || typeof str !== 'string') return DEFAULT_FILL_COLOR;
  const s = str.trim();
  if (s.toLowerCase() === 'transparent') return 'transparent';
  const p = parseRgba(s);
  return toRgbaCss(p.r, p.g, p.b, p.a);
}

/** r,g,b in 0–1 → { h: 0..360, s: 0..1, l: 0..1 } */
export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, l };
}

/** h 0..360, s,l 0..1 → r,g,b 0..1 */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r, g, b };
}

/** Multiply saturation of r,g,b (0–1) by factor; return new r,g,b. */
export function applySaturation(r, g, b, factor) {
  const { h, s, l } = rgbToHsl(r, g, b);
  const s2 = Math.min(1, s * factor);
  const { r: r2, g: g2, b: b2 } = hslToRgb(h, s2, l);
  return { r: r2, g: g2, b: b2 };
}

/**
 * Derive stroke color from fill color: same hue, slightly lower lightness (darker).
 * Returns rgba CSS string.
 */
export function deriveStrokeFromFill(rgbaFill) {
  const p = parseRgba(rgbaFill);
  const { h, s, l } = rgbToHsl(p.r, p.g, p.b);
  const strokeL = Math.max(0.08, l * 0.55);
  const strokeS = Math.min(1, s * 1.05);
  const { r, g, b } = hslToRgb(h, strokeS, strokeL);
  return toRgbaCss(r, g, b, p.a);
}
