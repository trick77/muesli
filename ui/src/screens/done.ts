// The session is over: dark and quiet, a dim restart mark. A paw tapping or swiping starts nothing: a new hunt takes
// a 1 s hold (a click or Space on a desktop).
import type { App, Ptr, Screen } from '../app';
import { audio } from '../audio/engine';
import { wakeLock } from '../platform/device';
import { UI_DIM, UI_TEXT } from '../render/palette';
import { startHunt, StartScreen } from './start';
import { Hold, restartIcon, ring, text, unit } from './ui';

export const RESTART_HOLD = 1;

export class DoneScreen implements Screen {
  readonly name = 'done';
  readonly restart = new Hold([], RESTART_HOLD);
  readonly menu = new Hold([], RESTART_HOLD);

  constructor(private readonly app: App) {}

  enter() {
    // The device may sleep again, nothing more to hear.
    void wakeLock.off();
    audio.hush();
  }

  resize(w: number, h: number) {
    const u = unit(w, h);
    this.restart.spots = [{ x: w / 2, y: h / 2, r: 3 * u }];
    this.menu.spots = [{ x: w / 2, y: h * 0.88, r: 2.5 * u }];
  }

  update(dt: number) {
    if (this.restart.update(dt)) startHunt(this.app);
    else if (this.menu.update(dt)) this.app.replace(new StartScreen(this.app));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const u = unit(w, h);
    text(ctx, 'Fertig. Zeit für ein Leckerli.', w / 2, h * 0.3, u, UI_TEXT);
    restartIcon(ctx, w / 2, h / 2, 2.4 * u, UI_DIM);
    if (this.restart.progress > 0) ring(ctx, w / 2, h / 2, 2.8 * u, this.restart.progress);
    text(ctx, 'Halten für eine neue Runde', w / 2, h / 2 + 3.6 * u, 0.7 * u, UI_DIM);
    text(ctx, 'Einstellungen (halten)', w / 2, h * 0.88, 0.7 * u, UI_DIM);
    if (this.menu.progress > 0) ring(ctx, w / 2, h * 0.88, 1.2 * u, this.menu.progress);
  }

  pointer(p: Ptr) {
    // A mouse is a human at a desk: a click will do.
    if (p.kind === 'mouse' && p.type === 'down') {
      const [s] = this.restart.spots;
      if (s && Math.hypot(p.x - s.x, p.y - s.y) <= s.r) return startHunt(this.app);
      const [m] = this.menu.spots;
      if (m && Math.hypot(p.x - m.x, p.y - m.y) <= m.r) return this.app.replace(new StartScreen(this.app));
    }
    this.restart.pointer(p.type, p.id, p.x, p.y);
    this.menu.pointer(p.type, p.id, p.x, p.y);
  }

  key(e: KeyboardEvent, down: boolean) {
    if (down && (e.key === ' ' || e.key === 'Enter')) startHunt(this.app);
    if (down && e.key === 'Escape') this.app.replace(new StartScreen(this.app));
  }
}
