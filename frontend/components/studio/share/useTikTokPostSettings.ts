/**
 * useTikTokPostSettings — the TikTok part of a post: the creator's account
 * state (read fresh each time the form shows, per TikTok's sharing
 * guidelines) and the choices they make (`TikTokPostSettings`, nothing
 * pre-selected). `ready` says whether a TikTok post may go out; the rules
 * are the shared ones the API enforces too.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studioService } from "@/lib/services/studio-service";
import {
  EMPTY_TIKTOK_POST_SETTINGS,
  tiktokSettingsProblem,
  type TikTokPostSettings,
} from "@shared/tiktok-post-settings";

export function useTikTokPostSettings(active: boolean, durationSec: number | null = null) {
  const creatorQuery = useQuery({
    queryKey: ["social", "tiktok", "creator-info"],
    queryFn: () => studioService.getTikTokCreatorInfo(),
    enabled: active,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const [settings, setSettings] = useState<TikTokPostSettings>(EMPTY_TIKTOK_POST_SETTINGS);
  const creator = creatorQuery.data ?? null;
  // TikTok caps video length per account; a longer video can't be posted.
  const maxSec = creator?.maxVideoPostDurationSec ?? null;
  const tooLong = maxSec !== null && durationSec !== null && durationSec > maxSec;
  const problem = !creator ? null : tooLong ? "tooLong" : tiktokSettingsProblem(settings, creator.privacyLevelOptions);

  return {
    creator,
    isLoading: creatorQuery.isLoading,
    isError: creatorQuery.isError,
    settings,
    update: (patch: Partial<TikTokPostSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    /** What blocks the post ("tooLong" | "privacy" | "disclosure" | "brandedPrivate"), or null. */
    problem,
    /** A TikTok post may go out with these settings. */
    ready: !!creator && !problem,
  };
}

export type TikTokPostSettingsState = ReturnType<typeof useTikTokPostSettings>;
