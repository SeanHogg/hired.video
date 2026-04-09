import React, { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRightLeft, Replace, SkipForward, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SectionMatch, MergeDecision } from "@/types/resume";
import MergeHighlightsDiff from "./MergeHighlightsDiff";

interface MergeSectionMatchProps {
  match: SectionMatch;
  sourceItem: Record<string, any>;
  targetItem: Record<string, any> | null;
  decision: MergeDecision;
  onDecisionChange: (decision: MergeDecision) => void;
}

function getConfidenceBadge(confidence: number, action: string) {
  if (action === "auto" || confidence >= 0.8)
    return <Badge className="bg-green-100 text-green-800 text-xs">Auto {(confidence * 100).toFixed(0)}%</Badge>;
  if (action === "manual" || confidence >= 0.4)
    return <Badge className="bg-yellow-100 text-yellow-800 text-xs">Review {(confidence * 100).toFixed(0)}%</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 text-xs">Low {(confidence * 100).toFixed(0)}%</Badge>;
}

function getSectionLabel(item: Record<string, any>, sectionType: string): string {
  switch (sectionType) {
    case "work":
      return `${item.name || "Unknown Company"} - ${item.position || "Unknown Position"}`;
    case "education":
      return `${item.institution || "Unknown"} - ${item.area || item.studyType || ""}`;
    case "skills":
      return item.name || "Unknown Skill";
    case "projects":
      return item.name || "Unknown Project";
    case "volunteer":
      return `${item.organization || "Unknown"} - ${item.position || ""}`;
    case "awards":
      return item.title || "Unknown Award";
    case "certificates":
      return item.name || "Unknown Certificate";
    case "publications":
      return item.name || "Unknown Publication";
    case "languages":
      return item.language || "Unknown Language";
    case "interests":
      return item.name || "Unknown Interest";
    case "references":
      return item.name || "Unknown Reference";
    default:
      return "Unknown";
  }
}

function getDateRange(item: Record<string, any>): string {
  const start = item.startDate || item.date || "";
  const end = item.endDate || "";
  if (!start && !end) return "";
  if (start && !end) return `${start} - Present`;
  return `${start} - ${end}`;
}

const ACTION_ICONS = {
  merge: ArrowRightLeft,
  replace: Replace,
  skip: SkipForward,
  add: Plus,
};

export default function MergeSectionMatch({
  match,
  sourceItem,
  targetItem,
  decision,
  onDecisionChange,
}: MergeSectionMatchProps) {
  const [expanded, setExpanded] = useState(match.mergeAction === "manual");

  const hasHighlights =
    (sourceItem.highlights?.length || 0) > 0 || (targetItem?.highlights?.length || 0) > 0;
  const hasKeywords =
    (sourceItem.keywords?.length || 0) > 0 || (targetItem?.keywords?.length || 0) > 0;

  const ActionIcon = ACTION_ICONS[decision.action] || ArrowRightLeft;

  return (
    <div className="border rounded-md">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {getConfidenceBadge(match.confidence, match.mergeAction)}
            <span className="text-sm font-medium truncate">
              {getSectionLabel(sourceItem, match.sectionType)}
            </span>
          </div>
          {getDateRange(sourceItem) && (
            <p className="text-xs text-muted-foreground mt-0.5">{getDateRange(sourceItem)}</p>
          )}
        </div>

        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Select
            value={decision.action}
            onValueChange={(val) =>
              onDecisionChange({ ...decision, action: val as MergeDecision["action"] })
            }
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <ActionIcon className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targetItem && <SelectItem value="merge">Merge</SelectItem>}
              {targetItem && <SelectItem value="replace">Replace</SelectItem>}
              <SelectItem value="skip">Skip</SelectItem>
              {!targetItem && <SelectItem value="add">Add</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t">
          <div className="grid grid-cols-2 gap-3 mt-3">
            {/* Source side */}
            <div>
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Source</p>
              <p className="text-sm font-medium">{getSectionLabel(sourceItem, match.sectionType)}</p>
              {getDateRange(sourceItem) && (
                <p className="text-xs text-muted-foreground">{getDateRange(sourceItem)}</p>
              )}
              {sourceItem.summary && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{sourceItem.summary}</p>
              )}
            </div>

            {/* Target side */}
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Target</p>
              {targetItem ? (
                <>
                  <p className="text-sm font-medium">{getSectionLabel(targetItem, match.sectionType)}</p>
                  {getDateRange(targetItem) && (
                    <p className="text-xs text-muted-foreground">{getDateRange(targetItem)}</p>
                  )}
                  {targetItem.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{targetItem.summary}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">No matching entry in target</p>
              )}
            </div>
          </div>

          {/* Highlights diff for merge action */}
          {decision.action === "merge" && (hasHighlights || hasKeywords) && (
            <div className="mt-3">
              {hasHighlights && (
                <div>
                  <p className="text-xs font-semibold mb-1">Highlights / Accomplishments</p>
                  <MergeHighlightsDiff
                    sourceHighlights={sourceItem.highlights ?? []}
                    targetHighlights={targetItem?.highlights ?? []}
                    selected={new Set([
                      ...(sourceItem.highlights ?? []).map((h: string) => h.toLowerCase().trim().replace(/\s+/g, " ")),
                      ...(targetItem?.highlights ?? []).map((h: string) => h.toLowerCase().trim().replace(/\s+/g, " ")),
                    ])}
                    onToggle={() => {}}
                  />
                </div>
              )}
              {hasKeywords && (
                <div className="mt-2">
                  <p className="text-xs font-semibold mb-1">Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {[...(targetItem?.keywords ?? []), ...(sourceItem.keywords ?? [])]
                      .filter((k, i, arr) => arr.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i)
                      .map((kw) => (
                        <Badge key={kw} variant="outline" className="text-xs">
                          {kw}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={decision.mergeHighlights ?? "combine"}
                  onValueChange={(val) =>
                    onDecisionChange({
                      ...decision,
                      mergeHighlights: val as MergeDecision["mergeHighlights"],
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combine">Combine all bullets</SelectItem>
                    <SelectItem value="source_only">Source bullets only</SelectItem>
                    <SelectItem value="target_only">Target bullets only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">{match.matchReason}</p>
        </div>
      )}
    </div>
  );
}
