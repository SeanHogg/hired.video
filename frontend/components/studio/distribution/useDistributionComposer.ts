/**
 * useDistributionComposer — state + logic for the Distribution Hub's
 * composer (#2047): pick a rendered video, pick where it goes in each lane
 * (your own accounts; hired.video's brand channels; the hired.video feed),
 * write one shared caption — and, per destination, its own caption and
 * title (PRD §4.2) — then send now or at a time. One submit makes the
 * fitted cuts the networks need, then queues one job per destination
 * (distributionService.schedule); the 5-minute queue posts them.
 *
 * Reuses the Post dock's pieces rather than re-deriving them: connections
 * (useSocialChannelConnections, useYouTubeConnection), the plan's channel
 * cap (postChannelLimit), how the master fits each network (useChannelFit —
 * shape read from the hosted file, useVideoShape), fitted cuts
 * (useFittedCuts, fed by useHubCutPublisher from the saved canvas), the
 * brand lane (usePromotionLane), TikTok's own settings
 * (useTikTokPostSettings) and the caption writer (writeCaption).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { distributionService, type ScheduleDestination, type ScheduleResult } from "@/lib/services/distribution-service";
import { startYouTubeConnect } from "@/lib/studio/youtube-connect";
import { writeCaption } from "@/lib/studio/write-caption";
import { shareChannelsFor, type ShareChannelId } from "@/lib/studio/share-channels";
import { SEND_NOW, sendTimeOf, whenProblem, type ScheduleWhen } from "@/lib/studio/distribution/schedule-when";
import { postChannelLimit } from "@shared/pricing";
import type { PromotionPlatform } from "@shared/promotions";
import { FEED_DESTINATION } from "@shared/social-publish-jobs";
import { isSocialPostPlatform, isVideoPublishPlatform, type VideoPublishPlatform } from "@shared/social-platforms";
import { useSocialChannelConnections } from "@/components/studio/v2/focus/useSocialChannelConnections";
import { useYouTubeConnection } from "@/components/studio/v2/focus/useYouTubeConnection";
import { useChannelFit } from "@/components/studio/v2/focus/useChannelFit";
import { useFittedCuts } from "@/components/studio/v2/focus/useFittedCuts";
import type { CutProgress } from "@/components/studio/v2/focus/usePostRun";
import { usePromotionLane } from "@/components/studio/share/usePromotionLane";
import { useTikTokPostSettings } from "@/components/studio/share/useTikTokPostSettings";
import { useVideoShape } from "./useVideoShape";
import { useHubCutPublisher } from "./useHubCutPublisher";
import { destinationKey, useDestinationText, type DestinationRef } from "./useDestinationText";
import { distributionJobsKey } from "./useDistributionJobs";

/** A video the Hub can post: rendered and hosted. */
export function isPostableProject(p: StudioProject): boolean {
  return (p.mediaKind ?? "video") === "video" && !!p.videoUrl;
}

/** Networks (never the profile) in the Post dock's display order. */
const NETWORKS = shareChannelsFor("video").filter((c): c is VideoPublishPlatform => c !== "profile");

