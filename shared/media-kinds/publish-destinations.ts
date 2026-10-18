import type { MediaKind } from "./kinds.js";

// ─── Publish destinations ────────────────────────────────────────────────────
//
// Where a finished project can be published. The save menu reads
// `publishDestinationsFor(kind)` to render the dropdown. Each destination
// is a stable id — the editor maps id → callback at the call site.
//
// NEVER pass `canPublishToX` booleans down through the component tree
// (`feedback_extract_on_duplication`): the menu calls this function and
// the dropdown self-gates per-row.

export type PublishDestinationId =
  // Video
  | "youtube"
  | "linkedin"
  | "profile"
  // Video — social networks posted through the generic social publisher
  // (ids mirror SOCIAL_POST_PLATFORMS in shared/social-platforms).
  | "tiktok"
  | "instagram"
  | "x"
  | "facebook"
  // Podcast
  | "rss"
  | "apple-podcasts"
  | "spotify-creators"
  // Voice
  | "voice-marketplace"
  | "profile-audio-embed"
  // Animation
  | "giphy"
  | "tenor"
  | "r2-host"
  // Game
  | "itch-io"
  | "github-pages"
  | "game-web-embed"
  // Comic
  | "comic-reader"
  | "webtoon-feed"
  | "tapas-feed"
  // Image (#932) — once exported the raster also lands in the creator's
  // R2 asset library so it's one click away from any other studio
  // project (the closed-loop interop tracked in #933). `profile-gallery`
  // is the creator's public image gallery surface.
  | "profile-gallery"
  | "asset-library"
  // CAD (#930) — `cad-gallery` is the no-render-required gallery
  // surface; `cad-asset-library` writes the flattened SVG/PDF into
  // R2 so other projects can reference it via MediaPicker.
  | "cad-gallery"
  | "cad-asset-library"
  // Training / e-learning (#160) — attaches the project to a course
  // as `sourceType: studio_video`. Available for every time-based kind.
  | "course-lesson";

export interface PublishDestination {
  id: PublishDestinationId;
  label: string;
  /** Visible only when the project's mediaKind is in this set. */
  mediaKinds: readonly MediaKind[];
  /** Becomes enabled once the project has a baked output (i.e. has been
   *  rendered at least once). The editor decides what "baked" means per
   *  destination; this flag just declares the dependency. */
  requiresRender: boolean;
}

export const PUBLISH_DESTINATIONS: PublishDestination[] = [
  // Video — the existing surfaces.
  { id: "youtube",              label: "YouTube",                 mediaKinds: ["video", "podcast"], requiresRender: true  },
  { id: "linkedin",             label: "LinkedIn",                mediaKinds: ["video", "podcast"], requiresRender: true  },
  { id: "profile",              label: "Profile",                 mediaKinds: ["video", "podcast", "voice", "animation", "comic"], requiresRender: false },
  { id: "tiktok",               label: "TikTok",                  mediaKinds: ["video"],            requiresRender: true  },
  { id: "instagram",            label: "Instagram",               mediaKinds: ["video"],            requiresRender: true  },
  { id: "x",                    label: "X",                       mediaKinds: ["video"],            requiresRender: true  },
  { id: "facebook",             label: "Facebook",                mediaKinds: ["video"],            requiresRender: true  },
  // Podcast.
  { id: "rss",                  label: "RSS feed",                mediaKinds: ["podcast"],          requiresRender: true  },
  { id: "apple-podcasts",       label: "Apple Podcasts Connect",  mediaKinds: ["podcast"],          requiresRender: true  },
  { id: "spotify-creators",     label: "Spotify for Creators",    mediaKinds: ["podcast"],          requiresRender: true  },
  // Voice.
  { id: "voice-marketplace",    label: "Voice marketplace",       mediaKinds: ["voice"],            requiresRender: true  },
  { id: "profile-audio-embed",  label: "Profile audio embed",     mediaKinds: ["voice"],            requiresRender: true  },
  // Animation.
  { id: "giphy",                label: "Giphy",                   mediaKinds: ["animation"],        requiresRender: true  },
  { id: "tenor",                label: "Tenor",                   mediaKinds: ["animation"],        requiresRender: true  },
  { id: "r2-host",              label: "Hosted CDN link",         mediaKinds: ["animation"],        requiresRender: true  },
  // Game.
  { id: "itch-io",              label: "itch.io",                 mediaKinds: ["game"],             requiresRender: true  },
  { id: "github-pages",         label: "GitHub Pages",            mediaKinds: ["game"],             requiresRender: true  },
  { id: "game-web-embed",       label: "Embed on hired.video",    mediaKinds: ["game"],             requiresRender: true  },
  // Comic — `comic-reader` hosts a scrollable reader on hired.video and
  // is the no-render-required default (the live canvas IS the reader).
  // The Webtoon / Tapas rows ride the same publish pipeline as the
  // social-share surfaces; the editor maps each id to its destination
  // adapter at the call site.
  { id: "comic-reader",         label: "Hired.video reader",      mediaKinds: ["comic"],            requiresRender: false },
  { id: "webtoon-feed",         label: "Webtoon (manual upload)", mediaKinds: ["comic"],            requiresRender: true  },
  { id: "tapas-feed",           label: "Tapas (manual upload)",   mediaKinds: ["comic"],            requiresRender: true  },
  // Image (#932) — the gallery is the no-render-required default (the
  // live canvas already renders); asset-library writes the flattened
  // PNG into R2 under the creator's namespace so it can be picked up
  // by any other studio project via MediaPicker (#933).
  { id: "profile-gallery",      label: "Profile gallery",         mediaKinds: ["image"],            requiresRender: false },
  { id: "asset-library",        label: "Save to asset library",   mediaKinds: ["image"],            requiresRender: true  },
  // CAD (#930) — gallery is the no-render default (live canvas);
  // `cad-asset-library` writes the rendered drawing to R2 so it can
  // be picked up by other studio projects via MediaPicker.
  { id: "cad-gallery",          label: "Profile gallery",         mediaKinds: ["cad"],              requiresRender: false },
  { id: "cad-asset-library",    label: "Save to asset library",   mediaKinds: ["cad"],              requiresRender: true  },
  // Training / e-learning (#160). The course picker mounts a list of
  // the author's draft courses; "Save as Course Lesson" attaches the
  // current project as `sourceType: studio_video`. Available for every
  // time-based kind; not for image / cad / game.
  { id: "course-lesson",        label: "Save as Course Lesson",   mediaKinds: ["video", "podcast", "voice", "animation", "comic"], requiresRender: false },
];

export function publishDestinationsFor(kind: MediaKind): PublishDestination[] {
  return PUBLISH_DESTINATIONS.filter((d) => d.mediaKinds.includes(kind));
}
