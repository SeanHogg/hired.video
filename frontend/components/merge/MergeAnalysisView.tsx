import React from "react";
import { CheckCircle2, AlertTriangle, Plus, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { MergeAnalysis, MergeDecision, MergeSectionType } from "@/types/resume";
import MergeSectionMatch from "./MergeSectionMatch";

interface MergeAnalysisViewProps {
  analysis: MergeAnalysis;
  sourceContent: Record<string, any>;
  targetContent: Record<string, any>;
  decisions: MergeDecision[];
  onDecisionChange: (index: number, decision: MergeDecision) => void;
  newItemDecisions: Map<string, boolean>; // key = "sectionType:sourceIndex", value = include
  onNewItemToggle: (key: string) => void;
  basicDecisions: Record<string, "source" | "target">;
  onBasicDecisionChange: (field: string, choice: "source" | "target") => void;
}

const SECTION_LABELS: Record<string, string> = {
  work: "Work Experience",
  education: "Education",
  skills: "Skills",
  volunteer: "Volunteer",
  awards: "Awards",
  certificates: "Certificates",
  publications: "Publications",
  languages: "Languages",
  interests: "Interests",
  references: "References",
  projects: "Projects",
};

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Build a section-aware label/secondary/hint for a "new item" row. The
 *  identity field varies per section (awards use `title`, education uses
 *  `institution`, languages uses `language`, etc.) — without this we
 *  fall through to "Unknown". */
function describeNewItem(
  sectionType: string,
  item: Record<string, unknown>,
): { label: string; secondary?: string; hint?: string } {
  // PascalCase fallback for legacy stored content that wasn't normalised
  const get = (key: string): string => asStr(item[key] ?? item[key.charAt(0).toUpperCase() + key.slice(1)]);

  const dateRange = (() => {
    const start = get("startDate");
    const end = get("endDate");
    if (!start && !end) return "";
    if (start && !end) return `${start} - Present`;
    if (!start && end) return end;
    return `${start} - ${end}`;
  })();

  switch (sectionType) {
    case "work": {
      const company = get("name") || "Untitled company";
      const position = get("position");
      return {
        label: company,
        secondary: [position, dateRange].filter(Boolean).join(" · "),
        hint: get("summary"),
      };
    }
    case "volunteer": {
      const org = get("organization") || "Untitled organization";
      const position = get("position");
      return {
        label: org,
        secondary: [position, dateRange].filter(Boolean).join(" · "),
        hint: get("summary"),
      };
    }
    case "education": {
      const institution = get("institution") || "Untitled institution";
      const degree = [get("studyType"), get("area")].filter(Boolean).join(" in ");
      return {
        label: institution,
        secondary: [degree, dateRange].filter(Boolean).join(" · "),
      };
    }
    case "projects": {
      const name = get("name") || "Untitled project";
      return {
        label: name,
        secondary: dateRange,
        hint: get("description"),
      };
    }
    case "awards": {
      const title = get("title") || "Untitled award";
      const date = get("date");
      const awarder = get("awarder");
      return {
        label: title,
        secondary: [awarder, date].filter(Boolean).join(" · "),
        hint: get("summary"),
      };
    }
    case "certificates": {
      const name = get("name") || "Untitled certificate";
      const date = get("date");
      const issuer = get("issuer");
      return {
        label: name,
        secondary: [issuer, date].filter(Boolean).join(" · "),
      };
    }
    case "publications": {
      const name = get("name") || "Untitled publication";
      const date = get("releaseDate");
      const publisher = get("publisher");
      return {
        label: name,
        secondary: [publisher, date].filter(Boolean).join(" · "),
        hint: get("summary"),
      };
    }
    case "skills": {
      const name = get("name") || "Untitled skill";
      const keywords = asArr(item.keywords ?? (item as any).Keywords);
      return {
        label: name,
        secondary: get("level"),
        hint: keywords.length ? keywords.join(", ") : undefined,
      };
    }
    case "languages": {
      return {
        label: get("language") || "Untitled language",
        secondary: get("fluency"),
      };
    }
    case "interests": {
      const name = get("name") || "Untitled interest";
      const keywords = asArr(item.keywords ?? (item as any).Keywords);
      return {
        label: name,
        hint: keywords.length ? keywords.join(", ") : undefined,
      };
    }
    case "references": {
      return {
        label: get("name") || "Untitled reference",
        hint: get("reference"),
      };
    }
    default: {
      // Last-resort: surface the first non-empty string field so the user
      // sees SOMETHING actionable instead of a bare "Unknown".
      const firstStr = Object.entries(item).find(
        ([, v]) => typeof v === "string" && v.trim().length > 0,
      );
      return {
        label: firstStr ? String(firstStr[1]).trim() : "Untitled item",
      };
    }
  }
}

export default function MergeAnalysisView({
  analysis,
  sourceContent,
  targetContent,
  decisions,
  onDecisionChange,
  newItemDecisions,
  onNewItemToggle,
  basicDecisions,
  onBasicDecisionChange,
}: MergeAnalysisViewProps) {
  // Group matches by section type
  const grouped = new Map<string, number[]>();
  decisions.forEach((d, i) => {
    const arr = grouped.get(d.sectionType) ?? [];
    arr.push(i);
    grouped.set(d.sectionType, arr);
  });

  // Group new items by section type
  const newGrouped = new Map<string, typeof analysis.newSections>();
  for (const item of analysis.newSections) {
    const arr = newGrouped.get(item.sectionType) ?? [];
    arr.push(item);
    newGrouped.set(item.sectionType, arr);
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>{analysis.summary.autoMerge} auto-merge</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span>{analysis.summary.manualReview} review</span>
        </div>
        <div className="flex items-center gap-1">
          <SkipForward className="h-4 w-4 text-muted-foreground" />
          <span>{analysis.summary.skip} skip</span>
        </div>
        <div className="flex items-center gap-1">
          <Plus className="h-4 w-4 text-blue-600" />
          <span>{analysis.summary.newItems} new</span>
        </div>
      </div>

      {/* Basics conflicts */}
      {analysis.basics.conflicts.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Basic Information Conflicts</h4>
          <div className="space-y-2">
            {analysis.basics.conflicts.map((c) => (
              <div key={c.field} className="border rounded-md p-3">
                <p className="text-xs font-medium capitalize mb-1">{c.field}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`text-left p-2 rounded text-sm border ${
                      basicDecisions[c.field] === "source"
                        ? "border-green-500 bg-green-50 dark:bg-green-950"
                        : "border-transparent hover:bg-muted"
                    }`}
                    onClick={() => onBasicDecisionChange(c.field, "source")}
                  >
                    <span className="text-xs text-green-700 dark:text-green-400 font-medium">Source</span>
                    <p className="truncate">{c.sourceValue}</p>
                  </button>
                  <button
                    className={`text-left p-2 rounded text-sm border ${
                      basicDecisions[c.field] === "target" || !basicDecisions[c.field]
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-transparent hover:bg-muted"
                    }`}
                    onClick={() => onBasicDecisionChange(c.field, "target")}
                  >
                    <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">Target (keep)</span>
                    <p className="truncate">{c.targetValue}</p>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Separator className="mt-4" />
        </div>
      )}

      {/* Section matches grouped by type */}
      {Array.from(grouped.entries()).map(([sectionType, indices]) => (
        <div key={sectionType}>
          <h4 className="text-sm font-semibold mb-2">{SECTION_LABELS[sectionType] || sectionType}</h4>
          <div className="space-y-2">
            {indices.map((idx) => {
              const d = decisions[idx];
              const match = analysis.sectionMatches.find(
                (m) => m.sectionType === d.sectionType && m.sourceIndex === d.sourceIndex,
              );
              if (!match) return null;
              const sourceItem = (sourceContent[sectionType] ?? [])[d.sourceIndex];
              const targetItem = d.targetIndex !== null ? (targetContent[sectionType] ?? [])[d.targetIndex] : null;
              if (!sourceItem) return null;
              return (
                <MergeSectionMatch
                  key={`${sectionType}-${d.sourceIndex}`}
                  match={match}
                  sourceItem={sourceItem}
                  targetItem={targetItem}
                  decision={d}
                  onDecisionChange={(updated) => onDecisionChange(idx, updated)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* New items */}
      {analysis.newSections.length > 0 && (
        <>
          <Separator />
          <h4 className="text-sm font-semibold">New Items (source only)</h4>
          {Array.from(newGrouped.entries()).map(([sectionType, items]) => (
            <div key={sectionType}>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {SECTION_LABELS[sectionType] || sectionType}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const key = `${item.sectionType}:${item.sourceIndex}`;
                  // Cross-section conflicts default to UNCHECKED — adding
                  // mis-classified content silently is exactly the bug
                  // we're trying to surface.
                  const defaultIncluded = !item.crossSectionConflict;
                  const included = newItemDecisions.get(key) ?? defaultIncluded;
                  const { label, secondary, hint } = describeNewItem(
                    item.sectionType,
                    item.item as Record<string, unknown>,
                  );
                  const conflict = item.crossSectionConflict;
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer ${
                        conflict ? "border-red-300 bg-red-50/30 dark:bg-red-950/20" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => onNewItemToggle(key)}
                        className="rounded mt-0.5"
                      />
                      {conflict ? (
                        <Badge className="bg-red-100 text-red-800 text-xs shrink-0 mt-0.5">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Misclassified
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 text-xs shrink-0 mt-0.5">New</Badge>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium">{label}</span>
                          {secondary && (
                            <span className="text-xs text-muted-foreground">{secondary}</span>
                          )}
                        </div>
                        {hint && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{hint}</p>
                        )}
                        {conflict && (
                          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                            {conflict.reason}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
