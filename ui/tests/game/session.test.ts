import { describe, expect, it } from 'vitest';
import { AWAY, Director, FINALE_MAX, LURE_AFTER, LURK_AFTER, LURK_AWAY } from '../../src/game/director';
import { dist, edgeDistance } from '../../src/game/geom';
import { Rng } from '../../src/game/prng';
import { NEUTRAL, Prey } from '../../src/game/prey';
import { Session, TIRE_MISSES } from '../../src/game/session';
import { DT, ipad } from './run';

function session(seed = 1, extra: Partial<ConstructorParameters<typeof Session>[0]> = {}) {
  return new Session({ seed, field: ipad(), length: 120, touch: true, learned: null, lastLook: null, ...extra });
}

/** Steps until the prey is fully on screen in a state of its own choosing. */
function untilOnScreen(s: Session) {
  for (let i = 0; i < 60 * 60; i++) {
    s.step(DT);
    const p = s.prey;
    const inBox = edgeDistance(p.box(), p.pos) >= 0;
    if (p.catchable && inBox && ['creep', 'freeze', 'edge', 'bolt'].includes(p.state) && p.sub !== 'emerge') return p;
  }
  throw new Error('prey never settled on screen');
}

describe('director', () => {
  it('lures after 10 s without a touch, lurks after 30, a touch ends both', () => {
    const d = new Director(new Rng(1), 300, true);
    let cue: string | null = null;
    for (let t = 0; t < LURE_AFTER - 0.1; t += DT) cue = d.step(DT, true) ?? cue;
    expect(cue).toBeNull();
    for (let t = 0; t < 0.2; t += DT) cue = d.step(DT, true) ?? cue;
    expect(cue).toBe('lure');
    expect(d.mode).toBe('lure');
    for (let t = 0; t < LURK_AFTER; t += DT) d.step(DT, true);
    expect(d.mode).toBe('lurk');
    expect(d.exitDue).toBe(true);
    const away = d.awayFor();
    expect(away).toBeGreaterThanOrEqual(LURK_AWAY[0]);
    expect(away).toBeLessThanOrEqual(LURK_AWAY[1]);
    d.touched();
    expect(d.mode).toBe('normal');
    expect(d.idle).toBe(0);
  });

  it('does not count time without prey on screen as time without a touch', () => {
    const d = new Director(new Rng(1), 300, true);
    for (let t = 0; t < 60; t += DT) d.step(DT, false);
    expect(d.idle).toBe(0);
    expect(d.mode).toBe('normal');
  });

  it('lures on a timer on a desktop', () => {
    const d = new Director(new Rng(2), 300, false);
    let lures = 0;
    for (let t = 0; t < 120; t += DT) if (d.step(DT, true) === 'lure') lures++;
    expect(lures).toBeGreaterThanOrEqual(2);
    expect(d.mode).toBe('normal');
  });

  it('draws away times evenly over 0.5 to 10 s', () => {
    const d = new Director(new Rng(3), 300, true);
    const xs = Array.from({ length: 4000 }, () => d.awayFor());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(AWAY[0]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(AWAY[1]);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeCloseTo((AWAY[0] + AWAY[1]) / 2, 0);
    // each quarter of the range gets about a quarter of the draws
    for (let q = 0; q < 4; q++) {
      const lo = AWAY[0] + ((AWAY[1] - AWAY[0]) * q) / 4;
      const n = xs.filter((x) => x >= lo && x < lo + (AWAY[1] - AWAY[0]) / 4).length;
      expect(n / xs.length).toBeGreaterThan(0.2);
      expect(n / xs.length).toBeLessThan(0.3);
    }
  });

  it('adapts to a cat that catches a lot, or little', () => {
    const d = new Director(new Rng(4), 300, true);
    for (let t = 0; t < 31; t += DT) d.step(DT, true);
    expect(d.adapt()).toBe(0.9);
    expect(d.sizeBias().l).toBeGreaterThan(1);
    d.hit();
    d.hit();
    d.hit();
    expect(d.adapt()).toBeGreaterThan(1);
    expect(d.sizeBias().s).toBeGreaterThan(1);
    expect(new Director(new Rng(4), 300, false).adapt()).toBe(1);
  });

  it('runs the finale, then sends the last prey off', () => {
    const d = new Director(new Rng(5), 10, true);
    let cue: string | null = null;
    for (let t = 0; t < 10.1; t += DT) cue = d.step(DT, true) ?? cue;
    expect(cue).toBe('finale');
    expect(d.exitDue).toBe(false);
    for (let t = 0; t < FINALE_MAX + 0.1; t += DT) cue = d.step(DT, true) ?? cue;
    expect(cue).toBe('leave');
    expect(d.exitDue).toBe(true);
  });
});

describe('session', () => {
  it('a hit squeaks, pins the prey and marks it', () => {
    const s = session(3);
    const p = untilOnScreen(s);
    s.events = [];
    s.pointer('down', 1, { ...p.pos }, 'touch');
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain('hit');
    expect(kinds).toContain('squeak');
    expect(p.state).toBe('caught');
    expect(p.wounds).toBe(1);
    expect(s.hits).toBe(1);
    // a second paw on the struggling prey does not count again
    s.pointer('down', 2, { ...p.pos }, 'touch');
    expect(p.wounds).toBe(1);
    expect(s.touchSeen).toBe(true);
  });

  it('a swipe across the prey catches it too', () => {
    const s = session(4);
    const p = untilOnScreen(s);
    const far = 6 * p.r;
    s.pointer('down', 1, { x: p.pos.x - far, y: p.pos.y }, 'touch');
    expect(p.state).not.toBe('caught');
    s.pointer('move', 1, { x: p.pos.x + far, y: p.pos.y }, 'touch');
    expect(p.state).toBe('caught');
  });

  it('a near miss sends it running away from the paw', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = session(seed);
      const p = untilOnScreen(s);
      const paw = { x: p.pos.x + 2.2 * p.r + 20, y: p.pos.y };
      const before = dist(paw, p.pos);
      s.pointer('down', 1, paw, 'touch');
      expect(['bolt', 'exit']).toContain(p.state);
      // a prey sprinting at the paw needs its 0.2 s to brake before it can turn
      for (let i = 0; i < 60; i++) s.step(DT);
      expect(dist(paw, p.pos), `seed ${seed}`).toBeGreaterThan(before);
    }
  });

  it('misses tire the prey, a hit refreshes it', () => {
    const s = session(5);
    const p = untilOnScreen(s);
    for (let i = 0; i < TIRE_MISSES; i++) s.pointer('down', 10 + i, { x: 1, y: 1 }, 'touch');
    expect(s.tire).toBe(1);
    const q = untilOnScreen(s);
    s.pointer('down', 99, { ...q.pos }, 'touch');
    expect(s.tire).toBe(0);
    expect(p).toBe(q);
  });

  it('a mouse moving without a button strikes nothing and teaches nothing', () => {
    const s = session(6);
    const p = untilOnScreen(s);
    s.pointer('move', 1, { ...p.pos }, 'mouse');
    expect(p.state).not.toBe('caught');
    s.pointer('down', 1, { ...p.pos }, 'mouse');
    expect(p.state).toBe('caught');
    expect(s.touchSeen).toBe(false);
    s.pointer('up', 1, { ...p.pos }, 'mouse');
  });

  it('counts touches and exposure per trait for learning', () => {
    const s = session(7);
    const p = untilOnScreen(s);
    s.pointer('down', 1, { ...p.pos }, 'touch');
    const key = `variant:${p.look.variant}`;
    expect(s.tallies[key].t).toBe(1);
    expect(s.tallies[key].s).toBeGreaterThan(0);
  });

  it('the finale makes one hit enough and ends the session', () => {
    const s = session(8, { length: 5 });
    for (let i = 0; i < 60 * 6; i++) s.step(DT);
    expect(s.director.phase).toBe('finale');
    let p = s.prey;
    for (let i = 0; i < 60 * 10 && !p.catchable; i++) s.step(DT);
    p = s.prey;
    s.pointer('down', 1, { ...p.pos }, 'touch');
    expect(p.state).toBe('caught');
    const ends: string[] = [];
    for (let i = 0; i < 60 * 6 && !s.done; i++) {
      s.step(DT);
      ends.push(...s.events.map((e) => e.kind));
      s.events = [];
    }
    expect(ends).toContain('end');
    expect(s.done).toBe(true);
    // nothing moves once it is over
    const t = s.t;
    s.step(DT);
    s.pointer('down', 2, { x: 1, y: 1 }, 'touch');
    expect(s.t).toBe(t);
  });

  it('a lure may bring a second prey for a few seconds', () => {
    let seen = false;
    for (let seed = 1; seed <= 10 && !seen; seed++) {
      const s = session(seed);
      for (let i = 0; i < 60 * 40; i++) {
        s.step(DT);
        if (s.extra) seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it('follows the screen when it turns', () => {
    const s = session(9);
    const p = untilOnScreen(s);
    const r = p.r;
    p.pos = { x: 1100, y: 400 };
    s.resize(600, 900, { top: 40, right: 0, bottom: 30, left: 0 });
    expect(p.r).toBeLessThan(r);
    // pulled into the new screen, not left outside unseen
    expect(p.pos.x).toBeLessThanOrEqual(600);
    expect(p.visible).toBe(true);
    for (let i = 0; i < 120; i++) s.step(DT);
    expect(s.field.w).toBe(600);
  });

  it('sends a lure’s second prey off when the finale starts', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30 && checked < 3; seed++) {
      const s = session(seed, { length: 40 });
      for (let i = 0; i < 60 * 39 && !s.extra; i++) s.step(DT);
      if (!s.extra) continue;
      while (s.director.phase === 'hunt') s.step(DT);
      // the extra runs off and is dropped well before the finale's 15 s are up
      for (let i = 0; i < 60 * 8 && s.extra; i++) s.step(DT);
      expect(s.extra, `seed ${seed}`).toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('prey', () => {
  it('starts away and comes in from an edge', () => {
    const f = ipad();
    const p = new Prey(f, new Rng(1), { variant: 'mouse', color: 'cyan', size: 'm' });
    expect(p.visible).toBe(false);
    p.spawn();
    expect(p.state === 'enter' || p.state === 'bolt').toBe(true);
    for (let i = 0; i < 300; i++) p.step(DT, NEUTRAL);
    expect(p.visible).toBe(true);
  });

  it('keeps its look while seen and takes a new one only while away', () => {
    const p = new Prey(ipad(), new Rng(2), { variant: 'dot', color: 'blue', size: 'l' });
    p.spawn();
    p.step(DT, NEUTRAL);
    p.setLook({ variant: 'beetle', color: 'lime', size: 's' });
    expect(p.look.variant).toBe('dot');
  });

  it('lures toward the middle and wiggles there', () => {
    const s = session(10);
    const p = untilOnScreen(s);
    p.lure();
    expect(p.state).toBe('lure');
    let wiggled = false;
    for (let i = 0; i < 60 * 8; i++) {
      p.step(DT, NEUTRAL);
      if (p.sub === 'wiggle') wiggled = true;
    }
    expect(wiggled).toBe(true);
  });
});
