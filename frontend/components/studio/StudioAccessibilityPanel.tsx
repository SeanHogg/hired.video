/**
 * Studio Accessibility Panel (#1556) — WCAG 2.2 audit of the live
 * CanvasState, rendered inside an Actions-sheet dialog.
 *
 * Self-gates: shows the report inline. Each issue has a click-target
 * (sceneId + optional widgetId) so the host can scroll to the
 * offending widget once we wire the click handler from the consumer.
 *
 * Closes the Articulate 360 accessibility-tooling gap: authors get an
 * inline alt-text / contrast / captions / reading-order check *before*
 * publish, without the $1,099/seat/yr ticket.
 */
import { useMemo } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { auditCanvasState, type WcagIssue } from "@/lib/studio/accessibility/wcag-audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface StudioAccessibilityPanelProps {
  state: CanvasState;
  /** Click handler — host scrolls to the scene / widget and selects it
   *  in the inspector. Optional; when absent, issues render without a
   *  navigation affordance. */
  onNavigate?: (target: { sceneId: string; widgetId?: string }) => void;
}

export default function StudioAccessibilityPanel({
  state,
  onNavigate,
}: StudioAccessibilityPanelProps) {
  const report = useMemo(() => auditCanvasState(state), [state]);

  if (report.summary.total === 0) {
    return (
      <div className="flex flex-col items-center text-center py-10 px-4">
        <CheckCircle2 className="h-12 w-12 text-green-600 mb-3" />
        <h3 className="text-lg font-semibold mb-1">No accessibility issues found</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Image widgets have alt text, text/background contrast clears WCAG 2.2
          AA, captions are present, and reading order matches visual order. Ship
          with confidence.
        </p>
      </div>
    );
  }

  const grouped = groupBySeverity(report.issues);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {report.summary.errors > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> {report.summary.errors} error
            {report.summary.errors !== 1 ? "s" : ""}
          </Badge>
        )}
        {report.summary.warnings > 0 && (
          <Badge variant="outline" className="gap-1 border-amber-600 text-amber-700">
            <AlertTriangle className="h-3 w-3" /> {report.summary.warnings} warning
            {report.summary.warnings !== 1 ? "s" : ""}
          </Badge>
        )}
        {report.summary.infos > 0 && (
          <Badge variant="outline" className="gap-1">
            <Info className="h-3 w-3" /> {report.summary.infos} info
          </Badge>
        )}
      </div>

      {(["error", "warning", "info"] as const).map((severity) => {
        const items = grouped[severity];
        if (items.length === 0) return null;
        return (
          <div key={severity} className="space-y-2">
            {items.map((issue, idx) => (
              <IssueCard
                key={`${issue.rule}-${issue.sceneId}-${issue.widgetId ?? "scene"}-${idx}`}
                issue={issue}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground pt-2 border-t">
        Audit covers WCAG 2.2 success criteria 1.1.1 (alt text), 1.2.2 (captions),
        1.3.2 (reading order), 1.4.3 / 1.4.6 (contrast AA / AAA), and 1.4.4
        (resize text). Audio descriptions (1.2.5), flashing content (2.3.1), and
        sign-language alternatives (1.2.6) are on roadmap.
      </p>
    </div>
  );
}

function IssueCard({
  issue,
  onNavigate,
}: {
  issue: WcagIssue;
  onNavigate?: (target: { sceneId: string; widgetId?: string }) => void;
}) {
  const Icon =
    issue.severity === "error"
      ? AlertCircle
      : issue.severity === "warning"
        ? AlertTriangle
        : Info;
  const tint =
    issue.severity === "error"
      ? "text-red-600"
      : issue.severity === "warning"
        ? "text-amber-600"
        : "text-blue-600";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${tint}`} />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold leading-snug">
              {issue.message}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              WCAG 2.2 SC {issue.sc} · rule <code className="font-mono">{issue.rule}</code>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Fix:</span> {issue.fix}
        </p>
        {onNavigate && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate({ sceneId: issue.sceneId, widgetId: issue.widgetId })}
          >
            Jump to {issue.widgetId ? "widget" : "scene"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function groupBySeverity(issues: WcagIssue[]): Record<"error" | "warning" | "info", WcagIssue[]> {
  return {
    error: issues.filter((i) => i.severity === "error"),
    warning: issues.filter((i) => i.severity === "warning"),
    info: issues.filter((i) => i.severity === "info"),
  };
}
