/**
 * The Target stage's job match, in the rail beside the page: "Match for <job>" (score ring,
 * found keywords green, missing red) and "This version" (where the result
 * is / will be saved). Renders nothing until a job is attached. Data comes
 * from deriveJobMatch (lib/build/job-match.ts) and useResumeLineage.
 */
import { useTranslation } from "react-i18next";
import type { ResumeLineage } from "@shared/resume-lineage";
import type { JobMatch } from "@/lib/build/job-match";
import { cn } from "@/lib/utils";
import ScoreRing from "./ScoreRing";
import VersionNote from "./VersionNote";
import { KEYWORD_CHIP as CHIP, KEYWORD_FOUND as FOUND, KEYWORD_MISSING as MISSING, KeywordGroup } from "./keyword-chips";

interface Props {
  match: JobMatch | null;
  lineage: ResumeLineage | null;
  /** A missing keyword becomes a button that asks for a line covering it. */
  onAddKeyword?: (keyword: string) => void;
  className?: string;
}

export default function JobMatchPanel({ match, lineage, onAddKeyword, className }: Props) {
  const { t } = useTranslation();
  if (!match) return null;
  const title = match.jobLabel ? t("build.match.title", { job: match.jobLabel }) : t("build.match.titleNoJob");
  const showBefore = match.scoreBefore !== undefined && match.scoreBefore !== match.score;
  const hasKeywords = match.found.length > 0 || match.missing.length > 0;

  return (
    <div className={cn("grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]", className)}>
      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <ScoreRing score={match.score} label={t("build.match.scoreLabel", { score: match.score })} />
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold">{title}</h3>
            {showBefore && <p className="text-xs text-muted-foreground">{t("build.match.from", { before: match.scoreBefore })}</p>}
          </div>
        </div>
        {match.found.length > 0 && (
          <KeywordGroup label={t("build.match.found")}>
            {match.found.map((k) => (
              <li key={k} className="max-w-full">
                <span className={cn(CHIP, FOUND)}>{k}</span>
              </li>
            ))}
          </KeywordGroup>
        )}
        {match.missing.length > 0 && (
          <KeywordGroup label={t("build.match.missing")}>
            {match.missing.map((k) => (
              <li key={k} className="max-w-full">
                {onAddKeyword ? (
                  <button
                    type="button"
                    onClick={() => onAddKeyword(k)}
                    aria-label={t("build.match.addLine", { keyword: k })}
                    title={t("build.match.addLine", { keyword: k })}
                    className={cn(
                      CHIP,
                      MISSING,
                      "min-h-11 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-7",
                    )}
                  >
                    <span aria-hidden="true" className="mr-1">+</span>
                    {k}
                  </button>
                ) : (
                  <span className={cn(CHIP, MISSING)}>{k}</span>
                )}
              </li>
            ))}
          </KeywordGroup>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {hasKeywords ? t("build.match.legend") : t("build.match.noKeywords")}
        </p>
      </section>
      <VersionNote lineage={lineage} unsaved={match.source !== "tool"} />
    </div>
  );
}
