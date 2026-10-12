/**
 * useSharePanel — state + logic for the editor's Post panel (SharePanel):
 * which channels this media kind can post to directly, per-channel connect
 * state (YouTube connect + the social networks' server OAuth), the caption, and
 * the multi-channel post run. Posting goes through `usePublishHandlers().core`
 * — the SAME handlers the Save menu uses — after ONE anon-gate check: a
 * signed-out visitor gets a silent guest session and the post continues with
 * no form. How many destinations one post may reach is `postChannelLimit`
 * (shared/pricing): a guest gets one — picking a second is the
 * "multi-destination" sign-up gate — a free account two, Pro unlimited. At
 * the free cap the remaining channels are locked (`isLocked`), not hidden.
 *
 * "Schedule" (#2047): with a send time picked (`when`), the same run
 * prepares the video and its fitted cuts, then queues one job per network
 * (useScheduleRun) instead of posting; the queue posts them at that time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicVideoPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useAnonGate } from "@/lib/studio/anon-gate-context";
import { writeCaption as writeCaptionFor } from "@/lib/studio/write-caption";
import { startYouTubeConnect } from "@/lib/studio/youtube-connect";
import type { PublishHandlers, PublishOutcome } from "@/lib/studio/use-publish-handlers";
import { shareChannelsFor, type ShareChannelId } from "@/lib/studio/share-channels";
import type { MediaKind } from "@shared/media-kinds";
import {
  isSocialPostPlatform,
  isVideoPublishPlatform,
  sharedPostTextLimit,
  SOCIAL_POST_PLATFORMS,
  type VideoPublishPlatform,
} from "@shared/social-platforms";
import { useSocialChannelConnections } from "./useSocialChannelConnections";
import { useTikTokPostSettings } from "@/components/studio/share/useTikTokPostSettings";
import { postChannelLimit } from "@shared/pricing";
import { usePostRun } from "./usePostRun";
import { useChannelFit, type VideoFrame } from "./useChannelFit";
import { useFittedCuts } from "./useFittedCuts";
import { useYouTubeConnection } from "./useYouTubeConnection";
import { useScheduleRun } from "./useScheduleRun";
import { SEND_NOW, sendTimeOf, whenProblem, type ScheduleWhen } from "@/lib/studio/distribution/schedule-when";

export type SharePanelStatus = "idle" | "posting" | "done" | "scheduled";

export interface UseSharePanelArgs {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaKind: MediaKind;
  title: string;
  publisher: PublishHandlers;
  /** Saved project id — enables the AI caption helper. */
  projectId: string | null;
  /** Video length, for platforms with a per-account cap (TikTok) and each
   *  network's duration window (shared/publish-presets). */
  durationSec?: number | null;
  /** Output frame size — which aspect each network gets, and whether a
   *  YouTube post is a Short. Null when unknown (duration-only checks). */
  frame?: VideoFrame | null;
}

