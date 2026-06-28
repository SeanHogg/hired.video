import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Gift, Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { getRoleDisplayLabel } from "@/lib/role-utils";

interface ReferredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  referredAt: string;
  converted: boolean;
}

interface ReferralGroup {
  affiliateId: string;
  referralCode: string;
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  referredCount: number;
  convertedCount: number;
  referredUsers: ReferredUser[];
}

interface ReferredUsersGrouped {
  groups: ReferralGroup[];
  totalReferred: number;
  totalConverted: number;
  truncated: boolean;
}

/**
 * "Group by referrer" view for /admin/users — every referred user bucketed
 * under the affiliate who brought them in. Self-fetching + SuperAdmin-only
 * (the whole /admin/impersonate API tree is SA-gated); the parent page only
 * toggles it on/off.
 */
export function ReferralGroups() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { format: formatTz } = useUserTimezone();

  const [data, setData] = useState<ReferredUsersGrouped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<ReferredUsersGrouped>("/api/admin/impersonate/users/referrals");
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadUsers"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
        {t("status.loadingUsers")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-destructive py-6">
        {error}
        <Button variant="ghost" size="sm" className="ml-2" onClick={load}>{t("actions.retry")}</Button>
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Gift className="h-8 w-8 mx-auto mb-3 opacity-40" />
          {t("messages.noReferralsYet")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("labels.referredUsers")}</p>
            <p className="text-2xl font-bold text-brand-purple">{data.totalReferred}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("labels.converted")}</p>
            <p className="text-2xl font-bold text-emerald-600">{data.totalConverted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("labels.referrers")}</p>
            <p className="text-2xl font-bold">{data.groups.length}</p>
          </CardContent>
        </Card>
      </div>

      {data.truncated && (
        <p className="text-xs text-muted-foreground">{t("messages.referralsTruncated")}</p>
      )}

      {/* Groups */}
      <div className="space-y-2">
        {data.groups.map((g) => {
          const isOpen = expanded.has(g.affiliateId);
          return (
            <Card key={g.affiliateId}>
              <button
                type="button"
                onClick={() => toggle(g.affiliateId)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{g.referrerName || g.referrerEmail}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <code className="rounded bg-muted px-1 py-0.5">{g.referralCode}</code>
                      <span className="ml-2">{g.referrerEmail}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="inline-flex items-center gap-1 text-sm font-medium">
                    <UserPlus className="h-3.5 w-3.5 text-brand-purple" />
                    {g.referredCount}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {g.convertedCount}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t divide-y">
                  {g.referredUsers.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">{t("messages.noReferralsYet")}</p>
                  ) : (
                    g.referredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => navigate(`/people/${u.id}`)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm truncate">{u.name || u.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          {u.role && (
                            <span className="text-muted-foreground">{getRoleDisplayLabel(u.role)}</span>
                          )}
                          {u.converted && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              {t("labels.converted")}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {formatTz(u.referredAt, { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                  {g.referredUsers.length < g.referredCount && (
                    <p className="px-4 py-2 text-xs text-muted-foreground">
                      {t("messages.referralsGroupTruncated", { shown: g.referredUsers.length, total: g.referredCount })}
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
