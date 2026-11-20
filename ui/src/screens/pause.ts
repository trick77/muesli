// Paused: the hunt stands still underneath. Ordinary taps here: a human opened it with two hands.
import type { App, Ptr, Screen } from '../app';
import { audio } from '../audio/engine';
import { t } from '../platform/i18n';
import { settings } from '../platform/settings';
import { wakeLock } from '../platform/device';
import type { HuntScreen } from './hunt';
import { StartScreen } from './start';
import { StatsScreen } from './stats';
import { button, inside, text, unit, type Rect } from './ui';
import { UI_BRIGHT } from '../render/palette';

const ITEMS = ['resume', 'sound', 'stats', 'quit'] as const;
type Item = (typeof ITEMS)[number];

export class PauseScreen implements Screen {
  readonly name = 'pause';
  private rects: Record<Item, Rect> = {} as Record<Item, Rect>;

  constructor(
    private readonly app: App,
    private readonly hunt: HuntScreen,
  ) {}

  enter() {
    this.hunt.pause.clear();
  }

  update() {}

  /** Laid out on entry too: a tap may come before the first frame is drawn. */
  resize(w: number, h: number) {
    const u = unit(w, h);
    const bw = Math.min(w * 0.6, 16 * u);
    const bh = 2.8 * u;
    ITEMS.forEach((it, i) => (this.rects[it] = { x: w / 2 - bw / 2, y: h * 0.32 + i * (bh + u), w: bw, h: bh }));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.hunt.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, w, h);
    const u = unit(w, h);
    const tx = t();
    text(ctx, tx.pause, w / 2, h * 0.2, 1.8 * u, UI_BRIGHT, 'center', 600);
    this.resize(w, h);
    const labels: Record<Item, string> = {
      resume: tx.resume,
      sound: tx.sound(!settings.muted),
      stats: tx.stats,
      quit: tx.quit,
    };
    for (const it of ITEMS) button(ctx, this.rects[it], labels[it], u, it === 'resume');
  }

  pointer(p: Ptr) {
    if (p.type !== 'down') return;
    const hit = ITEMS.find((it) => this.rects[it] && inside(this.rects[it], p.x, p.y));
    if (hit === 'resume') this.app.pop();
    else if (hit === 'sound') {
      settings.muted = !settings.muted;
      audio.setMuted(settings.muted);
    } else if (hit === 'stats') this.app.push(new StatsScreen(this.app));
    else if (hit === 'quit') {
      void wakeLock.off();
      this.app.replace(new StartScreen(this.app));
    }
  }

  key(e: KeyboardEvent, down: boolean) {
    if (down && (e.key === 'Escape' || e.key === ' ')) this.app.pop();
  }
}