export function useSharePanel({
  open,
  onOpenChange,
  mediaKind,
  title,
  publisher,
  projectId,
  durationSec = null,
  frame = null,
}: UseSharePanelArgs) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, isGuest } = useAuth();
  const hasAccount = !!user && !isGuest;
  // Guest sessions connect + post too, so connection state loads for any
  // signed-in visitor (`isAuthenticated` is false for guests).
  const isAuthenticated = !!user;
  const { isPro } = useSubscription();
  const limit = postChannelLimit({ isPro, hasAccount });
  const anonGate = useAnonGate();
  const social = useSocialChannelConnections(open);
  // Social networks only once the server offers them (developer app configured).
  const offeredKey = SOCIAL_POST_PLATFORMS.filter((p) => social.offers(p)).join(",");
  const channels = useMemo(
    () => shareChannelsFor(mediaKind).filter((c) => !isSocialPostPlatform(c) || offeredKey.split(",").includes(c)),
    [mediaKind, offeredKey],
  );

  // The profile needs no connect, so it is pre-selected for everyone: the
  // fastest path to a live, shareable post. A guest swaps it for another
  // channel by unticking it (their one free destination).
  const [selected, setSelected] = useState<Set<ShareChannelId>>(
    () => new Set(channels.includes("profile") ? ["profile"] : []),
  );
  const [caption, setCaption] = useState("");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [connecting, setConnecting] = useState<ShareChannelId | null>(null);
  // The run: one render, then every destination in parallel, each with its
  // own status (usePostRun). `status` / `results` are views of it.
  const postRun = usePostRun();
  const fit = useChannelFit(frame, durationSec);
  // Networks the master doesn't fit are posted their own cut (#2045).
  const cuts = useFittedCuts(publisher, fit.variantFor, fit.shapeKey);
  const { progress } = postRun;
  const results = useMemo(() => {
    const out: Partial<Record<ShareChannelId, PublishOutcome>> = {};
    for (const [channel, s] of Object.entries(progress.channels)) {
      if (s?.state === "done") out[channel as ShareChannelId] = s.outcome;
    }
    return out;
  }, [progress.channels]);
  // "Now" or a send time; with a time the run queues jobs instead (#2047).
  const [when, setWhen] = useState<ScheduleWhen>(SEND_NOW);
  const scheduleRun = useScheduleRun();
  const status: SharePanelStatus =
    progress.phase === "preparing" || progress.phase === "posting" || scheduleRun.running
      ? "posting"
      : scheduleRun.scheduled
        ? "scheduled"
        : progress.phase === "done" && Object.values(results).some((o) => o?.ok)
          ? "done"
          : "idle";
  // Channels the user has explicitly toggled — auto-select never overrides them.
  const touchedRef = useRef<Set<ShareChannelId>>(new Set());

  const autoSelect = (channel: ShareChannelId) => {
    if (touchedRef.current.has(channel)) return;
    setSelected((prev) => (prev.size < limit ? new Set(prev).add(channel) : prev));
  };

  // Load connect state while open (and on focus / the OAuth broadcast).
  const youtube = useYouTubeConnection(open && isAuthenticated && channels.includes("youtube"), () => autoSelect("youtube"));

  const isConnected = (channel: ShareChannelId): boolean =>
    channel === "profile" ||
    (channel === "youtube" && youtube.connected) ||
    (isSocialPostPlatform(channel) && social.isConnected(channel));

  // Connected networks are picked like YouTube (within the cap,
  // never over a channel the visitor toggled themselves).
  const connectedKey = SOCIAL_POST_PLATFORMS.filter((p) => social.isConnected(p)).join(",");
  useEffect(() => {
    if (!open || !connectedKey) return;
    for (const p of connectedKey.split(",")) autoSelect(p as ShareChannelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectedKey]);

  // TikTok posts carry the creator's own settings (TikTok's sharing rules):
  // the form shows — and its account info loads — only while TikTok is picked.
  const tiktokPicked = open && selected.has("tiktok") && isConnected("tiktok");
  const tiktok = useTikTokPostSettings(tiktokPicked, durationSec);

  /** At a free account's cap: unpicked channels need Pro. */
  const isLocked = (channel: ShareChannelId): boolean =>
    hasAccount && !selected.has(channel) && selected.size >= limit;

  const toggle = (channel: ShareChannelId) => {
    const adding = !selected.has(channel);
    if (adding && isLocked(channel)) return;
    if (adding && selected.size >= limit && !gatedMulti(() => toggle(channel))) return;
    touchedRef.current.add(channel);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  /** Gate a server-touching action; the panel steps aside for the auth sheet
   *  and reopens to resume once the visitor is signed in. */
  const gated = (run: () => void): boolean => {
    const ok = anonGate.requireAuth({
      reason: "publish",
      displayReason: t("studio.anon.gatePublish", {
        defaultValue: "Create a free account to publish — we'll keep everything you've made.",
      }),
      onAuthed: () => {
        onOpenChange(true);
        run();
      },
    });
    if (!ok) onOpenChange(false);
    return ok;
  };

  /** A second destination needs a real account (guests get exactly one). */
  const gatedMulti = (run: () => void): boolean => {
    if (hasAccount) return true;
    const ok = anonGate.requireAuth({
      reason: "multi-destination",
      displayReason: t("studio.share.gateMulti"),
      onAuthed: () => {
        onOpenChange(true);
        run();
      },
    });
    if (!ok) onOpenChange(false);
    return ok;
  };

  const connect = async (channel: ShareChannelId) => {
    if (!gated(() => void connect(channel))) return;
    setConnecting(channel);
    try {
      if (isSocialPostPlatform(channel)) {
        await social.connect(channel);
      } else if (channel === "youtube") {
        await startYouTubeConnect();
      }
    } catch {
      // Connect failures leave the channel disconnected; the row stays actionable.
    } finally {
      setConnecting(null);
    }
  };

  const writeCaption = async () => {
    if (!projectId || !gated(() => void writeCaption())) return;
    setGeneratingCaption(true);
    try {
      // Save edits made since the dock opened, so the caption describes what is on screen now.
      const saved = await publisher.core.ensureSaved();
      setCaption(await writeCaptionFor(saved?.id ?? projectId, captionPlatforms));
    } catch (err) {
      // Keep whatever the user typed, but say the helper didn't work.
      toast({
        title: t("studio.share.captionFailed"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGeneratingCaption(false);
    }
  };

  const postable = channels.filter((c) => selected.has(c) && isConnected(c));
  /** The networks the one caption goes to — it is written for, and capped at, the tightest. */
  const captionPlatforms = channels.filter(
    (c): c is VideoPublishPlatform => selected.has(c) && isVideoPublishPlatform(c),
  );
  const captionLimit = sharedPostTextLimit(captionPlatforms);
  /** TikTok is picked but its settings aren't complete yet. */
  const needsTikTokSettings = postable.includes("tiktok") && !tiktok.ready;

  const runPost = async () => {
    const chosen = channels.filter((c) => selected.has(c) && isConnected(c));
    if (chosen.length === 0 || (chosen.includes("tiktok") && !tiktok.ready)) return;
    const { core } = publisher;
    await postRun.run({
      channels: chosen,
      // One save/render up front — every channel posts the same project row.
      prepare: (onRender) => (chosen.some((c) => c !== "profile") ? core.ensureRendered(onRender) : core.ensureSaved()),
      // Then each distinct fitted cut once — shared by every network that needs it.
      bakeCuts: (project, report) => cuts.bakeCuts(project, chosen, report),
      postOne: async (channel, project, cut) => {
        // A YouTube cut is a landscape reframe, never a Short.
        if (channel === "youtube") return core.postToYouTube(project, caption.trim(), fit.youtubeShort && !cut, cut);
        if (isSocialPostPlatform(channel))
          return core.postToSocial(project, channel, caption.trim(), channel === "tiktok" ? tiktok.settings : undefined, cut);
        if (channel === "profile")
          return publisher.isOnProfile
            ? { ok: true, url: publicVideoPath(project.slug || project.id) }
            : core.setProfileLive(project.id, true);
        return { ok: false, url: null, reason: "not-connected" };
      },
      onOutcome: (channel, outcome) => {
        if (outcome.reason !== "not-connected") return;
        if (channel === "youtube") youtube.markDisconnected();
        else if (isSocialPostPlatform(channel)) social.reload();
      },
    });
  };

  /** Networks a scheduled post goes to — the profile isn't a timed post. */
  const schedulable = postable.filter((c) => c !== "profile");
  const scheduling = when.mode === "later";
  const whenError = whenProblem(when, new Date());

  const runSchedule = async () => {
    const chosen = channels.filter((c) => c !== "profile" && selected.has(c) && isConnected(c));
    if (chosen.length === 0 || (chosen.includes("tiktok") && !tiktok.ready) || whenProblem(when, new Date())) return;
    const { core } = publisher;
    await scheduleRun.run({
      channels: chosen,
      at: sendTimeOf(when, new Date()),
      caption: caption.trim(),
      prepare: (onRender) => core.ensureRendered(onRender),
      bakeCuts: (project, report) => cuts.bakeCuts(project, chosen, report),
      destinationFor: (channel, project, cut) => ({
        destination: channel as VideoPublishPlatform,
        lane: "self",
        variantVideoId: cut,
        settings:
          channel === "tiktok"
            ? { tiktok: tiktok.settings }
            : channel === "youtube"
              ? // Same choices a post now makes (usePublishHandlers.postToYouTube).
                { youtube: { privacy: project.isPublic ? "public" : "unlisted", shorts: fit.youtubeShort && !cut } }
              : undefined,
      }),
    });
  };

  const post = () => {
    const run = scheduling ? runSchedule : runPost;
    if (postable.length > limit && !gatedMulti(() => void run())) return;
    if (!gated(() => void run())) return;
    void run();
  };

  const { reset: resetPost } = postRun;
  const { reset: resetSchedule } = scheduleRun;
  const reset = useCallback(() => {
    resetPost();
    resetSchedule();
  }, [resetPost, resetSchedule]);

  return {
    /** The project being shared — null for an unsaved draft. */
    projectId,
    title,
    channels,
    selected,
    toggle,
    isConnected,
    isLocked,
    /** Destinations one post may reach (Infinity on Pro). */
    limit,
    connect,
    connecting,
    caption,
    setCaption,
    /** The caption box's cap: the tightest text limit of the picked networks. */
    captionLimit,
    /** One-line fit note for a channel (gets its own cut, too long, reframed, posts as a Short). */
    fitNoteFor: (channel: ShareChannelId) => fit.noteFor(channel, cuts.bakes(channel)),
    /** Lane A: the fitted cut to submit for a brand-channel platform (#2045). */
    promotionCut: cuts.promotionCut,
    canWriteCaption: !!projectId,
    writeCaption,
    generatingCaption,
    /** Selected AND connected channels, in display order. */
    postable,
    postableCount: postable.length,
    /** TikTok's settings form state (shown while TikTok is picked). */
    tiktok,
    showTikTokSettings: tiktokPicked,
    needsTikTokSettings,
    post,
    status,
    results,
    /** Where the run is: render progress and each destination's state. */
    progress: scheduleRun.running ? scheduleRun.progress : progress,
    reset,
    /** "Now" or a send time (#2047). */
    when,
    setWhen,
    /** A send time is picked: the action queues the post instead. */
    scheduling,
    /** Why the picked time can't be used (null = fine, or posting now). */
    whenError,
    /** Networks the scheduled post goes to (the profile isn't one). */
    schedulable,
    /** What the last Schedule queued, and when it sends. */
    scheduled: scheduleRun.scheduled,
    /** Why the last Schedule failed (shown under the action). */
    scheduleError: scheduleRun.error,
  };
}

export type SharePanelState = ReturnType<typeof useSharePanel>;
