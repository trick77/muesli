import { describe, expect, it } from 'vitest';
import { Particles } from '../../src/render/particles';
import {
  dotRadius,
  drawPrey,
  legCount,
  PULSE,
  TAIL_BEND,
  TAIL_SEGS,
  tailLength,
  tailPoints,
  type PreyView,
} from '../../src/render/prey';
import { recCtx, type Call } from '../stubs';

const view = (over: Partial<PreyView> = {}): PreyView => ({
  x: 100,
  y: 100,
  heading: 0,
  r: 20,
  variant: 'mouse',
  color: 'cyan',
  opacity: 1,
  wounds: 0,
  still: false,
  caught: false,
  dead: false,
  t: 1,
  walked: 50,
  trail: [],
  ...over,
});

describe('prey drawing', () => {
  it('draws every shape in its colour, no eyes: only fills and thick strokes', () => {
    for (const variant of ['dot', 'mouse', 'beetle'] as const)
      for (const still of [false, true]) {
        const calls: Call[] = [];
        const ctx = recCtx(calls);
        drawPrey(ctx, view({ variant, still, caught: !still, dead: still && variant === 'dot' }));
        expect(ctx.fillStyle).toBe('#00E5FF');
        expect(calls.some((c) => c[0] === 'fill')).toBe(true);
        expect(calls.filter((c) => c[0] === 'arc').length).toBeLessThanOrEqual(1);
      }
  });

  it('draws nothing when faded out', () => {
    const calls: Call[] = [];
    drawPrey(recCtx(calls), view({ opacity: 0 }));
    expect(calls).toEqual([]);
  });

  it('pulses the standing dot clearly', () => {
    const radii: number[] = [];
    for (let t = 0; t < 1; t += 0.01) {
      const calls: Call[] = [];
      drawPrey(recCtx(calls), view({ variant: 'dot', still: true, t }));
      radii.push(calls.find((c) => c[0] === 'arc')![3] as number);
    }
    expect(Math.max(...radii) / 20).toBeCloseTo(1 + PULSE, 1);
    expect(Math.min(...radii) / 20).toBeCloseTo(1 - PULSE, 1);
  });

  it('shows hits: smaller dot, shorter tail, fewer legs', () => {
    expect(dotRadius(20, 2)).toBeLessThan(dotRadius(20, 1));
    expect(tailLength(2)).toBeLessThan(tailLength(0));
    expect(tailLength(10)).toBe(0.5);
    expect(legCount(0)).toBe(6);
    expect(legCount(3)).toBe(3);
    expect(legCount(9)).toBe(2);
  });
});

describe('tail', () => {
  const root = { x: 0, y: 0 };

  it('leaves the body straight backwards', () => {
    const pts = tailPoints(root, 0, [], 80);
    expect(pts).toHaveLength(TAIL_SEGS);
    for (const p of pts) {
      expect(p.x).toBeLessThan(0);
      expect(Math.abs(p.y)).toBeLessThan(1e-9);
    }
    expect(Math.hypot(pts.at(-1)!.x, pts.at(-1)!.y)).toBeCloseTo(80);
  });

  it('follows a turn behind it, bending gradually, never out of the side', () => {
    // the mouse came up from below and turned right: its path lies below and behind
    const trail = Array.from({ length: 16 }, (_, i) => ({ x: -5, y: 10 + i * 8 }));
    const pts = tailPoints(root, 0, trail, 80);
    let prev = Math.PI;
    let from = root;
    for (const p of pts) {
      const a = Math.atan2(p.y - from.y, p.x - from.x);
      const d = Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
      expect(Math.abs(d)).toBeLessThanOrEqual(TAIL_BEND + 1e-9);
      prev = a;
      from = p;
    }
    // the first segment points backwards within one bend
    const first = Math.atan2(pts[0].y, pts[0].x);
    expect(Math.abs(Math.atan2(Math.sin(first - Math.PI), Math.cos(first - Math.PI)))).toBeLessThanOrEqual(TAIL_BEND + 1e-9);
    // and it does swing toward the path
    expect(pts.at(-1)!.y).toBeGreaterThan(10);
  });
});

describe('particles', () => {
  it('burst, fly, fade and go', () => {
    const p = new Particles(() => 0.5);
    p.burst(10, 10, 20, '#fff', 5);
    expect(p.count).toBe(5);
    const calls: Call[] = [];
    p.draw(recCtx(calls));
    expect(calls.filter((c) => c[0] === 'fillRect')).toHaveLength(5);
    p.update(0.3);
    expect(p.count).toBe(5);
    p.update(0.3);
    expect(p.count).toBe(0);
  });
});
