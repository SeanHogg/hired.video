/**
 * The tool-run history row for a tailor (the /tools history sheet, admin
 * tool usage, the résumé's history panel). Tailoring moved from the tool
 * page into the kit's review; the row it records is unchanged.
 */
import type { TFunction } from "i18next";
import type { JobTailorResponse } from "@/lib/services/match-service";
import type { RecordToolRunArgs } from "@/lib/tools/use-tool-run-recorder";

export function tailorRunRecord(
  r: JobTailorResponse,
  t: TFunction,
  args: { resumeId?: string; jobDescription?: string; jobLabel?: string },
): RecordToolRunArgs {
  const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);
  return {
    score: r.newScore,
    result: {
      overallScore: r.newScore,
      summary: r.summaryRecommendations,
      ...(args.jobLabel?.trim() ? { jobLabel: args.jobLabel.trim() } : {}),
      // The keywords it found on the résumé, so the run reads like a match.
      ...(r.matchedKeywords.length ? { strengths: r.matchedKeywords } : {}),
      categoryScores: [
        { label: t("tools.resumeTailor.beforeTailor"), score: r.oldScore },
        { label: t("tools.resumeTailor.afterTailor"), score: r.newScore },
      ],
      recommendations: r.changes.map((c) => ({
        title: `${c.section}: ${clip(c.before)}`,
        description: `${c.why}\n\n${t("tools.resumeTailor.runChangeAfter", { after: c.after })}`,
      })),
      raw: r,
    },
    summary: t("tools.resumeTailor.runSummary", { oldScore: Math.round(r.oldScore), newScore: Math.round(r.newScore) }),
    resumeId: args.resumeId,
    jobDescription: args.jobDescription,
  };
}
