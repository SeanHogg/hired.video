/**
 * The caller's TikTok creator info for the Post dock's TikTok settings form
 * (nickname, privacy options, interaction disables, max duration).
 *
 * Not cached on purpose: TikTok's sharing guidelines require reading it fresh
 * whenever the post form renders (posting limits and options change), and it
 * is one call per form open.
 */
import type { TikTokCreatorInfo } from "../../../../shared/tiktok-post-settings.js";
import { socialConnectionServiceFor } from "./social-connection-factory.js";
import type { SocialEnv } from "./social-connection-service.js";
import { queryTikTokCreatorInfo } from "./publishers/tiktok.js";

export interface TikTokCreatorInfoDeps {
  getAccessToken?: (userId: string) => Promise<string | null>;
  query?: (accessToken: string) => Promise<TikTokCreatorInfo>;
}

/** Null when the caller has no fresh TikTok connection. */
export async function getTikTokCreatorInfo(
  userId: string,
  env: SocialEnv | undefined,
  deps: TikTokCreatorInfoDeps = {},
): Promise<TikTokCreatorInfo | null> {
  const getAccessToken =
    deps.getAccessToken ??
    ((id: string) => socialConnectionServiceFor(env).getFreshSelfAccessToken(id, null, "tiktok"));
  const token = await getAccessToken(userId);
  if (!token) return null;
  return (deps.query ?? queryTikTokCreatorInfo)(token);
}
