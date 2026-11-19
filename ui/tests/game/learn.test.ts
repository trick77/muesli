import { describe, expect, it } from 'vitest';
import { bars, DECAY, empty, MAX_FACTOR, merge, MIN_SESSIONS, parse, rate, weights, type LearnData } from '../../src/game/learn';

/** A record of `n` sessions where mice got `mouse` touches per minute and dots `dot`. */
function sessions(n: number, mouse: number, dot: number): LearnData {
  let d = empty();
  for (let i = 0; i < n; i++)
    d = merge(
      d,
      {
        'variant:mouse': { t: mouse, s: 60 },
        'variant:dot': { t: dot, s: 60 },
        'color:cyan': { t: mouse + dot, s: 120 },
        'state:creep': { t: mouse, s: 60 },
        'state:bolt': { t: dot, s: 60 },
      },
      120,
    );
  return d;
}

describe('learning', () => {
  it('reads broken or foreign storage as empty, never throws', () => {
    for (const raw of [null, '', 'nope', '[]', '{"v":2,"feats":{}}', '{"v":1}', '{"v":1,"feats":null}'])
      expect(parse(raw)).toEqual(empty());
    const d = parse('{"v":1,"sessions":3,"touched":-1,"longest":"x","feats":{"a":{"t":1,"s":2},"b":{"t":-1,"s":1},"c":7}}');
    expect(d).toEqual({ v: 1, sessions: 3, touched: 0, longest: 0, feats: { a: { t: 1, s: 2 } } });
  });

  it('round-trips through JSON', () => {
    const d = sessions(2, 5, 1);
    expect(parse(JSON.stringify(d))).toEqual(d);
  });

  it('draws evenly until enough sessions had touches', () => {
    expect(weights(sessions(MIN_SESSIONS - 1, 9, 1))).toBeNull();
    expect(weights(sessions(MIN_SESSIONS, 9, 1))).not.toBeNull();
    // sessions without a single touch do not count
    let d = sessions(MIN_SESSIONS - 1, 9, 1);
    d = merge(d, { 'variant:mouse': { t: 0, s: 60 } }, 60);
    expect(d.touched).toBe(MIN_SESSIONS - 1);
    expect(weights(d)).toBeNull();
  });

  it('weighs a trait by its touches per minute, within a factor of two', () => {
    const w = weights(sessions(5, 9, 1))!;
    expect(w.look.variant.mouse!).toBeGreaterThan(1);
    expect(w.look.variant.dot!).toBeLessThan(1);
    expect(w.states.creep!).toBeGreaterThan(w.states.bolt!);
    const extreme = weights(sessions(10, 1000, 0))!;
    for (const v of Object.values(extreme.look.variant)) {
      expect(v).toBeLessThanOrEqual(MAX_FACTOR);
      expect(v).toBeGreaterThanOrEqual(1 / MAX_FACTOR);
    }
    // nothing seen of a group: neutral
    expect(w.look.size).toEqual({});
  });

  it('lets old sessions fade', () => {
    const d = sessions(1, 10, 0);
    const later = merge(d, {}, 30);
    expect(later.feats['variant:mouse'].t).toBeCloseTo(10 * DECAY);
    expect(later.longest).toBe(120);
    expect(later.sessions).toBe(2);
  });

  it('turns the record into bars by shape and colour', () => {
    const b = bars(sessions(3, 6, 3));
    expect(b.find((x) => x.key === 'mouse')!.rate).toBeCloseTo(6);
    expect(b.find((x) => x.key === 'cyan')!.group).toBe('color');
    expect(rate(undefined)).toBe(0);
    expect(rate({ t: 3, s: 0 })).toBe(0);
  });
});
