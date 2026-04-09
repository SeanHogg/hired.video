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
          <SkipForward className="h-4 w-4 text-gray-400" />
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
                  const included = newItemDecisions.get(key) ?? true;
                  const label =
                    (item.item as any).name ||
                    (item.item as any).title ||
                    (item.item as any).institution ||
                    (item.item as any).organization ||
                    (item.item as any).language ||
                    "Unknown";
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => onNewItemToggle(key)}
                        className="rounded"
                      />
                      <Badge className="bg-blue-100 text-blue-800 text-xs">New</Badge>
                      <span className="text-sm">{label}</span>
                      {(item.item as any).position && (
                        <span className="text-xs text-muted-foreground">
                          - {(item.item as any).position}
                        </span>
                      )}
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
