/**
 * Compact gamification widget — balance, streak, next milestone.
 *
 * Self-gated by role per [[feedback_extract_on_duplication]]: every
 * consumer just renders <PointsWidget /> and the component decides
 * whether to show anything based on the authenticated user's role. No
 * prop-drilled `canShowPoints` boolean.
 *
 * V1 = job_seeker only; recruiter / employer collapse to `null` until
 * the catalog widens (tracked in the Gap Register).
 */

import { useQuery } from "@tanstack/react-query";
import { Flame, Trophy, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { pointsService, isPointsEligible, type PointsSummary } from "@/lib/services/points-service";

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function nextMilestone(current: number): number | null {
  for (const m of STREAK_MILESTONES) if (current < m) return m;
  return null;
}

export function PointsWidget({ variant = "compact" }: { variant?: "compact" | "expanded" }) {
  const { user } = useAuth();
  const isEligible = isPointsEligible(user);

  const { data, isLoading } = useQuery<PointsSummary>({
    queryKey: ["points", "me"],
    queryFn: () => pointsService.getMe(),
    enabled: isEligible,
    staleTime: 60_000,
  });

  if (!isEligible) return null;
  if (isLoading || !data) {
    return (
      <Card className="p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-24 mb-2" />
        <div className="h-8 bg-muted rounded w-32" />
      </Card>
    );
  }

  const next = nextMilestone(data.streak.current);

  return (
    <Card className={variant === "compact" ? "p-4" : "p-6"}>
      {data.isSuspended ? (
        <SuspendedBanner reason={data.suspendedReason} />
      ) : (
        <div className="space-y-3">
          <Link to="/points" className="block hover:opacity-80 transition-opacity">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Your points
              </span>
              <span className="text-xs text-muted-foreground">View activity →</span>
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">
              {data.balance.toLocaleString()}
            </div>
          </Link>

          <div className="flex items-center gap-2 text-sm">
            <Flame
              className={`h-4 w-4 ${data.streak.current > 0 ? "text-orange-500" : "text-muted-foreground"}`}
            />
            <span className="font-medium">
              {data.streak.current}-day streak
            </span>
            {next != null && (
              <span className="text-xs text-muted-foreground">
                {next - data.streak.current} to {next}-day bonus
              </span>
            )}
          </div>

          {variant === "expanded" && (
            <div className="pt-2 border-t border-border space-y-2">
              <UserTaskGate
                completed={data.userTaskGate.completed}
                threshold={data.userTaskGate.threshold}
                unlocked={data.userTaskGate.unlocked}
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Trophy className="h-3.5 w-3.5" />
                {data.badges.filter((b) => b.earned).length} of {data.badges.length} badges earned
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SuspendedBanner({ reason }: { reason: string | null }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Lock className="h-4 w-4 text-amber-500 mt-0.5" />
      <div>
        <div className="font-medium text-foreground">Points paused</div>
        <div className="text-xs text-muted-foreground">
          {reason ?? "Under review by support. Earning resumes after review."}
        </div>
      </div>
    </div>
  );
}

function UserTaskGate({
  completed,
  threshold,
  unlocked,
}: {
  completed: number;
  threshold: number;
  unlocked: boolean;
}) {
  if (unlocked) {
    return (
      <div className="text-xs text-green-600 dark:text-green-400">
        ✓ Self-task earnings unlocked
      </div>
    );
  }
  const pct = Math.min(100, Math.round((completed / threshold) * 100));
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div className="flex justify-between">
        <span>Self-task earning gate</span>
        <span className="tabular-nums">
          {completed}/{threshold}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
