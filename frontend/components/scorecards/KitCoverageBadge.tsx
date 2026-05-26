// KitCoverageBadge — self-gating "missing-question" warning for a kit
// (#1390). Renders nothing when the kit has questions for every
// competency its templates assess. When gaps exist, shows a compact
// warning with the uncovered competency names.

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  scorecardsService,
  type KitCoverageRow,
} from "@/lib/services/scorecards-service";

interface Props {
  kitId: string;
}

export function KitCoverageBadge({ kitId }: Props) {
  const [rows, setRows] = useState<KitCoverageRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await scorecardsService.getKitCoverage(kitId).catch(() => []);
      if (!cancelled) {
        setRows(r);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kitId]);

  if (!loaded) return null;
  const uncovered = rows.filter((r) => !r.hasQuestions);
  // Self-gate: hidden when nothing to flag (kit doesn't use the
  // competency framework yet, OR every competency has at least one
  // tagged question).
  if (uncovered.length === 0) return null;

  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700">
      <AlertCircle className="mr-1 h-3 w-3" />
      Missing questions for: {uncovered.map((r) => r.competencyName).join(", ")}
    </Badge>
  );
}
