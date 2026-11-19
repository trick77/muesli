// One prey animal: a state machine over a steered body. Pure: no DOM, no clock, randomness only from the Rng.
//
// The body always moves the way it faces (heading), its speed eases toward a target speed and its heading turns
// at a bounded rate, so nothing jumps, glides sideways or bounces. Speeds are in shorts per second (the short screen
// edge), so a phone and a desktop look alike.
import {
  angleTo,
  clampTo,
  dist,
  edgeDistance,
  inner,
  nearestSide,
  onScreen,
  onSide,
  outward,
  rayToBox,
  short,
  SIDES,
  wrap,
  type Box,
  type Field,
  type Side,
  type Vec,
} from './geom';
import { SIZE_SCALE, type Look, type Variant } from './look';
import type { Rng } from './prng';

export type State =
  'creep' | 'freeze' | 'bolt' | 'edge' | 'peek' | 'exit' | 'away' | 'enter' | 'caught' | 'dead' | 'lure';

/** The states the prey picks between on its own; the rest are reactions or the director's. */
export type Choice = 'creep' | 'freeze' | 'bolt' | 'edge' | 'peek';
export const CHOICES: readonly Choice[] = ['creep', 'freeze', 'bolt', 'edge', 'peek'];

export type Tier = 'still' | 'creep' | 'trot' | 'sprint' | 'blitz';
export const TIERS: readonly Tier[] = ['still', 'creep', 'trot', 'sprint', 'blitz'];

/** Speed bands, shorts per second; each state draws its speed anew on entry. */
export const TIER_SPEED: Record<Tier, [number, number]> = {
  still: [0, 0],
  creep: [0.05, 0.2],
  trot: [0.25, 0.45],
  sprint: [0.7, 1.1],
  blitz: [1.3, 1.6],
};

/**
 * Visible seconds after which a tier that has not come is forced next: every 30 s stretch on screen holds a stop,
 * a creep and a sprint; a 2-minute session holds all five.
 */
export const TIER_DUE: Record<Tier, number> = { still: 18, creep: 18, trot: 25, sprint: 18, blitz: 25 };

/** How each shape moves (plan: mouse straight bursts in wide arcs, beetle short zigzag, dot in between). */
interface Motion {
  /** Max turn while moving, rad/s. */
  turn: number;
  /** Seconds between jinks while bolting. */
  jinkEvery: [number, number];
  /** Size of a jink, rad. */
  jink: [number, number];
  burst: [number, number];
  pause: [number, number];
  /** Half the body's length over its radius: the hit test's spine. */
  spine: number;
  /** Body length over diameter (scare distances are in body lengths). */
  length: number;
}

export const MOTION: Record<Variant, Motion> = {
  mouse: {
    turn: Math.PI,
    jinkEvery: [0.6, 1.2],
    jink: [0.15, 0.35],
    burst: [0.5, 1.5],
    pause: [0.1, 0.4],
    spine: 0.6,
    length: 1.5,
  },
  beetle: {
    turn: 1.3 * Math.PI,
    jinkEvery: [0.25, 0.5],
    jink: [0.4, 0.8],
    burst: [0.3, 0.9],
    pause: [0.2, 0.6],
    spine: 0.4,
    length: 1.3,
  },
  dot: {
    turn: 1.15 * Math.PI,
    jinkEvery: [0.4, 0.8],
    jink: [0.25, 0.55],
    burst: [0.4, 1.2],
    pause: [0.1, 0.5],
    spine: 0,
    length: 1,
  },
};

/** Turn rate standing still, rad/s: a beetle spins on the spot, any prey turns round before it runs. */
const TURN_STILL = 2.5 * Math.PI;
/** Turn rate on a scare: it wheels round and runs. */
const TURN_FLEE = 5 * Math.PI;
/** Acceleration, shorts/s²: still to sprint in about 0.1 s, braking in about 0.2 s. */
const ACCEL = 10;
const BRAKE = 5;
/** A turn wider than this (rad) while moving needs a stop first: no U-turns at speed. */
const STOP_TURN = 2.1;
/**
 * Base radius over the short edge, clamped to px. Half the first draft's 4.5 %: on a real desktop and iPad that
 * prey looked twice too big.
 */
const RADIUS = 0.0225;
const R_MIN = 12;
const R_MAX = 28;
/** Width of the band along the walls the prey creeps in, shorts. */
const BAND = 0.2;
/** Seconds a scare blocks the next one: a swiping paw is one scare, not twenty. */
const SCARE_COOLDOWN = 0.35;

/** What the session tells the prey each step. */
export interface Drive {
  /** Factor on every speed: fatigue, wounds, learning, adaptation. */
  speed: number;
  /** Factor on freeze durations (a tired prey rests longer). */
  freeze: number;
  /** Weights of the prey's own choices (mood × learned), 1 = neutral. */
  weights: Partial<Record<Choice, number>>;
  /** Time to leave the screen. */
  exitDue: boolean;
  /** Last prey of the session: slow, stays in the open, never leaves. */
  easy: boolean;
}

