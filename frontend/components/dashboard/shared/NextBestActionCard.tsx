import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  FileText,
  Briefcase,
  Clock,
  Wand2,
  Mic,
  Users,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Recommendation } from "@/lib/services/dashboard-service";

interface NextBestActionCardProps {
  recommendations: Recommendation[];
  loading?: boolean;
}

// Server sends a stable `icon` string key (decoupled from any UI library);
// the dashboard maps it to a concrete lucide icon here.
const ICONS: Record<string, LucideIcon> = {
  resume: FileText,
  apply: Briefcase,
  followup: Clock,
  interview: Mic,
  tailor: Wand2,
  candidate: Users,
  job: Briefcase,
};

/**
 * AI Next Best Action (gap #1825) — the "tells you what to do next" surface.
 * Self-gates: renders nothing when there are no recommendations, so it can be
 * mounted unconditionally on every role dashboard.
 */
export function NextBestActionCard({ recommendations, loading = false }: NextBestActionCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card className="border-brand-blue/20 bg-brand-blue/5">
        <CardHeader>
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 w-full bg-gray-200 rounded animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!recommendations || recommendations.length === 0) return null;

  return (
    <Card className="border-brand-blue/20 bg-brand-blue/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-blue" />
          {t("dashboard.nextBestAction.title", "Next best action")}
        </CardTitle>
        <CardDescription>
          {t("dashboard.nextBestAction.subtitle", "What to do next to move your career forward")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {recommendations.map((rec) => {
          const Icon = ICONS[rec.icon] ?? Sparkles;
          return (
            <div
              key={rec.id}
              className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-md bg-brand-blue/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rec.title}</p>
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to={rec.url}>
                  {rec.actionLabel}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default NextBestActionCard;
