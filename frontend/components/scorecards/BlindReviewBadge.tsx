// BlindReviewBadge — shared visibility badge for #1380.
//
// Self-gating: the badge decides its own visibility from the submission
// shape (the API stamps `_anonymized: true` only when the row was
// actually masked). Consumers don't need to thread a `canShow` boolean.

import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScorecardSubmission } from "@/lib/services/scorecards-service";

interface Props {
  submission: Pick<ScorecardSubmission, "_anonymized"> | null | undefined;
  className?: string;
}

export function BlindReviewBadge({ submission, className }: Props) {
  if (!submission?._anonymized) return null;
  return (
    <Badge variant="outline" className={className ?? "border-amber-500 text-amber-700"}>
      <EyeOff className="mr-1 h-3 w-3" /> Identity hidden
    </Badge>
  );
}
