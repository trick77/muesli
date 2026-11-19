import { describe, expect, it } from 'vitest';
import {
  clampTo,
  dist,
  edgeDistance,
  inner,
  nearestSide,
  onScreen,
  onSide,
  outward,
  rayToBox,
  segDist,
  segSegDist,
  wrap,
  type Field,
} from '../../src/game/geom';
import { PawTracker, REST_PX, REST_S, strikes } from '../../src/game/hit';
import { COLORS, lookKey, nextLook, SIZES, VARIANTS, type Look } from '../../src/game/look';
import { Rng } from '../../src/game/prng';

describe('Rng', () => {
  it('replays from a seed and stays in range', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('draws ranges, ints, signs and picks', () => {
    const r = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
      expect([0, 1, 2]).toContain(r.int(3));
      expect([-1, 1]).toContain(r.sign());
      expect(['a', 'b']).toContain(r.pick(['a', 'b']));
    }
    expect(typeof r.chance(0.5)).toBe('boolean');
  });

  it('draws weighted keys in proportion, never a zero weight', () => {
    const r = new Rng(9);
    const n: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30000; i++) n[r.weighted({ a: 1, b: 3, c: 0 })]++;
    expect(n.c).toBe(0);
    expect(n.b / n.a).toBeGreaterThan(2.7);
    expect(n.b / n.a).toBeLessThan(3.3);
    expect(() => r.weighted({ a: 0 })).toThrow();
  });
});

describe('geometry', () => {
  const f: Field = { w: 400, h: 200, inset: { top: 10, right: 0, bottom: 0, left: 20 } };

  it('wraps angles and measures distances', () => {
    expect(wrap(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrap(-0.5)).toBeCloseTo(-0.5);
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(segDist({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(segDist({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
    expect(segSegDist({ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(segSegDist({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 2 })).toBe(2);
  });

  it('knows the inner box, its sides and rays', () => {
    const b = inner(f, 5);
    expect(b).toEqual({ x0: 25, y0: 15, x1: 395, y1: 195 });
    expect(clampTo(b, { x: 0, y: 500 })).toEqual({ x: 25, y: 195 });
    expect(edgeDistance(b, { x: 30, y: 100 })).toBe(5);
    expect(nearestSide(b, { x: 30, y: 100 })).toBe('left');
    expect(nearestSide(b, { x: 200, y: 190 })).toBe('bottom');
    expect(nearestSide(b, { x: 390, y: 100 })).toBe('right');
    expect(nearestSide(b, { x: 200, y: 20 })).toBe('top');
    expect(rayToBox(b, { x: 200, y: 100 }, 0)).toBeCloseTo(195);
    expect(rayToBox(b, { x: 200, y: 100 }, Math.PI)).toBeCloseTo(175);
    expect(rayToBox(b, { x: 200, y: 100 }, Math.PI / 2)).toBeCloseTo(95);
    expect(rayToBox(b, { x: 200, y: 100 }, -Math.PI / 2)).toBeCloseTo(85);
    for (const s of ['top', 'right', 'bottom', 'left'] as const) {
      const p = onSide(f, s, 0.5, 10);
      expect(onScreen(f, p, 5)).toBe(false);
      expect(onScreen(f, p, 15)).toBe(true);
      expect(Math.hypot(outward(s).x, outward(s).y)).toBe(1);
    }
  });
});

describe('looks', () => {
  it('never shows the same look twice in a row', () => {
    const r = new Rng(5);
    let prev: Look | null = null;
    for (let i = 0; i < 2000; i++) {
      const l = nextLook(r, prev, null);
      if (prev) expect(lookKey(l)).not.toBe(lookKey(prev));
      expect(VARIANTS).toContain(l.variant);
      expect(COLORS).toContain(l.color);
      expect(SIZES).toContain(l.size);
      prev = l;
    }
  });

  it('follows learned weights for most picks, explores the rest', () => {
    const r = new Rng(6);
    const n: Record<string, number> = { dot: 0, mouse: 0, beetle: 0 };
    let prev: Look | null = null;
    for (let i = 0; i < 6000; i++) {
      prev = nextLook(r, prev, { variant: { mouse: 2, dot: 0.5, beetle: 0.5 }, color: {}, size: {} });
      n[prev.variant]++;
    }
    expect(n.mouse).toBeGreaterThan(n.dot * 2);
    // exploration keeps the others coming
    expect(n.dot).toBeGreaterThan(600);
  });

  it('changes the colour by hand when the weights pin a single look', () => {
    const prev: Look = { variant: 'dot', color: 'cyan', size: 's' };
    const w = { variant: { dot: 1, mouse: 0, beetle: 0 }, color: { cyan: 1, yellow: 0, lime: 0, blue: 0 }, size: { s: 1, m: 0, l: 0 } };
    // every learned pick is the same look; a seed whose exploring draws never fire long enough still ends different
    for (let seed = 0; seed < 50; seed++) expect(lookKey(nextLook(new Rng(seed), prev, w))).not.toBe(lookKey(prev));
  });
});

describe('paws', () => {
  it('a tap strikes where it lands, a swipe along its path', () => {
    const t = new PawTracker();
    const s = t.down(1, { x: 10, y: 10 }, 0);
    expect(s).toEqual({ id: 1, a: { x: 10, y: 10 }, b: { x: 10, y: 10 }, down: true });
    const m = t.move(1, { x: 60, y: 10 }, 0.05)!;
    expect(m.a).toEqual({ x: 10, y: 10 });
    expect(m.b).toEqual({ x: 60, y: 10 });
    expect(m.down).toBe(false);
    expect(strikes(m, [{ x: 35, y: 30 }, { x: 35, y: 30 }], 20)).toBe(true);
    expect(strikes(m, [{ x: 35, y: 31 }, { x: 35, y: 31 }], 20)).toBe(false);
  });

  it('a paw left lying on the glass strikes nothing until it moves on', () => {
    const t = new PawTracker();
    t.down(1, { x: 100, y: 100 }, 0);
    expect(t.move(1, { x: 105, y: 100 }, 0.1)).toBeNull();
    expect(t.resting(1)).toBe(false);
    t.tick(REST_S + 0.01);
    expect(t.resting(1)).toBe(true);
    expect(t.move(1, { x: 108, y: 102 }, 1)).toBeNull();
    const s = t.move(1, { x: 100 + REST_PX + 1, y: 100 }, 1.1);
    expect(s).not.toBeNull();
    expect(t.resting(1)).toBe(false);
    expect(t.positions()).toEqual([{ x: 100 + REST_PX + 1, y: 100 }]);
    t.up(1);
    expect(t.count).toBe(0);
    // a mouse moving without a button down
    expect(t.move(2, { x: 0, y: 0 }, 2)).toBeNull();
  });
});
