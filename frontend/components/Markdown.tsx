import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildImageUrl } from "@/lib/utils";

// Resolve markdown image srcs through buildImageUrl so an API-relative
// path (e.g. the `/api/og/lesson-diagram?d=…` diagrams migration 0190
// embeds into course lesson bodies) becomes an absolute URL on the API
// origin. The SPA is served from a static host that doesn't proxy `/api`,
// so an unresolved relative src 404s as a broken image. Absolute URLs
// pass through unchanged. Centralized here so every markdown surface
// (lesson bodies, article inline bodies, …) inherits the same handling.
const MARKDOWN_COMPONENTS: Components = {
  img: ({ src, node: _node, ...props }) => (
    <img src={buildImageUrl(typeof src === "string" ? src : undefined)} {...props} />
  ),
};

export default function Markdown({
  children,
  className = "prose prose-sm dark:prose-invert max-w-none",
}: {
  children: string;
  /** Override the prose wrapper so surfaces with their own typography
   *  (e.g. the larger article body) still inherit the image resolver. */
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
