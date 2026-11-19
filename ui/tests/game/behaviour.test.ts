// The plan's guarantees for how the prey moves, checked over many seeds of whole sessions.
import { describe, expect, it } from 'vitest';
import { dist, edgeDistance, inner, short, wrap } from '../../src/game/geom';
import { lookKey } from '../../src/game/look';
import { AWAY } from '../../src/game/director';
import { BAND, CHOICES, TIERS, type Tier } from '../../src/game/prey';
import { DT, record, type Frame } from './run';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const runs = SEEDS.map((seed) => ({ seed, ...record(seed) }));
const quiet = SEEDS.slice(0, 8).map((seed) => ({ seed, ...record(seed, { cat: false }) }));
const all = [...runs, ...quiet];

const S = short(runs[0].s.field);
/** Fully on screen: not peeking, entering, leaving or away. */
const confined = (f: Frame) =>
  !['exit', 'away', 'peek', 'enter'].includes(f.state) || (f.sub === 'emerge' && f.state !== 'exit');

describe('prey movement', () => {
  it('replays the same session from the same seed', () => {
    const a = record(7);
    const b = record(7);
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
    expect(a.s.hits).toBe(b.s.hits);
  });

  it('faces the way it moves: no gliding sideways, no running backwards', () => {
    for (const { frames } of all)
      for (const f of frames) {
        const dx = f.pos.x - f.prev.x;
        const dy = f.pos.y - f.prev.y;
        if (Math.hypot(dx, dy) < 0.05) continue;
        expect(Math.abs(wrap(Math.atan2(dy, dx) - f.heading))).toBeLessThan(1e-6);
      }
  });

  it('turns at a bounded rate (a scare at most, 5 pi rad/s)', () => {
    for (const { frames } of all)
      for (const f of frames) {
        if (!f.visible || f.slid) continue;
        if (Math.hypot(f.pos.x - f.prev.x, f.pos.y - f.prev.y) > 0.4 * S) continue; // re-placed while unseen
        expect(Math.abs(wrap(f.heading - f.prevHeading))).toBeLessThanOrEqual(5 * Math.PI * DT + 1e-9);
      }
  });

  it('never jumps while it can be seen', () => {
    // The fastest band, 1.6 shorts/s, at the highest speed factor 1.25.
    const max = 1.6 * 1.25 * S * DT + 1e-6;
    for (const { frames } of all)
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        if (!f.visible || !frames[i - 1].visible) continue;
        expect(dist(f.pos, f.prev)).toBeLessThanOrEqual(max);
      }
  });

  it('once fully on screen, stays there unless it is peeking or leaving', () => {
    for (const { s, frames } of all) {
      let inside = false;
      for (const f of frames) {
        if (!confined(f)) {
          inside = false;
          continue;
        }
        const b = inner(s.field, f.r * 1.1);
        const now = f.pos.x >= b.x0 - 1 && f.pos.x <= b.x1 + 1 && f.pos.y >= b.y0 - 1 && f.pos.y <= b.y1 + 1;
        if (inside) expect(now, `${f.state} at ${f.t}`).toBe(true);
        inside = inside || now;
      }
    }
  });

  it('keeps to the walls at least 60 % of the time it is seen', () => {
    for (const { s, frames } of all) {
      const seen = frames.filter((f) => f.visible);
      const near = seen.filter((f) => edgeDistance(inner(s.field, f.r * 1.1), f.pos) < BAND * S);
      expect(near.length / seen.length).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('never creeps across the open middle (luring aside)', () => {
    for (const { s, frames } of all)
      for (const f of frames) {
        if (f.state !== 'creep') continue;
        // the band plus what a creep can cover before its next target pulls it back to the wall
        expect(edgeDistance(inner(s.field, f.r * 1.1), f.pos)).toBeLessThanOrEqual(BAND * S + 0.05 * S);
      }
  });

  it('never picks the same state twice in a row', () => {
    // Without a cat: a scare may restart a bolt on purpose, the prey's own choices never repeat.
    for (const { frames } of quiet)
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        if (!(CHOICES as readonly string[]).includes(b.state)) continue;
        if (a.state === b.state) expect(b.stateT, `${b.state} restarted at ${b.t}`).toBeGreaterThan(a.stateT);
      }
  });
});

describe('speed variety', () => {
  /** Visible seconds each tier ran, by 30 s windows of visible time. */
  function windows(frames: Frame[]) {
    const out: Set<Tier>[] = [];
    let vt = 0;
    for (const f of frames) {
      if (!f.visible) continue;
      vt += DT;
      const w = Math.floor(vt / 30);
      out[w] ??= new Set();
      const moving = f.speed > 0.01 * S;
      if (f.tier === 'still' ? f.speed < 0.02 * S : moving) out[w].add(f.tier);
    }
    // the last window is cut short by the session's end
    return { full: out.slice(0, Math.floor(vt / 30)), all: out };
  }

  it('shows a stop, a creep and a sprint in every 30 s on screen', () => {
    for (const { frames } of quiet) {
      for (const w of windows(frames).full) {
        expect(w.has('still')).toBe(true);
        expect(w.has('creep')).toBe(true);
        expect(w.has('sprint') || w.has('blitz')).toBe(true);
      }
    }
  });

  it('shows all five speed bands in a session', () => {
    for (const { frames } of all) {
      const seen = new Set<Tier>();
      for (const w of windows(frames).all) for (const t of w ?? []) seen.add(t);
      for (const t of TIERS) expect(seen.has(t), t).toBe(true);
    }
  });

  it('eases into speed instead of jumping (save the pinning paw)', () => {
    for (const { frames } of all)
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        if (b.state === 'caught' || !b.visible || !a.visible) continue;
        expect(b.speed - a.speed).toBeLessThanOrEqual(10 * S * DT + 1e-6);
        expect(a.speed - b.speed).toBeLessThanOrEqual(5 * S * DT + 1e-6);
      }
  });
});

