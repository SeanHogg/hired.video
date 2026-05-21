// TeamLeaderboardPanel — per-recruiter pipeline activity rollup, rendered
// as the "Team" tab on /companies. The previous /services/team URL now
// redirects here. Closes the "Performance dashboards & team leaderboards"
// Pricing claim.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";

interface LeaderboardRow {
  userId: string;
  name: string;
  role: string;
  candidates: number;
  active: number;
  hires: number;
  rejected: number;
  submitted: number;
  touchpoints: number;
  stageChanges: number;
  lastActivityAt: string | null;
}

interface LeaderboardResponse {
  rows: LeaderboardRow[];
  days: number;
  generatedAt: string;
}

export default function TeamLeaderboardPanel() {
  const { scope, companyId, setCompanyId, hasNoCompany } = useCurrentCompanyScope();

  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<LeaderboardResponse>(`/api/services/team/leaderboard?companyId=${companyId}&days=${days}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, days]);

  const totals = useMemo(() => {
    if (!data) return null;
    return data.rows.reduce(
      (acc, r) => ({
        candidates: acc.candidates + r.candidates,
        hires: acc.hires + r.hires,
        active: acc.active + r.active,
        touchpoints: acc.touchpoints + r.touchpoints,
      }),
      { candidates: 0, hires: 0, active: 0, touchpoints: 0 },
    );
  }, [data]);

  if (hasNoCompany) {
    return (
      <div className="text-center text-sm text-muted-foreground py-12">
        Create or join a company to see per-recruiter pipeline activity here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {scope && scope.companies.length > 1 && (
          <Select value={companyId ?? ""} onValueChange={(v) => setCompanyId(v)}>
            <SelectTrigger className="w-[220px]">
              <Building2 className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              {scope.companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={String(days)} onValueChange={(v) => setDays(Number.parseInt(v, 10))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Candidates" value={totals.candidates} />
          <KpiCard label="Active" value={totals.active} />
          <KpiCard label="Hires" value={totals.hires} />
          <KpiCard label="Touchpoints" value={totals.touchpoints} />
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading leaderboard…
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No team members in this company yet, or no pipeline activity to rank.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2 w-8">#</th>
                    <th className="text-left py-2 px-2">Member</th>
                    <th className="text-right py-2 px-2">Candidates</th>
                    <th className="text-right py-2 px-2">Active</th>
                    <th className="text-right py-2 px-2">Hires</th>
                    <th className="text-right py-2 px-2">Submitted</th>
                    <th className="text-right py-2 px-2">Touchpoints</th>
                    <th className="text-right py-2 px-2">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, idx) => (
                    <tr key={r.userId} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 px-2 font-medium">
                        {r.name}
                        <span className="ml-2 text-[11px] text-muted-foreground uppercase">
                          {r.role}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{r.candidates}</td>
                      <td className="py-2 px-2 text-right">{r.active}</td>
                      <td className="py-2 px-2 text-right font-semibold text-green-700">
                        {r.hires}
                      </td>
                      <td className="py-2 px-2 text-right">{r.submitted}</td>
                      <td className="py-2 px-2 text-right">{r.touchpoints}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground text-xs">
                        {r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Touchpoints count the last {days} days; candidates / active / hires
        are all-time counts of pipeline ownership across this team's posted jobs.
      </p>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
