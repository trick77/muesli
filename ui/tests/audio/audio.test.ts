import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audio, MAX_VOICES, resetAudio, VOLUME } from '../../src/audio/engine';
import { noise, play } from '../../src/audio/synth';
import { fakeAudio, stubWindow } from '../stubs';

describe('synth', () => {
  it('makes every sound from oscillators and noise, never a bare sine', () => {
    const { Ctx, made } = fakeAudio();
    const ctx = new Ctx() as unknown as AudioContext;
    const out = ctx.createGain();
    let r = 0;
    const rnd = () => ((r = (r + 0.37) % 1), r);
    for (const kind of ['squeak', 'rustle', 'tick'] as const) {
      made.length = 0;
      const end = play(ctx, out, kind, 1, rnd);
      expect(end).toBeGreaterThan(1);
      expect(made).toContain('source'); // noise in every one
      if (kind === 'squeak') expect(made.filter((m) => m === 'osc').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps one noise buffer per context', () => {
    const { Ctx } = fakeAudio();
    const ctx = new Ctx() as unknown as AudioContext;
    expect(noise(ctx, Math.random)).toBe(noise(ctx, Math.random));
  });
});

describe('audio engine', () => {
  let win: ReturnType<typeof stubWindow>;
  beforeEach(() => {
    win = stubWindow();
    resetAudio();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays silent until unlocked inside a gesture', () => {
    audio.play('squeak');
    expect(win.audio.made).toEqual([]);
    audio.unlock();
    expect(audio.unlocked).toBe(true);
    expect(win.audio.made).toContain('compressor');
    audio.play('squeak', 2);
    expect(win.audio.made).toContain('panner');
    audio.unlock(); // a second call just resumes
  });

  it('mutes, unmutes and hushes', () => {
    audio.unlock();
    audio.setMuted(true);
    expect(audio.muted).toBe(true);
    const n = win.audio.made.length;
    audio.play('tick');
    expect(win.audio.made.length).toBe(n);
    audio.setMuted(false);
    audio.hush();
    expect(VOLUME).toBeLessThan(0.5);
  });

  it('drops sounds beyond the voice limit until some end', () => {
    audio.unlock();
    for (let i = 0; i < MAX_VOICES; i++) audio.play('rustle');
    const n = win.audio.made.length;
    audio.play('rustle');
    expect(win.audio.made.length).toBe(n);
    vi.advanceTimersByTime(2000);
    audio.play('rustle');
    expect(win.audio.made.length).toBeGreaterThan(n);
  });

  it('suspends while hidden and comes back', () => {
    audio.unlock();
    const doc = document as unknown as { hidden: boolean };
    doc.hidden = true;
    for (const f of win.listeners.visibilitychange) f({});
    doc.hidden = false;
    for (const f of win.listeners.visibilitychange) f({});
    for (const f of win.listeners.pointerdown) f({});
  });
});
