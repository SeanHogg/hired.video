/**
 * What the Post dock shows after "Schedule" (#2047): when the post goes
 * out, to how many networks, any network that was already queued for this
 * video, and the way to the Distribution Hub where it can be followed,
 * cancelled or retried.
 */
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { ScheduleResult } from "@/lib/services/distribution-service";
import { useDestinationLabel } from "./useDestinationLabel";

export interface ScheduledConfirmationProps {
  at: Date;
  result: ScheduleResult;
  onScheduleAnother: () => void;
  onNavigate: () => void;
}

export default function ScheduledConfirmation({ at, result, onScheduleAnother, onNavigate }: ScheduledConfirmationProps) {
  const { t, i18n } = useTranslation();
  const labelOf = useDestinationLabel();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(at);
  return (
    <section aria-live="polite" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-foreground">
            {t("distribution.confirm.title", { count: result.scheduled.length })}
          </h3>
          <p className="text-sm text-muted-foreground">{t("distribution.confirm.when", { when })}</p>
        </div>
      </div>
      {result.scheduled.length > 0 && (
        <p className="text-sm text-foreground">
          {result.scheduled.map((s) => labelOf(s.destination, s.lane)).join(" · ")}
        </p>
      )}
      {result.skipped.length > 0 && (
        <p className="text-[13px] text-muted-foreground">
          {t("distribution.confirm.skipped", {
            names: result.skipped.map((s) => labelOf(s.destination, s.lane)).join(", "),
          })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/studio/distribution"
          onClick={onNavigate}
          className="flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("distribution.confirm.openHub")}
        </Link>
        <button
          type="button"
          onClick={onScheduleAnother}
          className="flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-accent"
        >
          {t("distribution.confirm.another")}
        </button>
      </div>
    </section>
  );
}
