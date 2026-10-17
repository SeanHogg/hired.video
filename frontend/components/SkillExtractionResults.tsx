// Reusable renderer for the Skill Extractor tool. Consumes the normalized
// API response from POST /api/ai/tools/skill-extract and groups the skills
// by category with importance pills. Can be embedded in any page that
// wants to display an extraction result (the tool page, a sidebar panel,
// or future context-menu dialogs).

import { Award, Briefcase, Clock, Copy, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SkillEvidence } from "@/types/resume";
import type { SkillLevel } from "@shared/resume";

export type SkillSourceType = "job" | "resume";

export type SkillCategory =
  | "technical"
  | "soft"
  | "tool"
  | "language"
  | "framework"
  | "certification"
  | "domain"
  | "other";

export type SkillImportance = "required" | "preferred" | "nice-to-have";

export type { SkillLevel };

export interface ExtractedSkill {
  name: string;
  category: SkillCategory;
  importance?: SkillImportance;
  /** Resume-side enrichment — populated when sourceType === "resume". */
  level?: SkillLevel;
  yearsOfExperience?: number;
  evidenceLabels?: string[];
}

export interface SkillExtractionResult {
  sourceType: SkillSourceType;
  skills: ExtractedSkill[];
  summary?: string;
  /** Server-resolved evidence rows binding skills to section-item UUIDs.
   *  Only present when the caller passed a `resumeId` context. The tool
   *  uses these to write `content.skillEvidence` on save-back. */
  evidence?: SkillEvidence[];
}

interface Props {
  result: SkillExtractionResult;
  /** Show a "Copy Skills" convenience button under the grid. */
  showCopyButton?: boolean;
  className?: string;
}

const CATEGORY_ORDER: SkillCategory[] = [
  "technical",
  "language",
  "framework",
  "tool",
  "domain",
  "soft",
  "certification",
  "other",
];

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  technical: "Technical",
  language: "Languages",
  framework: "Frameworks",
  tool: "Tools & Platforms",
  domain: "Domain Knowledge",
  soft: "Soft Skills",
  certification: "Certifications",
  other: "Other",
};

const CATEGORY_ACCENT: Record<SkillCategory, string> = {
  technical: "bg-accent text-accent-foreground",
  language: "bg-accent text-accent-foreground",
  framework: "bg-accent text-accent-foreground",
  tool: "bg-cyan-100 text-cyan-800",
  domain: "bg-emerald-100 text-emerald-800",
  soft: "bg-pink-100 text-pink-800",
  certification: "bg-amber-100 text-amber-800",
  other: "bg-muted text-foreground",
};

const IMPORTANCE_ACCENT: Record<SkillImportance, string> = {
  required: "bg-red-100 text-red-800 border-red-200",
  preferred: "bg-yellow-100 text-yellow-800 border-yellow-200",
  "nice-to-have": "bg-muted text-foreground/80 border-border",
};

const LEVEL_ACCENT: Record<SkillLevel, string> = {
  Beginner: "bg-muted text-foreground/80 border-border",
  Intermediate: "bg-sky-100 text-sky-800 border-sky-200",
  Advanced: "bg-sky-100 text-sky-800 border-sky-200",
  Expert: "bg-amber-100 text-amber-800 border-amber-200",
};

function formatYears(n: number | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1) return "<1y";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}y` : `${rounded.toFixed(1)}y`;
}

export function groupSkillsByCategory(skills: ExtractedSkill[]) {
  const map = new Map<SkillCategory, ExtractedSkill[]>();
  for (const s of skills) {
    const list = map.get(s.category) ?? [];
    list.push(s);
    map.set(s.category, list);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
    category: c,
    skills: map.get(c)!,
  }));
}

export { CATEGORY_LABEL as SKILL_CATEGORY_LABEL };

export function SkillExtractionResults({ result, showCopyButton = true, className }: Props) {
  const grouped = groupSkillsByCategory(result.skills);
  const totalSkills = result.skills.length;

  const handleCopy = () => {
    const lines = grouped.map((g) => {
      const names = g.skills.map((s) => s.name).join(", ");
      return `${CATEGORY_LABEL[g.category]}: ${names}`;
    });
    const header = `Skills extracted from ${result.sourceType === "job" ? "job description" : "resume"} (${totalSkills} total)`;
    navigator.clipboard.writeText(`${header}\n\n${lines.join("\n")}`);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Extracted Skills
        </CardTitle>
        {result.summary && (
          <p className="text-sm text-muted-foreground mt-1">{result.summary}</p>
        )}
      </CardHeader>
      <CardContent>
        {totalSkills === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            No skills were detected. Try pasting more complete content.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">{totalSkills}</span>
              <span className="text-muted-foreground">
                skill{totalSkills === 1 ? "" : "s"} found in this{" "}
                {result.sourceType === "job" ? "job description" : "resume"}
              </span>
            </div>

            {grouped.map(({ category, skills }) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-sm">
                    {CATEGORY_LABEL[category]}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    ({skills.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {skills.map((skill, idx) => {
                    const yrs = formatYears(skill.yearsOfExperience);
                    const evCount = skill.evidenceLabels?.length ?? 0;
                    const hasEnrichment = !!skill.level || !!yrs || evCount > 0;
                    return (
                      <div
                        key={`${category}-${skill.name}-${idx}`}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <Badge
                          variant="secondary"
                          className={cn("text-xs", CATEGORY_ACCENT[category])}
                        >
                          {skill.name}
                        </Badge>
                        {skill.importance && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-5 border",
                              IMPORTANCE_ACCENT[skill.importance],
                            )}
                          >
                            {skill.importance}
                          </Badge>
                        )}
                        {skill.level && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-5 border inline-flex items-center gap-1",
                              LEVEL_ACCENT[skill.level],
                            )}
                          >
                            <Award className="h-2.5 w-2.5" />
                            {skill.level}
                          </Badge>
                        )}
                        {yrs && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 border inline-flex items-center gap-1"
                          >
                            <Clock className="h-2.5 w-2.5" />
                            {yrs}
                          </Badge>
                        )}
                        {evCount > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 border inline-flex items-center gap-1"
                            title={skill.evidenceLabels!.join(" • ")}
                          >
                            <Briefcase className="h-2.5 w-2.5" />
                            {evCount} use{evCount === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {!hasEnrichment && result.sourceType === "resume" && (
                          <span className="sr-only">
                            No evidence linked yet
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {showCopyButton && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Skills
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