export const NEUTRAL: Drive = { speed: 1, freeze: 1, weights: {}, exitDue: false, easy: false };

export type PreyEvent =
  | { kind: 'squeak' | 'rustle' | 'tick' | 'scare' | 'hit' | 'kill' | 'enter'; x: number; y: number }
  /** Gone off screen through `side`; the session decides how long it stays away. */
  | { kind: 'away'; x: number; y: number; side: Side }
  /** Dead and faded: the session sends the next prey. */
  | { kind: 'gone'; x: number; y: number };

type Sub = 'go' | 'pause' | 'out' | 'hidden' | 'in' | 'hold' | 'emerge' | 'wiggle';

export class Prey {
  pos: Vec;
  /** Position at the start of the last step: drawn in between (App.alpha). */
  prev: Vec;
  heading: number;
  prevHeading: number;
  speed = 0;
  state: State = 'away';
  /** Seconds in the current state. */
  stateT = 0;
  /** Sub-phase inside creep/edge (bursts), peek/enter (peeking) and lure. */
  sub: Sub = 'go';
  /** Speed band currently asked for: the trace view and the variety guarantee. */
  tier: Tier = 'still';
  r: number;
  wounds = 0;
  /** Hits that kill it (2 to 4, 1 when easy). */
  lives: number;
  /** 0..1, fades the body when dead. */
  opacity = 1;
  /** Distance walked, px: leg and tail phase. */
  walked = 0;
  /** Recent positions, about r/3 apart, newest first: the mouse's tail follows them. */
  trail: Vec[] = [];
  /** True if the last step slid along a wall (heading set to the wall's direction). */
  slid = false;
  /** Visible seconds; tierSeen[t] is the visible time a tier last ran. */
  visibleT = 0;
  readonly tierSeen: Record<Tier, number> = { still: 0, creep: 0, trot: 0, sprint: 0, blitz: 0 };
  /** Where and when it last left: re-entry comes elsewhere. */
  exitPoint: Vec | null = null;
  exitSide: Side | null = null;
  events: PreyEvent[] = [];

  private target: Vec | null = null;
  private targetSpeed = 0;
  private stateDur = 0;
  private subT = 0;
  private subDur = 0;
  private jinkT = 0;
  private jinkOff = 0;
  private fleeing = false;
  private alertT = 0;
  private scareT = 0;
  private peekSide: Side = 'left';
  private peekAgain = false;
  private sound = 0;
  private lastPaw: Vec = { x: 0, y: 0 };
  private drive: Drive = NEUTRAL;

  constructor(
    readonly field: Field,
    private readonly rng: Rng,
    public look: Look,
    easy = false,
  ) {
    this.r = radius(field, look);
    this.lives = easy ? 1 : 2 + rng.int(3);
    this.pos = { x: -this.r * 3, y: field.h / 2 };
    this.prev = { ...this.pos };
    this.heading = 0;
    this.prevHeading = 0;
  }

  /** A new look, only while off screen: the cat never sees it change. */
  setLook(look: Look) {
    if (this.state !== 'away') return;
    this.look = look;
    this.r = radius(this.field, look);
  }

  /** The next animal after a kill: unhurt, its own lives. */
  renew(look: Look, easy: boolean) {
    this.wounds = 0;
    this.lives = easy ? 1 : 2 + this.rng.int(3);
    this.opacity = 1;
    this.setLook(look);
  }

  /** The screen changed size (rotation): the radius follows the short edge. */
  resized(old: { w: number; h: number } = this.field) {
    this.r = radius(this.field, this.look);
    // A rotation must not leave it outside the new screen, unseen, walking toward a target that no longer exists.
    if (this.state === 'away') return;
    const before = { ...this.pos };
    if (['exit', 'peek', 'enter'].includes(this.state)) {
      // At or past an edge: it keeps to the same edge of the new screen, as far out as it was.
      const move = (p: Vec): Vec => {
        const f = this.field;
        const x = p.x > old.w / 2 ? p.x + f.w - old.w : p.x;
        const y = p.y > old.h / 2 ? p.y + f.h - old.h : p.y;
        const m = this.r * 2;
        const inX = p.x >= 0 && p.x <= old.w;
        const inY = p.y >= 0 && p.y <= old.h;
        return {
          x: inX ? Math.max(m, Math.min(f.w - m, x)) : x,
          y: inY ? Math.max(m, Math.min(f.h - m, y)) : y,
        };
      };
      this.pos = move(this.pos);
      if (this.target) this.target = move(this.target);
    } else {
      const b = this.box();
      this.pos = clampTo(b, this.pos);
      if (this.target) this.target = clampTo(b, this.target);
    }
    this.prev = { ...this.pos };
    // the tail must not streak from where it was to where it is now
    if (dist(before, this.pos) > 1) this.trail = [];
  }

