// StudioPlayer.tsx — the unified studio video player. Self-picks its
// source from project state via `pickPlayerSource()`:
//   • baked  → mounts an HTML5 <video> against the rendered MP4 at
//              `state.videoUrl`. Cheap, portable, used both inside the
//              editor (when fresh) and on the public /v/:id page.
//   • live   → mounts <VideoPreview/> (the canvas RAF + frame-renderer +
//              voiceover engines + audio scheduler) so the user sees
//              their unsaved edits immediately.
//
// Per the standing DRY rule the player owns the decision: consumers
// pass project state, NOT a `useBaked` boolean. That keeps the in-editor
// player and the public viewer from drifting — both surfaces ask the
// same `pickPlayerSource()` helper.
//
// Both branches expose the same external surface (play/pause via the
// `playing` prop, scrub via `currentTime`, progress via onTimeUpdate,
// onEnded when the playhead reaches the end). That way the chrome
// around the player (scrubber, play button, action stepper) doesn't
// have to branch on the source either.

import { useEffect, useRef, useState } from "react";
import VideoPreview from "@/components/VideoPreview";
import { pickPlayerSource } from "@/lib/studio/baked-freshness";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { useSubscription } from "@/lib/hooks/useSubscription";
import EndCapOverlay from "@/components/studio/EndCapOverlay";
import { VideoTracker } from "@/lib/analytics/video-tracker";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { StudioProjectState } from "@/types/studio";
import type { ElementBox, SceneElement } from "@/types/video-script";

export interface StudioPlayerProps {
  /** Project state — the player reads `script`, `videoUrl`, `voiceover`,
   *  `captions` to decide its source. No `useBaked` prop: per DRY the
   *  decision lives in `pickPlayerSource()` only. */
  state: Pick<
    StudioProjectState,
    "script" | "videoUrl" | "voiceover" | "captions"
  >;
  /** Compiled timeline for the LIVE branch. Ignored by the baked
   *  branch (the MP4 already encodes the compiled output). Optional so
   *  the public /v/:id page can mount the player before — or even
   *  without — recompiling client-side: when a fresh `videoUrl` exists,
   *  the baked branch needs no compile pass. */
  compiledVideo?: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onEnded?: () => void;
  className?: string;
  /** Live-branch overlays for the active scene. Ignored by baked. */
  overlayElements?: SceneElement[];
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onUpdateElementBox?: (id: string, box: ElementBox) => void;
  /** Pro-only opt-out: Free users always see branding regardless of
   *  this flag (the policy lives in `shouldShowBranding`). */
  removeBrandingFlag?: boolean;
  /** When set, attaches the per-second VideoTracker to the baked
   *  branch's `<video>` element. Public surfaces pass the project id
   *  so engagement analytics land per migration 0085. The live branch
   *  ignores it (no native <video> to listen on). */
  analyticsProjectId?: string;
}

