// ?trace: one whole session simulated at once, the prey's path drawn as a line coloured by speed band, with
// markers for stops, exits and hits. For a human to judge at a glance: does it move like a mouse (walls, bursts,
// stops) or like a screensaver?
import type { App, Screen } from '../app';
import type { Vec } from '../game/geom';
import type { Tier } from '../game/prey';
import { Session } from '../game/session';
import { VirtualCat } from '../game/virtualcat';
import { t } from '../platform/i18n';
import { UI_BRIGHT, UI_DIM, UI_TEXT } from '../render/palette';
import { text, unit } from './ui';

export const TIER_COLOR: Record<Tier, string> = {
  still: '#ffffff',
  creep: '#3D8BFF',
  trot: '#00E5FF',
  sprint: '#FFE600',
  blitz: '#B6FF00',
};

interface Seg {
  a: Vec;
  b: Vec;
  tier: Tier;
}

export interface TraceData {
  segs: Seg[];
  stops: Vec[];
  exits: Vec[];
  hits: Vec[];
  seconds: number;
  w: number;
  h: number;
}

/** Runs a session of `seconds` headless with a pretend cat. */
export function simulate(seed: number, w: number, h: number, seconds: number, cat = true): TraceData {
  const s = new Session({
    seed,
    field: { w, h, inset: { top: 0, right: 0, bottom: 0, left: 0 } },
    length: seconds,
    touch: true,
    learned: null,
    lastLook: null,
  });
  const vc = cat ? new VirtualCat(seed) : null;
  const out: TraceData = { segs: [], stops: [], exits: [], hits: [], seconds: 0, w, h };
  let wasStill = false;
  for (let i = 0; i < 60 * (seconds + 40) && !s.done; i++) {
    vc?.step(1 / 60, s);
    s.step(1 / 60);
    const p = s.prey;
    if (p.visible && p.state !== 'away') {
      const moved = Math.hypot(p.pos.x - p.prev.x, p.pos.y - p.prev.y) > 0;
      if (moved) out.segs.push({ a: { ...p.prev }, b: { ...p.pos }, tier: p.tier });
      const still = p.speed < 0.02 * p.S;
      if (still && !wasStill) out.stops.push({ ...p.pos });
      wasStill = still;
    }
    for (const e of s.events) {
      if (e.kind === 'away' && e.prey === p) out.exits.push({ x: e.x, y: e.y });
      if (e.kind === 'hit') out.hits.push({ x: e.x, y: e.y });
    }
    s.events = [];
  }
  out.seconds = s.t;
  return out;
}

export class TraceScreen implements Screen {
  readonly name = 'trace';
  private data: TraceData | null = null;

  constructor(
    private readonly app: App,
    private readonly seed: number,
    private readonly seconds = 120,
  ) {}

  resize(w: number, h: number) {
    this.data = simulate(this.seed, w, h, this.seconds);
  }

  update() {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const d = this.data;
    if (!d) return;
    const u = unit(w, h);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const s of d.segs) {
      ctx.strokeStyle = TIER_COLOR[s.tier];
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    for (const p of d.stops) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = UI_BRIGHT;
    ctx.lineWidth = 2;
    for (const p of d.exits) {
      const x = Math.max(8, Math.min(w - 8, p.x));
      const y = Math.max(8, Math.min(h - 8, p.y));
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 7);
      ctx.lineTo(x + 7, y + 7);
      ctx.moveTo(x + 7, y - 7);
      ctx.lineTo(x - 7, y + 7);
      ctx.stroke();
    }
    for (const p of d.hits) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // legend
    let x = u;
    const y = h - u;
    const tx = t();
    for (const tier of Object.keys(TIER_COLOR) as Tier[]) {
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillRect(x, y - 3, u, 6);
      text(ctx, tx.tiers[tier], x + 1.3 * u, y, 0.7 * u, UI_TEXT, 'left');
      x += 6.5 * u;
    }
    text(ctx, tx.traceLegend(this.seed, Math.round(d.seconds)), u, y - 1.5 * u, 0.7 * u, UI_DIM, 'left');
    void this.app;
  }
}
