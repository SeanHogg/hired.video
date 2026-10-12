/**
 * DistributionJobList — the Hub's queue (#2047): Upcoming, Sent and Failed,
 * each grouped by day. A row names the video and where it goes, its status
 * (job-list.ts decides what each state says and offers), the time, the
 * link once it is live, the error when it failed, and Cancel / Retry.
 */
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { PublishJob } from "@/lib/services/distribution-service";
import { groupJobsByDay, jobRowState, type JobTone } from "@/lib/studio/distribution/job-list";
import { PUBLISH_JOB_VIEWS, type PublishJobView } from "@shared/social-publish-jobs";
import SegmentToggle from "@/components/studio/v2/focus/SegmentToggle";
import { useDistributionJobs } from "./useDistributionJobs";
import { useDestinationLabel } from "./useDestinationLabel";

const TONE: Record<JobTone, string> = {
  waiting: "bg-muted text-foreground",
  sending: "bg-primary/10 text-primary",
  sent: "bg-brand-green/10 text-brand-green-text",
  review: "bg-brand-orange/10 text-foreground",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const EMPTY_KEY: Record<PublishJobView, string> = {
  upcoming: "distribution.list.emptyUpcoming",
  sent: "distribution.list.emptySent",
  failed: "distribution.list.emptyFailed",
};

function JobRow({
  job,
  onCancel,
  onRetry,
  pending,
}: {
  job: PublishJob;
  onCancel: () => void;
  onRetry: () => void;
  pending: boolean;
}) {
  const { t, i18n } = useTranslation();
  const labelOf = useDestinationLabel();
  const row = jobRowState(job);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(new Date(row.time));
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <strong className="min-w-0 truncate text-sm text-foreground">{labelOf(job.destination, job.lane)}</strong>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", TONE[row.tone])}>{t(row.labelKey)}</span>
      </div>
      <p className="min-w-0 truncate text-[13px] text-muted-foreground">
        {job.projectTitle || t("distribution.compose.untitled")} · {t(row.timeKey, { time })}
      </p>
      {job.caption && <p className="line-clamp-2 break-words text-[13px] text-foreground/80">{job.caption}</p>}
      {job.lastError && (row.tone === "failed" || job.status === "scheduled") && (
        <p className="break-words text-[13px] text-destructive">{job.lastError}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {row.href && (
          <a
            href={row.href}
            target={row.href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t("distribution.list.view")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        {row.canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
          >
            {t("distribution.list.cancel")}
          </button>
        )}
        {row.canRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={pending}
            className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
          >
            {t("distribution.list.retry")}
          </button>
        )}
      </div>
    </li>
  );
}

export default function DistributionJobList() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<PublishJobView>("upcoming");
  const { query, cancel, retry } = useDistributionJobs(view);
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric" });
  const jobs = query.data ?? [];
  const pendingId = (cancel.isPending ? cancel.variables : null) ?? (retry.isPending ? retry.variables : null);
  const actionError = cancel.error ?? retry.error;

  return (
    <div className="flex flex-col gap-3">
      <SegmentToggle<PublishJobView>
        ariaLabel={t("distribution.list.label")}
        value={view}
        onChange={setView}
        options={PUBLISH_JOB_VIEWS.map((v) => ({ id: v, label: t(`distribution.list.${v}`) }))}
      />
      {actionError && (
        <p role="alert" className="text-[13px] text-destructive">
          {actionError instanceof Error ? actionError.message : t("distribution.list.actionFailed")}
        </p>
      )}
      {query.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("distribution.list.loading")}
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("distribution.list.loadFailed")}
        </p>
      ) : jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">{t(EMPTY_KEY[view])}</p>
      ) : (
        groupJobsByDay(jobs).map((group) => (
          <section key={group.day} aria-label={dayFmt.format(new Date(`${group.day}T12:00:00`))} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dayFmt.format(new Date(`${group.day}T12:00:00`))}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  pending={pendingId === job.id}
                  onCancel={() => cancel.mutate(job.id)}
                  onRetry={() => retry.mutate(job.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
