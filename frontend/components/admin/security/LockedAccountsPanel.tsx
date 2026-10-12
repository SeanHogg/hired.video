/**
 * LockedAccountsPanel — SuperAdmin-only list of currently locked
 * accounts with one-click manual unlock.
 *
 * Self-gates: returns null if the caller is not a SuperAdmin so a
 * higher-level page never has to pass an `isAdmin` prop. Self-fetches
 * via adminSecurityService.
 */

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import {
  adminSecurityService,
  type LockedAccount,
} from "@/lib/services/admin-security-service";

export function LockedAccountsPanel() {
  if (!isSuperAdminFromToken()) return null;
  return <LockedAccountsPanelInner />;
}

function LockedAccountsPanelInner() {
  const [rows, setRows] = useState<LockedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminSecurityService.listLockedAccounts();
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlock = async (userId: string) => {
    setPendingId(userId);
    try {
      await adminSecurityService.unlockAccount(userId);
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locked accounts</CardTitle>
        <CardDescription>
          Brute-force locks auto-clear after 15 minutes. Other lock reasons require manual review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}
        {error && <div className="text-sm text-destructive py-4">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="text-sm text-muted-foreground py-4">No locked accounts.</div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.lockId} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{row.email}</span>
                    <Badge variant="secondary" className="text-xs">{row.reason}</Badge>
                    {row.unlocksAt && (
                      <span className="text-xs text-muted-foreground">
                        auto-unlocks {formatDistanceToNow(new Date(row.unlocksAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {row.name} · locked {formatDistanceToNow(new Date(row.lockedAt), { addSuffix: true })}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unlock(row.userId)}
                  disabled={pendingId === row.userId}
                >
                  {pendingId === row.userId ? "Unlocking…" : "Unlock"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
