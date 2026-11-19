// A small burst in the prey's colour where the paw landed. Cosmetic: Math.random is fine here.

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

const LIFE = 0.55;

export class Particles {
  private bits: Bit[] = [];

  constructor(private readonly rnd: () => number = Math.random) {}

  get count() {
    return this.bits.length;
  }

  burst(x: number, y: number, r: number, color: string, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      // fast enough to leave the body behind at once: the same colour on top of it would not show
      const v = (5 + this.rnd() * 7) * r;
      this.bits.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: LIFE,
        size: r * (0.18 + this.rnd() * 0.2),
        color,
      });
    }
  }

  update(dt: number) {
    for (const b of this.bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 1 - 4 * dt;
      b.vy *= 1 - 4 * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const b of this.bits) {
      ctx.globalAlpha = Math.max(0, b.life / LIFE);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    }
    ctx.globalAlpha = 1;
  }
}
