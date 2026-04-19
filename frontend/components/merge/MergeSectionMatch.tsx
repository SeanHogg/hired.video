import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ArrowRightLeft, Replace, SkipForward, Plus, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SectionMatch, MergeDecision } from "@/types/resume";
import MergeHighlightsDiff from "./MergeHighlightsDiff";

interface MergeSectionMatchProps {
  match: SectionMatch;
  sourceItem: Record<string, any>;
  targetItem: Record<string, any> | null;
  decision: MergeDecision;
  onDecisionChange: (decision: MergeDecision) => void;
}

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

const FIELD_LABELS: Record<string, string> = {
  startDate: "Start date",
  endDate: "End date",
  releaseDate: "Release date",
  date: "Date",
  summary: "Summary",
  description: "Description",
  url: "URL",
  score: "Score",
  name: "Name",
  organization: "Organization",
  institution: "Institution",
  position: "Position",
  title: "Title",
  area: "Area of study",
  studyType: "Degree",
  issuer: "Issuer",
  awarder: "Awarder",
  publisher: "Publisher",
  entity: "Entity",
  type: "Type",
  language: "Language",
  fluency: "Fluency",
  level: "Level",
  reference: "Reference",
};

function humaniseFieldName(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

/** Header label for the bullet picker — different section types use
 *  different underlying array fields. */
function bulletSectionLabel(sectionType: string): string {
  switch (sectionType) {
    case "education":
      return "Courses";
    case "projects":
      return "Highlights";
    case "work":
    case "volunteer":
      return "Accomplishments";
    default:
      return "Highlights";
  }
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
  // Auto-expand when identity matches but bullets differ — the user
  // needs to see/pick which accomplishments to keep.
  const [expanded, setExpanded] = useState(
    match.mergeAction === "manual" || !!match.hasContentDifferences,
  );

  const sourceHighlights: string[] = Array.isArray(sourceItem?.highlights) ? sourceItem.highlights : [];
  const targetHighlights: string[] = Array.isArray(targetItem?.highlights) ? targetItem.highlights : [];

  const hasHighlights = sourceHighlights.length > 0 || targetHighlights.length > 0;
  const hasKeywords =
    (sourceItem.keywords?.length || 0) > 0 || (targetItem?.keywords?.length || 0) > 0;

  // Map of normalised bullet text → display text. Preserve the first
  // occurrence so we show the casing the user authored.
  const highlightCatalog = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of targetHighlights) {
      const k = normalize(h);
      if (k && !map.has(k)) map.set(k, h);
    }
    for (const h of sourceHighlights) {
      const k = normalize(h);
      if (k && !map.has(k)) map.set(k, h);
    }
    return map;
  }, [sourceHighlights, targetHighlights]);

  // Derive the currently-selected set from the decision. Default: combine
  // all bullets from both sides (no explicit selection yet).
  const selectedSet: Set<string> = useMemo(() => {
    if (decision.selectedHighlights) {
      return new Set(decision.selectedHighlights.map(normalize));
    }
    // Match backend default behaviour for the current `mergeHighlights` mode
    const mode = decision.mergeHighlights ?? "combine";
    if (mode === "source_only") return new Set(sourceHighlights.map(normalize));
    if (mode === "target_only") return new Set(targetHighlights.map(normalize));
    // combine: everything
    return new Set(Array.from(highlightCatalog.keys()));
  }, [decision.selectedHighlights, decision.mergeHighlights, sourceHighlights, targetHighlights, highlightCatalog]);

  const handleToggleHighlight = (normKey: string) => {
    const next = new Set(selectedSet);
    if (next.has(normKey)) next.delete(normKey);
    else next.add(normKey);

    // Materialise back to real strings, preserving the source ordering
    // (target first, then source-only additions).
    const ordered: string[] = [];
    for (const h of targetHighlights) {
      const k = normalize(h);
      if (next.has(k) && !ordered.some((x) => normalize(x) === k)) ordered.push(h);
    }
    for (const h of sourceHighlights) {
      const k = normalize(h);
      if (next.has(k) && !ordered.some((x) => normalize(x) === k)) ordered.push(h);
    }

    onDecisionChange({ ...decision, selectedHighlights: ordered });
  };

  const ActionIcon = ACTION_ICONS[decision.action] || ArrowRightLeft;
  const diff = match.highlightDiff;
  const scalarDiffEntries = Object.entries(match.scalarDiffs ?? {});
  const scalarDiffCount = scalarDiffEntries.length;
  const scalarDiffLabels = scalarDiffEntries.map(([k]) => humaniseFieldName(k)).join(", ");

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
          <div className="flex items-center gap-2 flex-wrap">
            {getConfidenceBadge(match.confidence, match.mergeAction)}
            {match.hasContentDifferences && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Content differs
              </Badge>
            )}
            <span className="text-sm font-medium truncate">
              {getSectionLabel(sourceItem, match.sectionType)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            {getDateRange(sourceItem) && <span>{getDateRange(sourceItem)}</span>}
            {diff && (diff.onlyInSource > 0 || diff.onlyInTarget > 0) && (
              <span>
                {diff.onlyInSource > 0 && <span className="text-green-700 dark:text-green-400">+{diff.onlyInSource} new bullet{diff.onlyInSource === 1 ? "" : "s"}</span>}
                {diff.onlyInSource > 0 && diff.onlyInTarget > 0 && " · "}
                {diff.onlyInTarget > 0 && <span>{diff.onlyInTarget} target-only</span>}
              </span>
            )}
            {scalarDiffCount > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {scalarDiffCount} field{scalarDiffCount === 1 ? "" : "s"} differ: {scalarDiffLabels}
              </span>
            )}
          </div>
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

          {/* Scalar field diffs (dates, summary, url, etc.) — pick source or target */}
          {decision.action === "merge" && scalarDiffCount > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-2">
                Field differences — pick which value to keep
              </p>
              <div className="space-y-2">
                {scalarDiffEntries.map(([field, values]) => {
                  const picked = decision.scalarChoices?.[field];
                  // Default pick: target wins unless target is empty. We
                  // only enter this branch when both sides are non-empty
                  // (the diff detector already filtered empty cases),
                  // so default is "target" unless the user overrides.
                  const effective = picked ?? "target";
                  const setChoice = (choice: "source" | "target") =>
                    onDecisionChange({
                      ...decision,
                      scalarChoices: { ...(decision.scalarChoices ?? {}), [field]: choice },
                    });
                  return (
                    <div key={field} className="border rounded-md p-2">
                      <p className="text-xs font-medium mb-1">{humaniseFieldName(field)}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setChoice("source"); }}
                          className={`text-left text-xs p-2 rounded border transition-colors ${
                            effective === "source"
                              ? "border-green-500 bg-green-50 dark:bg-green-950"
                              : "border-transparent hover:bg-muted"
                          }`}
                        >
                          <span className="block text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Source</span>
                          <span className="block truncate">{values.source || <em className="text-muted-foreground">empty</em>}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setChoice("target"); }}
                          className={`text-left text-xs p-2 rounded border transition-colors ${
                            effective === "target"
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                              : "border-transparent hover:bg-muted"
                          }`}
                        >
                          <span className="block text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Target (keep)</span>
                          <span className="block truncate">{values.target || <em className="text-muted-foreground">empty</em>}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Highlights diff for merge action — bullet-level picker */}
          {decision.action === "merge" && hasHighlights && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold">{bulletSectionLabel(match.sectionType)}</p>
                <span className="text-xs text-muted-foreground">
                  {selectedSet.size} of {highlightCatalog.size} selected
                </span>
              </div>
              <MergeHighlightsDiff
                sourceHighlights={sourceHighlights}
                targetHighlights={targetHighlights}
                selected={selectedSet}
                onToggle={handleToggleHighlight}
              />
              <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    onDecisionChange({
                      ...decision,
                      mergeHighlights: "combine",
                      selectedHighlights: Array.from(highlightCatalog.values()),
                    })
                  }
                >
                  Select all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    onDecisionChange({ ...decision, selectedHighlights: [] })
                  }
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const next = { ...decision };
                    delete (next as any).selectedHighlights;
                    next.mergeHighlights = "combine";
                    onDecisionChange(next);
                  }}
                  title="Remove manual selection and use combine default"
                >
                  Reset
                </Button>
              </div>
            </div>
          )}

          {decision.action === "merge" && hasKeywords && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-1">Keywords (combined)</p>
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

          <p className="text-xs text-muted-foreground mt-2">{match.matchReason}</p>
        </div>
      )}
    </div>
  );
}
