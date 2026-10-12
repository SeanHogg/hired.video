/**
 * #1262 — Mutuals row + warm-intro CTA. Mounted on CandidateDetail /
 * PeopleDetail headers. Reads `/api/graph/mutuals/:userId` (backend
 * already ships) and renders the count + avatar tile. The "Reach via
 * warm intro" affordance hits `/api/graph/path/:userId` lazily —
 * only when the user clicks Show path, so we don't waste edge queries
 * on every profile pageload.
 *
 * Self-gates on `targetUserId` and on the result count — returns null
 * when no mutuals exist so the parent doesn't have to pre-check.
 */

import { useEffect, useState } from "react";
import { Loader2, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

interface MutualUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface PathStep {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface MutualsRowProps {
  targetUserId: string;
}

export default function MutualConnectionsRow({ targetUserId }: MutualsRowProps) {
  // Mutuals are computed between ME and the target, so the query is
  // meaningless — and 401s — for a signed-out viewer. Self-gate on auth so a
  // public profile view never fires the auth-required graph call.
  const { isAuthenticated } = useAuth();
  const [mutuals, setMutuals] = useState<MutualUser[] | null>(null);
  const [loadingMutuals, setLoadingMutuals] = useState(true);
  const [path, setPath] = useState<PathStep[] | null>(null);
  const [loadingPath, setLoadingPath] = useState(false);

  useEffect(() => {
    if (!targetUserId || !isAuthenticated) {
      setLoadingMutuals(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get(`/api/graph/mutuals/${encodeURIComponent(targetUserId)}`)
      .then((res) => {
        if (cancelled) return;
        const body = (res as any).data?.data ?? (res as any).data ?? {};
        setMutuals((body.items ?? body.mutuals ?? []) as MutualUser[]);
      })
      .catch(() => {
        if (!cancelled) setMutuals([]);
      })
      .finally(() => !cancelled && setLoadingMutuals(false));
    return () => { cancelled = true; };
  }, [targetUserId, isAuthenticated]);

  const showPath = async () => {
    if (path) return;
    setLoadingPath(true);
    try {
      const res = await apiClient.get(`/api/graph/path/${encodeURIComponent(targetUserId)}`);
      const body = (res as any).data?.data ?? (res as any).data ?? {};
      setPath((body.path ?? []) as PathStep[]);
    } catch {
      setPath([]);
    } finally {
      setLoadingPath(false);
    }
  };

  if (loadingMutuals) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading network…
      </div>
    );
  }
  if (!mutuals || mutuals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{mutuals.length} mutual{mutuals.length === 1 ? "" : "s"}</span>
        <div className="flex -space-x-2">
          {mutuals.slice(0, 5).map((m) => (
            <div
              key={m.userId}
              title={m.displayName}
              className="h-6 w-6 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-medium"
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                m.displayName?.slice(0, 1) ?? "?"
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={showPath}
          disabled={loadingPath || path !== null}
        >
          {loadingPath ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
            <>
              Reach via warm intro <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      </div>
      {path && path.length > 0 && (
        <div className="rounded border bg-muted/30 p-2 text-xs flex items-center gap-2 overflow-x-auto">
          {path.map((step, i) => (
            <span key={step.userId} className="flex items-center gap-2">
              <span className="font-medium">{step.displayName}</span>
              {i < path.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </span>
          ))}
        </div>
      )}
      {path && path.length === 0 && (
        <div className="text-xs text-muted-foreground">No warm path found within 3 hops.</div>
      )}
    </div>
  );
}
