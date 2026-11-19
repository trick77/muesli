// Paws: what a touch means. A tap strikes where it lands, a swipe strikes along its path, a paw left lying on the
// glass strikes nothing (it would block the game: the prey would walk into it).
import { dist, segSegDist, type Vec } from './geom';

/** A paw resting this long within REST_PX of where it settled counts as lying on the glass. */
export const REST_S = 0.4;
export const REST_PX = 12;

/** Hit reach: 1.5 body radii plus this, CSS px (paws are wide and land with several pads). */
export const SLOP = 16;

/** One strike: the stretch a paw covered since the last event (a point for a tap). */
export interface Strike {
  id: number;
  a: Vec;
  b: Vec;
  /** A fresh touch-down (counts as a miss when it hits nothing); moves never count as misses. */
  down: boolean;
}

interface Paw {
  last: Vec;
  anchor: Vec;
  anchorT: number;
  resting: boolean;
}

export class PawTracker {
  private paws = new Map<number, Paw>();

  get count() {
    return this.paws.size;
  }

  /** Pointer events in, strikes out (null: nothing that counts). `t` is the session clock, seconds. */
  down(id: number, p: Vec, t: number): Strike {
    this.paws.set(id, { last: p, anchor: p, anchorT: t, resting: false });
    return { id, a: p, b: p, down: true };
  }

  move(id: number, p: Vec, t: number): Strike | null {
    const paw = this.paws.get(id);
    if (!paw) return null; // a mouse hovering, or a pointer that went down before the hunt
    if (dist(p, paw.anchor) >= REST_PX) {
      const s: Strike = { id, a: paw.last, b: p, down: false };
      paw.anchor = p;
      paw.anchorT = t;
      paw.last = p;
      paw.resting = false;
      return s;
    }
    // Jitter under a paw that is not going anywhere.
    if (t - paw.anchorT >= REST_S) paw.resting = true;
    return null;
  }

  /** Called every step: a paw that has not moved for REST_S rests even without events. */
  tick(t: number) {
    for (const p of this.paws.values()) if (!p.resting && t - p.anchorT >= REST_S) p.resting = true;
  }

  up(id: number) {
    this.paws.delete(id);
  }

  resting(id: number): boolean {
    return this.paws.get(id)?.resting ?? false;
  }

  /** Positions of the paws on the glass. */
  positions(): Vec[] {
    return [...this.paws.values()].map((p) => p.last);
  }
}

/** Does the strike touch a body with this spine and reach? */
export function strikes(s: Strike, spine: [Vec, Vec], reach: number): boolean {
  return segSegDist(s.a, s.b, spine[0], spine[1]) <= reach;
}
