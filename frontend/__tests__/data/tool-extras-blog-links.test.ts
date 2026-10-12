/**
 * Data-integrity guard for the tool-page footer → guide link.
 *
 * Every tool in TOOL_EXTRAS advertises a "Learn more in our guide" card
 * (rendered by ToolFooterSEO) that links to /blog/<blogSlug>. BlogPost.tsx
 * redirects to /blog when the slug doesn't resolve, so a blogSlug with no
 * matching BLOG_POSTS entry silently dead-ends the user on the blog index.
 *
 * This pins the invariant: every blogSlug referenced by a tool must point
 * at a real article. (Career 360's link was broken this way — gap fixed.)
 */

import { describe, it, expect } from "vitest";
import { TOOL_EXTRAS } from "@/data/tool-extras";
import { getBlogPost } from "@/data/blog-posts";

describe("tool-extras blog links", () => {
  it("every blogSlug resolves to a real BLOG_POSTS article", () => {
    const broken = Object.entries(TOOL_EXTRAS)
      .filter(([, extras]) => !getBlogPost(extras.blogSlug))
      .map(([toolPath, extras]) => `${toolPath} → /blog/${extras.blogSlug}`);

    expect(broken, `Tool footer links pointing at missing articles:\n${broken.join("\n")}`).toEqual([]);
  });
});
