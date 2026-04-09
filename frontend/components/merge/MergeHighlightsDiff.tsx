import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface MergeHighlightsDiffProps {
  sourceHighlights: string[];
  targetHighlights: string[];
  selected: Set<string>;
  onToggle: (highlight: string) => void;
}

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export default function MergeHighlightsDiff({
  sourceHighlights,
  targetHighlights,
  selected,
  onToggle,
}: MergeHighlightsDiffProps) {
  const targetNorm = new Set(targetHighlights.map(normalize));
  const sourceNorm = new Set(sourceHighlights.map(normalize));

  // All unique highlights with origin tag
  const items: Array<{ text: string; origin: "both" | "source" | "target" }> = [];
  const seen = new Set<string>();

  for (const h of targetHighlights) {
    const key = normalize(h);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ text: h, origin: sourceNorm.has(key) ? "both" : "target" });
  }
  for (const h of sourceHighlights) {
    const key = normalize(h);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ text: h, origin: "source" });
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No highlights</p>;
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const key = normalize(item.text);
        return (
          <li key={key} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={selected.has(key)}
              onCheckedChange={() => onToggle(key)}
              className="mt-0.5"
            />
            <span
              className={cn(
                item.origin === "source" && "text-green-700 dark:text-green-400",
                item.origin === "target" && "text-muted-foreground",
                item.origin === "both" && "text-foreground",
              )}
            >
              {item.text}
              {item.origin === "source" && (
                <span className="ml-1 text-xs text-green-600">(new)</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
