// One hunt: the prey, the director, the paws, what the cat touched. Screens feed pointer events and steps in and
// drain `events` (sounds, particles, the end).
import { Director } from './director';
import { dist, short, type Field, type Vec } from './geom';
import { PawTracker, SLOP, strikes, type Strike } from './hit';
import type { Tally, Weights } from './learn';
import { nextLook, type Look, type LookWeights } from './look';
import { Rng } from './prng';
import { CHOICES, Prey, type Choice, type Drive, type PreyEvent } from './prey';

export interface SessionOpts {
  seed: number;
  field: Field;
  /** Seconds until the finale. */
  length: number;
  /** A touch screen (paws drive lure, lurk and adaptation). */
  touch: boolean;
  learned: Weights | null;
  /** The look the last session ended on: the first one here differs. */
  lastLook: Look | null;
}

export type GameEvent = (PreyEvent & { prey: Prey }) | { kind: 'end' } | { kind: 'lure' };

/** Misses that tire the prey fully (40 % slower, freezes twice as long). */
export const TIRE_MISSES = 8;
/** Hits in a row (no missed pounce between) after which the prey escapes off the screen in a zigzag. */
export const ESCAPE_STREAK = 2;
/** Chance that a single hit already sends it off. */
export const ESCAPE_FIRST = 0.25;

export class Session {
  readonly rng: Rng;
  readonly director: Director;
  readonly paws = new PawTracker();
  readonly field: Field;
  prey: Prey;
  /** A second prey for a few seconds while luring. */
  extra: Prey | null = null;
  events: GameEvent[] = [];
  hits = 0;
  misses = 0;
  /** Hits since the last missed pounce. */
  streak = 0;
  /** A paw (not a mouse) touched: only then is there anything to learn. */
  touchSeen = false;
  /** Touches and visible seconds per trait, for learn.ts. */
  readonly tallies: Record<string, Tally> = {};
  private extraLeft = 0;
  private lastLook: Look;

  constructor(private readonly opts: SessionOpts) {
    this.rng = new Rng(opts.seed);
    this.field = opts.field;
    this.director = new Director(this.rng, opts.length, opts.touch);
    this.lastLook = this.pickLook(opts.lastLook);
    this.prey = new Prey(this.field, this.rng, this.lastLook);
    this.prey.spawn();
  }

  get t() {
    return this.director.t;
  }

  get done() {
    return this.director.phase === 'done';
  }

  /** The look now showing (persisted, so the next session starts with another). */
  get look(): Look {
    return this.prey.look;
  }

  get tire(): number {
    return Math.min(1, this.misses / TIRE_MISSES);
  }

  get all(): Prey[] {
    return this.extra ? [this.prey, this.extra] : [this.prey];
  }

  /** The screen changed size: the prey keep this same field object. */
  resize(w: number, h: number, inset: Field['inset']) {
    const old = { w: this.field.w, h: this.field.h };
    this.field.w = w;
    this.field.h = h;
    this.field.inset = inset;
    for (const p of this.all) p.resized(old);
  }

  step(dt: number) {
    if (this.done) return;
    const d = this.director;
    this.paws.tick(d.t);
    const visible = this.all.some((p) => p.visible);
    const cue = d.step(dt, visible);
    if (cue === 'lure') this.lure();
    if (cue === 'finale') this.finale();

    this.prey.step(dt, this.drive(this.prey, false));
    if (this.extra) {
      this.extraLeft -= dt;
      this.extra.step(dt, this.drive(this.extra, this.extraLeft <= 0));
    }
    for (const p of this.all) {
      if (p.visible) this.tally(p, 's', dt);
      for (const e of p.events) this.handle(p, e);
      p.events = [];
    }
  }

  private drive(p: Prey, leave: boolean): Drive {
    const d = this.director;
    // Only the main prey turns easy in the finale; a lure's second prey still leaves when sent.
    const easy = d.phase === 'finale' && !leave;
    if (easy) return { speed: 0.55, freeze: 2, weights: {}, exitDue: false, easy: true };
    let speed = d.adapt() * (1 - 0.4 * this.tire) * (1 - 0.06 * p.wounds);
    const learned = this.opts.learned?.states ?? {};
    const weights: Partial<Record<Choice, number>> = {};
    for (const c of CHOICES) weights[c] = (d.weights[c] ?? 1) * (learned[c] ?? 1);
    // Hits and learning move the bands by at most a quarter; fatigue may slow it down to 60 %.
    speed = Math.max(0.6, Math.min(1.25, speed));
    return {
      speed,
      freeze: 1 + this.tire,
      weights,
      exitDue: leave || (p === this.prey && d.exitDue),
      easy: false,
    };
  }

