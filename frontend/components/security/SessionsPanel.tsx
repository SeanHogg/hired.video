/**
 * SessionsPanel — drop-in panel for /security/sessions and the
 * Settings → Security tab. Self-fetches via useSessions and self-gates
 * each row via SessionRow. Returns null when not authenticated rather
 * than rendering a "please log in" placeholder — the page-level shell
 * already handles the auth gate.
 */

import { useAuth } from "@/lib/auth";
import { useSessions } from "@/hooks/use-sessions";
import { SessionRow } from "./SessionRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SessionsPanel() {
  const { isAuthenticated } = useAuth();
  const { sessions, loading, error, revoke, revokeAllOthers } = useSessions();

  if (!isAuthenticated) return null;

  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          Up to 3 devices can be signed in at once. Sessions go inactive after 14 days
          without use, or 30 days total — whichever comes first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}
        {error && <div className="text-sm text-destructive py-4">{error}</div>}
        {!loading && !error && sessions.length === 0 && (
          <div className="text-sm text-muted-foreground py-4">No active sessions.</div>
        )}
        {!loading && !error && sessions.length > 0 && (
          <>
            <div className="divide-y">
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} onRevoke={revoke} />
              ))}
            </div>
            {otherCount > 0 && (
              <div className="pt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={revokeAllOthers}>
                  Sign out all other devices
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
