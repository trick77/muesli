// What the browser offers: screen wake lock, fullscreen, safe-area insets, touch. All optional; each call degrades
// to a no-op where the API is missing (iPhone Safari has no element fullscreen, older iOS no wake lock).

interface Sentinel {
  release(): Promise<void>;
  addEventListener?(type: 'release', f: () => void): void;
}

let lock: Sentinel | null = null;
let pending: Promise<void> | null = null;
let wanted = false;
let watching = false;

/** One request at a time; a lock that arrives after off() goes straight back. */
function acquire(): Promise<void> {
  const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
  if (!wl || lock) return Promise.resolve();
  pending ??= (async () => {
    try {
      const s = await wl.request('screen');
      if (!wanted) {
        await s.release().catch(() => {});
        return;
      }
      lock = s;
      s.addEventListener?.('release', () => {
        if (lock === s) lock = null;
      });
    } catch {
      // Not allowed (no HTTPS, battery saver): the screen may dim.
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Keeps the screen on during a hunt; the system drops the lock when the page hides, so it comes back on return. */
export const wakeLock = {
  async on() {
    wanted = true;
    if (!watching) {
      watching = true;
      document.addEventListener('visibilitychange', () => {
        if (wanted && document.visibilityState === 'visible') void acquire();
      });
    }
    await acquire();
  },
  async off() {
    wanted = false;
    const l = lock;
    lock = null;
    await l?.release().catch(() => {});
  },
  get held() {
    return lock !== null;
  },
};

/** Installed to the home screen: already fullscreen. */
export function standalone(): boolean {
  try {
    return (
      matchMedia('(display-mode: fullscreen)').matches ||
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** Fullscreen where the browser has it for any element (desktop, Android, iPad); never on iPhone Safari. */
export function enterFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (standalone() || document.fullscreenElement) return;
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch {
    // refused: the page stays as it is
  }
}

export const canFullscreen = () =>
  !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as unknown as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen
  );

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLElement | null = null;

/** The safe-area insets (notch, home bar), CSS px; read anew on every call (rotation changes them). */
export function safeArea(): Insets {
  try {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(probe);
    }
    const s = getComputedStyle(probe);
    return {
      top: parseFloat(s.paddingTop) || 0,
      right: parseFloat(s.paddingRight) || 0,
      bottom: parseFloat(s.paddingBottom) || 0,
      left: parseFloat(s.paddingLeft) || 0,
    };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** A touch screen: the cat's paws drive the pace. A desktop with a mouse runs on time alone. */
export function touchScreen(): boolean {
  try {
    return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
