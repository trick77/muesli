// Drawing and hit areas for the human's controls: plain text and outlined boxes in dim grey, nothing a cat would
// chase.
import { UI_BRIGHT, UI_DIM, UI_TEXT } from '../render/palette';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Font size for this screen: scales with the short edge. */
export const unit = (w: number, h: number) => Math.max(12, Math.min(w, h) / 56);

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color = UI_TEXT,
  align: CanvasTextAlign = 'center',
  weight = 400,
) {
  ctx.font = `${weight} ${Math.round(size)}px -apple-system, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

export function button(ctx: CanvasRenderingContext2D, r: Rect, label: string, size: number, on = false) {
  ctx.strokeStyle = on ? UI_BRIGHT : UI_DIM;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(12, r.h / 4));
  ctx.stroke();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, size, on ? UI_BRIGHT : UI_TEXT);
}

/** A ring filling up while something is held (0..1). */
export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: number, color = UI_TEXT) {
  ctx.strokeStyle = UI_DIM;
  ctx.lineWidth = Math.max(2, r / 8);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (f <= 0) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f));
  ctx.stroke();
}

/** A circular arrow: the restart mark. */
export function restartIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color = UI_DIM) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, r / 6);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, -Math.PI * 0.35, Math.PI * 1.45);
  ctx.stroke();
  const a = -Math.PI * 0.35;
  const tx = x + Math.cos(a) * r * 0.6;
  const ty = y + Math.sin(a) * r * 0.6;
  ctx.beginPath();
  ctx.moveTo(tx + r * 0.28, ty - r * 0.02);
  ctx.lineTo(tx - r * 0.12, ty - r * 0.3);
  ctx.lineTo(tx - r * 0.1, ty + r * 0.18);
  ctx.closePath();
  ctx.fill();
}

/**
 * Holding pointers on a set of spots for `dur` seconds. Every spot needs its own finger at the same time (the pause
 * takes two opposite spots: one paw cannot do that).
 */
export class Hold {
  /** 0..1 */
  progress = 0;
  private on = new Map<number, number>(); // pointer id → spot index

  constructor(
    public spots: { x: number; y: number; r: number }[],
    private readonly dur: number,
  ) {}

  pointer(type: string, id: number, x: number, y: number) {
    if (type === 'down' || type === 'move') {
      const i = this.spots.findIndex((s) => Math.hypot(x - s.x, y - s.y) <= s.r);
      if (i >= 0) this.on.set(id, i);
      else this.on.delete(id);
    } else this.on.delete(id);
  }

  /** True once, when the hold completes. */
  update(dt: number): boolean {
    const held = new Set(this.on.values());
    if (held.size === this.spots.length) this.progress += dt / this.dur;
    else this.progress = 0;
    if (this.progress >= 1) {
      this.progress = 0;
      this.on.clear();
      return true;
    }
    return false;
  }

  get active() {
    return this.on.size > 0 && new Set(this.on.values()).size === this.spots.length;
  }

  clear() {
    this.on.clear();
    this.progress = 0;
  }
}
