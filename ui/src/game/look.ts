// What the prey looks like: shape, colour and size. Changes only while it is off screen (Hall, Bradshaw &
// Robinson 2002: a cat's play collapses on an unchanging toy and comes back at once for a changed one).
import type { Rng } from './prng';

export const VARIANTS = ['dot', 'mouse', 'beetle'] as const;
export type Variant = (typeof VARIANTS)[number];

// Cats are dichromats: blue and yellow-green carry, reds and oranges read as dark grey.
export const COLORS = ['cyan', 'yellow', 'lime', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const SIZES = ['s', 'm', 'l'] as const;
export type Size = (typeof SIZES)[number];

/** Size factor on the base radius (2.25 % of the short edge). */
export const SIZE_SCALE: Record<Size, number> = { s: 0.8, m: 1, l: 1.3 };

export interface Look {
  variant: Variant;
  color: Color;
  size: Size;
}

export const lookKey = (l: Look) => `${l.variant}/${l.color}/${l.size}`;

/** Weights per trait value, 1 = neutral (learn.ts). */
export interface LookWeights {
  variant: Partial<Record<Variant, number>>;
  color: Partial<Record<Color, number>>;
  size: Partial<Record<Size, number>>;
}

/** Share of picks that ignore the learned weights, so a new favourite gets its chance. */
export const EXPLORE = 0.3;

/** A look unlike `prev` (never the same combination twice in a row), learned weights for 70 % of picks. */
export function nextLook(rng: Rng, prev: Look | null, w: LookWeights | null): Look {
  for (let i = 0; i < 20; i++) {
    const learned = w !== null && !rng.chance(EXPLORE);
    const l: Look = {
      variant: learned ? rng.weighted(fill(VARIANTS, w.variant)) : rng.pick(VARIANTS),
      color: learned ? rng.weighted(fill(COLORS, w.color)) : rng.pick(COLORS),
      size: learned ? rng.weighted(fill(SIZES, w.size)) : rng.pick(SIZES),
    };
    if (!prev || lookKey(l) !== lookKey(prev)) return l;
  }
  // Twenty equal draws in a row: weights pin one look. Change the colour by hand.
  const p = prev!;
  return { ...p, color: COLORS[(COLORS.indexOf(p.color) + 1) % COLORS.length] };
}

function fill<K extends string>(keys: readonly K[], w: Partial<Record<K, number>>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = w[k] ?? 1;
  return out;
}
