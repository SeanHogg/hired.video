import type { ReactNode } from "react";

import type { AspectRatioInput } from "@/lib/studio/aspect";
import type { PublicVideoReady } from "@/lib/studio/public-video-schema";

// ─── Public API ─────────────────────────────────────────────────────────────

export type CommonProps = {
  /** Container class for the outer wrapper. */
  className?: string;
  /** Override the AspectFrame ratio; otherwise read from payload. */
  aspectRatio?: AspectRatioInput;
  /** Optional override for the title (defaults to payload). */
  title?: string;
  /** When set, attaches a VideoTracker (per-second engagement
   *  analytics) to the baked-MP4 branch's `<video>` element. Events
   *  land on the supplied studio project id — keyed there per
   *  migration 0085. The live-canvas branch is currently unsupported
   *  for tracking (no native <video> element to listen on); that
   *  trade-off is documented at the ATS callsite. */
  analyticsProjectId?: string;
};

export type EagerProps = CommonProps & {
  mode: "eager";
  ready: PublicVideoReady;
};

export type LazyProps = CommonProps & {
  mode: "lazy";
  videoId: string;
  /** Poster shown during the brief fetch window. After the payload
   *  resolves the canvas takes over and renders its own first-frame
   *  paused state, so this is only visible for the network roundtrip. */
  poster?: string | null;
  /** When true, auto-start playback once the canvas hydrates —
   *  "live thumbnail" feel for the homepage hero / channel header.
   *  When false (default) the surface hydrates to the first frame
   *  paused and the user clicks to play. Eager fetch is always on
   *  regardless — never the gated press-play. */
  autoplay?: boolean;
  /** Optional fallback URL for the YouTube/baked branch when the lazy
   *  fetch fails — keeps legacy direct-upload videos playable even when
   *  the project lookup 404s. */
  fallbackVideoUrl?: string | null;
  fallbackYoutubeVideoId?: string | null;
};

/** Flat sources — caller has the embed primitive directly, no studio
 *  project to fetch. The three variants match the three primitives the
 *  underlying dispatcher already knows how to render. */
export type FlatVideoSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "url"; url: string; poster?: string | null }
  | { kind: "thumbnail"; thumbnailUrl: string | null };

export type FlatProps = CommonProps & {
  mode: "flat";
  source: FlatVideoSource;
  /** Show native playback controls. Default true. Hero spotlight sets
   *  false for muted-autoplay "live thumbnail" loops. */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** Absolutely-positioned overlay rendered ON TOP of the embed but
   *  INSIDE the same AspectFrame — used by the hero spotlight chrome. */
  children?: ReactNode;
};

export type Props = EagerProps | LazyProps | FlatProps;
