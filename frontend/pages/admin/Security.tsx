import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronLeft,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";
import { LockedAccountsPanel } from "@/components/admin/security/LockedAccountsPanel";
import { BotBlockGlobe } from "@/components/admin/security/BotBlockGlobe";
import { RegionWaitlistTable } from "@/components/admin/security/RegionWaitlistTable";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignupGroup {
  ip: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sampleEmails: string[];
  verifiedCount: number;
  bannedCount: number;
}

interface RecentResponse {
  windowHours: number;
  minCount: number;
  groups: SignupGroup[];
}

interface ByIpAccount {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isBanned: boolean;
  isSuspended: boolean;
  isActive: boolean;
  createdAt: string;
  signupUserAgent: string | null;
}

interface ByIpEvent {
  id: string;
  userId: string | null;
  email: string | null;
  kind: string;
  provider: string | null;
  success: boolean;
  failureReason: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ByIpResponse {
  ip: string;
  windowHours: number;
  accounts: ByIpAccount[];
  events: ByIpEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t("status.justNow");
  const m = Math.floor(ms / 60_000);
  if (m < 60) return t("status.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("status.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  return t("status.daysAgo", { count: d });
}

function accountStatusToneAndKey(a: { isBanned: boolean; isSuspended: boolean; isActive: boolean }): { key: string; tone: "ok" | "warn" | "bad" } {
  if (a.isBanned) return { key: "status.bannedStatus", tone: "bad" };
  if (a.isSuspended) return { key: "status.suspendedStatus", tone: "warn" };
  if (!a.isActive) return { key: "status.inactiveStatus", tone: "warn" };
  return { key: "status.activeStatus", tone: "ok" };
}

const TONE_STYLES: Record<"ok" | "warn" | "bad", string> = {
  ok:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  warn: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  bad:  "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Security() {
  const { t } = useTranslation();
  const [hours, setHours] = useState(24);
  const [minCount, setMinCount] = useState(2);
  const [data, setData] = useState<RecentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        hours: String(hours),
        minCount: String(minCount),
      });
      const res = await apiClient.get<RecentResponse>(
        `/api/admin/impersonate/security/signups/recent?${params.toString()}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadRecentSignups"));
    } finally {
      setLoading(false);
    }
  }, [hours, minCount, t]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  // Hooks must precede the early return below (#1871 — useMemo was after
  // the `selectedIp` drill-down return, changing hook order).
  const groups = data?.groups ?? [];
  const totalSpammySignups = useMemo(
    () => groups.reduce((sum, g) => sum + g.count, 0),
    [groups],
  );

  if (selectedIp) {
    return (
      <IpDrillDown ip={selectedIp} onBack={() => setSelectedIp(null)} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            {t("headings.securityAndAbuse")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("messages.securityIntro")}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={loadRecent} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("actions.refresh")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("labels.window")}</Label>
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("labels.last1Hour")}</SelectItem>
              <SelectItem value="6">{t("labels.last6Hours")}</SelectItem>
              <SelectItem value="24">{t("labels.last24Hours")}</SelectItem>
              <SelectItem value="168">{t("labels.last7Days")}</SelectItem>
              <SelectItem value="720">{t("labels.last30Days")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("labels.minAccountsPerIp")}</Label>
          <Select value={String(minCount)} onValueChange={(v) => setMinCount(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">{t("labels.threshold2Plus")}</SelectItem>
              <SelectItem value="3">{t("labels.threshold3Plus")}</SelectItem>
              <SelectItem value="5">{t("labels.threshold5Plus")}</SelectItem>
              <SelectItem value="10">{t("labels.threshold10Plus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {!loading && (
            <span dangerouslySetInnerHTML={{ __html: t("labels.summaryIpAccount", { ips: `<span class="font-semibold text-foreground">${groups.length}</span>`, accounts: `<span class="font-semibold text-foreground">${totalSpammySignups}</span>`, count: groups.length }) }} />
          )}
        </div>
      </div>

      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadRecent}>{t("actions.retry")}</Button>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("labels.ipAddress")}</TableHead>
              <TableHead className="text-right">{t("labels.accounts")}</TableHead>
              <TableHead className="text-right">{t("labels.verifiedColumn")}</TableHead>
              <TableHead className="text-right">{t("status.bannedStatus")}</TableHead>
              <TableHead>{t("labels.firstSignup")}</TableHead>
              <TableHead>{t("labels.lastSignup")}</TableHead>
              <TableHead>{t("labels.sampleEmails")}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("status.loadingEllipsis")}
                </TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {t("messages.noIpsCalmState", { minCount, hours })}
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => {
                // A wave is "more suspicious" when most accounts on the IP
                // are unverified — verified mostly means real users.
                const unverified = g.count - g.verifiedCount;
                const suspicion = unverified / g.count;
                return (
                  <TableRow key={g.ip} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedIp(g.ip)}>
                    <TableCell className="font-mono text-xs">
                      {g.ip}
                      {suspicion >= 0.8 && g.count >= 3 && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline-block ml-1.5 align-text-bottom" />
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{g.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{g.verifiedCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {g.bannedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <ShieldOff className="h-3 w-3" />
                          {g.bannedCount}
                        </span>
                      ) : (
                        <span>0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(g.firstSeen, t)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(g.lastSeen, t)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={g.sampleEmails.join(", ")}>
                      {g.sampleEmails.join(", ")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">{t("actions.viewArrow")}</Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Operator security surfaces — folded in from the former standalone
          /admin/security page (#2278). Each panel self-gates to SuperAdmin. */}
      <LockedAccountsPanel />
      <BotBlockGlobe />
      <RegionWaitlistTable />
    </div>
  );
}

// ── Drill-down ────────────────────────────────────────────────────────────────

function IpDrillDown({ ip, onBack }: { ip: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [hours, setHours] = useState(168); // default 7 days at the per-IP level
  const [data, setData] = useState<ByIpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ ip, hours: String(hours) });
      const res = await apiClient.get<ByIpResponse>(
        `/api/admin/impersonate/security/signups/by-ip?${params.toString()}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadIpDetail"));
    } finally {
      setLoading(false);
    }
  }, [ip, hours, t]);

  useEffect(() => { load(); }, [load]);

  const accounts = data?.accounts ?? [];
  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            {t("actions.back")}
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-mono">{ip}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("messages.ipDrillDownIntro")}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("labels.window")}</Label>
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">{t("labels.last24Hours")}</SelectItem>
                <SelectItem value="168">{t("labels.last7Days")}</SelectItem>
                <SelectItem value="720">{t("labels.last30Days")}</SelectItem>
                <SelectItem value="2160">{t("labels.last90Days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("actions.refresh")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={load}>{t("actions.retry")}</Button>
        </div>
      )}

      {/* Accounts created from this IP */}
      <div>
        <h2 className="text-sm font-semibold mb-2">
          {t("messages.signupsAccountsRegistered")}
          <span className="text-muted-foreground font-normal ml-2">({accounts.length})</span>
        </h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labels.created")}</TableHead>
                <TableHead>{t("fields.email.label")}</TableHead>
                <TableHead>{t("labels.name")}</TableHead>
                <TableHead>{t("labels.callStatus")}</TableHead>
                <TableHead>{t("labels.verifiedColumn")}</TableHead>
                <TableHead>{t("labels.userAgent")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    {t("status.loadingEllipsis")}
                  </TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("messages.noAccountsForIp")}
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => {
                  const status = accountStatusToneAndKey(a);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">{a.email}</TableCell>
                      <TableCell className="text-sm">{a.name}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TONE_STYLES[status.tone]}`}>
                          {t(status.key)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{a.emailVerified ? t("labels.yes") : t("labels.no")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={a.signupUserAgent ?? ""}>
                        {a.signupUserAgent ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Login + register events from this IP */}
      <div>
        <h2 className="text-sm font-semibold mb-2">
          {t("messages.authEventsFromIp")}
          <span className="text-muted-foreground font-normal ml-2">({events.length})</span>
        </h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labels.timeColumn")}</TableHead>
                <TableHead>{t("labels.kind")}</TableHead>
                <TableHead>{t("labels.provider")}</TableHead>
                <TableHead>{t("fields.email.label")}</TableHead>
                <TableHead>{t("labels.result")}</TableHead>
                <TableHead>{t("labels.userAgent")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    {t("status.loadingEllipsis")}
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("messages.noAuthEventsForIp")}
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.kind}</code>
                    </TableCell>
                    <TableCell className="text-xs">{e.provider ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.email ?? "—"}</TableCell>
                    <TableCell>
                      {e.success ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TONE_STYLES.ok}`}>
                          {t("status.successLower")}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TONE_STYLES.bad}`}>
                          {e.failureReason ? t("status.failWithReason", { reason: e.failureReason }) : t("status.failLower")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate" title={e.userAgent ?? ""}>
                      {e.userAgent ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
