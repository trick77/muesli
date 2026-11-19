// Runs whole sessions headless and records every step: the behaviour tests read the record.
import type { Field, Vec } from '../../src/game/geom';
import type { Look } from '../../src/game/look';
import type { State, Tier } from '../../src/game/prey';
import { Session, type GameEvent } from '../../src/game/session';
import { VirtualCat } from '../../src/game/virtualcat';

export const DT = 1 / 60;

export const ipad = (): Field => ({ w: 1194, h: 834, inset: { top: 0, right: 0, bottom: 0, left: 0 } });

export interface Frame {
  t: number;
  pos: Vec;
  prev: Vec;
  heading: number;
  prevHeading: number;
  speed: number;
  state: State;
  stateT: number;
  sub: string;
  tier: Tier;
  visible: boolean;
  slid: boolean;
  look: Look;
  r: number;
}

export interface Record {
  s: Session;
  frames: Frame[];
  events: (GameEvent & { t: number })[];
}

export function record(seed: number, opts: { cat?: boolean; length?: number; field?: Field; touch?: boolean } = {}) {
  const field = opts.field ?? ipad();
  const s = new Session({
    seed,
    field,
    length: opts.length ?? 120,
    touch: opts.touch ?? true,
    learned: null,
    lastLook: null,
  });
  const cat = opts.cat === false ? null : new VirtualCat(seed);
  const frames: Frame[] = [];
  const events: (GameEvent & { t: number })[] = [];
  for (let i = 0; i < 60 * 400 && !s.done; i++) {
    cat?.step(DT, s);
    s.step(DT);
    const p = s.prey;
    frames.push({
      t: s.t,
      pos: { ...p.pos },
      prev: { ...p.prev },
      heading: p.heading,
      prevHeading: p.prevHeading,
      speed: p.speed,
      state: p.state,
      stateT: p.stateT,
      sub: p.sub,
      tier: p.tier,
      visible: p.visible,
      slid: p.slid,
      look: p.look,
      r: p.r,
    });
    for (const e of s.events) events.push({ ...e, t: s.t });
    s.events = [];
  }
  return { s, frames, events } satisfies Record;
}
