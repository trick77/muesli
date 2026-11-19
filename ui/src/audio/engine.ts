// Main-thread audio. Silent until unlock() runs inside a user gesture: iOS Safari only starts audio from a touch
// or click handler. Sounds asked for before that are dropped (they are all moments, nothing to catch up on).
import { play, type Sound } from './synth';

/** Quiet by default: the cat's ears are far better than ours. */
export const VOLUME = 0.3;
/** At most this many sounds at once; more are dropped, never a pile-up into a roar. */
export const MAX_VOICES = 8;

interface Chain {
  ctx: AudioContext;
  master: GainNode;
}

let chain: Chain | null = null;
let muted = false;
let voices = 0;
/** Silenced at a session's end: a tap or a tab switch does not wake it, only the next unlock(). */
let hushed = false;

function resume() {
  if (chain && !hushed && chain.ctx.state !== 'running') void chain.ctx.resume().catch(() => {});
}

function start(): Chain {
  const AC: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  // iOS: play through the ring/silent switch, like a video would.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  const ctx = new AC({ latencyHint: 'interactive' });
  // Must happen synchronously inside the gesture on iOS.
  void ctx.resume().catch(() => {});
  const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = silent;
  src.connect(ctx.destination);
  src.start(0);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(comp);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend().catch(() => {});
    else resume();
  });
  // iOS can put the context into "interrupted" (calls, Siri): any touch revives it.
  addEventListener('pointerdown', resume, { passive: true });
  return { ctx, master };
}

export const audio = {
  /** Call from the first pointerdown/keydown. Safe to call repeatedly. */
  unlock() {
    hushed = false;
    if (!chain) chain = start();
    else resume();
  },
  get unlocked() {
    return chain !== null;
  },
  get muted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    if (chain) chain.master.gain.value = m ? 0 : VOLUME;
  },
  /** `pan` -1 (left) .. 1 (right): a sound comes from where the prey is, or where it vanished. */
  play(kind: Sound, pan = 0) {
    if (!chain || muted || hushed || voices >= MAX_VOICES) return;
    const { ctx, master } = chain;
    let out: AudioNode = master;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(master);
      out = p;
    }
    const end = play(ctx, out, kind, ctx.currentTime + 0.005, Math.random);
    voices++;
    setTimeout(() => voices--, Math.max(0, (end - ctx.currentTime) * 1000) + 20);
  },
  /** The session is over: nothing more to hear until the next start. */
  hush() {
    hushed = true;
    if (chain) void chain.ctx.suspend().catch(() => {});
  },
  get hushed() {
    return hushed;
  },
};

/** Test hook: forget the context. */
export function resetAudio() {
  chain = null;
  muted = false;
  voices = 0;
  hushed = false;
}
