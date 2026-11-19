// Screen stack, fixed-timestep loop, the device canvas and every input listener. Screens never bind events.

/** One game step, seconds: the rules run at 60 Hz whatever the display does. */
export const STEP = 1 / 60;

export interface Ptr {
  type: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  /** CSS px from the top left of the screen. */
  x: number;
  y: number;
  /** 'touch', 'mouse' or 'pen'. */
  kind: string;
}

export interface Screen {
  readonly name: string;
  update(dt: number): void;
  /** Draws in CSS px; the canvas is cleared to black first. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  pointer?(p: Ptr): void;
  key?(e: KeyboardEvent, down: boolean): void;
  enter?(): void;
  leave?(): void;
  /** The screen size changed. */
  resize?(w: number, h: number): void;
}

export class App {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** CSS px. */
  w = 0;
  h = 0;
  private dpr = 1;
  private stack: Screen[] = [];
  private acc = 0;
  private last = 0;
  /** How far the frame being drawn is past the last step, 0..1: moving things are drawn in between. */
  alpha = 1;
  paused = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    addEventListener('resize', () => this.resize());
    screen.orientation?.addEventListener?.('change', () => setTimeout(() => this.resize(), 50));
    this.resize();
    this.bindInput();
    requestAnimationFrame((t) => this.frame(t));
  }

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** The screens below the top, bottom first (a pause screen draws the hunt under itself). */
  below(s: Screen): Screen | undefined {
    const i = this.stack.indexOf(s);
    return i > 0 ? this.stack[i - 1] : undefined;
  }

  push(s: Screen) {
    this.top?.leave?.();
    this.stack.push(s);
    s.resize?.(this.w, this.h);
    s.enter?.();
  }

  pop() {
    const s = this.stack.pop();
    s?.leave?.();
    this.top?.enter?.();
  }

  replace(s: Screen) {
    for (const old of this.stack.splice(0)) old.leave?.();
    this.stack.push(s);
    s.resize?.(this.w, this.h);
    s.enter?.();
  }

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    for (const s of this.stack) s.resize?.(this.w, this.h);
  }

  private frame(t: number) {
    requestAnimationFrame((n) => this.frame(n));
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    const top = this.top;
    if (!top) return;
    if (!this.paused) {
      this.acc += dt;
      // A screen that pushed or popped one is done for this frame: the rest of the time goes to the new top.
      while (this.acc >= STEP && this.top === top) {
        top.update(STEP);
        this.acc -= STEP;
      }
    }
    this.alpha = Math.min(1, this.acc / STEP);
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.w, this.h);
    this.top!.draw(c, this.w, this.h);
  }

  private bindInput() {
    const c = this.canvas;
    const send = (type: Ptr['type']) => (e: PointerEvent) => {
      e.preventDefault();
      if (type === 'down') {
        try {
          c.setPointerCapture?.(e.pointerId);
        } catch {
          // a pointer already gone (or a synthetic one): the event still counts
        }
      }
      const r = c.getBoundingClientRect();
      this.top?.pointer?.({
        type,
        id: e.pointerId,
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        kind: e.pointerType || 'mouse',
      });
    };
    c.addEventListener('pointerdown', send('down'));
    c.addEventListener('pointermove', send('move'));
    c.addEventListener('pointerup', send('up'));
    c.addEventListener('pointercancel', send('cancel'));
    // iOS Safari: stop pinch-zoom, double-tap zoom, the long-press callout and scrolling.
    for (const ev of [
      'touchstart',
      'touchmove',
      'touchend',
      'gesturestart',
      'gesturechange',
      'dblclick',
      'contextmenu',
    ])
      c.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    addEventListener('keydown', (e) => {
      // shortcuts and function keys (reload, full screen, dev tools) stay the browser's
      if (e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(e.key)) return;
      this.top?.key?.(e, true);
      e.preventDefault();
    });
    addEventListener('keyup', (e) => this.top?.key?.(e, false));
  }
}
