/**
 * useChannelFit — how the video being posted fits each network's delivery
 * preset (shared/publish-presets: aspect, duration window, codec), as the
 * one-line note the Post dock shows under a channel. Also answers whether a
 * YouTube post is a Short (vertical, ≤ 3 min) so the server tags it.
 *
 * Shape comes from the editor: the frame size (null when unknown — then only
 * duration is checked, never a guessed aspect) and the total duration.
 *
 * `variantFor` is the fitted cut a network needs (#2045) from the SAME shape
 * the notes read, so a note and the cut that resolves it never disagree.
 * When the dock will post that cut, the note says so instead of warning;
 * the warning stays for a surface that can't render cuts, or a cut that
 * failed to render (the master is posted then).
 */
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  aspectOf,
  isYouTubeShort,
  PUBLISH_PLATFORM_PRESETS,
  publishFitFor,
  variantSpecFor,
  type VariantSpec,
} from "@shared/publish-presets";
import { isVideoPublishPlatform } from "@shared/social-platforms";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import { useShareChannelLabel } from "./useShareChannelLabel";

export interface VideoFrame {
  width: number;
  height: number;
}

/** 140 → "2:20", 600 → "10:00", 4 h → "4:00:00". */
export function formatClock(totalSec: number): string {
  const s = Math.floor(totalSec % 60);
  const m = Math.floor((totalSec / 60) % 60);
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function useChannelFit(frame: VideoFrame | null | undefined, durationSec: number | null | undefined) {
  const { t } = useTranslation();
  const labelOf = useShareChannelLabel();
  const aspect = frame ? aspectOf(frame.width, frame.height) : null;
  const duration = durationSec && durationSec > 0 ? durationSec : 0;

  const youtubeShort = useMemo(() => isYouTubeShort({ aspect, durationSec: duration }), [aspect, duration]);

  /** The fitted cut this network needs, or null when the master fits it. */
  const variantFor = useCallback(
    (channel: ShareChannelId): VariantSpec | null => {
      if (!isVideoPublishPlatform(channel) || duration <= 0) return null;
      // Without a known frame, check duration only: never reframe what we can't see.
      const known = frame ? aspect : PUBLISH_PLATFORM_PRESETS[channel].aspects[0];
      return variantSpecFor(channel, { aspect: known, durationSec: duration });
    },
    [aspect, duration, frame],
  );

  /** `bakesCut`: the dock will post this network its own cut. */
  const noteFor = useCallback(
    (channel: ShareChannelId, bakesCut = false): string | null => {
      if (!isVideoPublishPlatform(channel)) return null;
      const name = labelOf(channel);
      const preset = PUBLISH_PLATFORM_PRESETS[channel];
      // Without a known frame, check duration only: never claim a reframe we can't see.
      const fit = publishFitFor(channel, { aspect: frame ? aspect : preset.aspects[0], durationSec: duration });
      const cut = bakesCut ? variantFor(channel) : null;
      if (cut) return cutNote(t, name, cut);
      if (fit.trimToSec !== null) return t("publish.fit.tooLong", { name, limit: formatClock(fit.trimToSec) });
      if (fit.tooShort) return t("publish.fit.tooShort", { name, min: preset.minDurationSec });
      if (fit.reframe) return t("publish.fit.reframe", { name, aspect: fit.aspect });
      if (channel === "youtube" && youtubeShort) return t("publish.fit.youtubeShort");
      return null;
    },
    [aspect, duration, frame, labelOf, t, youtubeShort, variantFor],
  );

  /** Identity of the master's shape (frame + length): changes exactly when
   *  the cuts a network needs could change. */
  const shapeKey = `${frame ? `${frame.width}x${frame.height}` : "?"}@${duration}`;

  return { noteFor, variantFor, youtubeShort, shapeKey };
}

/** "9:16" or "9:16 · 2:20" — how a cut is named in notes and progress. */
export function cutLabel(cut: VariantSpec): string {
  return cut.trimToSec === null ? cut.aspect : `${cut.aspect} · ${formatClock(cut.trimToSec)}`;
}

function cutNote(t: TFunction, name: string, cut: VariantSpec): string {
  if (cut.trimToSec === null) return t("publish.variant.noteReframe", { name, aspect: cut.aspect });
  return t("publish.variant.noteTrim", { name, aspect: cut.aspect, limit: formatClock(cut.trimToSec) });
}
