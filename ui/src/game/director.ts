// The director: the session's pace above the prey. Hunting arcs (stalk, then chase), leaving the screen every 10 to
// 30 s, luring when no paw came for a while, lurking when none came for longer, and the ending.
import type { Rng } from './prng';
import type { Choice } from './prey';

export type Phase = 'hunt' | 'finale' | 'leaving' | 'done';
export type Mood = 'stalk' | 'chase';
export type Mode = 'normal' | 'lure' | 'lurk';

/** Seconds on screen between two exits (counted from the return). */
export const EXIT_GAP: [number, number] = [10, 30];
/** Seconds the prey stays away, drawn evenly: the cat can never tell when it comes back. Was up to 20 s. */
export const AWAY: [number, number] = [0.5, 10];
/** Away while lurking: it only peeks now and then. */
export const LURK_AWAY: [number, number] = [8, 15];
/** Seconds of prey on screen without a touch before luring, before lurking. */
export const LURE_AFTER = 10;
export const LURK_AFTER = 30;
/** The last prey waits this long to be caught, then runs off. */
export const FINALE_MAX = 15;

const MOOD_WEIGHTS: Record<Mood, Partial<Record<Choice, number>>> = {
  stalk: { creep: 2, freeze: 1.5, peek: 1.5, bolt: 0.5, edge: 0.8 },
  chase: { bolt: 2, edge: 2, creep: 0.5, freeze: 0.8, peek: 0.5 },
};

export class Director {
  /** Session clock, seconds. */
  t = 0;
  phase: Phase = 'hunt';
  mood: Mood = 'stalk';
  mode: Mode = 'normal';
  /** Seconds of prey on screen since the last touch. */
  idle = 0;
  /** Seconds on screen since the prey came back. */
  sinceReturn = 0;
  exitGap: number;
  finaleT = 0;
  private moodLeft: number;
  private lured = false;
  private nextLure: number;
  private hits: number[] = [];

  constructor(
    private readonly rng: Rng,
    /** Session length, seconds (2, 3 or 5 minutes). */
    readonly length: number,
    /** A touch screen: the cat's paws are the signal. Without one only time drives the pace. */
    readonly touch: boolean,
  ) {
    this.exitGap = rng.range(...EXIT_GAP);
    this.moodLeft = rng.range(8, 15);
    this.nextLure = rng.range(25, 45);
  }

  get exitDue(): boolean {
    if (this.phase === 'leaving') return true;
    if (this.phase !== 'hunt') return false;
    // Lurking: a few seconds of peeking, then off again.
    if (this.mode === 'lurk') return this.sinceReturn >= 3;
    return this.sinceReturn >= this.exitGap;
  }

  /** Weights for the prey's own choices in the current mood. */
  get weights(): Partial<Record<Choice, number>> {
    return MOOD_WEIGHTS[this.mood];
  }

  /**
   * Advances the clock. `visible`: some prey on screen. Returns what the session must do now: start a lure, end
   * the hunt (finale), or nothing.
   */
  step(dt: number, visible: boolean): 'lure' | 'finale' | 'leave' | null {
    this.t += dt;
    if (this.phase === 'finale') {
      this.finaleT += dt;
      if (this.finaleT >= FINALE_MAX) {
        this.phase = 'leaving';
        return 'leave';
      }
      return null;
    }
    if (this.phase !== 'hunt') return null;
    if (this.t >= this.length) {
      this.phase = 'finale';
      this.mode = 'normal';
      return 'finale';
    }
    this.moodLeft -= dt;
    if (this.moodLeft <= 0) {
      this.mood = this.mood === 'stalk' ? 'chase' : 'stalk';
      this.moodLeft = this.mood === 'stalk' ? this.rng.range(8, 15) : this.rng.range(10, 20);
    }
    if (visible) {
      this.sinceReturn += dt;
      // Away time is no time without a touch: nothing was there to touch.
      this.idle += dt;
    }
    if (this.touch) {
      if (this.idle >= LURK_AFTER && this.mode !== 'lurk') this.mode = 'lurk';
      else if (this.idle >= LURE_AFTER && !this.lured) {
        this.lured = true;
        this.mode = 'lure';
        return 'lure';
      }
    } else if (this.t >= this.nextLure) {
      this.nextLure = this.t + this.rng.range(25, 45);
      return 'lure';
    }
    return null;
  }

  /** Any paw on the glass: the hunt is on again. */
  touched() {
    this.idle = 0;
    this.lured = false;
    if (this.mode !== 'normal') this.mode = 'normal';
  }

  hit() {
    this.hits.push(this.t);
  }

  /** After a kill: rest, then stalk anew. */
  killed() {
    this.mood = 'stalk';
    this.moodLeft = this.rng.range(8, 15);
  }

  /** The prey is back on screen: the next exit comes 10 to 30 s from now. */
  returned() {
    this.sinceReturn = 0;
    this.exitGap = this.rng.range(...EXIT_GAP);
  }

  /** How long the prey stays away this time. */
  awayFor(): number {
    return this.mode === 'lurk' ? this.rng.range(...LURK_AWAY) : this.rng.range(...AWAY);
  }

  /** Hits in the last 30 s, for adaptation. */
  recentHits(): number {
    while (this.hits.length && this.hits[0] < this.t - 30) this.hits.shift();
    return this.hits.length;
  }

  /** A cat that catches a lot gets quicker prey, one that catches little slower (touch screens only). */
  adapt(): number {
    if (!this.touch || this.t < 30) return 1;
    const h = this.recentHits();
    if (h >= 3) return 1.12;
    if (h === 0) return 0.9;
    return 1;
  }

  /** The cat's hits push the next look's size: many → small, none → large. */
  sizeBias(): { s: number; m: number; l: number } {
    const a = this.adapt();
    if (a > 1) return { s: 1.6, m: 1, l: 0.6 };
    if (a < 1) return { s: 0.6, m: 1, l: 1.6 };
    return { s: 1, m: 1, l: 1 };
  }

  end() {
    this.phase = 'done';
  }
}
