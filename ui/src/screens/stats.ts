// What the game has learned about this cat on this device.
import type { App, Ptr, Screen } from '../app';
import { bars, MIN_SESSIONS, type LearnData } from '../game/learn';
import { t } from '../platform/i18n';
import { settings } from '../platform/settings';
import { PREY_COLOR, UI_BRIGHT, UI_DIM, UI_TEXT } from '../render/palette';
import { button, Hold, inside, ring, text, unit, type Rect } from './ui';

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class StatsScreen implements Screen {
  readonly name = 'stats';
  private back: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private reset: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private data: LearnData;
  /** Resetting takes a 1 s hold: a year of learning should not go with one slip. */
  private hold = new Hold([], 1);

  constructor(private readonly app: App) {
    this.data = settings.learn;
  }

  update(dt: number) {
    if (this.hold.update(dt)) {
      settings.resetLearn();
      this.data = settings.learn;
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const u = unit(w, h);
    const d = this.data;
    const tx = t();
    text(ctx, tx.stats, w / 2, h * 0.1, 1.8 * u, UI_BRIGHT, 'center', 600);
    text(ctx, tx.totals(d.sessions, d.touched, mmss(d.longest)), w / 2, h * 0.1 + 2.2 * u, 0.85 * u);
    const rows = bars(d);
    const x0 = w * 0.18;
    const x1 = w * 0.82;
    if (!rows.length) text(ctx, tx.noTouches, w / 2, h * 0.4, u);
    else {
      const max = Math.max(...rows.map((r) => r.rate), 0.1);
      const lh = Math.min(2 * u, (h * 0.55) / (rows.length + 2));
      let y = h * 0.24;
      let group = '';
      for (const r of rows) {
        if (r.group !== group) {
          group = r.group;
          text(ctx, group === 'variant' ? tx.shape : tx.colour, x0, y, 0.8 * u, UI_TEXT, 'left', 600);
          y += lh;
        }
        text(ctx, (tx.names as Record<string, string>)[r.key] ?? r.key, x0, y, 0.8 * u, UI_TEXT, 'left');
        const bx = x0 + 6 * u;
        const bw = Math.max(2, ((x1 - bx - 5 * u) * r.rate) / max);
        ctx.fillStyle = r.group === 'color' ? PREY_COLOR[r.key as keyof typeof PREY_COLOR] : UI_DIM;
        ctx.fillRect(bx, y - lh * 0.3, bw, lh * 0.6);
        text(ctx, tx.perMin(r.rate.toFixed(1)), bx + bw + 0.5 * u, y, 0.75 * u, UI_TEXT, 'left');
        y += lh;
      }
    }
    const note = d.touched < MIN_SESSIONS ? tx.weightedFrom(MIN_SESSIONS) : tx.weighted;
    text(ctx, note, w / 2, h * 0.82, 0.75 * u);
    const bw = Math.min(w * 0.3, 11 * u);
    const bh = 2.6 * u;
    this.back = { x: w / 2 - bw - u / 2, y: h * 0.87, w: bw, h: bh };
    this.reset = { x: w / 2 + u / 2, y: h * 0.87, w: bw, h: bh };
    button(ctx, this.back, tx.back, 0.9 * u, true);
    button(ctx, this.reset, tx.resetHold, 0.8 * u);
    this.hold.spots = [{ x: this.reset.x + bw / 2, y: this.reset.y + bh / 2, r: Math.max(bw, bh) / 2 }];
    if (this.hold.progress > 0) ring(ctx, this.reset.x + bw + u, this.reset.y + bh / 2, 0.6 * u, this.hold.progress);
  }

  pointer(p: Ptr) {
    this.hold.pointer(p.type, p.id, p.x, p.y);
    if (p.type === 'down' && inside(this.back, p.x, p.y)) this.app.pop();
  }

  key(e: KeyboardEvent, down: boolean) {
    if (down && e.key === 'Escape') this.app.pop();
  }
}
