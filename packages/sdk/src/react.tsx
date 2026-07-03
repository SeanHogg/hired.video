/**
 * @hiredvideo/sdk/react — React components for embedding a Hired.Video profile
 * or resume. `react` is a peer dependency (not bundled).
 *
 * The `token` must be minted server-side via `HiredClient.createEmbedToken`;
 * pass it to the component. Renders a responsive iframe pointing at the
 * Hired.Video embed surface.
 */
import * as React from "react";
import { buildEmbedUrl } from "./embed.js";

export interface HiredProfileEmbedProps {
  /** Short-lived embed token from `HiredClient.createEmbedToken`. */
  token: string;
  /** API origin (must match the one that minted the token). */
  baseUrl?: string;
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
 * import { HiredProfileEmbed } from "@hiredvideo/sdk/react";
 * <HiredProfileEmbed token={token} height={800} />
 * ```
 */
export function HiredProfileEmbed({
  token,
  baseUrl,
  height = 720,
  title = "Hired.Video profile",
  className,
  style,
  onLoad,
}: HiredProfileEmbedProps): React.ReactElement {
  const src = buildEmbedUrl(token, baseUrl);
  return (
    <iframe
      src={src}
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

/** Alias — `HiredResumeEmbed` renders the same surface (the embed page shows
 *  the profile header + resume together). Kept as a named export so partner
 *  code reads intentfully when they only care about the resume. */
export { HiredProfileEmbed as HiredResumeEmbed };
