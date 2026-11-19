// The hunt: the session, its prey on black, the paws, sound and the pause hold.
import { STEP, type App, type Ptr, type Screen } from '../app';
import { audio } from '../audio/engine';
import type { Sound } from '../audio/synth';
import { merge, weights } from '../game/learn';
import type { Prey } from '../game/prey';
import { Session, type GameEvent } from '../game/session';
import { VirtualCat } from '../game/virtualcat';
import { PREY_COLOR } from '../render/palette';
import { Particles } from '../render/particles';
import { drawPrey, type PreyView } from '../render/prey';
import { safeArea, touchScreen } from '../platform/device';
import { settings } from '../platform/settings';
import { DoneScreen } from './done';
import { PauseScreen } from './pause';
import { Hold, ring } from './ui';

export interface HuntOpts {
  seed?: number;
  /** A pretend cat plays (?demo, screenshots). */
  demo?: boolean;
}

/** The two spots to hold together for the pause, as fractions of the screen: inset from the corners, since iOS
 * delays touches at the very edge and a held finger there drops out. */
export const PAUSE_SPOTS = [
  [0.12, 0.12],
  [0.88, 0.88],
] as const;
export const PAUSE_HOLD = 1.5;

export class HuntScreen implements Screen {
  readonly name = 'hunt';
  readonly session: Session;
  readonly particles = new Particles();
  readonly pause: Hold;
  private cat: VirtualCat | null;
  private w = 0;
  private h = 0;
  private finished = false;

  constructor(
    private readonly app: App,
    opts: HuntOpts = {},
  ) {
    this.w = app.w;
    this.h = app.h;
    const learn = settings.learn;
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
    this.session = new Session({
      seed,
      field: { w: app.w, h: app.h, inset: safeArea() },
      length: settings.minutes * 60,
      touch: touchScreen() || !!opts.demo,
      learned: weights(learn),
      lastLook: settings.lastLook,
    });
    this.cat = opts.demo ? new VirtualCat(seed, [1, 3], 0.5, true) : null;
    this.pause = new Hold(this.spots(), PAUSE_HOLD);
  }

  private spots() {
    const r = Math.max(36, Math.min(this.w, this.h) * 0.07);
    return PAUSE_SPOTS.map(([fx, fy]) => ({ x: fx * this.w, y: fy * this.h, r }));
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.session.resize(w, h, safeArea());
    this.pause.spots = this.spots();
  }

  update(dt: number) {
    if (this.finished) return;
    this.cat?.step(dt, this.session);
    this.session.step(dt);
    this.particles.update(dt);
    this.drain();
    // The session may have just ended: no pause over the end screen.
    if (this.finished) return;
    if (this.pause.update(dt)) this.app.push(new PauseScreen(this.app, this));
  }

  /** The mouse pointer would be one more thing to chase: hidden while the hunt is on top, back for menus. */
  enter() {
    this.app.canvas.style.cursor = 'none';
  }

  leave() {
    this.app.canvas.style.cursor = '';
  }

  private drain() {
    const s = this.session;
    for (const e of s.events) this.event(e);
    s.events = [];
  }

  private event(e: GameEvent) {
    if (e.kind === 'end') return this.end();
    if (e.kind === 'lure') return this.sound('rustle', this.w / 2);
    const p = e.prey;
    switch (e.kind) {
      case 'squeak':
      case 'rustle':
      case 'tick':
        this.sound(e.kind, e.x);
        break;
      case 'hit':
        this.particles.burst(e.x, e.y, p.r, PREY_COLOR[p.look.color]);
        break;
      case 'away':
        // still rustling off to the side it ran to
        if (Math.random() < 0.6)
          setTimeout(
            () => {
              // not over a pause, nor after the end
              if (!this.finished && this.app.top === this) this.sound('rustle', e.x);
            },
            300 + Math.random() * 1500,
          );
        break;
    }
  }

  private sound(kind: Sound, x: number) {
    audio.play(kind, this.w ? (x / this.w) * 2 - 1 : 0);
  }

  /** Session over: learn from it, then the quiet end screen. */
  end() {
    if (this.finished) return;
    this.finished = true;
    const s = this.session;
    settings.lastLook = s.look;
    // Every session counts (sessions, longest); only a paw on a touch screen feeds the weights, never a mouse.
    settings.learn = merge(settings.learn, s.director.touch && s.touchSeen ? s.tallies : {}, s.t);
    this.app.replace(new DoneScreen(this.app));
  }

  pointer(p: Ptr) {
    this.pause.pointer(p.type, p.id, p.x, p.y);
    this.session.pointer(p.type, p.id, { x: p.x, y: p.y }, p.kind);
    if (p.type === 'down') audio.unlock();
    this.drain();
  }

  key(e: KeyboardEvent, down: boolean) {
    if (down && e.key === 'Escape') this.app.push(new PauseScreen(this.app, this));
  }

  draw(ctx: CanvasRenderingContext2D) {
    const a = this.app.alpha;
    for (const p of this.session.all) drawPrey(ctx, view(p, a, this.session.t));
    this.particles.draw(ctx);
    if (this.pause.active) for (const s of this.pause.spots) ring(ctx, s.x, s.y, s.r, this.pause.progress);
  }
}

/** The prey as drawn: between the last two steps. */
export function view(p: Prey, alpha: number, t: number): PreyView {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  let dh = p.heading - p.prevHeading;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return {
    x: lerp(p.prev.x, p.pos.x),
    y: lerp(p.prev.y, p.pos.y),
    heading: p.prevHeading + dh * alpha,
    r: p.r,
    variant: p.look.variant,
    color: p.look.color,
    opacity: p.state === 'away' ? 0 : p.opacity,
    wounds: p.wounds,
    still: p.speed < 0.02 * p.S,
    caught: p.state === 'caught',
    dead: p.state === 'dead',
    t: t - STEP * (1 - alpha),
    walked: p.walked,
    trail: p.trail,
  };
}
