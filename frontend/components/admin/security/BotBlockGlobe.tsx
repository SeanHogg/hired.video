/**
 * BotBlockGlobe — SuperAdmin-only choropleth showing where bot
 * blocks originated, plus a reason-breakdown legend and stat cards.
 *
 * Self-gates: returns null when not SuperAdmin.
 *
 * Uses a CSS-only choropleth (countries → coloured boxes) instead of
 * react-globe.gl / react-simple-maps to keep the bundle small. The
 * SVG approach is intentional: it gives us 95% of the visualization
 * value for ~0KB of dependency cost. Upgrade to `react-globe.gl`
 * later if the operator wants the rotating-3D wow factor.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import {
  adminSecurityService,
  type BotStats,
  type BotEvent,
} from "@/lib/services/admin-security-service";

export function BotBlockGlobe() {
  if (!isSuperAdminFromToken()) return null;
  return <BotBlockGlobeInner />;
}

const RANGES = ["1h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

const REASON_COLORS: Record<string, string> = {
  TURNSTILE_FAIL: "#f97316",
  HONEYPOT_HIT: "#a855f7",
  RATE_LIMIT: "#3b82f6",
  DISPOSABLE_EMAIL: "#06b6d4",
  MX_FAIL: "#10b981",
  BREACHED_PASSWORD: "#ef4444",
  GEO_BLOCKED: "#eab308",
  OFAC_BLOCKED: "#dc2626",
  BRUTE_FORCE: "#f43f5e",
};

function BotBlockGlobeInner() {
  const [range, setRange] = useState<Range>("24h");
  const [stats, setStats] = useState<BotStats | null>(null);
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([
        adminSecurityService.getBotStats(range),
        adminSecurityService.listBotEvents(50),
      ]);
      setStats(s);
      setEvents(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void refresh();
    // Live-feed: 5-second poll while the panel is mounted. Cheap because
    // the backend aggregates with a single COUNT per group, and the
    // bot_block_events table is already indexed on (created_at). When
    // the operator switches range, the polling restarts on the new range.
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const topCountry = stats?.byCountry
    .filter((r) => r.countryCode)
    .sort((a, b) => b.count - a.count)[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Bot block telemetry</CardTitle>
            <CardDescription>
              Every gate (Turnstile, honeypot, disposable, MX, breach, geo, OFAC, brute-force)
              writes here. Hashed IP + email-domain only — no PII.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={r === range ? "default" : "outline"}
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}
        {error && <div className="text-sm text-destructive py-4">{error}</div>}
        {!loading && !error && stats && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total blocks" value={stats.total.toLocaleString()} />
              <StatCard label="Window" value={stats.range} />
              <StatCard
                label="Top country"
                value={topCountry?.countryCode ?? "—"}
                sub={topCountry ? `${topCountry.count} blocks` : undefined}
              />
              <StatCard
                label="Distinct countries"
                value={stats.byCountry.filter((c) => c.countryCode).length.toString()}
              />
            </div>

            {/* Country choropleth */}
            <div>
              <h3 className="font-medium text-sm mb-3">By country</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {stats.byCountry
                  .filter((r) => r.countryCode)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 24)
                  .map((row) => (
                    <CountryTile
                      key={row.countryCode!}
                      countryCode={row.countryCode!}
                      count={row.count}
                      max={topCountry?.count ?? 1}
                    />
                  ))}
              </div>
            </div>

            {/* Reason breakdown */}
            <div>
              <h3 className="font-medium text-sm mb-3">By reason</h3>
              <div className="space-y-2">
                {stats.byReason
                  .sort((a, b) => b.count - a.count)
                  .map((row) => (
                    <ReasonBar key={row.reason} reason={row.reason} count={row.count} total={stats.total} />
                  ))}
              </div>
            </div>

            {/* Recent events */}
            <div>
              <h3 className="font-medium text-sm mb-3">Recent events</h3>
              <div className="text-xs space-y-1 max-h-64 overflow-auto">
                {events.map((e) => (
                  <div key={e.id} className="flex gap-2 items-center py-1 border-b last:border-b-0">
                    <Badge
                      variant="outline"
                      className="text-[10px]"
                      style={{ borderColor: REASON_COLORS[e.reason] ?? "#666" }}
                    >
                      {e.reason}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {e.countryCode ?? "??"}
                    </span>
                    <span className="text-muted-foreground truncate">{e.endpoint}</span>
                    {e.emailDomain && (
                      <span className="text-muted-foreground truncate">@{e.emailDomain}</span>
                    )}
                    <span className="ml-auto text-muted-foreground text-[11px] shrink-0">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-sm text-muted-foreground py-2">No events.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function CountryTile({ countryCode, count, max }: { countryCode: string; count: number; max: number }) {
  const intensity = Math.max(0.15, Math.min(1, count / max));
  return (
    <div
      className="p-3 rounded border flex flex-col items-center justify-center"
      style={{ background: `rgba(220, 38, 38, ${intensity})` }}
      title={`${countryCode}: ${count} blocks`}
    >
      <div className="font-mono text-sm font-bold">{countryCode}</div>
      <div className="text-xs">{count}</div>
    </div>
  );
}

function ReasonBar({ reason, count, total }: { reason: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{reason}</span>
        <span className="text-muted-foreground">
          {count} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{
            width: `${pct}%`,
            background: REASON_COLORS[reason] ?? "#666",
          }}
        />
      </div>
    </div>
  );
}
