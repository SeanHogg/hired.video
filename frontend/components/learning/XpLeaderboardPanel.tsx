/**
 * XP leaderboard panel (#2068 GAP-4) — reusable ranking surface for learner
 * points. Global by default; pass a `cohortId` to scope it to a classroom.
 * Fetches its own data and renders the top earners + the viewer's own rank.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Loader2 } from "lucide-react";
import { getXpLeaderboard, type XpLeaderboard } from "@/lib/courses/courses-api";
import { useAuth } from "@/lib/auth";

interface Props {
  scope?: "global" | "cohort";
  cohortId?: string;
  limit?: number;
  className?: string;
}

export default function XpLeaderboardPanel({ scope = "global", cohortId, limit = 10, className }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<XpLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getXpLeaderboard(scope, { cohortId, limit })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, cohortId, limit]);

  return (
    <div className={`border rounded-lg bg-card ${className ?? ""}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-semibold text-sm">{t("learn.leaderboard.title")}</h3>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("learn.dashboard.continueLearning")}
        </div>
      ) : failed ? (
        <div className="p-4 text-sm text-destructive">{t("learn.leaderboard.empty")}</div>
      ) : !data || data.entries.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">{t("learn.leaderboard.empty")}</div>
      ) : (
        <ul className="divide-y">
          {data.entries.map((e) => {
            const isMe = e.userId === user?.id;
            return (
              <li
                key={e.userId}
                className={`flex items-center gap-3 px-4 py-2 ${isMe ? "bg-primary/5" : ""}`}
              >
                <span className="w-6 text-sm font-semibold text-muted-foreground tabular-nums">
                  {e.rank}
                </span>
                <Avatar className="w-7 h-7">
                  {e.avatarUrl ? <AvatarImage src={e.avatarUrl} alt={e.name} /> : null}
                  <AvatarFallback>{e.name.charAt(0) || "?"}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">
                  {e.name}
                  {isMe ? ` (${t("learn.leaderboard.you")})` : ""}
                </span>
                <span className="text-sm font-medium tabular-nums">{e.points.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      )}
      {data?.viewer && !data.entries.some((e) => e.userId === user?.id) && (
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          {t("learn.leaderboard.yourRank", { rank: data.viewer.rank })} ·{" "}
          {data.viewer.points.toLocaleString()} {t("learn.leaderboard.points")}
        </div>
      )}
    </div>
  );
}
