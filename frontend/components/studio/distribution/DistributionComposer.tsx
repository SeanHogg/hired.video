/**
 * DistributionComposer — the Hub's "compose once, post everywhere" form
 * (#2047): a rendered video, where it goes (the lane chooser: your own
 * accounts + the hired.video feed, or hired.video's brand channels), one
 * shared caption with each destination's own caption and title on top
 * (DestinationTextEditor), TikTok's own settings when TikTok is picked,
 * then "Send now" or a time. Networks hired.video can't post to yet get the
 * manual-upload card instead. State lives in useDistributionComposer.
 */
import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SOCIAL_PLATFORM_META } from "@shared/social-platforms";
import { FEED_POST_TEXT_MAX } from "@shared/social-publish-jobs";
import ShareChannelRow from "@/components/studio/v2/focus/ShareChannelRow";
import PublishLaneChooser from "@/components/studio/v2/focus/PublishLaneChooser";
import PostProgressList from "@/components/studio/v2/focus/PostProgressList";
import TikTokPostSettingsForm from "@/components/studio/share/TikTokPostSettingsForm";
import ScheduleWhenPicker from "./ScheduleWhenPicker";
import DestinationTextEditor, { CharCount } from "./DestinationTextEditor";
import ManualUploadCard from "./ManualUploadCard";
import { destinationKey } from "./useDestinationText";
import { useDestinationLabel } from "./useDestinationLabel";
import type { DistributionComposerState } from "./useDistributionComposer";

const FIELD =
  "min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60";

