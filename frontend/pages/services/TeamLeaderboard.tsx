// TeamLeaderboard — agency / employer team rollup. Per-member pipeline
// activity over a configurable window (default 30 days). Closes the
// "Performance dashboards & team leaderboards" Pricing claim — see audit
// memory: project_gap_register pointer to README "Consolidated Gap Register".

import { useEffect, useMemo, useState } from "react";
import { Trophy, Loader2, Building2 } from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ServicesNav from "@/components/services/ServicesNav";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { recruitService, type RecruitScope } from "@/lib/services/recruit-service";

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

export default function TeamLeaderboard() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { toast } = useToast();

  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    recruitService
      .getMyScope()
      .then((s) => {
        if (cancelled) return;
        setScope(s);
        setCompanyId(s.primaryCompanyId ?? s.companies[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: "Failed to load company scope",
            description: "Make sure you own or belong to a company.",
            variant: "destructive",
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16">
          <div className="max-w-6xl mx-auto p-6">
            <ServicesNav hasCompanyAccess={(scope?.companies.length ?? 0) > 0} />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                  <Trophy className="w-7 h-7 text-primary" />
                  Team leaderboard
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Per-recruiter pipeline activity for this company. Sourcing, stage moves, hires.
                </p>
              </div>
              <div className="flex items-center gap-2">
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
            </div>

            {totals && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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

            <p className="text-xs text-muted-foreground mt-3">
              Touchpoints count the last {days} days; candidates / active / hires
              are all-time counts of pipeline ownership across this team's posted jobs.
            </p>
          </div>
          <Footer />
        </div>
      </div>
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