  get S() {
    return short(this.field);
  }

  get motion(): Motion {
    return MOTION[this.look.variant];
  }

  /** Body length, px. */
  get bodyLen() {
    return 2 * this.r * this.motion.length;
  }

  /** Any part on screen and drawn. */
  get visible(): boolean {
    return this.state !== 'away' && onScreen(this.field, this.pos, this.r * 1.5);
  }

  /** Hits count now (not while it struggles, lies dead or is off screen). */
  get catchable(): boolean {
    return this.visible && this.state !== 'caught' && this.state !== 'dead';
  }

  /** The hit test's spine: nose to tail root (a point for the dot). */
  spine(): [Vec, Vec] {
    const h = this.r * this.motion.spine;
    const dx = Math.cos(this.heading) * h;
    const dy = Math.sin(this.heading) * h;
    return [
      { x: this.pos.x + dx, y: this.pos.y + dy },
      { x: this.pos.x - dx, y: this.pos.y - dy },
    ];
  }

  /** Box the centre stays in while the prey is fully on screen. */
  box(): Box {
    return inner(this.field, this.r * 1.1);
  }

  // ---------------------------------------------------------------------------------------------- entry points

  /** Starts off screen and comes in (the session's first prey and every new one). */
  spawn(avoid: Vec | null = null) {
    this.exitPoint = avoid;
    this.go('enter');
  }

