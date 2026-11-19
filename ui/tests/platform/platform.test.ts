import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { empty, merge } from '../../src/game/learn';
import { canFullscreen, enterFullscreen, safeArea, standalone, touchScreen, wakeLock } from '../../src/platform/device';
import { settings } from '../../src/platform/settings';
import { stubWindow } from '../stubs';

afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  beforeEach(() => stubWindow());

  it('defaults, stores and reads back under the game id', () => {
    expect(settings.muted).toBe(false);
    expect(settings.minutes).toBe(2);
    expect(settings.lastLook).toBeNull();
    settings.muted = true;
    settings.minutes = 5;
    settings.lastLook = { variant: 'mouse', color: 'lime', size: 's' };
    expect(settings.muted).toBe(true);
    expect(settings.minutes).toBe(5);
    expect(settings.lastLook).toEqual({ variant: 'mouse', color: 'lime', size: 's' });
    expect(localStorage.getItem('muesli.minutes')).toBe('5');
    settings.lastLook = null;
    expect(settings.lastLook).toBeNull();
  });

  it('ignores junk it finds in storage', () => {
    localStorage.setItem('muesli.minutes', '7');
    localStorage.setItem('muesli.look', '{"variant":"rat","color":"red","size":"xl"}');
    expect(settings.minutes).toBe(2);
    expect(settings.lastLook).toBeNull();
    localStorage.setItem('muesli.look', '{');
    expect(settings.lastLook).toBeNull();
  });

  it('keeps and resets what it learned', () => {
    settings.learn = merge(empty(), { 'variant:dot': { t: 2, s: 30 } }, 60);
    expect(settings.learn.sessions).toBe(1);
    settings.resetLearn();
    expect(settings.learn).toEqual(empty());
  });

  it('runs on defaults when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    });
    settings.muted = true;
    settings.lastLook = null;
    expect(settings.muted).toBe(false);
    expect(settings.learn).toEqual(empty());
  });
});

describe('device', () => {
  it('holds the screen awake, takes it back after hiding, lets go at the end', async () => {
    const win = stubWindow();
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    await wakeLock.on();
    expect(wakeLock.held).toBe(true);
    await wakeLock.off();
    expect(release).toHaveBeenCalled();
    expect(wakeLock.held).toBe(false);
    await wakeLock.on();
    // the system dropped the lock while hidden
    await wakeLock.off();
    await wakeLock.on();
    for (const f of win.listeners.visibilitychange) f({});
    expect(request.mock.calls.length).toBeGreaterThanOrEqual(3);
    await wakeLock.off();
  });

  it('copes without a wake lock or with a refusal', async () => {
    stubWindow();
    await wakeLock.on();
    expect(wakeLock.held).toBe(false);
    vi.stubGlobal('navigator', { wakeLock: { request: async () => Promise.reject(new Error('no')) } });
    await wakeLock.on();
    expect(wakeLock.held).toBe(false);
    await wakeLock.off();
  });

  it('asks for fullscreen only where the browser has it and the page is not installed', () => {
    stubWindow();
    expect(standalone()).toBe(false);
    expect(canFullscreen()).toBe(false);
    enterFullscreen(); // no API: nothing happens
    const req = vi.fn(async () => {});
    (document as unknown as { documentElement: unknown }).documentElement = { requestFullscreen: req };
    expect(canFullscreen()).toBe(true);
    enterFullscreen();
    expect(req).toHaveBeenCalled();
    const wk = vi.fn();
    (document as unknown as { documentElement: unknown }).documentElement = { webkitRequestFullscreen: wk };
    enterFullscreen();
    expect(wk).toHaveBeenCalled();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(standalone()).toBe(true);
    vi.stubGlobal('matchMedia', () => {
      throw new Error('old browser');
    });
    expect(standalone()).toBe(false);
    expect(touchScreen()).toBe(false);
  });

  it('reads the safe-area insets and knows a touch screen', () => {
    stubWindow({ touch: true });
    expect(safeArea()).toEqual({ top: 10, right: 0, bottom: 20, left: 0 });
    expect(touchScreen()).toBe(true);
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('no');
    });
    expect(safeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