export function useDistributionComposer() {
  const qc = useQueryClient();
  const { user, isGuest } = useAuth();
  const hasAccount = !!user && !isGuest;
  const { isPro } = useSubscription();
  const limit = postChannelLimit({ isPro, hasAccount });

  const projectsQuery = useQuery({
    queryKey: ["distribution", "projects"],
    queryFn: async () => (await studioService.getProjects()).data ?? [],
    enabled: hasAccount,
  });
  const projects = useMemo(() => (projectsQuery.data ?? []).filter(isPostableProject), [projectsQuery.data]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId) ?? null;

  const social = useSocialChannelConnections(hasAccount);
  const youtube = useYouTubeConnection(hasAccount);
  const offered = NETWORKS.filter((c) => !isSocialPostPlatform(c) || social.offers(c));
  /** Networks hired.video can't post to yet — the manual-upload fallback. */
  const manualNetworks = NETWORKS.filter((c) => !offered.includes(c));
  const isConnected = (c: VideoPublishPlatform) => (c === "youtube" ? youtube.connected : isSocialPostPlatform(c) && social.isConnected(c));

  const shape = useVideoShape(project?.videoUrl);
  const fit = useChannelFit(shape.frame, shape.durationSec);
  const hubCuts = useHubCutPublisher(project?.id ?? null);
  const cuts = useFittedCuts(hubCuts.publisher, fit.variantFor, fit.shapeKey);
  const lane = usePromotionLane(project?.id ?? null);
  const brandChannels = lane.ready.map((r) => r.platform as PromotionPlatform);

  const [own, setOwn] = useState<Set<VideoPublishPlatform>>(new Set());
  const [brand, setBrand] = useState<Set<PromotionPlatform>>(new Set());
  const [feed, setFeed] = useState(false);
  const [caption, setCaption] = useState("");
  const text = useDestinationText();
  const [writing, setWriting] = useState<string | null>(null);
  const [when, setWhen] = useState<ScheduleWhen>(SEND_NOW);
  const [connecting, setConnecting] = useState<ShareChannelId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cutProgress, setCutProgress] = useState<CutProgress | null>(null);
  const [result, setResult] = useState<{ at: Date; result: ScheduleResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownPicked = offered.filter((c) => own.has(c) && isConnected(c));
  const tiktok = useTikTokPostSettings(ownPicked.includes("tiktok"), shape.durationSec);

  const toggleOwn = (c: VideoPublishPlatform) =>
    setOwn((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else if (next.size < limit) next.add(c);
      return next;
    });
  const toggleBrand = (p: PromotionPlatform) =>
    setBrand((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const connect = async (c: VideoPublishPlatform) => {
    setConnecting(c);
    try {
      if (c === "youtube") await startYouTubeConnect();
      else if (isSocialPostPlatform(c)) await social.connect(c);
    } catch {
      // The card stays on Connect.
    } finally {
      setConnecting(null);
    }
  };

  const brandPicked = brandChannels.filter((p) => brand.has(p));
  /** Every picked destination, in display order. */
  const picked: DestinationRef[] = [
    ...ownPicked.map((destination): DestinationRef => ({ destination, lane: "self" })),
    ...brandPicked.map((destination): DestinationRef => ({ destination, lane: "managed" })),
    ...(feed ? [{ destination: FEED_DESTINATION, lane: "self" } as DestinationRef] : []),
  ];
  const textProblems = picked.filter((d) => text.textFor(d, caption).problem !== null).length;
  const timeProblem = whenProblem(when, new Date());
  const needsTikTokSettings = ownPicked.includes("tiktok") && !tiktok.ready;
  const canSubmit =
    !!project && picked.length > 0 && !timeProblem && !needsTikTokSettings && textProblems === 0 && !submitting;

  /** "Write it for me": the shared caption (for every picked network), or one destination's. */
  const writeFor = async (target: DestinationRef | null) => {
    if (!project) return;
    const key = target ? destinationKey(target) : "shared";
    setWriting(key);
    setError(null);
    try {
      const networks = target
        ? isVideoPublishPlatform(target.destination)
          ? [target.destination]
          : []
        : picked.map((d) => d.destination).filter(isVideoPublishPlatform);
      const written = await writeCaption(project.id, networks);
      if (target) text.setCaption(target, written);
      else setCaption(written);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(null);
    }
  };

  const destinationFor = (d: DestinationRef, cut: string | undefined): ScheduleDestination => {
    const t = text.textFor(d, caption);
    return {
      destination: d.destination,
      lane: d.lane,
      variantVideoId: cut,
      // Only send what differs from the shared caption.
      caption: t.overridden ? t.caption.trim() : undefined,
      title: t.title.trim() || undefined,
      settings:
        d.lane !== "self"
          ? undefined
          : d.destination === "tiktok"
            ? { tiktok: tiktok.settings }
            : d.destination === "youtube"
              ? // A YouTube cut is a landscape reframe, never a Short (as in the dock).
                { youtube: { privacy: project?.isPublic ? "public" : "unlisted", shorts: fit.youtubeShort && !cut } }
              : undefined,
    };
  };

  const submit = async () => {
    if (!project || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const at = sendTimeOf(when, new Date());
      // Fitted cuts first (rendered in this browser), like the dock; a cut
      // that can't be made leaves its network on the master.
      const master = await hubCuts.publisher.core.ensureRendered();
      const networks = picked.map((d) => d.destination).filter(isVideoPublishPlatform);
      const cutFor = master ? await cuts.bakeCuts(master, networks, setCutProgress).catch(() => ({})) : {};
      setCutProgress(null);
      const res = await distributionService.schedule({
        projectId: project.id,
        caption: caption.trim(),
        scheduledAt: at.toISOString(),
        destinations: picked.map((d) =>
          destinationFor(d, isVideoPublishPlatform(d.destination) ? (cutFor as Record<string, string>)[d.destination] : undefined),
        ),
      });
      setResult({ at, result: res });
      setOwn(new Set());
      setBrand(new Set());
      setFeed(false);
      setCaption("");
      text.reset();
      setWhen(SEND_NOW);
      void qc.invalidateQueries({ queryKey: distributionJobsKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCutProgress(null);
      setSubmitting(false);
    }
  };

  return {
    hasAccount,
    projects,
    projectsLoading: projectsQuery.isLoading,
    project,
    selectProject: (id: string | null) => {
      setProjectId(id);
      setBrand(new Set());
      text.reset();
      setResult(null);
    },
    networks: offered,
    manualNetworks,
    isConnected,
    isPicked: (c: VideoPublishPlatform) => own.has(c),
    /** At the plan's cap, an unpicked network needs Pro. */
    isLocked: (c: VideoPublishPlatform) => !own.has(c) && own.size >= limit,
    limit,
    toggleOwn,
    connect,
    connecting,
    /** One-line fit note — says when the network gets its own cut. */
    fitNoteFor: (c: VideoPublishPlatform) => fit.noteFor(c, cuts.bakes(c)),
    /** A network the master doesn't fit and no cut can be made for here. */
    needsCutFromEditor: (c: VideoPublishPlatform) => fit.variantFor(c) !== null && !cuts.bakes(c),
    brandChannels,
    isBrandPicked: (p: PromotionPlatform) => brand.has(p),
    toggleBrand,
    feed,
    setFeed,
    caption,
    setCaption,
    picked,
    text,
    textProblems,
    writeFor,
    /** Which caption is being written ("shared" or a destination key). */
    writing,
    tiktok,
    showTikTokSettings: ownPicked.includes("tiktok"),
    needsTikTokSettings,
    when,
    setWhen,
    destinationCount: picked.length,
    canSubmit,
    submitting,
    /** The cut being made while submitting (PostProgressList shape). */
    cutProgress,
    submit,
    result,
    dismissResult: () => setResult(null),
    error,
  };
}

export type DistributionComposerState = ReturnType<typeof useDistributionComposer>;
