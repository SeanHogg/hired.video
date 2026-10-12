/**
 * "Write it for me" — the ONE caption writer behind the Post dock and the
 * Distribution Hub (shared caption and each destination's own): the AI
 * caption route, written for the tightest limit of `platforms`, joined into
 * the text a post carries (hook, caption, hashtags).
 */
import { generateSocialCaption } from "@/lib/services/studio-features-service";
import type { VideoPublishPlatform } from "@shared/social-platforms";

export interface GeneratedCaption {
  hook: string;
  caption: string;
  hashtags: string[];
}

/** Hook, caption and #hashtags as one post text. */
export function captionTextOf(post: GeneratedCaption): string {
  const tags = post.hashtags.map((h) => `#${h}`).join(" ");
  return [post.hook, post.caption, tags].filter(Boolean).join("\n\n");
}

export async function writeCaption(projectId: string, platforms: VideoPublishPlatform[]): Promise<string> {
  const post = await generateSocialCaption({
    projectId,
    tone: "professional",
    platforms: platforms.length > 0 ? platforms : undefined,
  });
  return captionTextOf(post);
}