  step(dt: number, drive: Drive) {
    this.drive = drive;
    this.prev = { ...this.pos };
    this.prevHeading = this.heading;
    this.stateT += dt;
    this.scareT = Math.max(0, this.scareT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    this.think(dt);
    this.move(dt);
    if (this.visible) {
      this.visibleT += dt;
      if (this.tier === 'still' ? this.speed < 0.02 * this.S : this.speed > 0.01 * this.S)
        this.tierSeen[this.tier] = this.visibleT;
    }
    this.noises(dt);
  }

  /** A paw landed at `paw` without hitting: near → flee, a little further → freeze or flee. */
  scare(paw: Vec) {
    if (!this.catchable || this.scareT > 0 || this.state === 'exit' || this.state === 'lure') return;
    const d = dist(paw, this.pos);
    const L = this.bodyLen;
    if (d > 6 * L) return;
    if (d > 3 * L) {
      // Prey that hopes not to be seen: freezes first, runs at the second scare.
      if (this.alertT > 0) return this.flee(paw, 'sprint');
      if (this.state !== 'freeze' && this.rng.chance(0.5)) {
        this.alertT = 3;
        this.scareT = SCARE_COOLDOWN;
        this.go('freeze', this.rng.range(1.2, 2.5));
      }
      return;
    }
    this.flee(paw, 'sprint');
  }

  /** The paw hit at `paw`. Returns true if this hit killed it. */
  hit(paw: Vec): boolean {
    if (!this.catchable) return false;
    this.lastPaw = { ...paw };
    this.wounds++;
    this.emit('hit');
    this.emit('squeak');
    this.go('caught');
    return this.wounds >= this.lives;
  }

  /** The director pulls it toward the middle to wiggle (no touch for a while). */
  lure() {
    if (this.state === 'away' || this.state === 'caught' || this.state === 'dead' || this.state === 'exit') return;
    if (this.state === 'enter' || this.state === 'peek') return;
    this.go('lure');
  }

  /** Session end: leave at once if away, so the last prey shows up now. */
  comeBack() {
    if (this.state === 'away') this.go('enter');
  }

  // ---------------------------------------------------------------------------------------------- state machine

  private go(s: State, dur?: number) {
    const from = this.state;
    this.state = s;
    this.stateT = 0;
    this.fleeing = false;
    this.target = null;
    this.sub = 'go';
    this.subT = 0;
    const rng = this.rng;
    const S = this.S;
    const box = this.box();
    switch (s) {
      case 'freeze':
        this.setTier('still');
        this.stateDur = dur ?? rng.range(0.5, 2) * this.drive.freeze * (this.drive.easy ? 1.8 : 1);
        break;
      case 'creep': {
        this.setTier('creep');
        this.stateDur = rng.range(1, 4);
        this.target = this.alongWall(rng.range(0.15, 0.4) * S, rng.range(0, BAND * 0.5) * S);
        this.startBurst();
        break;
      }
      case 'edge': {
        this.setTier('trot');
        this.stateDur = rng.range(2, 5);
        this.target = this.alongWall(rng.range(0.4, 1) * S, 0, true);
        this.startBurst();
        break;
      }
      case 'bolt': {
        const blitz = this.due('blitz');
        this.setTier(blitz ? 'blitz' : 'sprint');
        this.stateDur = 3;
        this.target = blitz ? this.across() : this.cover(0.35 * S);
        this.jinkT = rng.range(...this.motion.jinkEvery);
        if (rng.chance(0.25)) this.emit('squeak');
        break;
      }
      case 'peek': {
        this.peekSide = nearestSide(box, this.pos);
        this.peekAgain = rng.chance(0.45);
        this.setTier('trot');
        this.stateDur = 12;
        this.sub = 'out';
        this.target = this.offScreen(this.peekSide, this.pos, 2.4);
        break;
      }
      case 'exit': {
        const side = nearestSide(box, this.pos);
        this.setTier('sprint');
        this.stateDur = 4;
        this.target = this.offScreen(side, this.pos, 2.2);
        this.exitSide = side;
        break;
      }
      case 'away':
        this.setTier('still');
        this.speed = 0;
        this.targetSpeed = 0;
        this.stateDur = dur ?? Infinity;
        this.trail = [];
        break;
      case 'enter':
        this.enter();
        break;
      case 'caught':
        this.setTier('still');
        // The paw pins it: no easing out of a sprint under a paw.
        this.speed = 0;
        this.stateDur = rng.range(0.4, 1);
        break;
      case 'dead':
        this.setTier('still');
        this.speed = 0;
        this.stateDur = rng.range(1, 2) + 0.6;
        break;
      case 'lure':
        this.setTier('trot');
        this.stateDur = 9;
        this.target = {
          x: this.field.w / 2 + rng.range(-0.15, 0.15) * S,
          y: this.field.h / 2 + rng.range(-0.1, 0.1) * S,
        };
        this.sub = 'go';
        break;
    }
    if (from === 'away' && s !== 'away') this.emit('enter');
  }

  /** Called every step: ends states, runs sub-phases, takes the director's exit. */
  private think(dt: number) {
    const rng = this.rng;
    const d = this.drive;
    this.subT += dt;
    if (d.exitDue && !d.easy && this.canLeave()) return this.go('exit');

    switch (this.state) {
      case 'away':
        if (this.stateT >= this.stateDur) this.go('enter');
        return;
      case 'exit':
        if (!onScreen(this.field, this.pos, this.r * 1.6) || this.stateT > this.stateDur) this.leave();
        return;
      case 'caught':
        if (this.stateT >= this.stateDur) {
          if (this.wounds >= this.lives) this.go('dead');
          else this.flee(this.lastPaw, 'blitz', true);
        }
        return;
      case 'dead':
        this.opacity = Math.max(0, Math.min(1, (this.stateDur - this.stateT) / 0.6));
        if (this.stateT >= this.stateDur) {
          this.opacity = 0;
          this.events.push({ kind: 'gone', x: this.pos.x, y: this.pos.y });
          this.go('away');
        }
        return;
      case 'peek':
      case 'enter':
        return this.thinkPeek();
      case 'lure':
        if (this.sub === 'go' && this.arrived()) {
          this.sub = 'wiggle';
          this.subT = 0;
          this.setTier('still');
          this.subDur = rng.range(2, 3.5);
          this.emit('rustle');
        } else if (this.sub === 'wiggle' && this.subT >= this.subDur) this.next();
        else if (this.stateT > this.stateDur) this.next();
        return;
      case 'creep':
      case 'edge':
        this.bursts();
        if (this.arrived()) {
          if (this.state === 'edge') this.target = this.alongWall(rng.range(0.4, 1) * this.S, 0, true);
          else this.target = this.alongWall(rng.range(0.15, 0.4) * this.S, rng.range(0, BAND * 0.5) * this.S);
        }
        break;
      case 'bolt':
        if (this.arrived()) return this.fleeing ? this.go('freeze') : this.next();
        this.jinkT -= dt;
        if (this.jinkT <= 0) {
          this.jinkT = rng.range(...this.motion.jinkEvery);
          this.jinkOff = rng.sign() * rng.range(...this.motion.jink);
        }
        break;
    }
    if (this.stateT >= this.stateDur) this.next();
  }

  /** Anything but a struggle, death or a running exit can be cut short by the director's exit. */
  private canLeave() {
    return !['exit', 'away', 'caught', 'dead'].includes(this.state);
  }

  /** The prey's own choice of what comes next. */
  private next() {
    if (!inBox(this.box(), this.pos)) {
      // Still half off screen (a peek cut short): in first.
      this.go('bolt');
      const n = outward(nearestSide(this.box(), this.pos));
      this.target = clampTo(this.box(), { x: this.pos.x - n.x * 0.2 * this.S, y: this.pos.y - n.y * 0.2 * this.S });
      return;
    }
    const forced = this.forcedTier();
    if (forced) return this.go(forced);
    const w: Partial<Record<Choice, number>> = { creep: 4, freeze: 2, bolt: 2, edge: 3, peek: 1 };
    // freeze often comes right before a sprint, and after one
    if (this.state === 'freeze') w.bolt! *= 2;
    if (this.state === 'bolt') w.freeze! *= 1.5;
    for (const c of CHOICES) w[c]! *= this.drive.weights[c] ?? 1;
    if (this.drive.easy) {
      w.peek = 0;
      w.bolt! *= 0.3;
      w.freeze! *= 2;
    }
    // Never the same state twice in a row.
    if ((CHOICES as readonly string[]).includes(this.state)) w[this.state as Choice] = 0;
    // Creeping only happens along the walls: out in the open it runs for cover instead.
    if (edgeDistance(this.box(), this.pos) > BAND * this.S) w.creep = 0;
    this.go(this.rng.weighted(w));
  }

  /** A speed band that has not run for too long, as the state that runs it. */
  private forcedTier(): Choice | null {
    if (this.drive.easy) return null;
    const order: [Tier, Choice][] = [
      ['sprint', 'bolt'],
      ['still', 'freeze'],
      ['creep', 'creep'],
      ['trot', 'edge'],
      ['blitz', 'bolt'],
    ];
    for (const [t, c] of order) if (this.due(t) && c !== this.state) return c;
    return null;
  }

  private due(t: Tier) {
    return this.visibleT - this.tierSeen[t] >= TIER_DUE[t];
  }

  private leave() {
    this.exitPoint = { ...this.pos };
    const side = this.exitSide ?? nearestSide(this.box(), this.pos);
    this.exitSide = side;
    this.events.push({ kind: 'away', x: this.pos.x, y: this.pos.y, side });
    this.go('away');
  }

  /** Stays away for `s` seconds (the session's call, after an `away` event). */
  stayAway(s: number) {
    if (this.state === 'away') this.stateDur = s;
  }

  // ---------------------------------------------------------------------------------------------- peeking

  /** Comes back elsewhere: mostly a careful peek from another side, sometimes a dash right across. */
  private enter() {
    const rng = this.rng;
    const sides = SIDES.filter((s) => s !== this.exitSide);
    let side: Side = rng.pick(sides);
    let start = onSide(this.field, side, rng.range(0.15, 0.85), this.r * 1.8);
    for (let i = 0; i < 10 && this.exitPoint && dist(start, this.exitPoint) < 0.4 * this.S; i++) {
      side = rng.pick(sides);
      start = onSide(this.field, side, rng.range(0.15, 0.85), this.r * 1.8);
    }
    this.pos = start;
    this.prev = { ...start };
    const n = outward(side);
    this.heading = Math.atan2(-n.y, -n.x);
    this.prevHeading = this.heading;
    this.speed = 0;
    this.trail = [];
    this.peekSide = side;
    this.stateDur = 15;
    if (!this.drive.easy && (rng.chance(0.2) || this.due('blitz'))) {
      // No warning: straight across.
      this.state = 'bolt';
      this.setTier('blitz');
      this.stateDur = 4;
      this.target = this.across(side);
      return;
    }
    this.peekAgain = false;
    this.setTier('creep');
    this.sub = 'in';
    this.target = this.peekPoint(side, start);
  }

  private thinkPeek() {
    const rng = this.rng;
    switch (this.sub) {
      case 'out':
        // Fully out of sight before it may turn round unseen.
        if (!this.visible) {
          this.sub = 'hidden';
          this.subT = 0;
          this.subDur = rng.range(0.3, 1);
          this.setTier('still');
        }
        break;
      case 'hidden':
        if (this.subT >= this.subDur) {
          // Off screen nobody sees it turn round; it comes back a little way along the side.
          const n = outward(this.peekSide);
          const along = rng.range(-0.15, 0.15) * this.S;
          const p = { x: this.pos.x + (n.y !== 0 ? along : 0), y: this.pos.y + (n.x !== 0 ? along : 0) };
          const c = clampTo(
            { x0: -4 * this.r, y0: -4 * this.r, x1: this.field.w + 4 * this.r, y1: this.field.h + 4 * this.r },
            p,
          );
          this.pos = { ...c };
          this.prev = { ...c };
          this.heading = Math.atan2(-n.y, -n.x);
          this.prevHeading = this.heading;
          this.trail = [];
          this.sub = 'in';
          this.subT = 0;
          this.setTier('creep');
          this.target = this.peekPoint(this.peekSide, this.pos);
        }
        break;
      case 'in':
        if (this.arrived()) {
          this.sub = 'hold';
          this.subT = 0;
          this.subDur = rng.range(0.8, 2.2);
          this.setTier('still');
          if (rng.chance(0.4)) this.emit('rustle');
        }
        break;
      case 'hold':
        if (this.subT >= this.subDur) {
          if (this.peekAgain) {
            this.peekAgain = false;
            this.sub = 'out';
            this.subT = 0;
            this.setTier('creep');
            this.target = this.offScreen(this.peekSide, this.pos, 2.4);
          } else {
            this.sub = 'emerge';
            this.subT = 0;
            this.setTier('creep');
            const n = outward(this.peekSide);
            const depth = this.r * 1.1 + this.rng.range(0.05, 0.12) * this.S;
            const p = { x: this.pos.x - n.x * depth * 2, y: this.pos.y - n.y * depth * 2 };
            this.target = clampTo(this.box(), p);
          }
        }
        break;
      case 'emerge':
        if (this.arrived() || this.subT > 4) return this.next();
        break;
    }
    if (this.stateT > this.stateDur) this.next();
  }

  // ---------------------------------------------------------------------------------------------- reactions

  /**
   * Runs away from `paw` to the nearest cover (a wall) in that direction, not across the open; near a wall it may
   * leave the screen.
   */
  private flee(paw: Vec, tier: Tier, hurt = false) {
    const S = this.S;
    const box = this.box();
    const away = dist(paw, this.pos) < 1 ? this.heading + Math.PI : angleTo(paw, this.pos);
    // Fan of escape angles: in a corner the straight-away ray is short, a side ray gets it out.
    let best = away;
    let bestScore = -1;
    let bestRun = 0;
    // Up to square to the paw: pinned against a wall it runs along it, never back past the paw.
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.5, -1.5]) {
      const a = away + off;
      const run = rayToBox(box, this.pos, a);
      // A short dash to the wall beats a long run through the open; a run of nothing (pressed in a corner) is no
      // escape at all.
      const reach = run < 0.12 * S ? (0.3 * run) / (0.12 * S) : 1 / (1 + Math.max(0, run - 0.35 * S) / (0.35 * S));
      const score = reach * (1 - 0.2 * Math.abs(off));
      if (score > bestScore) {
        bestScore = score;
        best = a;
        bestRun = run;
      }
    }
    this.scareT = SCARE_COOLDOWN;
    this.alertT = 0;
    this.emit('scare');
    if (!inBox(box, this.pos) && !this.drive.easy) {
      // Caught peeking: ducks back out of sight and peeks again a little further along, it does not leave for good.
      const side = nearestSide(box, this.pos);
      this.go('peek');
      this.peekSide = side;
      this.peekAgain = false;
      this.sub = 'out';
      this.setTier('sprint');
      this.target = this.offScreen(side, this.pos, 2.4);
      this.fleeing = true;
      return;
    }
    if (!this.drive.easy && bestRun < 0.3 * S && this.rng.chance(hurt ? 0.15 : 0.25)) {
      // Out through the wall it is running at: a mouse diving into its hole.
      this.go('exit');
      this.target = {
        x: this.pos.x + Math.cos(best) * (bestRun + this.r * 4),
        y: this.pos.y + Math.sin(best) * (bestRun + this.r * 4),
      };
      this.exitSide = nearestSide(box, this.target);
      this.fleeing = true;
      return;
    }
    this.go('bolt');
    this.setTier(this.drive.easy ? 'sprint' : tier);
    this.fleeing = true;
    if (!inBox(box, this.pos)) {
      // The last prey, hit while peeking: it runs in, never stays half off screen.
      const n = outward(nearestSide(box, this.pos));
      this.target = clampTo(box, { x: this.pos.x - n.x * 0.3 * S, y: this.pos.y - n.y * 0.3 * S });
      return;
    }
    this.target = { x: this.pos.x + Math.cos(best) * bestRun, y: this.pos.y + Math.sin(best) * bestRun };
    this.stateDur = 3;
  }

  // ---------------------------------------------------------------------------------------------- targets

  /** A point along the nearest wall, `along` px on, `depth` px in from it; `corner` runs on into corners. */
  private alongWall(along: number, depth: number, corner = false): Vec {
    const b = this.box();
    const side = nearestSide(b, this.pos);
    const dir = this.wallDir(side);
    let x = this.pos.x;
    let y = this.pos.y;
    if (side === 'left') x = b.x0 + depth;
    if (side === 'right') x = b.x1 - depth;
    if (side === 'top') y = b.y0 + depth;
    if (side === 'bottom') y = b.y1 - depth;
    x += dir.x * along;
    y += dir.y * along;
    const p = clampTo(b, { x, y });
    if (corner && dist(p, this.pos) < this.r) {
      // Stuck in a corner: turn onto the next wall.
      return clampTo(b, { x: this.pos.x - dir.x * along, y: this.pos.y - dir.y * along });
    }
    return p;
  }

  /** Along-wall direction: keeps going the way it faces if it can. */
  private wallDir(side: Side): Vec {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    if (side === 'left' || side === 'right') return { x: 0, y: s === 0 ? this.rng.sign() : Math.sign(s) };
    return { x: c === 0 ? this.rng.sign() : Math.sign(c), y: 0 };
  }

  /**
   * Cover: a point on the walls at least `min` px away, a corner now and then. Mostly nearby (up to 0.8 shorts):
   * prey dashes from one cover to the next, it crosses the whole open only now and then.
   */
  private cover(min: number): Vec {
    const b = this.box();
    const open = this.rng.chance(0.15);
    const max = open ? Infinity : 0.7 * this.S;
    // Mostly along its own wall or round the corner onto the next, not over to the opposite one.
    const here = nearestSide(b, this.pos);
    const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    for (let i = 0; i < 30; i++) {
      let p: Vec;
      if (this.rng.chance(0.3)) p = { x: this.rng.pick([b.x0, b.x1]), y: this.rng.pick([b.y0, b.y1]) };
      else {
        const side = this.rng.pick(SIDES);
        const t = this.rng.next();
        p =
          side === 'left' || side === 'right'
            ? { x: side === 'left' ? b.x0 : b.x1, y: b.y0 + t * (b.y1 - b.y0) }
            : { x: b.x0 + t * (b.x1 - b.x0), y: side === 'top' ? b.y0 : b.y1 };
      }
      const d = dist(p, this.pos);
      const across =
        edgeDistance(b, p) < 1 && nearestSide(b, p) === opposite[here] && edgeDistance(b, this.pos) < BAND * this.S;
      if (d >= min && d <= max && (open || !across)) return p;
    }
    return { x: this.pos.x < (b.x0 + b.x1) / 2 ? b.x1 : b.x0, y: this.pos.y < (b.y0 + b.y1) / 2 ? b.y1 : b.y0 };
  }

  /** The far side of the screen from `from` (or from where it stands). */
  private across(from?: Side): Vec {
    const b = this.box();
    const side = from ?? nearestSide(b, this.pos);
    const t = this.rng.range(0.15, 0.85);
    switch (side) {
      case 'left':
        return { x: b.x1, y: b.y0 + t * (b.y1 - b.y0) };
      case 'right':
        return { x: b.x0, y: b.y0 + t * (b.y1 - b.y0) };
      case 'top':
        return { x: b.x0 + t * (b.x1 - b.x0), y: b.y1 };
      default:
        return { x: b.x0 + t * (b.x1 - b.x0), y: b.y0 };
    }
  }

  /** Straight out past side s, `k` radii beyond the screen edge. */
  private offScreen(s: Side, from: Vec, k: number): Vec {
    const n = outward(s);
    const f = this.field;
    const edge =
      s === 'left'
        ? { x: 0, y: from.y }
        : s === 'right'
          ? { x: f.w, y: from.y }
          : s === 'top'
            ? { x: from.x, y: 0 }
            : { x: from.x, y: f.h };
    return { x: edge.x + n.x * this.r * k, y: edge.y + n.y * this.r * k };
  }

  /** Where it holds while peeking: its centre a little outside side s, the head and front showing. */
  private peekPoint(s: Side, from: Vec): Vec {
    const f = this.field;
    const x = Math.max(this.r * 2, Math.min(f.w - this.r * 2, from.x));
    const y = Math.max(this.r * 2, Math.min(f.h - this.r * 2, from.y));
    const out = this.r * 0.3;
    if (s === 'left') return { x: -out, y };
    if (s === 'right') return { x: f.w + out, y };
    if (s === 'top') return { x, y: -out };
    return { x, y: f.h + out };
  }

  // ---------------------------------------------------------------------------------------------- body

  private setTier(t: Tier) {
    this.tier = t;
    const [a, b] = TIER_SPEED[t];
    this.targetSpeed = this.rng.range(a, b) * this.S;
  }

  private startBurst() {
    this.sub = 'go';
    this.subT = 0;
    this.subDur = this.rng.range(...this.motion.burst);
  }

  /** creep and edge run in bursts with short stops; edge sprints now and then. */
  private bursts() {
    if (this.subT < this.subDur) return;
    this.subT = 0;
    if (this.sub === 'go') {
      this.sub = 'pause';
      this.subDur = this.rng.range(...this.motion.pause);
      this.targetSpeed = 0;
    } else {
      this.sub = 'go';
      this.subDur = this.rng.range(...this.motion.burst);
      const t: Tier = this.state === 'edge' ? (this.rng.chance(0.25) ? 'sprint' : 'trot') : 'creep';
      if (this.state === 'edge' && t === 'sprint') this.subDur = this.rng.range(0.3, 0.6);
      this.setTier(t);
    }
  }

  private arrived(): boolean {
    if (!this.target) return true;
    return dist(this.pos, this.target) < Math.max(this.r * 0.35, this.speed * 0.05);
  }

  private move(dt: number) {
    const S = this.S;
    const d = this.drive;
    let want = this.targetSpeed * d.speed;
    if (this.state === 'creep' || this.state === 'edge') {
      if (this.sub === 'pause') want = 0;
    }
    // Brakes into its target instead of overshooting.
    if (this.target) {
      const left = dist(this.pos, this.target);
      want = Math.min(want, Math.sqrt(2 * BRAKE * S * 0.9 * left));
      let desired = angleTo(this.pos, this.target) + (this.state === 'bolt' ? this.jinkOff : 0);
      if (left < this.r) desired = angleTo(this.pos, this.target);
      const diff = wrap(desired - this.heading);
      const still = this.speed < 0.03 * S;
      // No U-turns at speed: stop, then turn.
      if (!this.fleeing && !still && Math.abs(diff) > STOP_TURN) want = 0;
      const rate = this.fleeing ? TURN_FLEE : still ? TURN_STILL : this.motion.turn * (this.state === 'bolt' ? 1.6 : 1);
      this.heading = wrap(this.heading + Math.max(-rate * dt, Math.min(rate * dt, diff)));
      // Faces roughly where it goes before it speeds up; on a scare it wheels round first, never charging the paw.
      if (Math.abs(diff) > 1.2) want = Math.min(want, (this.fleeing ? 0.1 : 0.04) * S);
    } else want = 0;
    if (this.state === 'freeze' || this.state === 'caught' || this.state === 'dead' || this.state === 'away') want = 0;
    if (this.sub === 'hold' || this.sub === 'hidden' || this.sub === 'wiggle') want = 0;
    const dv = want - this.speed;
    this.speed += Math.max(-BRAKE * S * dt, Math.min(ACCEL * S * dt, dv));
    if (this.speed < 0) this.speed = 0;

    const step = this.speed * dt;
    let nx = this.pos.x + Math.cos(this.heading) * step;
    let ny = this.pos.y + Math.sin(this.heading) * step;
    this.slid = false;
    if (this.confined() && step > 0) {
      const b = this.box();
      if (nx < b.x0 || nx > b.x1 || ny < b.y0 || ny > b.y1) {
        // Along the wall, never off it: the heading turns to the wall's direction (no bounce).
        const c = clampTo(b, { x: nx, y: ny });
        const mx = c.x - this.pos.x;
        const my = c.y - this.pos.y;
        // Head-on into a corner it stands pressed in, braking as usual, until it has turned away.
        if (Math.hypot(mx, my) > 1e-6) this.heading = Math.atan2(my, mx);
        nx = c.x;
        ny = c.y;
        this.slid = true;
      }
    }
    const moved = Math.hypot(nx - this.pos.x, ny - this.pos.y);
    this.pos = { x: nx, y: ny };
    this.walked += moved;
    const last = this.trail[0];
    if (!last || dist(last, this.pos) > this.r / 3) {
      this.trail.unshift({ ...this.pos });
      if (this.trail.length > 16) this.trail.length = 16;
    }
  }

  /** States that keep the whole body on screen, once it is in: coming in from outside is never a jump. */
  private confined(): boolean {
    if (this.state === 'exit' || this.state === 'away') return false;
    if ((this.state === 'peek' || this.state === 'enter') && this.sub !== 'emerge') return false;
    return inBox(this.box(), this.pos);
  }

  /** Rustles while creeping, ticks while trotting along a wall: never a steady tone. */
  private noises(dt: number) {
    if (!this.visible || this.speed < 0.02 * this.S) return;
    this.sound -= dt;
    if (this.sound > 0) return;
    if (this.state === 'edge') {
      this.emit('tick');
      this.sound = this.rng.range(0.12, 0.3);
    } else if (this.state === 'creep' || this.sub === 'in') {
      if (this.rng.chance(0.5)) this.emit('rustle');
      this.sound = this.rng.range(0.8, 2.5);
    } else this.sound = this.rng.range(0.3, 0.8);
  }

  private emit(kind: 'squeak' | 'rustle' | 'tick' | 'scare' | 'hit' | 'kill' | 'enter') {
    this.events.push({ kind, x: this.pos.x, y: this.pos.y });
  }
}

/** Body radius, px: 2.25 % of the short edge, 12..28 px, times the look's size. */
export function radius(f: Field, look: Look): number {
  return Math.max(R_MIN, Math.min(R_MAX, RADIUS * short(f))) * SIZE_SCALE[look.size];
}

const inBox = (b: Box, p: Vec) => p.x >= b.x0 - 0.5 && p.x <= b.x1 + 0.5 && p.y >= b.y0 - 0.5 && p.y <= b.y1 + 0.5;

export { BAND };
