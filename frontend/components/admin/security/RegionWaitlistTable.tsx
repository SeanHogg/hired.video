/**
 * RegionWaitlistTable — SuperAdmin-only review queue for the region
 * waitlist. Self-gates (returns null when not SuperAdmin).
 */

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import {
  adminSecurityService,
  type WaitlistEntry,
} from "@/lib/services/admin-security-service";

export function RegionWaitlistTable() {
  if (!isSuperAdminFromToken()) return null;
  return <RegionWaitlistTableInner />;
}

const STATUSES = ["pending", "invited", "declined"] as const;
type Status = (typeof STATUSES)[number];

function RegionWaitlistTableInner() {
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminSecurityService.listWaitlist(status);
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const review = async (id: string, next: "invited" | "declined") => {
    setPendingId(id);
    try {
      await adminSecurityService.reviewWaitlist(id, next);
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Region waitlist</CardTitle>
            <CardDescription>
              Visitors from outside North + South America who asked to be notified when we expand.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === status ? "default" : "outline"}
                onClick={() => setStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}
        {error && <div className="text-sm text-destructive py-4">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="text-sm text-muted-foreground py-4">No entries.</div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{row.email}</span>
                    <Badge variant="outline" className="text-xs font-mono">{row.countryCode}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {row.reason && (
                    <div className="text-xs text-muted-foreground mt-1">{row.reason}</div>
                  )}
                </div>
                {status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => review(row.id, "declined")}
                      disabled={pendingId === row.id}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => review(row.id, "invited")}
                      disabled={pendingId === row.id}
                    >
                      Invite
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
