/**
 * EventBadge — small format/category chip rendered above event tiles.
 * Self-gates: nothing surfaces when the event has neither a category
 * nor a non-default format.
 */
import { Badge } from "@/components/ui/badge";
import { Video } from "lucide-react";
import type { EventFormat } from "@shared/events";

interface EventBadgeProps {
  category?: string | null;
  eventFormat?: EventFormat | null;
  className?: string;
}

export function EventBadge({ category, eventFormat, className }: EventBadgeProps) {
  if (!category && (eventFormat == null || eventFormat === "in_person")) return null;

  const isCoffee = category === "coffee";
  return (
    <div className={`flex gap-1 flex-wrap ${className ?? ""}`}>
      {isCoffee ? (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Coffee</Badge>
      ) : category ? (
        <Badge variant="secondary" className="capitalize">{category}</Badge>
      ) : null}
      {eventFormat === "remote" && (
        <Badge variant="outline">
          <Video className="w-3 h-3 mr-1" />
          Remote
        </Badge>
      )}
      {eventFormat === "hybrid" && <Badge variant="outline">Hybrid</Badge>}
    </div>
  );
}
