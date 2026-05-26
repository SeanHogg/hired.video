// DueInBadge — shared SLA-state badge for #1383.
//
// Self-gating: renders nothing when the submission has no `dueAt` or is
// already submitted. Consumers don't pass a `canShow` boolean — the
// badge inspects the submission and decides.
//
// Three states:
//   • on track (dueAt > now + 4h)         → muted "Due in 6h"
//   • approaching (dueAt < now + 4h)      → amber "Due in 3h"
//   • overdue (dueAt <= now)              → red "Overdue by 12h"

import { Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScorecardSubmission } from "@/lib/services/scorecards-service";

const HOUR_MS = 60 * 60 * 1000;
const APPROACHING_WINDOW_MS = 4 * HOUR_MS;

interface Props {
  submission: Pick<ScorecardSubmission, "dueAt" | "status"> | null | undefined;
  /** Override "now" for tests + Storybook. */
  now?: Date;
}

function formatDelta(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / HOUR_MS);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
  if (hours >= 1) return `${hours}h`;
  const mins = Math.max(1, Math.floor(abs / (60 * 1000)));
  return `${mins}m`;
}

export function DueInBadge({ submission, now = new Date() }: Props) {
  if (!submission?.dueAt) return null;
  if (submission.status === "submitted") return null;

  const dueMs = new Date(submission.dueAt).getTime();
  const delta = dueMs - now.getTime();

  if (delta <= 0) {
    return (
      <Badge className="bg-red-600 text-white">
        <AlertTriangle className="mr-1 h-3 w-3" /> Overdue by {formatDelta(delta)}
      </Badge>
    );
  }
  if (delta <= APPROACHING_WINDOW_MS) {
    return (
      <Badge className="bg-amber-500 text-white">
        <Clock className="mr-1 h-3 w-3" /> Due in {formatDelta(delta)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Clock className="mr-1 h-3 w-3" /> Due in {formatDelta(delta)}
    </Badge>
  );
}
