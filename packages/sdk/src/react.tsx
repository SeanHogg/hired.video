/**
 * @seanhogg/hired-video-sdk/react — React component for embedding a Hired.Video
 * profile/resume. `react` is a peer dependency (not bundled).
 *
 * Pass the `embedUrl` returned by `HiredClient.createEmbedToken` (minted
 * server-side). Renders a responsive iframe pointing at the canonical
 * Hired.Video embed surface.
 */
import * as React from "react";

export interface HiredProfileEmbedProps {
  /** The `embedUrl` from `HiredClient.createEmbedToken`. */
  embedUrl: string;
  /** iframe height (px number or CSS length). Default 720. */
  height?: string | number;
  /** iframe title for accessibility. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Fired when the embed finishes loading. */
  onLoad?: () => void;
}

/**
 * Embed a connected job seeker's Hired.Video profile + resume.
 *
 * ```tsx
 * import { HiredProfileEmbed } from "@seanhogg/hired-video-sdk/react";
 * // embedUrl came from your server: hired.createEmbedToken({ userId })
 * <HiredProfileEmbed embedUrl={embedUrl} height={800} />
 * ```
 */
export function HiredProfileEmbed({
  embedUrl,
  height = 720,
  title = "Hired.Video profile",
  className,
  style,
  onLoad,
}: HiredProfileEmbedProps): React.ReactElement {
  return (
    <iframe
      src={embedUrl}
      title={title}
      loading="lazy"
      className={className}
      onLoad={onLoad}
      allow="clipboard-write"
      style={{
        width: "100%",
        border: 0,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
    />
  );
}

/** Alias — the embed surface shows the job seeker's profile + resume together. */
export { HiredProfileEmbed as HiredResumeEmbed };
