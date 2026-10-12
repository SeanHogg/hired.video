/**
 * SharePanelBody — the Post dock's content, frame-agnostic: heading + plan
 * line, then the lane chooser (PublishLaneChooser — self-gating): Lane B is
 * the channel cards (each with its fit note), watermark note, caption (with
 * "Write it for me"), "Now" or "Schedule" (ScheduleWhenPicker, #2047 — a
 * scheduled post ends on ScheduledConfirmation) and ONE post action — while it runs, each
 * destination's own status (PostProgressList); Lane A is the promotion card.
 * After a successful post, `SharePostedView`. State comes
 * from `useSharePanel` (the caller owns it), so the SAME body renders in the
 * editor's floating panel (SharePanel) and inline on the kit workspace (ShareVideoDock).
 *
 * `Heading` is the element the frame titles itself with — a Radix
 * `Dialog.Title` in the popover, a plain `h2` inline — so each frame keeps
 * its own accessible name without the body knowing which frame it is in.
 */
import type { ComponentType, ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import ShareChannelRow from "./ShareChannelRow";
import { useShareChannelLabel } from "./useShareChannelLabel";
import SharePostedView from "./SharePostedView";
import PostProgressList from "./PostProgressList";
import ShareProLine from "./ShareProLine";
import HomeWallToggle from "./HomeWallToggle";
import PublicScanNotice from "./PublicScanNotice";
import PromotionCard from "@/components/studio/share/PromotionCard";
import PublishLaneChooser from "./PublishLaneChooser";
import TikTokPostSettingsForm from "@/components/studio/share/TikTokPostSettingsForm";
import ScheduleWhenPicker from "@/components/studio/distribution/ScheduleWhenPicker";
import ScheduledConfirmation from "@/components/studio/distribution/ScheduledConfirmation";
import type { SharePanelState } from "./useSharePanel";

export interface SharePanelBodyProps {
  share: SharePanelState;
  /** Renders the title text; gets `sr-only` once posted (the posted view has its own heading). */
  Heading: ComponentType<{ className?: string; children: ReactNode }>;
  /** Called by links in the posted view that leave the panel. */
  onNavigate: () => void;
  /** Extra classes for the heading row (the popover reserves room for its close button). */
  headerClassName?: string;
  /** Shown under the posted view (a kit's "What's next"). */
  afterPosted?: ReactNode;
}

export default function SharePanelBody({ share, Heading, onNavigate, headerClassName, afterPosted }: SharePanelBodyProps) {
  const { t } = useTranslation();
  const { isPro } = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();
  const labelOf = useShareChannelLabel();
  const posting = share.status === "posting";
  const { postable, scheduling, schedulable } = share;
  // Scheduling (#2047) posts to the picked networks only, at a valid time.
  const blocked = scheduling
    ? schedulable.length === 0 || share.needsTikTokSettings || share.whenError !== null
    : share.postableCount === 0 || share.needsTikTokSettings;
  const postLabel = posting
    ? t("studio.share.posting")
    : share.needsTikTokSettings
      ? t("studio.share.tiktok.finishSettings")
      : scheduling
        ? schedulable.length === 0
          ? t("distribution.dock.pickNetwork")
          : t("distribution.dock.schedule", { count: schedulable.length })
        : postable.length === 0
          ? t("studio.share.pickChannel")
          : postable.length === 1
            ? t("studio.share.postToName", { name: labelOf(postable[0]) })
            : t("studio.share.postTo", { count: postable.length });

  if (share.status === "scheduled" && share.scheduled) {
    return (
      <>
        <Heading className="sr-only">{t("studio.share.title")}</Heading>
        <ScheduledConfirmation
          at={share.scheduled.at}
          result={share.scheduled.result}
          onScheduleAnother={share.reset}
          onNavigate={onNavigate}
        />
      </>
    );
  }

  if (share.status === "done") {
    return (
      <>
        <Heading className="sr-only">{t("studio.share.title")}</Heading>
        <SharePostedView
          channels={share.channels}
          results={share.results}
          isPro={isPro}
          onPostAgain={share.reset}
          onNavigate={onNavigate}
        />
        <PublicScanNotice projectId={share.projectId} />
        {afterPosted}
      </>
    );
  }

  // Lane B — the user's own accounts.
  const selfLane = (
    <>
      <ul
        aria-label={t("studio.share.channels")}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2"
      >
        {share.channels.map((channel) => (
          <ShareChannelRow
            key={channel}
            channel={channel}
            connected={share.isConnected(channel)}
            selected={share.selected.has(channel)}
            locked={share.isLocked(channel)}
            connecting={share.connecting === channel}
            disabled={posting}
            result={share.results[channel]}
            fitNote={share.fitNoteFor(channel)}
            onToggle={() => share.toggle(channel)}
            onConnect={() => void share.connect(channel)}
          />
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">
        {shouldShowBranding({ isPro, removeBrandingFlag: removeBranding })
          ? t("studio.share.watermarkNote")
          : t("studio.share.noWatermarkNote")}
      </p>
      <ShareProLine limit={share.limit} channelCount={share.channels.length} />
      <HomeWallToggle projectId={share.projectId} />
      <PublicScanNotice projectId={share.projectId} />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="share-caption" className="text-[13px] text-muted-foreground">
            {t("studio.share.caption")}
          </label>
          {share.canWriteCaption && (
            <button
              type="button"
              className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-primary hover:bg-accent disabled:opacity-60"
              disabled={posting || share.generatingCaption}
              onClick={() => void share.writeCaption()}
            >
              {share.generatingCaption ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t("studio.share.writeForMe")}
            </button>
          )}
        </div>
        <textarea
          id="share-caption"
          rows={3}
          maxLength={share.captionLimit}
          value={share.caption}
          onChange={(e) => share.setCaption(e.target.value)}
          placeholder={t("studio.share.captionPlaceholder")}
          disabled={posting}
          className="resize-y rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm leading-normal text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
        />
      </div>

      {share.showTikTokSettings && <TikTokPostSettingsForm state={share.tiktok} disabled={posting} />}

      <ScheduleWhenPicker
        value={share.when}
        onChange={share.setWhen}
        disabled={posting}
        nowLabel={t("distribution.when.postNow")}
      />
      {scheduling && share.selected.has("profile") && (
        <p className="text-[13px] text-muted-foreground">{t("distribution.dock.profileNotScheduled")}</p>
      )}

      <button
        type="button"
        disabled={posting || blocked}
        onClick={share.post}
        className={cn(
          "flex min-h-[52px] items-center justify-center gap-2 rounded-xl text-base font-bold",
          blocked
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70",
        )}
      >
        {posting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {postLabel}
      </button>

      {share.scheduleError && (
        <p role="alert" className="text-[13px] text-destructive">
          {t("distribution.dock.scheduleFailed", { reason: share.scheduleError })}
        </p>
      )}

      <PostProgressList progress={share.progress} />
    </>
  );

  return (
    <>
      <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5", headerClassName)}>
        <Heading className="font-display text-[22px] font-bold tracking-[-0.02em]">{t("studio.share.title")}</Heading>
        <span className="text-[13px] text-muted-foreground">
          {Number.isFinite(share.limit)
            ? t("studio.share.planFreeChannels", { count: share.limit })
            : t("studio.share.planPro")}
        </span>
      </div>

      <PublishLaneChooser
        projectId={share.projectId}
        managed={<PromotionCard projectId={share.projectId} title={share.title} resolveCut={share.promotionCut} />}
        self={selfLane}
      />
    </>
  );
}
