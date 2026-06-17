import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { DollarSign, TrendingUp, TrendingDown, Users, Search, MoreHorizontal, Loader2 } from "lucide-react";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api-client";
import PricingConfigCard from "@/components/admin/PricingConfigCard";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubscriptionRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planName: string;
  planSlug: string;
  priceMonthly: string;
  priceYearly: string | null;
  status: string;
  billingInterval: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  createdAt: string;
}

interface BillingSummary {
  mrr: number;
  arr: number;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
}

interface BillingResponse {
  subscriptions: SubscriptionRow[];
  total: number;
  page: number;
  limit: number;
  summary: BillingSummary;
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-800",
  trialing: "bg-blue-100 text-blue-800",
  canceled: "bg-muted text-muted-foreground",
  past_due: "bg-red-100 text-red-800",
};

export default function BillingManagement() {
  const { t } = useTranslation();
  const STATUS_LABELS: Record<string, string> = {
    active:   t("status.activeStatus"),
    trialing: t("status.trial"),
    canceled: t("status.canceled"),
    past_due: t("status.pastDue"),
  };
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { can } = useAdminPermissions();
  const canUpdate = can("billing", "update");
  const canDelete = can("billing", "delete");
  const limit = 50;

  // Action state
  const [cancelDialogSub, setCancelDialogSub] = useState<SubscriptionRow | null>(null);
  const [refundDialogSub, setRefundDialogSub] = useState<SubscriptionRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await apiClient.get<BillingResponse>(
        `/api/admin/billing/subscriptions?${params.toString()}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadBilling"));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, t]);

  useEffect(() => { loadData(); }, [loadData]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const summary = data?.summary ?? { mrr: 0, arr: 0, active: 0, trialing: 0, pastDue: 0, canceled: 0 };
  const subscriptions = data?.subscriptions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  async function handleCancelSubscription() {
    if (!cancelDialogSub) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/api/admin/billing/subscriptions/${cancelDialogSub.id}/cancel`, {});
      toast.success(`Subscription for ${cancelDialogSub.userName} has been cancelled.`);
      setCancelDialogSub(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel subscription");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRefundSubscription() {
    if (!refundDialogSub) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/api/admin/billing/subscriptions/${refundDialogSub.id}/refund`, { reason: "admin_refund" });
      toast.success(`Refund issued for ${refundDialogSub.userName}.`);
      setRefundDialogSub(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue refund");
    } finally {
      setActionLoading(false);
    }
  }

  function formatAmount(sub: SubscriptionRow): string {
    const price = sub.billingInterval === "yearly" && sub.priceYearly
      ? Number(sub.priceYearly)
      : Number(sub.priceMonthly);
    if (price === 0) return t("tiers.free.name");
    const suffix = sub.billingInterval === "yearly" ? t("labels.yearlySuffix") : t("labels.monthlySuffix");
    return `$${price.toLocaleString()}${suffix}`;
  }

  function formatNextBilling(sub: SubscriptionRow): string {
    if (sub.status === "canceled" || !sub.currentPeriodEnd) return "—";
    return new Date(sub.currentPeriodEnd).toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("headings.billingAndSubscriptions")}</h1>
        <p className="text-muted-foreground text-sm">{t("messages.billingManagementIntro")}</p>
      </div>

      <PricingConfigCard />

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">MRR</p>
                <p className="text-2xl font-bold">${summary.mrr.toLocaleString()}</p>
              </div>
              <DollarSign className="h-5 w-5 text-green-500 mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">ARR</p>
                <p className="text-2xl font-bold">${summary.arr.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-500 mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t("status.activeStatus")}</p>
                <p className="text-2xl font-bold">{summary.active}</p>
                <p className="text-xs text-muted-foreground">{t("labels.trialingCount", { count: summary.trialing })}</p>
              </div>
              <Users className="h-5 w-5 text-purple-500 mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t("labels.atRisk")}</p>
                <p className="text-2xl font-bold text-red-600">{summary.pastDue + summary.canceled}</p>
                <p className="text-xs text-muted-foreground">{t("labels.pastDuePastDueCanceled", { pastDue: summary.pastDue, canceled: summary.canceled })}</p>
              </div>
              <TrendingDown className="h-5 w-5 text-red-500 mt-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("messages.searchByUserOrEmail")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("labels.callStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("labels.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("status.activeStatus")}</SelectItem>
            <SelectItem value="trialing">{t("status.trialing")}</SelectItem>
            <SelectItem value="past_due">{t("status.pastDue")}</SelectItem>
            <SelectItem value="canceled">{t("status.canceled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadData}>{t("actions.retry")}</Button>
        </div>
      )}

      {/* Subscription table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("labels.customer")}</TableHead>
              <TableHead>{t("labels.plan")}</TableHead>
              <TableHead>{t("labels.callStatus")}</TableHead>
              <TableHead>{t("labels.transactionAmount")}</TableHead>
              <TableHead>{t("labels.nextBilling")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("status.loadingSubscriptions")}
                </TableCell>
              </TableRow>
            ) : subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("messages.noSubscriptions")}
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{sub.userName}</p>
                      <p className="text-xs text-muted-foreground">{sub.userEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{sub.planName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{sub.billingInterval}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sub.status] ?? ""}`}>
                      {STATUS_LABELS[sub.status] ?? sub.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatAmount(sub)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatNextBilling(sub)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && (
                          <DropdownMenuItem
                            disabled={sub.status === "canceled"}
                            onClick={() => setRefundDialogSub(sub)}
                          >
                            {t("actions.issueRefund")}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={sub.status === "canceled"}
                              onClick={() => setCancelDialogSub(sub)}
                            >
                              {t("actions.cancelSubscription")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("labels.pageOfWithSubscriptions", { page, totalPages, total })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              {t("actions.previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              {t("actions.next")}
            </Button>
          </div>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelDialogSub} onOpenChange={(open) => !open && setCancelDialogSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              This will cancel <strong>{cancelDialogSub?.userName}</strong>'s{" "}
              <strong>{cancelDialogSub?.planName}</strong> subscription at the end of the current billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelDialogSub(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="destructive" onClick={handleCancelSubscription} disabled={actionLoading}>
              {actionLoading ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund confirmation dialog */}
      <Dialog open={!!refundDialogSub} onOpenChange={(open) => !open && setRefundDialogSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue refund?</DialogTitle>
            <DialogDescription>
              This will refund <strong>{refundDialogSub?.userName}</strong>'s last payment
              ({refundDialogSub ? formatAmount(refundDialogSub) : ""}) and cancel their subscription immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRefundDialogSub(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefundSubscription} disabled={actionLoading}>
              {actionLoading ? "Processing..." : "Confirm Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
