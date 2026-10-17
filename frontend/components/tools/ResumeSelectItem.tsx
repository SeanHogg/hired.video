import { FileText } from "lucide-react";
import { SelectItem } from "@/components/ui/select";
import ResumeScoreBadges, { type ResumeScoreFields } from "./ResumeScoreBadges";

/**
 * Minimum shape this component reads. Loose-typed because the upstream
 * Resume type is `Record<string, unknown>` in some tool pages — we
 * extract just the fields we render and let TypeScript permissively
 * accept supersets.
 */
export interface ResumeRow extends ResumeScoreFields {
  id: string;
  title?: string | null;
  slug?: string | null;
}

interface ResumeSelectItemProps {
  resume: ResumeRow;
}

/**
 * Shared row renderer for the "pick a resume" Select used by ten tool
 * pages (AI Resume Scorer, Optimizer, Tailor, Sentiment, Summarize,
 * Skill Extractor, Form Autofill, JobResumeMatch, ValueProposition,
 * ResumeConsolidator).
 *
 * Owns: FileText icon, "Untitled Resume" fallback label, score badges
 * cluster (sentiment today; ATS/keyword/etc. when phase 2 lands).
 *
 * DRY rule: extracted because the SelectItem body was duplicated across
 * those ten pages with subtle drift (some used FileText, some did not;
 * some fell back to slug, some did not). The shared row makes the badge
 * surface uniform and removes the drift.
 */
export default function ResumeSelectItem({ resume }: ResumeSelectItemProps) {
  const label = resume.title || resume.slug || "Untitled Resume";
  return (
    <SelectItem value={resume.id}>
      <div className="flex w-full items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{label}</span>
        <ResumeScoreBadges resume={resume} compact className="ml-auto" />
      </div>
    </SelectItem>
  );
}
