/**
 * Where a post is, while it runs (usePostRun): the video's render progress
 * — then each fitted cut's (#2045), named with the networks it feeds —
 * then one row per destination — queued, posting, posted (with its link) or
 * failed — each moving on its own, since destinations post in parallel.
 * Renders nothing when no post is running.
 */
import { useTranslation } from "react-i18next";
import { Check, Clock, ExternalLink, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import { useShareChannelLabel } from "./useShareChannelLabel";
import type { ChannelPostState, PostProgress } from "./usePostRun";

function StateLabel({ state }: { state: ChannelPostState }) {
  const { t } = useTranslation();
  if (state.state === "queued")
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
        {t("studio.share.progress.queued")}
      </span>
    );
  if (state.state === "posting")
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        {t("studio.share.progress.posting")}
      </span>
    );
  const { outcome } = state;
  if (!outcome.ok)
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <X aria-hidden="true" className="h-3.5 w-3.5" />
        {outcome.reason === "not-connected" ? t("studio.share.progress.notConnected") : t("studio.share.progress.failed")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
      <Check aria-hidden="true" className="h-3.5 w-3.5" />
      {outcome.url ? (
        <a href={outcome.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
          {t("studio.share.progress.posted")}
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      ) : (
        t("studio.share.progress.posted")
      )}
    </span>
  );
}

export default function PostProgressList({ progress }: { progress: PostProgress }) {
  const { t } = useTranslation();
  const labelOf = useShareChannelLabel();
  if (progress.phase === "idle" || progress.phase === "done") return null;
  const rows = Object.entries(progress.channels) as Array<[ShareChannelId, ChannelPostState]>;
  const { cut } = progress;
  const fraction = cut ? cut.progress : progress.render;
  const pct = fraction === null ? null : Math.round(fraction * 100);
  const preparingLabel = cut
    ? t("publish.variant.progress", { cut: cut.label, names: cut.channels.map(labelOf).join(", ") })
    : t("studio.share.progress.preparing");

  return (
    <section aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      {progress.phase === "preparing" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 font-semibold text-foreground">
            <span className="min-w-0">{preparingLabel}</span>
            {pct !== null && <span>{pct}%</span>}
          </div>
          <div
            role="progressbar"
            aria-label={preparingLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? undefined}
            className="h-1.5 overflow-hidden rounded-full bg-border"
          >
            <div
              className={cn("h-full rounded-full bg-primary transition-[width]", pct === null && "w-1/3 animate-pulse")}
              style={pct === null ? undefined : { width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {rows.map(([channel, state]) => (
          <li key={channel} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-foreground">{labelOf(channel)}</span>
            <StateLabel state={state} />
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{t("studio.share.progress.keepsGoing")}</p>
    </section>
  );
}
