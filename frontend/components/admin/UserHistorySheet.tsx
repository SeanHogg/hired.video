import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";

// Sheet that shows a single user's auth history: signup IP/UA pinned to
// the user row, plus the per-event login_events stream. Powers the
// "View History" action on /admin/users.

interface HistoryAccount {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
  emailVerified: boolean;
  isBanned: boolean;
  isSuspended: boolean;
  isActive: boolean;
  signupIp: string | null;
  signupUserAgent: string | null;
}

interface HistoryEvent {
  id: string;
  kind: string;
  provider: string | null;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface HistoryResponse {
  account: HistoryAccount;
  events: HistoryEvent[];
}

interface UserHistorySheetProps {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function UserHistorySheet({ userId, onOpenChange }: UserHistorySheetProps) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<HistoryResponse>(
        `/api/admin/impersonate/users/${id}/history?limit=200`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      // Clear stale data so the next open doesn't briefly flash the
      // previous user's history.
      setData(null);
      return;
    }
    load(userId);
  }, [userId, load]);

  const open = userId !== null;
  const account = data?.account;
  const events = data?.events ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Account history</SheetTitle>
          <SheetDescription>
            Signup attribution and per-event login history for this user.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mt-6 text-sm text-destructive">{error}</div>
        )}

        {loading && !data && (
          <div className="mt-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
            Loading…
          </div>
        )}

        {account && (
          <div className="mt-6 space-y-6">
            {/* Account summary */}
            <Card className="p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium truncate">{account.email}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(account.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Last login</span>
                <span>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Email verified</span>
                <span>{account.emailVerified ? "yes" : "no"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <span>
                  {account.isBanned
                    ? "banned"
                    : account.isSuspended
                    ? "suspended"
                    : account.isActive
                    ? "active"
                    : "inactive"}
                </span>
              </div>
              <div className="flex justify-between gap-4 pt-2 border-t">
                <span className="text-muted-foreground">Signup IP</span>
                <span className="font-mono text-xs">{account.signupIp ?? "— (legacy)"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Signup user-agent</span>
                <span className="text-xs text-right truncate max-w-[280px]" title={account.signupUserAgent ?? ""}>
                  {account.signupUserAgent ?? "— (legacy)"}
                </span>
              </div>
            </Card>

            {/* Auth events */}
            <div>
              <h3 className="text-sm font-semibold mb-2">
                Auth events
                <span className="text-muted-foreground font-normal ml-2">({events.length})</span>
              </h3>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                          No login events recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(e.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {e.kind}{e.provider ? `·${e.provider}` : ""}
                            </code>
                          </TableCell>
                          <TableCell className="text-xs">
                            {e.success ? (
                              <span className="text-emerald-700 dark:text-emerald-400">success</span>
                            ) : (
                              <span className="text-red-700 dark:text-red-400">
                                fail{e.failureReason ? ` · ${e.failureReason}` : ""}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.ipAddress ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