  private handle(p: Prey, e: PreyEvent) {
    const d = this.director;
    if (e.kind === 'away') {
      if (p === this.extra) {
        this.extra = null;
        return;
      }
      if (d.phase === 'leaving') {
        d.end();
        this.events.push({ kind: 'end' });
        return;
      }
      // Off screen: it comes back changed (Hall et al. 2002), never as it left.
      p.setLook(this.pickLook(p.look));
      // The last prey shows up at once.
      p.stayAway(d.phase === 'finale' ? 0.3 : d.awayFor());
    } else if (e.kind === 'enter' && p === this.prey) d.returned();
    else if (e.kind === 'gone') {
      if (p === this.extra) {
        this.extra = null;
        return;
      }
      if (d.phase === 'finale' || d.phase === 'leaving') {
        d.end();
        this.events.push({ kind: 'end' });
        return;
      }
      d.killed();
      p.renew(this.pickLook(p.look), false);
      p.stayAway(this.rng.range(2, 5));
    }
    this.events.push({ ...e, prey: p });
  }

  private pickLook(prev: Look | null): Look {
    const learned = this.opts.learned?.look ?? null;
    const bias = this.director.sizeBias();
    const w: LookWeights = {
      variant: learned?.variant ?? {},
      color: learned?.color ?? {},
      size: {
        s: (learned?.size?.s ?? 1) * bias.s,
        m: (learned?.size?.m ?? 1) * bias.m,
        l: (learned?.size?.l ?? 1) * bias.l,
      },
    };
    const anyBias = learned !== null || bias.s !== 1;
    const l = nextLook(this.rng, prev, anyBias ? w : null);
    this.lastLook = l;
    return l;
  }

  private lure() {
    this.prey.lure();
    this.events.push({ kind: 'lure' });
    if (!this.extra && this.rng.chance(0.5)) {
      this.extra = new Prey(this.field, this.rng, nextLook(this.rng, this.prey.look, null));
      this.extra.lives = 1;
      this.extra.spawn(this.prey.pos);
      this.extraLeft = this.rng.range(5, 10);
    }
  }

  private finale() {
    const p = this.prey;
    p.lives = p.wounds + 1;
    p.comeBack();
    if (this.extra) this.extraLeft = 0;
  }

  // ------------------------------------------------------------------------------------------------ paws

  pointer(type: 'down' | 'move' | 'up' | 'cancel', id: number, at: Vec, kind: string) {
    if (this.done) return;
    if (type === 'up' || type === 'cancel') return this.paws.up(id);
    const s = type === 'down' ? this.paws.down(id, at, this.t) : this.paws.move(id, at, this.t);
    if (!s) return;
    if (kind !== 'mouse') this.touchSeen = true;
    this.director.touched();
    this.strike(s);
  }

  private strike(s: Strike) {
    let hit = false;
    for (const p of this.all) {
      if (!p.catchable) continue;
      if (strikes(s, p.spine(), 1.5 * p.r + SLOP)) {
        hit = true;
        this.hits++;
        this.misses = 0;
        this.director.hit();
        this.tally(p, 't', 1);
        // Hits in a row drive it off the screen; now and then a first one already does.
        this.streak++;
        const escape = this.streak >= ESCAPE_STREAK || this.rng.chance(ESCAPE_FIRST);
        if (escape) this.streak = 0;
        if (p.hit(s.b, escape)) {
          this.director.killed();
          p.events.push({ kind: 'kill', x: p.pos.x, y: p.pos.y });
        }
        break;
      }
    }
    if (hit) {
      for (const p of this.all) this.drainNow(p);
      return;
    }
    for (const p of this.all) {
      if (!p.catchable) continue;
      const near = dist(s.b, p.pos) <= 3 * p.bodyLen;
      if (near) this.tally(p, 't', 1);
      p.scare(s.b);
    }
    if (s.down) {
      this.misses++;
      this.streak = 0;
    }
    for (const p of this.all) this.drainNow(p);
  }

  /** Strikes come between steps: their sounds go out now, not a frame late. */
  private drainNow(p: Prey) {
    for (const e of p.events) this.handle(p, e);
    p.events = [];
  }

  private tally(p: Prey, k: 't' | 's', v: number) {
    const keys = [`variant:${p.look.variant}`, `color:${p.look.color}`, `size:${p.look.size}`];
    if ((CHOICES as readonly string[]).includes(p.state)) keys.push(`state:${p.state}`);
    for (const key of keys) {
      const f = (this.tallies[key] ??= { t: 0, s: 0 });
      f[k] += v;
    }
  }

  /** Units for the screens: the short edge, px. */
  get S() {
    return short(this.field);
  }
}
