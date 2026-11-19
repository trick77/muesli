// What this cat likes, learned across sessions on one device: touches per minute of exposure, per shape, colour,
// size and per prey state. Counts in, weights out; storage is platform/settings.ts.
import { COLORS, SIZES, VARIANTS, type LookWeights } from './look';
import { CHOICES, type Choice } from './prey';

/** Touches (hits and near misses) and visible seconds of one trait. */
export interface Tally {
  t: number;
  s: number;
}

export interface LearnData {
  v: 1;
  /** Sessions played (decayed counts aside, this one is exact). */
  sessions: number;
  /** Sessions with at least one touch: weighting starts at MIN_SESSIONS. */
  touched: number;
  /** Longest session, seconds. */
  longest: number;
  /** Keyed `variant:mouse`, `color:cyan`, `size:m`, `state:creep`. */
  feats: Record<string, Tally>;
}

export const MIN_SESSIONS = 3;
/** Older sessions weigh less, so a changing taste comes through. */
export const DECAY = 0.9;
/** A learned weight stays within this factor of neutral: the play never turns one-sided. */
export const MAX_FACTOR = 2;

export const empty = (): LearnData => ({ v: 1, sessions: 0, touched: 0, longest: 0, feats: {} });

/** Reads stored data; anything broken or foreign gives an empty record, never an error. */
export function parse(raw: string | null): LearnData {
  if (!raw) return empty();
  try {
    const d = JSON.parse(raw) as Partial<LearnData>;
    if (d?.v !== 1 || typeof d.feats !== 'object' || d.feats === null) return empty();
    const feats: Record<string, Tally> = {};
    for (const [k, v] of Object.entries(d.feats)) {
      if (typeof v?.t === 'number' && typeof v?.s === 'number' && v.t >= 0 && v.s >= 0 && isFinite(v.t + v.s))
        feats[k] = { t: v.t, s: v.s };
    }
    return {
      v: 1,
      sessions: num(d.sessions),
      touched: num(d.touched),
      longest: num(d.longest),
      feats,
    };
  } catch {
    return empty();
  }
}

const num = (x: unknown) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : 0);

/** Folds one finished session in: old counts decay first. */
export function merge(d: LearnData, session: Record<string, Tally>, seconds: number): LearnData {
  const feats: Record<string, Tally> = {};
  for (const [k, v] of Object.entries(d.feats)) feats[k] = { t: v.t * DECAY, s: v.s * DECAY };
  let touches = 0;
  for (const [k, v] of Object.entries(session)) {
    const f = (feats[k] ??= { t: 0, s: 0 });
    f.t += v.t;
    f.s += v.s;
    if (k.startsWith('variant:')) touches += v.t;
  }
  return {
    v: 1,
    sessions: d.sessions + 1,
    touched: d.touched + (touches > 0 ? 1 : 0),
    longest: Math.max(d.longest, seconds),
    feats,
  };
}

/** Touches per minute of exposure. */
export const rate = (t: Tally | undefined) => (t && t.s > 0 ? (t.t * 60) / t.s : 0);

export interface Weights {
  look: LookWeights;
  states: Partial<Record<Choice, number>>;
}

/** Learned weights, or null while there is too little to go on (then everything is drawn evenly). */
export function weights(d: LearnData): Weights | null {
  if (d.touched < MIN_SESSIONS) return null;
  return {
    look: {
      variant: group(d, 'variant', VARIANTS),
      color: group(d, 'color', COLORS),
      size: group(d, 'size', SIZES),
    },
    states: group(d, 'state', CHOICES),
  };
}

/**
 * Each trait's rate over the group's mean, clamped to 1/MAX_FACTOR..MAX_FACTOR. Half a minute of the group's
 * average stands in as a prior, so ten seconds of one lucky trait do not run away with it.
 */
function group<K extends string>(d: LearnData, prefix: string, keys: readonly K[]): Partial<Record<K, number>> {
  let t = 0;
  let s = 0;
  for (const k of keys) {
    const f = d.feats[`${prefix}:${k}`];
    if (f) {
      t += f.t;
      s += f.s;
    }
  }
  const out: Partial<Record<K, number>> = {};
  if (s <= 0 || t <= 0) return out;
  const mean = (t * 60) / s;
  const prior = { t: mean * 0.5, s: 30 };
  const rates = keys.map((k) => {
    const f = d.feats[`${prefix}:${k}`] ?? { t: 0, s: 0 };
    return ((f.t + prior.t) * 60) / (f.s + prior.s);
  });
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  keys.forEach((k, i) => {
    out[k] = Math.max(1 / MAX_FACTOR, Math.min(MAX_FACTOR, rates[i] / avg));
  });
  return out;
}

/** Bars for the stats screen: touches per minute of every trait seen, by group. */
export function bars(d: LearnData): { group: string; key: string; rate: number }[] {
  const out: { group: string; key: string; rate: number }[] = [];
  for (const [prefix, keys] of [
    ['variant', VARIANTS],
    ['color', COLORS],
  ] as const) {
    for (const k of keys) {
      const f = d.feats[`${prefix}:${k}`];
      if (f && f.s > 0) out.push({ group: prefix, key: k, rate: rate(f) });
    }
  }
  return out;
}
