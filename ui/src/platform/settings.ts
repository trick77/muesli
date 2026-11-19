// Per-device settings and learned taste in localStorage. Every access may throw (private mode, blocked storage):
// then the game runs on defaults and forgets on reload.
import { GAME_ID } from '../brand';
import { empty, parse, type LearnData } from '../game/learn';
import { COLORS, SIZES, VARIANTS, type Look } from '../game/look';

export const LENGTHS = [2, 3, 5] as const;
export type Minutes = (typeof LENGTHS)[number];

const key = (k: string) => `${GAME_ID}.${k}`;

function get(k: string): string | null {
  try {
    return localStorage.getItem(key(k));
  } catch {
    return null;
  }
}

function set(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key(k));
    else localStorage.setItem(key(k), v);
  } catch {
    // Storage blocked: lasts for this page only.
  }
}

export const settings = {
  get muted(): boolean {
    return get('muted') === '1';
  },
  set muted(m: boolean) {
    set('muted', m ? '1' : '0');
  },
  get minutes(): Minutes {
    const m = Number(get('minutes'));
    return (LENGTHS as readonly number[]).includes(m) ? (m as Minutes) : 2;
  },
  set minutes(m: Minutes) {
    set('minutes', String(m));
  },
  /** The look the last session ended on: the next one starts with another. */
  get lastLook(): Look | null {
    try {
      const l = JSON.parse(get('look') ?? 'null') as Look | null;
      if (l && VARIANTS.includes(l.variant) && COLORS.includes(l.color) && SIZES.includes(l.size)) return l;
    } catch {
      // unreadable: no previous look
    }
    return null;
  },
  set lastLook(l: Look | null) {
    set('look', l ? JSON.stringify(l) : null);
  },
  get learn(): LearnData {
    return parse(get('learn'));
  },
  set learn(d: LearnData) {
    set('learn', JSON.stringify(d));
  },
  resetLearn() {
    set('learn', JSON.stringify(empty()));
  },
};
