/**
 * "This line" › Job match: how the selected line serves the job the résumé
 * is aimed at — the job's keywords it already shows (green) and the ones the
 * résumé still misses that it could cover (red; each asks the AI to work it
 * into this line). With no job attached yet, a plain note. The chips are the
 * job match's own (keyword-chips.tsx).
 */
import { useTranslation } from "react-i18next";
import type { JobMatch } from "@/lib/build/job-match";
import type { LineKeywords } from "@/lib/build/this-line";
import { cn } from "@/lib/utils";
import { KEYWORD_CHIP, KEYWORD_FOUND, KEYWORD_MISSING, KeywordGroup } from "@/components/build/stage-panels/keyword-chips";

interface LineJobMatchSectionProps {
  match: JobMatch | null;
  keywords: LineKeywords | null;
  onAddKeyword: (keyword: string) => void;
}

export default function LineJobMatchSection({ match, keywords, onAddKeyword }: LineJobMatchSectionProps) {
  const { t } = useTranslation();
  if (!match || !keywords) {
    return <p className="m-0 text-sm text-muted-foreground">{t("build.thisLine.match.noJob")}</p>;
  }
  const title = match.jobLabel ? t("build.match.title", { job: match.jobLabel }) : t("build.match.titleNoJob");
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-foreground">
        {title} · <span aria-label={t("build.match.scoreLabel", { score: match.score })}>{match.score}</span>
      </p>
      <KeywordGroup label={t("build.thisLine.match.shows")}>
        {keywords.matched.length === 0 ? (
          <li className="text-sm text-muted-foreground">{t("build.thisLine.match.showsNone")}</li>
        ) : (
          keywords.matched.map((k) => (
            <li key={k} className={cn(KEYWORD_CHIP, KEYWORD_FOUND)}>
              {k}
            </li>
          ))
        )}
      </KeywordGroup>
      {keywords.missing.length > 0 && (
        <KeywordGroup label={t("build.thisLine.match.couldCover")}>
          {keywords.missing.map((k) => (
            <li key={k} className="max-w-full">
              <button
                type="button"
                onClick={() => onAddKeyword(k)}
                aria-label={t("build.thisLine.match.addAria", { keyword: k })}
                className={cn(
                  KEYWORD_CHIP,
                  KEYWORD_MISSING,
                  "min-h-11 hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                + {k}
              </button>
            </li>
          ))}
        </KeywordGroup>
      )}
    </div>
  );
}