export default function DistributionComposer({ c }: { c: DistributionComposerState }) {
  const { t, i18n } = useTranslation();
  const labelOf = useDestinationLabel();
  const busy = c.submitting;

  if (!c.projectsLoading && c.projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p>{t("distribution.compose.noVideos")}</p>
        <Link to="/studio" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
          {t("distribution.compose.openStudio")}
        </Link>
      </div>
    );
  }

  const ownLane = (
    <>
      <ul aria-label={t("distribution.compose.yourAccounts")} className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
        {c.networks.map((n) => (
          <ShareChannelRow
            key={n}
            channel={n}
            connected={c.isConnected(n)}
            selected={c.isPicked(n)}
            locked={c.isLocked(n)}
            connecting={c.connecting === n}
            disabled={busy || !c.project}
            fitNote={c.project ? c.fitNoteFor(n) : null}
            onToggle={() => c.toggleOwn(n)}
            onConnect={() => void c.connect(n)}
          />
        ))}
      </ul>
      {c.project && c.networks.some((n) => c.needsCutFromEditor(n)) && (
        <p className="text-[13px] text-muted-foreground">{t("distribution.compose.cutsInEditor")}</p>
      )}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
          checked={c.feed}
          disabled={busy || !c.project}
          onChange={(e) => c.setFeed(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{t("distribution.compose.feed")}</span>
          <span className="block text-[13px] text-muted-foreground">{t("distribution.compose.feedHint")}</span>
        </span>
      </label>
      {c.project && c.manualNetworks.length > 0 && (
        <details className="rounded-xl border border-border bg-muted/30 px-3 py-2">
          <summary className="flex min-h-9 cursor-pointer items-center text-sm font-semibold text-foreground">
            {t("distribution.manual.summary", { names: c.manualNetworks.map((n) => labelOf(n)).join(", ") })}
          </summary>
          <div className="mt-2 flex flex-col gap-2 pb-1">
            {c.manualNetworks.map((n) => (
              <ManualUploadCard key={n} projectId={c.project!.id} destination={n} downloadUrl={c.project!.videoUrl} caption={c.caption.trim() || undefined} />
            ))}
          </div>
        </details>
      )}
    </>
  );

  const brandLane = (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t("distribution.compose.brandChannels")}</legend>
      {c.brandChannels.map((p) => (
        <label key={p} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={c.isBrandPicked(p)} disabled={busy} onChange={() => c.toggleBrand(p)} />
          <span className="text-sm font-semibold text-foreground">{SOCIAL_PLATFORM_META[p].label}</span>
        </label>
      ))}
      <p className="text-[13px] text-muted-foreground">{t("distribution.compose.brandHint")}</p>
    </fieldset>
  );

  const submitLabel = busy
    ? t("distribution.compose.queueing")
    : c.destinationCount === 0
      ? t("distribution.compose.pickDestination")
      : c.when.mode === "now"
        ? t("distribution.compose.sendNow", { count: c.destinationCount })
        : t("distribution.compose.schedule", { count: c.destinationCount });
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void c.submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="distribution-project" className="text-[13px] text-muted-foreground">
          {t("distribution.compose.video")}
        </label>
        <select
          id="distribution-project"
          className={FIELD}
          value={c.project?.id ?? ""}
          disabled={busy || c.projectsLoading}
          onChange={(e) => c.selectProject(e.target.value || null)}
        >
          <option value="">{c.projectsLoading ? t("distribution.compose.loadingVideos") : t("distribution.compose.pickVideo")}</option>
          {c.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || t("distribution.compose.untitled")}
            </option>
          ))}
        </select>
      </div>

      <PublishLaneChooser projectId={c.project?.id ?? null} self={ownLane} managed={brandLane} />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="distribution-caption" className="text-[13px] text-muted-foreground">
            {t("distribution.text.shared")}
          </label>
          <div className="flex items-center gap-2">
            <CharCount length={c.caption.length} limit={FEED_POST_TEXT_MAX} />
            {c.project && (
              <button
                type="button"
                disabled={busy || c.writing !== null}
                onClick={() => void c.writeFor(null)}
                className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-primary hover:bg-accent disabled:opacity-60"
              >
                {c.writing === "shared" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                {t("studio.share.writeForMe")}
              </button>
            )}
          </div>
        </div>
        <textarea
          id="distribution-caption"
          rows={4}
          maxLength={FEED_POST_TEXT_MAX}
          value={c.caption}
          disabled={busy}
          onChange={(e) => c.setCaption(e.target.value)}
          placeholder={t("studio.share.captionPlaceholder")}
          className="resize-y rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm leading-normal text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
        />
        {c.picked.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-muted-foreground">{t("distribution.text.perDestination")}</p>
            {c.picked.map((d) => (
              <DestinationTextEditor
                key={destinationKey(d)}
                target={d}
                shared={c.caption}
                text={c.text}
                disabled={busy}
                writing={c.writing === destinationKey(d)}
                canWrite={!!c.project && c.writing === null}
                onWrite={() => void c.writeFor(d)}
              />
            ))}
          </div>
        )}
      </div>

      {c.showTikTokSettings && <TikTokPostSettingsForm state={c.tiktok} disabled={busy} />}

      <ScheduleWhenPicker value={c.when} onChange={c.setWhen} disabled={busy} nowLabel={t("distribution.when.sendNow")} />

      <button
        type="submit"
        disabled={!c.canSubmit}
        className={cn(
          "flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-4 text-base font-bold",
          c.canSubmit ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
        )}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
      {c.textProblems > 0 && (
        <p role="alert" className="text-[13px] text-destructive">
          {t("distribution.text.fixProblems", { count: c.textProblems })}
        </p>
      )}
      {c.cutProgress && <PostProgressList progress={{ phase: "preparing", render: null, channels: {}, cut: c.cutProgress }} />}
      <p className="text-[13px] text-muted-foreground">{t("distribution.compose.queueNote")}</p>

      {c.error && (
        <p role="alert" className="text-[13px] text-destructive">
          {t("distribution.compose.failed", { reason: c.error })}
        </p>
      )}
      {c.result && (
        <div role="status" className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p className="font-semibold text-foreground">
            {t("distribution.confirm.title", { count: c.result.result.scheduled.length })}{" "}
            <span className="font-normal text-muted-foreground">{t("distribution.confirm.when", { when: fmt.format(c.result.at) })}</span>
          </p>
          {c.result.result.skipped.length > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("distribution.confirm.skipped", {
                names: c.result.result.skipped.map((s) => labelOf(s.destination, s.lane)).join(", "),
              })}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
