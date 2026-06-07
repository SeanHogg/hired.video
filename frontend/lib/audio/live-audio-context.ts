/**
 * live-audio-context.ts — the single owner of *device-backed* AudioContext
 * lifecycle.
 *
 * Why this exists
 * ───────────────
 * Chromium logs the verbatim console error
 *
 *   "The AudioContext encountered an error from the audio device or the
 *    WebAudio renderer"
 *
 * whenever a LIVE AudioContext's underlying output device fails — no default
 * output device, an exclusive-mode conflict, a device disconnect, or the OS
 * putting the device to sleep — OR when too many live contexts pile up (the
 * per-document cap is ~6). An ad-hoc `new AudioContext()` that is never closed
 * leaks the device handle and keeps emitting that error on unrelated pages
 * long after the sound has stopped (e.g. a never-released TTS context bleeding
 * onto /search?category=media after the user leaves the studio).
 *
 * Per DRY there is now exactly ONE place that creates a live, interactive
 * context. `OfflineAudioContext` (render-to-buffer, no device) and the export
 * pipeline's self-contained capture context (`video-exporter.ts`, which owns
 * its own MediaStreamDestination + user-facing error surfacing) are
 * intentionally out of scope.
 *
 * Model
 * ─────
 * A single ref-counted shared live context. Each interactive consumer (music
 * scheduler, ambient preview, piano, TTS playback, mic analyser) calls
 * `acquireSharedAudioContext()` on start and the returned `release()` on stop /
 * unmount. When the last consumer releases, the context is closed shortly
 * after so no idle device handle lingers and re-emits the renderer error. The
 * short close delay lets a rapid stop→start (play/pause, clip-drag rebuilds)
 * reuse the same context instead of thrashing device handles — repeated
 * open/close is itself a trigger for the error.
 */

export interface SharedAudioContextHandle {
  /** The shared live AudioContext. Do not call `.close()` on it directly —
   *  call `release()` instead so the ref-count stays correct. */
  ctx: AudioContext;
  /** Release this consumer's hold. Idempotent. Closes the shared context once
   *  the last consumer releases (after a short grace period). */
  release: () => void;
}

// States that mean the device dropped out from under us. Safari surfaces
// "interrupted" on audio-focus loss; we try to resume rather than leave the
// context wedged.
const RECOVERABLE_STATES = new Set<string>(["interrupted"]);

// Grace period before closing an idle context, so a quick stop→start reuses it.
const IDLE_CLOSE_MS = 2000;

let shared: AudioContext | null = null;
let refCount = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function makeContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  // Auto-recover from OS audio-focus interruptions instead of leaving the
  // context wedged (and spamming the device error). `resume()` no-ops if the
  // device is genuinely gone; the idle-close path then reclaims it.
  ctx.addEventListener("statechange", () => {
    if (ctx === shared && RECOVERABLE_STATES.has(ctx.state as string)) {
      ctx.resume().catch(() => {});
    }
  });
  return ctx;
}

/**
 * Acquire a hold on the shared live AudioContext, creating it if needed.
 * Returns the context plus a `release()` to relinquish the hold.
 */
export function acquireSharedAudioContext(): SharedAudioContextHandle {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (!shared || shared.state === "closed") {
    shared = makeContext();
  }
  refCount += 1;
  // Resume opportunistically — succeeds once a user gesture has unlocked audio.
  if (shared.state === "suspended") shared.resume().catch(() => {});

  const ctx = shared;
  let released = false;
  return {
    ctx,
    release() {
      if (released) return;
      released = true;
      refCount = Math.max(0, refCount - 1);
      if (refCount > 0) return;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (refCount === 0 && shared && shared.state !== "closed") {
          shared.close().catch(() => {});
          shared = null;
        }
      }, IDLE_CLOSE_MS);
    },
  };
}
