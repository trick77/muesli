// The human's screen: start, sound, session length, stats.
import type { App, Ptr, Screen } from '../app';
import { audio } from '../audio/engine';
import { GAME_NAME } from '../brand';
import { canFullscreen, enterFullscreen, standalone, wakeLock } from '../platform/device';
import { t } from '../platform/i18n';
import { LENGTHS, settings } from '../platform/settings';
import { UI_BRIGHT, UI_TEXT } from '../render/palette';
import { HuntScreen, type HuntOpts } from './hunt';
import { StatsScreen } from './stats';
import { button, inside, text, unit, type Rect } from './ui';

/**
 * Starts a hunt: inside the tap's release (pointerup), so audio, wake lock and fullscreen are allowed. A touch's
 * pointerdown would do for audio but not for fullscreen on an iPad.
 */
export function startHunt(app: App, opts: HuntOpts = {}) {
  audio.unlock();
  audio.setMuted(settings.muted);
  enterFullscreen();
  void wakeLock.on();
  app.replace(new HuntScreen(app, opts));
}

export class StartScreen implements Screen {
  readonly name = 'start';
  private go: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private sound: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private length: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private stats: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private pressed = new Set<number>();

  constructor(
    private readonly app: App,
    private readonly opts: HuntOpts = {},
  ) {}

  enter() {
    void wakeLock.off();
  }

  update() {}

  /** Laid out on entry too: a tap may come before the first frame is drawn. */
  resize(w: number, h: number) {
    this.layout(w, h);
  }

  private layout(w: number, h: number) {
    const u = unit(w, h);
    this.go = { x: w * 0.15, y: h * 0.3, w: w * 0.7, h: h * 0.32 };
    const bw = Math.min(w * 0.27, 12 * u);
    const bh = 2.6 * u;
    const gap = Math.min(w * 0.03, u);
    const x0 = w / 2 - (3 * bw + 2 * gap) / 2;
    const y = h * 0.68;
    this.sound = { x: x0, y, w: bw, h: bh };
    this.length = { x: x0 + bw + gap, y, w: bw, h: bh };
    this.stats = { x: x0 + 2 * (bw + gap), y, w: bw, h: bh };
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.layout(w, h);
    const u = unit(w, h);
    text(ctx, GAME_NAME, w / 2, h * 0.13, 2.6 * u, UI_BRIGHT, 'center', 600);
    const tx = t();
    text(ctx, tx.tagline, w / 2, h * 0.13 + 2.2 * u, 0.9 * u);
    button(ctx, this.go, tx.tapToStart, 1.4 * u, true);
    button(ctx, this.sound, tx.sound(!settings.muted), 0.9 * u);
    button(ctx, this.length, tx.length(settings.minutes), 0.9 * u);
    button(ctx, this.stats, tx.stats, 0.9 * u);
    const hy = this.sound.y + this.sound.h + 1.8 * u;
    text(ctx, tx.pauseHint, w / 2, hy, 0.75 * u, UI_TEXT);
    if (!standalone() && !canFullscreen()) text(ctx, tx.installHint, w / 2, hy + 1.4 * u, 0.75 * u, UI_TEXT);
  }

  pointer(p: Ptr) {
    // The start area answers the release of a tap that began on it.
    if (p.type === 'down' && inside(this.go, p.x, p.y)) this.pressed.add(p.id);
    if (p.type === 'up' && this.pressed.has(p.id) && inside(this.go, p.x, p.y)) return startHunt(this.app, this.opts);
    if (p.type === 'up' || p.type === 'cancel') this.pressed.delete(p.id);
    if (p.type !== 'down') return;
    if (inside(this.sound, p.x, p.y)) {
      settings.muted = !settings.muted;
      audio.setMuted(settings.muted);
    } else if (inside(this.length, p.x, p.y)) {
      const i = LENGTHS.indexOf(settings.minutes);
      settings.minutes = LENGTHS[(i + 1) % LENGTHS.length];
    } else if (inside(this.stats, p.x, p.y)) this.app.push(new StatsScreen(this.app));
  }

  key(e: KeyboardEvent, down: boolean) {
    if (down && (e.key === ' ' || e.key === 'Enter')) startHunt(this.app, this.opts);
  }
}
