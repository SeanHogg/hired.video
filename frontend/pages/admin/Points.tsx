/**
 * SuperAdmin gamification page. Three tabs:
 *   • Overview      — global stats, top earners, action catalog
 *   • User lookup   — full picture for one user, suspend/reinstate/adjust
 *   • Fraud queue   — open flags, resolve with optional reinstate
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, ShieldAlert, AlertOctagon, Plus, Minus, RotateCcw, Gift } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  pointsAdminService,
  type PointsAdminDashboard,
  type PointsAdminUserView,
  type PointsFraudFlag,
  type PointsTopEarner,
  type UserRedemption,
} from "@/lib/services/points-service";

export default function AdminPointsPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Points & Rewards Admin</h1>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="user">User Lookup</TabsTrigger>
          <TabsTrigger value="fraud">Fraud Queue</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="user" className="mt-4">
          <UserTab />
        </TabsContent>
        <TabsContent value="fraud" className="mt-4">
          <FraudTab />
        </TabsContent>
        <TabsContent value="redemptions" className="mt-4">
          <RedemptionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────

function OverviewTab() {
  const dash = useQuery<PointsAdminDashboard>({
    queryKey: ["admin", "points", "dashboard"],
    queryFn: () => pointsAdminService.getDashboard(),
  });

  const top = useQuery<PointsTopEarner[]>({
    queryKey: ["admin", "points", "top"],
    queryFn: () => pointsAdminService.getTopEarners(25),
  });

  if (dash.isLoading || !dash.data) {
    return <Loader2 className="h-5 w-5 animate-spin" />;
  }

  const stats = dash.data.stats;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Suspended" value={stats.suspendedUsers} tone={stats.suspendedUsers > 0 ? "warn" : "neutral"} />
        <StatCard label="Total balance" value={stats.totalBalance} />
        <StatCard label="Lifetime earned" value={stats.totalEarned} />
        <StatCard label="Lifetime redeemed" value={stats.totalRedeemed} />
        <StatCard label="Open fraud flags" value={stats.openFraudFlags} tone={stats.openFraudFlags > 0 ? "warn" : "neutral"} />
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Action catalog</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">Daily cap</TableHead>
              <TableHead className="text-center">Gated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dash.data.catalog.actions.map((a) => (
              <TableRow key={a.key}>
                <TableCell className="font-mono text-xs">{a.key}</TableCell>
                <TableCell>{a.label}</TableCell>
                <TableCell className="text-xs">{a.roles.join(", ") || "all"}</TableCell>
                <TableCell className="text-right tabular-nums">{a.points}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {a.dailyCapPoints ?? "—"}
                </TableCell>
                <TableCell className="text-center">{a.requiresUserTaskGate ? "✓" : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Top earners</h3>
        {top.isLoading || !top.data ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Lifetime earned</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.data.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-mono text-xs">{u.userId}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.lifetimeEarned.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.balance.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn";
}) {
  return (
    <Card className={`p-4 ${tone === "warn" ? "border-amber-500" : ""}`}>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
    </Card>
  );
}

// ── User lookup ─────────────────────────────────────────────────────

function UserTab() {
  const [userId, setUserId] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const qc = useQueryClient();

  const view = useQuery<PointsAdminUserView>({
    queryKey: ["admin", "points", "user", activeId],
    queryFn: () => pointsAdminService.getUser(activeId!),
    enabled: !!activeId,
  });

  const adjustMut = useMutation({
    mutationFn: (vars: { userId: string; delta: number; reason: string }) =>
      pointsAdminService.adjust(vars.userId, vars.delta, vars.reason),
    onSuccess: () => {
      toast.success("Adjustment applied.");
      qc.invalidateQueries({ queryKey: ["admin", "points"] });
    },
    onError: (e) => toast.error("Adjust failed.", { description: String(e) }),
  });

  const suspendMut = useMutation({
    mutationFn: (vars: { userId: string; reason: string }) =>
      pointsAdminService.suspend(vars.userId, vars.reason),
    onSuccess: () => {
      toast.success("Points suspended.");
      qc.invalidateQueries({ queryKey: ["admin", "points"] });
    },
  });

  const reinstateMut = useMutation({
    mutationFn: (id: string) => pointsAdminService.reinstate(id),
    onSuccess: () => {
      toast.success("Points reinstated.");
      qc.invalidateQueries({ queryKey: ["admin", "points"] });
    },
  });

  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="flex gap-2">
          <Input
            placeholder="User ID (uuid)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <Button
            onClick={() => setActiveId(userId.trim() || null)}
            disabled={!userId.trim()}
          >
            <Search className="h-4 w-4 mr-1" /> Look up
          </Button>
        </div>
      </Card>

      {activeId && view.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
      {activeId && view.data && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Balance</div>
                <div className="text-3xl font-bold tabular-nums">
                  {view.data.summary.balance.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {view.data.summary.lifetimeEarned.toLocaleString()} earned ·{" "}
                  {view.data.summary.lifetimeRedeemed.toLocaleString()} redeemed
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Streak: {view.data.summary.streak.current} (longest{" "}
                  {view.data.summary.streak.longest}) · Self-tasks {view.data.summary.userTaskGate.completed}/{view.data.summary.userTaskGate.threshold}
                </div>
              </div>
              <div>
                {view.data.summary.isSuspended ? (
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-800">
                      SUSPENDED
                    </span>
                    <Button
                      size="sm"
                      onClick={() => reinstateMut.mutate(activeId)}
                      disabled={reinstateMut.isPending}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Reinstate
                    </Button>
                  </div>
                ) : (
                  <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
                    ACTIVE
                  </span>
                )}
              </div>
            </div>

            {view.data.summary.suspendedReason && (
              <div className="mt-3 text-xs text-amber-700">
                Reason: {view.data.summary.suspendedReason}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="font-semibold mb-2 text-sm">Manual adjust</h4>
              <Input
                placeholder="Delta (positive or negative)"
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
              />
              <Textarea
                className="mt-2"
                placeholder="Reason (required, audit trail)"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
              <Button
                size="sm"
                className="mt-2"
                disabled={!adjustDelta || !adjustReason.trim() || adjustMut.isPending}
                onClick={() =>
                  adjustMut.mutate({
                    userId: activeId,
                    delta: parseInt(adjustDelta, 10),
                    reason: adjustReason.trim(),
                  })
                }
              >
                {parseInt(adjustDelta || "0", 10) >= 0 ? (
                  <Plus className="h-3 w-3 mr-1" />
                ) : (
                  <Minus className="h-3 w-3 mr-1" />
                )}
                Apply
              </Button>
            </Card>

            <Card className="p-4">
              <h4 className="font-semibold mb-2 text-sm flex items-center gap-1">
                <ShieldAlert className="h-4 w-4" /> Suspend points
              </h4>
              <Textarea
                placeholder="Reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                className="mt-2"
                disabled={!suspendReason.trim() || suspendMut.isPending || view.data.summary.isSuspended}
                onClick={() => suspendMut.mutate({ userId: activeId, reason: suspendReason.trim() })}
              >
                Suspend
              </Button>
            </Card>
          </div>

          <Card className="p-4">
            <h4 className="font-semibold mb-2 text-sm">Fraud flags ({view.data.fraudFlags.length})</h4>
            {view.data.fraudFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flags.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.data.fraudFlags.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.kind}</TableCell>
                      <TableCell>{f.severity}</TableCell>
                      <TableCell>{f.status}</TableCell>
                      <TableCell className="text-xs">{new Date(f.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="p-4">
            <h4 className="font-semibold mb-2 text-sm">Activity (most recent)</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.data.activity.slice(0, 50).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.delta > 0 ? "+" : ""}{a.delta}
                    </TableCell>
                    <TableCell className="text-xs">{a.category}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}

// ── Fraud queue ─────────────────────────────────────────────────────

// ── Redemptions queue ──────────────────────────────────────────────

function RedemptionsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"queue" | "fulfilled" | "failed" | "cancelled">("queue");

  const redemptions = useQuery<UserRedemption[]>({
    queryKey: ["admin", "points", "redemptions", filter],
    queryFn: () => pointsAdminService.getRedemptions(filter === "queue" ? undefined : filter, 200),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => pointsAdminService.approveRedemption(id),
    onSuccess: () => {
      toast.success("Redemption approved and dispatched.");
      qc.invalidateQueries({ queryKey: ["admin", "points", "redemptions"] });
    },
    onError: (e) => toast.error("Approve failed.", { description: String(e) }),
  });

  const cancelMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      pointsAdminService.cancelRedemption(vars.id, vars.reason),
    onSuccess: () => {
      toast.success("Redemption cancelled and points refunded.");
      qc.invalidateQueries({ queryKey: ["admin", "points", "redemptions"] });
    },
  });

  if (redemptions.isLoading || !redemptions.data) {
    return <Loader2 className="h-5 w-5 animate-spin" />;
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Gift className="h-4 w-4" /> Redemptions ({redemptions.data.length})
        </h3>
        <div className="flex gap-1 text-xs">
          {(["queue", "fulfilled", "failed", "cancelled"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "queue" ? "Pending + queued" : f}
            </Button>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>KYC</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {redemptions.data.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.userId}</TableCell>
              <TableCell className="text-xs">{r.kind}</TableCell>
              <TableCell className="text-xs">{r.skuId}</TableCell>
              <TableCell className="text-right tabular-nums">{r.pointsCost.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">${(r.valueCents / 100).toFixed(2)}</TableCell>
              <TableCell>{r.status}</TableCell>
              <TableCell>{r.requiresKyc ? (r.kycCompletedAt ? "✓" : "needed") : ""}</TableCell>
              <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString()}</TableCell>
              <TableCell className="text-right space-x-1">
                {(r.status === "pending" || r.status === "queued") && (
                  <>
                    <Button
                      size="sm"
                      disabled={approveMut.isPending}
                      onClick={() => approveMut.mutate(r.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancelMut.isPending}
                      onClick={() => {
                        const reason = prompt("Cancel reason?");
                        if (reason) cancelMut.mutate({ id: r.id, reason });
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {r.failureReason && (
                  <span className="text-xs text-red-600">{r.failureReason}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function FraudTab() {
  const qc = useQueryClient();
  const queue = useQuery<PointsFraudFlag[]>({
    queryKey: ["admin", "points", "fraud", "queue"],
    queryFn: () => pointsAdminService.getFraudQueue(100),
  });

  const resolveMut = useMutation({
    mutationFn: (vars: {
      flagId: string;
      decision: "confirmed" | "dismissed";
      notes?: string;
      reinstate?: boolean;
    }) =>
      pointsAdminService.resolveFraud(
        vars.flagId,
        vars.decision,
        vars.notes,
        vars.reinstate,
      ),
    onSuccess: () => {
      toast.success("Flag resolved.");
      qc.invalidateQueries({ queryKey: ["admin", "points"] });
    },
  });

  if (queue.isLoading || !queue.data) {
    return <Loader2 className="h-5 w-5 animate-spin" />;
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-2 flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 text-amber-500" />
        Open fraud flags ({queue.data.length})
      </h3>
      {queue.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">All clear.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Auto-suspended</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.data.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono text-xs">{f.userId}</TableCell>
                <TableCell className="font-mono text-xs">{f.kind}</TableCell>
                <TableCell>{f.severity}</TableCell>
                <TableCell>{f.autoSuspended ? "yes" : ""}</TableCell>
                <TableCell className="text-xs">{new Date(f.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={resolveMut.isPending}
                    onClick={() =>
                      resolveMut.mutate({ flagId: f.id, decision: "confirmed" })
                    }
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveMut.isPending}
                    onClick={() =>
                      resolveMut.mutate({
                        flagId: f.id,
                        decision: "dismissed",
                        reinstate: true,
                      })
                    }
                  >
                    Dismiss + reinstate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
