/**
 * Who is looking at a project's engagement widgets (#1586) — decides, in
 * ONE place, whether `useEngagementAsset` reads the owner listings (forms,
 * chapters, thumbnails AND review threads, all owner/delegate-only) or the
 * single public read (`GET …/engagement/public`: active forms, chapters,
 * thumbnails — never review comments).
 *
 *   • A signed-out viewer is always "public" — the owner APIs would 401.
 *   • A playback surface for viewers (the public watch page and every embed
 *     through `StudioVideoSurface`) declares "public" with
 *     `<EngagementAudienceProvider value="public">`, so a signed-in
 *     stranger never fires owner-only requests that can only 404.
 *   • Everything else — the studio editor, its canvas cards and preview —
 *     inherits the default "owner".
 *
 * Consumers never pass a `canX` flag: the hook reads this context.
 */
import { createContext, useContext } from "react";
import { useApiReady, useAuth } from "@/lib/auth";

export type EngagementAudience = "owner" | "public";

const EngagementAudienceContext = createContext<EngagementAudience>("owner");

export const EngagementAudienceProvider = EngagementAudienceContext.Provider;

/** Pure: the audience a request should use. `undefined` while auth is still
 *  bootstrapping (don't fire a request that's about to be wrong). */
export function resolveEngagementAudience(
  declared: EngagementAudience,
  auth: { loading: boolean; signedIn: boolean },
): EngagementAudience | undefined {
  if (auth.signedIn) return declared;
  return auth.loading ? undefined : "public";
}

export function useEngagementAudience(): EngagementAudience | undefined {
  const declared = useContext(EngagementAudienceContext);
  const signedIn = useApiReady();
  const { isLoading } = useAuth();
  return resolveEngagementAudience(declared, { loading: isLoading, signedIn });
}
