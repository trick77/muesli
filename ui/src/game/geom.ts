// Plane geometry in CSS pixels. y grows downwards, angles in radians, 0 = +x.

export interface Vec {
  x: number;
  y: number;
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Wraps an angle into -PI..PI. */
export function wrap(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export const angleTo = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x);

/** Distance from p to the segment a-b. */
export function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance between the segments a-b and c-d. */
export function segSegDist(a: Vec, b: Vec, c: Vec, d: Vec): number {
  if (intersects(a, b, c, d)) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

function cross(o: Vec, a: Vec, b: Vec) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function intersects(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** The play field: where the prey's centre may be while it is fully on screen. */
export interface Field {
  /** Screen size, CSS px. */
  w: number;
  h: number;
  /** Safe-area insets: the prey never hides under a notch or the home bar. */
  inset: { top: number; right: number; bottom: number; left: number };
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** The short screen edge: speeds are in shorts per second, so a phone and a desktop look alike. */
export const short = (f: Field) => Math.min(f.w, f.h);

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Field less the insets and a margin m around it. */
export function inner(f: Field, m: number): Box {
  return { x0: f.inset.left + m, y0: f.inset.top + m, x1: f.w - f.inset.right - m, y1: f.h - f.inset.bottom - m };
}

export const clampTo = (b: Box, p: Vec): Vec => ({
  x: Math.max(b.x0, Math.min(b.x1, p.x)),
  y: Math.max(b.y0, Math.min(b.y1, p.y)),
});

/** Distance from p to the box's nearest side (negative outside). */
export function edgeDistance(b: Box, p: Vec): number {
  return Math.min(p.x - b.x0, b.x1 - p.x, p.y - b.y0, b.y1 - p.y);
}

export function nearestSide(b: Box, p: Vec): Side {
  const d: Record<Side, number> = { left: p.x - b.x0, right: b.x1 - p.x, top: p.y - b.y0, bottom: b.y1 - p.y };
  let best: Side = 'left';
  for (const s of SIDES) if (d[s] < d[best]) best = s;
  return best;
}

/** How far from p a ray at angle a stays inside b. */
export function rayToBox(b: Box, p: Vec, a: number): number {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (b.x1 - p.x) / dx);
  if (dx < -1e-9) t = Math.min(t, (b.x0 - p.x) / dx);
  if (dy > 1e-9) t = Math.min(t, (b.y1 - p.y) / dy);
  if (dy < -1e-9) t = Math.min(t, (b.y0 - p.y) / dy);
  return Math.max(0, t);
}

/** The outward normal of a side. */
export function outward(s: Side): Vec {
  switch (s) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    default:
      return { x: -1, y: 0 };
  }
}

/** The point on side s of the screen (not the inner box) at fraction t along it, pushed out by d px. */
export function onSide(f: Field, s: Side, t: number, d: number): Vec {
  switch (s) {
    case 'top':
      return { x: f.w * t, y: -d };
    case 'right':
      return { x: f.w + d, y: f.h * t };
    case 'bottom':
      return { x: f.w * t, y: f.h + d };
    default:
      return { x: -d, y: f.h * t };
  }
}

/** True while any part of a circle of radius r at p is on screen. */
export const onScreen = (f: Field, p: Vec, r: number) => p.x > -r && p.x < f.w + r && p.y > -r && p.y < f.h + r;