export default function StudioPlayer(props: StudioPlayerProps) {
  // Self-gated branding policy — the same primitive StudioPreview uses
  // so the end-cap can't disagree between in-editor and public surfaces.
  const { isPro } = useSubscription();
  const showBrandingEndCap = shouldShowBranding({
    isPro,
    removeBrandingFlag: props.removeBrandingFlag,
  });

  // Source decision lives in baked-freshness.ts — single source so the
  // Publish button labels can derive their "Re-render needed" state
  // from the same comparison without duplicating it.
  const source = pickPlayerSource(props.state);

  if (source.kind === "baked") {
    return (
      <BakedBranch
        url={source.url}
        playing={props.playing}
        currentTime={props.currentTime}
        onTimeUpdate={props.onTimeUpdate}
        onEnded={props.onEnded}
        className={props.className}
        showBrandingEndCap={showBrandingEndCap}
        analyticsProjectId={props.analyticsProjectId}
      />
    );
  }

  if (!props.compiledVideo) {
    // Live branch needs a compiled timeline. Without one we render a
    // gentle empty state instead of crashing — happens during the brief
    // window between project load and compile completion, and on the
    // public page when a project has no script yet.
    return (
      <div className={`flex items-center justify-center text-xs text-muted-foreground ${props.className ?? ""}`}>
        Nothing to play yet.
      </div>
    );
  }

  return (
    <VideoPreview
      compiledVideo={props.compiledVideo}
      playing={props.playing}
      currentTime={props.currentTime}
      onTimeUpdate={props.onTimeUpdate}
      audio={props.state.script?.video?.audio}
      voiceover={props.state.voiceover}
      sceneTimings={props.state.script?.scenes.map((s) => ({
        id: s.id,
        start: s.start,
        duration: s.duration,
        text: [
          typeof s.text === "string" ? s.text : s.text?.join(". "),
          s.items?.join(". "),
          s.skills ? `Skills: ${s.skills.join(", ")}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      }))}
      overlayElements={props.overlayElements}
      selectedElementId={props.selectedElementId}
      onSelectElement={props.onSelectElement}
      onUpdateElementBox={props.onUpdateElementBox}
      onEnded={props.onEnded}
      showBrandingEndCap={showBrandingEndCap}
      className={props.className}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Baked branch — HTML5 <video>. Drives play/pause + currentTime from props
// the same way the live branch does so the surrounding chrome (scrubber,
// play button) doesn't have to branch by source.
// ───────────────────────────────────────────────────────────────────────────

interface BakedBranchProps {
  url: string;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onEnded?: () => void;
  className?: string;
  showBrandingEndCap: boolean;
  analyticsProjectId?: string;
}

function BakedBranch({
  url,
  playing,
  currentTime,
  onTimeUpdate,
  onEnded,
  className,
  showBrandingEndCap,
  analyticsProjectId,
}: BakedBranchProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  // Track whether the user-driven `currentTime` prop change came from
  // the player itself (timeupdate echo) or from an outside seek. Without
  // this guard the seek in the effect re-fires constantly during normal
  // playback as `onTimeUpdate` -> parent state -> `currentTime` prop
  // round-trips.
  const lastEchoedRef = useRef<number>(currentTime);
  const SEEK_EPSILON = 0.25;

  // Attach per-second engagement tracker when a project id is supplied.
  // Owned here so consumers can't accidentally attach to the wrong
  // element (or forget to detach on unmount).
  useEffect(() => {
    if (!analyticsProjectId || !videoRef.current) return;
    const tracker = new VideoTracker(analyticsProjectId);
    return tracker.attach(videoRef.current);
  }, [analyticsProjectId]);

  // Sync `playing` prop → element state.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      // Re-arming after end: clear the overlay so onReplay isn't the
      // only path back to playback.
      setAtEnd(false);
      el.play().catch(() => {
        // Autoplay policies can reject — surface as a paused state
        // rather than throwing. The play button is still wired.
      });
    } else {
      el.pause();
    }
  }, [playing]);

  // Sync `currentTime` prop → element seek (only when the gap is real,
  // not the echo from our own onTimeUpdate emit).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (Math.abs(el.currentTime - currentTime) > SEEK_EPSILON
      && Math.abs(currentTime - lastEchoedRef.current) > SEEK_EPSILON) {
      el.currentTime = currentTime;
      if (currentTime < (el.duration ?? Infinity) - SEEK_EPSILON) setAtEnd(false);
    }
  }, [currentTime]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full"
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          lastEchoedRef.current = t;
          onTimeUpdate(t);
        }}
        onEnded={() => {
          setAtEnd(true);
          onEnded?.();
        }}
      />
      <EndCapOverlay
        atEnd={atEnd}
        showBranding={showBrandingEndCap}
        onReplay={() => {
          const el = videoRef.current;
          if (!el) return;
          el.currentTime = 0;
          setAtEnd(false);
          el.play().catch(() => {});
        }}
      />
    </div>
  );
}
