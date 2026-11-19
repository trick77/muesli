// A pretend cat for tests, the ?trace view and the ?demo screenshot: taps near the prey now and then, mostly a
// little off, sometimes on it, sometimes a swipe.
import type { Vec } from './geom';
import { Rng } from './prng';
import type { Session } from './session';

export class VirtualCat {
  private rng: Rng;
  private wait: number;
  private id = 1000;
  private held: { id: number; left: number } | null = null;

  constructor(
    seed: number,
    /** Seconds between pounces. */
    private readonly every: [number, number] = [1.5, 5],
    /** Chance a pounce lands on the body. */
    private readonly aim = 0.35,
  ) {
    this.rng = new Rng(seed ^ 0x5eed);
    this.wait = this.rng.range(...every);
  }

  step(dt: number, s: Session) {
    if (this.held) {
      this.held.left -= dt;
      if (this.held.left <= 0) {
        s.pointer('up', this.held.id, { x: 0, y: 0 }, 'touch');
        this.held = null;
      }
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = this.rng.range(...this.every);
    // Pounces on prey out on the screen, not on a head peeking in at the edge.
    const p = s.all.find((q) => q.catchable && ['creep', 'freeze', 'bolt', 'edge', 'lure'].includes(q.state));
    if (!p) return;
    const rng = this.rng;
    const off = rng.chance(this.aim) ? rng.range(0, p.r) : rng.range(2, 7) * p.r;
    const a = rng.range(0, 2 * Math.PI);
    const at: Vec = { x: p.pos.x + Math.cos(a) * off, y: p.pos.y + Math.sin(a) * off };
    const id = ++this.id;
    s.pointer('down', id, at, 'touch');
    if (rng.chance(0.3)) {
      // A swipe: the paw drags on across the glass.
      const b = rng.range(0, 2 * Math.PI);
      s.pointer('move', id, { x: at.x + Math.cos(b) * 3 * p.r, y: at.y + Math.sin(b) * 3 * p.r }, 'touch');
    }
    this.held = { id, left: rng.range(0.05, 0.25) };
  }
}
