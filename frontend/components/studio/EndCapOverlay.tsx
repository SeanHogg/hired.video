// EndCapOverlay.tsx — branded card layered over the video canvas after
// natural end of playback. Replaces the old approach where the compiler
// appended a 2-second outro scene to every free user's timeline; that
// stole seconds from the user's content (music cut mid-card, captions
// trailed off) and broke WYSIWYG between preview and export. Now the
// exported MP4 ends exactly at the user's last frame, and this overlay
// only appears in the in-app player (and on the public share page) when
// the branding policy says it should.
//
// The component returns null when the video isn't at the end or the
// policy says no — the consumer can render it unconditionally and it
// self-gates, which keeps the call sites short and avoids the
// "prop-drilled canX boolean the consumer could compute itself" anti-
// pattern.

import { useMemo } from "react";

interface Props {
  /** True when playback has reached or passed the video's natural end. */
  atEnd: boolean;
  /** Branding-policy gate. False suppresses the overlay (Pro opt-out). */
  showBranding: boolean;
  /** Replay the video from the beginning. */
  onReplay: () => void;
}

export default function EndCapOverlay({ atEnd, showBranding, onReplay }: Props) {
  // Memoising the static markup keeps re-renders cheap during the brief
  // window where atEnd flips true and the parent canvas keeps painting.
  const card = useMemo(
    () => (
      <div className="text-center text-white">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img src="/pwa-512x512.png" alt="hired.video" className="w-12 h-12" />
          <span className="text-2xl font-bold">hired.video</span>
        </div>
        <p className="text-sm text-white/70 mb-4">Make yours at hired.video</p>
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
        >
          Replay
        </button>
      </div>
    ),
    [onReplay],
  );

  if (!atEnd || !showBranding) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#3b2098]/95 to-[#3b82f6]/95 backdrop-blur-sm rounded-lg"
      data-testid="end-cap-overlay"
    >
      {card}
    </div>
  );
}