describe('leaving the screen', () => {
  it('leaves at most about 30 s on screen after coming back', () => {
    for (const { frames } of all) {
      let onScreen = 0;
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        if (f.state === 'away') onScreen = 0;
        else if (f.visible) onScreen += DT;
        if (f.state === 'exit' && frames[i - 1].state !== 'exit') onScreen = 0;
        // 30 s plus a struggle under the paw or a peek to finish
        expect(onScreen).toBeLessThanOrEqual(31.5);
      }
    }
  });

  it('stays away 0.5 to 10 s, drawn evenly', () => {
    const awayFor: number[] = [];
    for (const { events } of runs) {
      let since: number | null = null;
      for (const e of events) {
        if (e.kind === 'away' && 'prey' in e && e.prey === runs[0].s.prey) since = e.t;
        if (e.kind === 'away') since = e.t;
        if (e.kind === 'gone') since = null; // a kill rests 2 to 5 s instead
        if (e.kind === 'enter' && since !== null) {
          awayFor.push(e.t - since);
          since = null;
        }
      }
    }
    expect(awayFor.length).toBeGreaterThan(40);
    for (const a of awayFor) expect(a).toBeLessThanOrEqual(AWAY[1] + 2 * DT);
    const mean = awayFor.reduce((x, y) => x + y, 0) / awayFor.length;
    expect(mean).toBeGreaterThan(3.5);
    expect(mean).toBeLessThan(7);
  });

  it('comes back somewhere else than it left', () => {
    for (const { s, events, frames } of runs) {
      let left: { x: number; y: number } | null = null;
      for (const e of events) {
        if (e.kind === 'away' && 'x' in e && e.prey === s.prey) left = { x: e.x, y: e.y };
        if (e.kind === 'enter' && left && 'x' in e && e.prey === s.prey) {
          // the enter event fires at the off-screen start point
          expect(dist(left, e)).toBeGreaterThanOrEqual(0.4 * S - 1);
          left = null;
        }
      }
      expect(frames.length).toBeGreaterThan(0);
    }
  });

  it('changes its look only while away, and never shows one look for more than 45 s', () => {
    for (const { frames } of all) {
      let shown = 0;
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        if (lookKey(a.look) !== lookKey(b.look)) {
          expect(a.state === 'away' || b.state === 'away' || a.state === 'dead').toBe(true);
          shown = 0;
        }
        if (b.visible) shown += DT;
        expect(shown).toBeLessThanOrEqual(45);
      }
    }
  });
});

describe('the cat', () => {
  it('can catch it: a virtual cat lands hits and kills', () => {
    const hits = runs.reduce((n, r) => n + r.s.hits, 0);
    const kills = runs.reduce((n, r) => n + r.events.filter((e) => e.kind === 'kill').length, 0);
    expect(hits).toBeGreaterThan(runs.length * 2);
    expect(kills).toBeGreaterThan(runs.length);
  });

  it('ends every session on its own, a little after the set length', () => {
    for (const { s, events } of all) {
      expect(s.done).toBe(true);
      const end = events.find((e) => e.kind === 'end')!;
      expect(end.t).toBeGreaterThanOrEqual(120);
      // finale 15 s, then the run off screen
      expect(end.t).toBeLessThanOrEqual(120 + 15 + 6);
    }
  });
});
