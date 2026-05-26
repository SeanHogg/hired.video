import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Coins, Flame, Lock, ShieldCheck, Trophy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { cn } from "@/lib/utils";
import { USER_ROLES } from "@shared/user-roles";
import {
  pointsService,
  isPointsEligibleRole,
  type PointsSummary,
  type ShowcaseBadge,
} from "@/lib/services/points-service";
import { BadgeIcon } from "@/components/badges/BadgeIcon";

/**
 * Sidebar pill mirroring AITokenPill's idiom — balance + streak summary,
 * link-through to `/points`. Gates on the effective role from
 * `useEffectiveRole()` (impersonation > persona preview > real role) so
 * SuperAdmin previewing as a scoring role sees the surface the previewed
 * role would see. Raw SuperAdmin (no preview) renders an admin-flavored
 * shortcut to `/admin/points`. Other non-scoring roles render null.
 *
 * `collapsed` mirrors AITokenPill: icon-only with a hover tooltip when
 * the sidebar is collapsed; full balance + streak row when expanded.
 */
interface PointsPillProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
function nextMilestone(current: number): number | null {
  for (const m of STREAK_MILESTONES) if (current < m) return m;
  return null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function PointsPill({ collapsed = false, onNavigate }: PointsPillProps) {
  const { user, isAuthenticated } = useAuth();
  const effectiveRole = useEffectiveRole();
  const enabled = isPointsEligibleRole(effectiveRole);
  const isRawSuperAdmin =
    isAuthenticated && !enabled && user?.role === USER_ROLES.SUPER_ADMIN;

  const { data, isLoading } = useQuery<PointsSummary>({
    queryKey: ["points", "me"],
    queryFn: () => pointsService.getMe(),
    enabled,
    staleTime: 60_000,
  });

  // Public badge catalog — feeds the "X badges to earn" count shown to
  // logged-out visitors. Same endpoint /rewards uses, so signed-out users
  // see the same total they'd see on the marketing page.
  const { data: showcase } = useQuery<ShowcaseBadge[]>({
    queryKey: ["points", "badges", "showcase"],
    queryFn: () => pointsService.listAllBadges(),
    enabled: !isAuthenticated,
    staleTime: 5 * 60_000,
  });

  // Logged-out teaser — surfaces the count of earnable badges and links to
  // /rewards (the public marketing article). Self-gates here so the sidebar
  // doesn't have to branch on auth.
  if (!isAuthenticated) {
    const totalBadges = showcase?.length ?? 0;
    if (collapsed) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/rewards"
                onClick={onNavigate}
                className="relative flex items-center justify-center px-2 py-2 rounded-md hover:bg-muted transition-colors"
                aria-label="Points and badges"
              >
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <div className="font-medium">Earn points + badges</div>
                <div className="text-muted-foreground">
                  {totalBadges > 0
                    ? `${totalBadges} badges to unlock — sign up to start earning.`
                    : "Sign up to start earning."}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <Link
        to="/rewards"
        onClick={onNavigate}
        className="block px-3 py-2 rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors"
        aria-label="Points and badges"
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span>Points</span>
          </div>
          <span className="text-[11px] font-semibold text-primary">
            Learn more →
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Trophy className="h-3 w-3" />
            <span className="tabular-nums">
              {totalBadges > 0 ? `${totalBadges} badges to earn` : "Badges to earn"}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3" />
            <span>Streaks</span>
          </span>
        </div>
      </Link>
    );
  }

  // Raw SuperAdmin (no scoring-role preview / impersonation) — surface a
  // shortcut to /admin/points so SA can reach the gamification review
  // queues without flipping a preview. Self-contained: no SA branching
  // leaks into the regular pill below.
  if (isRawSuperAdmin) {
    if (collapsed) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/admin/points"
                onClick={onNavigate}
                className="relative flex items-center justify-center px-2 py-2 rounded-md hover:bg-muted transition-colors"
                aria-label="Points admin"
              >
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <div className="font-medium">Points admin</div>
                <div className="text-muted-foreground">
                  Review fraud queue, redemptions, and per-user balances.
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <Link
        to="/admin/points"
        onClick={onNavigate}
        className="block px-3 py-2 rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors"
        aria-label="Points admin"
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Points admin</span>
          </div>
          <span className="text-[11px] font-semibold text-primary">
            Open →
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Trophy className="h-3 w-3" />
            <span>Fraud · redemptions</span>
          </span>
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3" />
            <span>Balances</span>
          </span>
        </div>
      </Link>
    );
  }

  if (!enabled) return null;
  if (isLoading || !data) return null;

  const suspended = data.isSuspended;
  const streakActive = data.streak.current > 0 && !suspended;
  const nextStreak = nextMilestone(data.streak.current);
  const earnedBadges = data.badges.filter((b) => b.earned);
  const earnedCount = earnedBadges.length;
  // Most-recent earn drives the collapsed-view badge thumbnail + the
  // expanded-view "latest" tooltip line.
  const latestBadge = earnedBadges
    .slice()
    .sort((a, b) => {
      const at = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
      const bt = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
      return bt - at;
    })[0];

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/points"
              onClick={onNavigate}
              className="relative flex items-center justify-center px-2 py-2 rounded-md hover:bg-muted transition-colors"
              aria-label="Your points"
            >
              {suspended ? (
                <Lock className="h-4 w-4 text-amber-500" />
              ) : (
                <Coins className="h-4 w-4 text-muted-foreground" />
              )}
              {streakActive && (
                <span
                  className="absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-background bg-orange-500"
                  aria-hidden="true"
                />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            {suspended ? (
              <div className="space-y-1 text-xs">
                <div className="font-medium text-amber-700 dark:text-amber-300">
                  Points paused
                </div>
                <div className="text-muted-foreground">
                  {data.suspendedReason ?? "Under review."}
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="font-medium">{fmt(data.balance)} points</div>
                <div className="text-muted-foreground">
                  {data.streak.current}-day streak
                  {nextStreak != null && ` · ${nextStreak - data.streak.current} to ${nextStreak}-day`}
                </div>
                {earnedCount > 0 && (
                  <div className="text-muted-foreground">
                    {earnedCount} of {data.badges.length} badges
                    {latestBadge && ` · latest: ${latestBadge.name}`}
                  </div>
                )}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (suspended) {
    return (
      <Link
        to="/points"
        onClick={onNavigate}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors"
        aria-label="Points paused for review"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Points paused
          </span>
        </div>
        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          Review →
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/points"
      onClick={onNavigate}
      className={cn(
        "block px-3 py-2 rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors",
      )}
      aria-label="Your points and streak"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Coins className="h-3.5 w-3.5 text-primary" />
          <span>Points</span>
        </div>
        <span className="text-xs tabular-nums font-semibold">
          {fmt(data.balance)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Flame
            className={cn(
              "h-3 w-3",
              streakActive ? "text-orange-500" : "text-muted-foreground",
            )}
          />
          <span className="tabular-nums">{data.streak.current}d streak</span>
        </span>
        {nextStreak != null && (
          <span className="tabular-nums">
            {nextStreak - data.streak.current} to {nextStreak}
          </span>
        )}
      </div>

      {(earnedCount > 0 || data.badges.length > 0) && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 pt-1 border-t border-border/60">
          <span className="flex items-center gap-1">
            {latestBadge ? (
              <BadgeIcon
                iconKey={latestBadge.iconKey}
                tier={latestBadge.tier}
                earned
                size="sm"
                className="!h-3.5 !w-3.5 [&>svg]:!h-2 [&>svg]:!w-2"
              />
            ) : (
              <Trophy className="h-3 w-3" />
            )}
            <span className="tabular-nums">{earnedCount} badges</span>
          </span>
          <span className="text-[10px]">View →</span>
        </div>
      )}
    </Link>
  );
}
