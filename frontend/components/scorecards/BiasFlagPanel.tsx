// BiasFlagPanel — debounced bias-linter results for the active scorecard
// (#1385). Self-gating: returns null when no input text + no flags. The
// hook owns the debounce + LLM call.
//
// Single source of truth for the severity → color mapping so any future
// surface that renders bias flags reuses this component instead of
// re-deriving.

import { useEffect, useState } from "react";
import { AlertTriangle, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  scorecardsService,
  type BiasFlag,
} from "@/lib/services/scorecards-service";

const SEVERITY_TONE: Record<BiasFlag["severity"], string> = {
  high: "bg-red-600 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-amber-200 text-amber-900",
};

interface Props {
  summary?: string;
  strengths?: string;
  concerns?: string;
  /** Debounce window before firing the LLM. Default 1500ms. */
  debounceMs?: number;
}

export function BiasFlagPanel({
  summary,
  strengths,
  concerns,
  debounceMs = 1500,
}: Props) {
  const [flags, setFlags] = useState<BiasFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const combinedLen =
      (summary?.length ?? 0) + (strengths?.length ?? 0) + (concerns?.length ?? 0);
    if (combinedLen < 20) {
      setFlags([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await scorecardsService.lintBias({
          summary,
          strengths,
          concerns,
        });
        if (!cancelled) {
          setFlags(res.flags ?? []);
          setUnavailable(false);
        }
      } catch {
        if (!cancelled) {
          setUnavailable(true);
          setFlags([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [summary, strengths, concerns, debounceMs]);

  // Self-gate: nothing to render when there are no flags and the linter
  // isn't actively churning. Loading state suppressed to keep the form
  // calm — the next pass replaces the panel content when it lands.
  if (unavailable) return null;
  if (flags.length === 0 && !loading) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquareWarning className="h-4 w-4 text-amber-600" />
          Bias-language linter
          {loading && (
            <span className="text-xs text-muted-foreground">analyzing…</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {flags.map((f, i) => (
          <div key={i} className="rounded border border-amber-200 p-2 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <Badge className={SEVERITY_TONE[f.severity]}>
                <AlertTriangle className="mr-1 h-3 w-3" /> {f.severity}
              </Badge>
              <code className="text-xs">{f.phrase}</code>
            </div>
            <p className="text-xs text-muted-foreground">{f.rationale}</p>
            {f.suggestedReplacement && (
              <p className="text-xs">
                <strong>Suggested:</strong> {f.suggestedReplacement}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
