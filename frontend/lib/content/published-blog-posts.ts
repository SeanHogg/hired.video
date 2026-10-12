/**
 * Published blog posts — the ONE gated accessor over the static editorial
 * registry (data/blog-posts.ts). Posts tagged `audience: "hiring"`
 * (recruiter / employer / people-ops guides, whose CTAs land on hiring routes
 * behind HiringRouteGate) are hidden while HIRING_PERSONAS_ENABLED is off.
 * Nothing is deleted: flip the switch and every post, category, related-post
 * link and feed card comes back.
 *
 * Every public consumer (/blog index + categories, /blog/:slug + related
 * posts, the unified search/card feed) reads through here; only regression
 * tests that validate registry links read BLOG_POSTS / getBlogPost directly.
 * Pure — `hiringEnabled` is injectable for tests; callers omit it.
 */

import { BLOG_POSTS, type BlogPost } from "@/data/blog-posts";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";

/** Is this post written for the hiring side (recruiters / employers)? */
export function isHiringBlogPost(post: Pick<BlogPost, "audience">): boolean {
  return post.audience === "hiring";
}

/** Is this post publicly offered under the given persona switch? */
export function isBlogPostPublished(
  post: Pick<BlogPost, "audience">,
  hiringEnabled: boolean = HIRING_PERSONAS_ENABLED,
): boolean {
  return hiringEnabled || !isHiringBlogPost(post);
}

/** Every publicly offered post, in registry order. */
export function publishedBlogPosts(hiringEnabled: boolean = HIRING_PERSONAS_ENABLED): BlogPost[] {
  return BLOG_POSTS.filter((p) => isBlogPostPublished(p, hiringEnabled));
}

/** A publicly offered post by slug; undefined for unknown OR gated slugs so
 *  /blog/:slug takes its existing not-found path. */
export function getPublishedBlogPost(
  slug: string,
  hiringEnabled: boolean = HIRING_PERSONAS_ENABLED,
): BlogPost | undefined {
  return publishedBlogPosts(hiringEnabled).find((p) => p.slug === slug);
}

/** Up to `limit` published posts in the same category, excluding `post`. */
export function relatedBlogPosts(
  post: Pick<BlogPost, "slug" | "category">,
  limit = 2,
  hiringEnabled: boolean = HIRING_PERSONAS_ENABLED,
): BlogPost[] {
  return publishedBlogPosts(hiringEnabled)
    .filter((p) => p.slug !== post.slug && p.category === post.category)
    .slice(0, limit);
}
