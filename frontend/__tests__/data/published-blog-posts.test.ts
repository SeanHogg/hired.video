import { describe, it, expect } from "vitest";
import { BLOG_POSTS } from "@/data/blog-posts";
import {
  getPublishedBlogPost,
  isHiringBlogPost,
  publishedBlogPosts,
  relatedBlogPosts,
} from "@/lib/content/published-blog-posts";

const hiringPost = BLOG_POSTS.find(isHiringBlogPost);
const seekerPost = BLOG_POSTS.find((p) => !isHiringBlogPost(p));

describe("published blog posts (hiring persona switch)", () => {
  it("the registry tags at least one hiring-audience post", () => {
    expect(hiringPost).toBeDefined();
    expect(seekerPost).toBeDefined();
  });

  it("hides hiring posts while hiring is off, keeps every other post", () => {
    const off = publishedBlogPosts(false);
    expect(off.some(isHiringBlogPost)).toBe(false);
    expect(off.length).toBe(BLOG_POSTS.filter((p) => !isHiringBlogPost(p)).length);
  });

  it("restores every post when hiring is on", () => {
    expect(publishedBlogPosts(true).length).toBe(BLOG_POSTS.length);
  });

  it("a gated slug resolves to undefined (→ /blog not-found path)", () => {
    expect(getPublishedBlogPost(hiringPost!.slug, false)).toBeUndefined();
    expect(getPublishedBlogPost(hiringPost!.slug, true)?.slug).toBe(hiringPost!.slug);
    expect(getPublishedBlogPost(seekerPost!.slug, false)?.slug).toBe(seekerPost!.slug);
  });

  it("no recruiter-route CTA survives on a published post while hiring is off", () => {
    for (const p of publishedBlogPosts(false)) {
      expect(p.toolUrl, p.slug).not.toBe("/for-recruiters");
    }
  });

  it("related posts never surface a gated post", () => {
    for (const p of publishedBlogPosts(false)) {
      expect(relatedBlogPosts(p, 10, false).some(isHiringBlogPost)).toBe(false);
    }
  });
});
