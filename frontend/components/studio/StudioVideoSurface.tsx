// StudioVideoSurface — THE only video player in the app.
//
// Every surface that shows a video — studio-published, raw URL, YouTube
// embed, or static thumbnail — mounts this component. There is no
// secondary "VideoPlayer" wrapper: the source variants below replace it.
//
// Per the standing DRY rule the surface owns its own dispatch — given a
// payload it decides between:
//
//   • Real YouTube id           → privacy-friendly nocookie iframe.
//   • Baked MP4 (videoUrl)      → native <video> + CtaHotzonesOverlay.
//   • Saved canvas, no MP4      → <TimelineFramePreview/> live off the V2
//                                 state (`timelineSpec`, or a stored V1
//                                 script converted at read time — #666,
//                                 #721). The "saved-but-unrendered" case.
//   • Only thumbnail            → static poster placeholder.
//   • Nothing                   → friendly empty state.
//
// Three consumption modes pick the data path:
//
//   <StudioVideoSurface mode="eager" ready={payload} />
//   <StudioVideoSurface mode="lazy"  videoId="…" poster="…" />
//   <StudioVideoSurface mode="flat"  source={{ kind: "youtube", videoId }} />
//
// • `eager` — caller already fetched the `/api/studio/public/:id` payload.
// • `lazy`  — caller has only a studio video id; mounts a poster + Play
//             overlay, fetches on activation (or immediately when
//             `autoplay`), then dispatches like eager.
// • `flat`  — caller has a raw URL / YouTube id / thumbnail and no
//             studio project to lazy-fetch (marketing CTAs, hero
//             rotation thumbnails, in-frame element videos). Skips the
//             script branch.
//
// Implementation lives in ./video-surface/ (one file per branch + hooks);
// this module is the stable public entry point.

import FlatSurface from "./video-surface/FlatSurface";
import LazySurface from "./video-surface/LazySurface";
import PublicVideoDispatch from "./video-surface/PublicVideoDispatch";
import type { Props } from "./video-surface/types";

export type { FlatVideoSource } from "./video-surface/types";

export default function StudioVideoSurface(props: Props) {
  if (props.mode === "eager") {
    return (
      <PublicVideoDispatch
        ready={props.ready}
        title={props.title ?? props.ready.title}
        aspectRatio={props.aspectRatio ?? props.ready.aspect ?? undefined}
        className={props.className}
        analyticsProjectId={props.analyticsProjectId}
      />
    );
  }
  if (props.mode === "lazy") {
    return <LazySurface {...props} />;
  }
  return <FlatSurface {...props} />;
}
