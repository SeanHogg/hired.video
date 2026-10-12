/**
 * Account Audit Log — single source of truth for "what's happened on
 * this account". Unifies sessions / password changes / email changes /
 * account locks / impersonation events / admin actions into one stream
 * fetched from /api/audit/me.
 *
 * Self-gating: when no events come back, the empty state still renders
 * so the user knows the panel works rather than wondering whether the
 * fetch failed silently. Consumers don't pass a `visible` boolean —
 * mount it inside the security tab and it owns its own loading /
 * empty / error states.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Info,
  LockKeyhole,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

interface AuditEvent {
  id: string;
  kind:
    | "login"
    | "session_revoked"
    | "password_changed"
    | "email_change_requested"
    | "email_changed"
    | "account_locked"
    | "account_unlocked"
    | "impersonation_started"
    | "impersonation_ended"
    | "admin_action";
  occurredAt: string;
  title: string;
  detail: string | null;
  severity: "info" | "warn" | "critical";
  metadata?: Record<string, unknown>;
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function iconFor(kind: AuditEvent["kind"], severity: AuditEvent["severity"]) {
  if (severity === "critical") return <ShieldAlert className="h-4 w-4 text-red-600" />;
  if (kind === "login") return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
  if (kind === "password_changed") return <LockKeyhole className="h-4 w-4 text-primary" />;
  if (severity === "warn") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function badgeFor(severity: AuditEvent["severity"]) {
  if (severity === "critical") return <Badge variant="destructive" className="text-[10px]">Critical</Badge>;
  if (severity === "warn") return <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800">Notable</Badge>;
  return null;
}

export function AccountAuditLogPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<AuditEvent[]>("/api/audit/me?limit=100", null as any)
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data ?? []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message ?? "Couldn't load audit log.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Audit Log
        </CardTitle>
        <CardDescription>
          Every security-relevant event on your account — logins, password changes, email
          updates, locks, and any admin actions taken on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive">
            {error}{" "}
            <Button variant="link" size="sm" className="px-0" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}
        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No audit events recorded yet. New events appear here as they happen.
          </p>
        )}
        {!loading && !error && events.length > 0 && (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 border-b last:border-0 pb-3 last:pb-0">
                <div className="mt-0.5">{iconFor(e.kind, e.severity)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{e.title}</span>
                    {badgeFor(e.severity)}
                  </div>
                  {e.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.detail}</p>
                  )}
                </div>
                <span
                  className="text-xs text-muted-foreground whitespace-nowrap inline-flex items-center gap-1"
                  title={new Date(e.occurredAt).toLocaleString()}
                >
                  <Clock className="h-3 w-3" /> {fmtRelative(e.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
