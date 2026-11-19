// The prey's sounds, made on the fly: no sound files. Cats hear best around 5 to 32 kHz and rodents call high, so
// the squeak sits at 3 to 6 kHz with overtones up to about 16 kHz, and the rustle is mostly treble. Never a pure
// sine: another cat game noted its cat ignoring plain beeps within two seconds. Every call varies pitch and length.

export type Sound = 'squeak' | 'rustle' | 'tick';

/** One second of white noise, made once per context. */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noise(ctx: BaseAudioContext, rnd: () => number): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Plays `kind` into `out` starting at `when`; returns when it ends (seconds, context time). */
export function play(ctx: BaseAudioContext, out: AudioNode, kind: Sound, when: number, rnd: () => number): number {
  switch (kind) {
    case 'squeak': {
      let end = squeak(ctx, out, when, rnd);
      // a double chirp now and then
      if (rnd() < 0.4) end = squeak(ctx, out, end + 0.04 + rnd() * 0.05, rnd);
      return end;
    }
    case 'rustle':
      return rustle(ctx, out, when, rnd);
    case 'tick':
      return tick(ctx, out, when, rnd);
  }
}

function squeak(ctx: BaseAudioContext, out: AudioNode, t0: number, rnd: () => number): number {
  const f0 = 3000 + rnd() * 3000;
  const len = 0.08 + rnd() * 0.1;
  const peak = 0.35 + rnd() * 0.25;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(0.5, t0 + 0.005);
  env.gain.setValueAtTime(0.5, t0 + len * 0.6);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  env.connect(out);
  // fundamental and two overtones, all bending the same way: up, then down
  for (const [mult, type, gain] of [
    [1, 'triangle', 0.6],
    [2, 'sine', 0.25],
    [2.7, 'sine', 0.1],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    const f = f0 * mult;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.linearRampToValueAtTime(f * (1 + peak), t0 + len * 0.4);
    o.frequency.linearRampToValueAtTime(f * (0.85 + rnd() * 0.1), t0 + len);
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(env);
    o.start(t0);
    o.stop(t0 + len + 0.01);
  }
  // breath in the squeak
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx, rnd);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f0 * 1.5;
  bp.Q.value = 3;
  const ng = ctx.createGain();
  ng.gain.value = 0.2;
  n.connect(bp).connect(ng).connect(env);
  n.start(t0, rnd() * 0.5);
  n.stop(t0 + len);
  return t0 + len;
}

function rustle(ctx: BaseAudioContext, out: AudioNode, t0: number, rnd: () => number): number {
  const len = 0.15 + rnd() * 0.3;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, rnd);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500 + rnd() * 2000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  // a few crackles, not a hiss
  const bumps = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < bumps; i++) {
    const t = t0 + (len * (i + rnd() * 0.6)) / bumps;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.25 + rnd() * 0.35, t + 0.006);
    env.gain.linearRampToValueAtTime(0, t + 0.02 + rnd() * 0.03);
  }
  src.connect(hp).connect(env).connect(out);
  src.start(t0, rnd() * 0.5);
  src.stop(t0 + len + 0.06);
  return t0 + len + 0.06;
}

function tick(ctx: BaseAudioContext, out: AudioNode, t0: number, rnd: () => number): number {
  const len = 0.004 + rnd() * 0.005;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, rnd);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000 + rnd() * 3000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.3, t0);
  env.gain.linearRampToValueAtTime(0, t0 + len);
  src.connect(hp).connect(env).connect(out);
  src.start(t0, rnd() * 0.5);
  src.stop(t0 + len + 0.005);
  return t0 + len + 0.005;
}
