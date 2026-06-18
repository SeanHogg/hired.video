// SuperAdmin — AI vendor / gateway observability (#2210).
//
// End users never see which LLM serves their requests; the gateway treats our
// per-use-case `modelHint` as a HINT, not a hard pin, and may silently swap
// vendors on cooldown / outage / plan mismatch. For latency-pinned use cases
// (notably `match`, which expects sub-200ms Cerebras) a swap is an SLA breach.
//
// Panes:
//   1. Model substitutions  — totalSubstituted over a selectable window + a
//      table of requested→resolved swaps. Rows whose featureKey rolls up to a
//      latency-critical use case (`match`) are flagged as SLA breaches. (#2210)
//   2. Use-case profiles     — model hint + temp + cross-vendor fallback chain.
//   3. Catalog audit         — our model hints joined vs the live gateway
//      catalog; hints the gateway no longer carries are flagged as drift.
//   4. Live gateway models    — what the gateway can actually resolve now.
//   5. Gateway usage          — per-tenant aggregated cost.
//
// Wired to /api/admin/impersonate/ai/* (aiVendorRoutes), mounted on the SA tree
// so the SuperAdmin middleware is applied at the parent. Gated behind the
// admin-permissions resource "aiVendors" + the role-access manifest, exactly
// like every other admin tab. These are admin-low-frequency reads — react-query
// with a modest staleTime, no bespoke cache layer.

import { useState } from "react";
import {
  Loader2,
  Cpu,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Server,
  ListChecks,
  DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Reads are low-frequency admin observability — keep them fresh-ish but avoid
// hammering the gateway as the SA clicks between admin tabs.
const STALE_MS = 60_000;

// Use cases whose latency budget makes a silent substitution an SLA breach.
// `match` expects a sub-200ms Cerebras path; a swap there is ~50× the latency
// budget. Kept in sync with the gateway's latency-pinned profiles.
const SLA_CRITICAL_USE_CASES = new Set(["match"]);

// The gateway substitution projection stamps the originating `featureKey`, which
// for the latency-pinned path is the `match` use case (e.g. "match" / "match_*").
function isSlaBreach(featureKey: string | null | undefined): boolean {
  if (!featureKey) return false;
  const head = featureKey.split(/[._:/]/)[0];
  return SLA_CRITICAL_USE_CASES.has(head) || SLA_CRITICAL_USE_CASES.has(featureKey);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── Wire shapes ───────────────────────────────────────────────────────────

interface ProfileRow {
  modelHint: string;
  temperature: number;
  maxTokens: number | null;
}

interface UseCaseRow extends ProfileRow {
  useCase: string;
  fallbacks: ProfileRow[];
  featureKeys: string[];
}

interface CatalogAudit {
  configured: boolean;
  hints: { modelHint: string; inCatalog: boolean | null }[];
  // Tolerant of additional fields the audit service may add.
  [k: string]: unknown;
}

interface SubstitutionSwap {
  requestedModel: string | null;
  resolvedModel: string | null;
  featureKey: string | null;
  count: number;
  lastSeen: string | null;
}

interface SubstitutionsResponse {
  windowDays: number;
  since: string;
  totalSubstituted: number;
  bySwap: SubstitutionSwap[];
}

interface ModelsResponse {
  configured?: boolean;
  data?: { id?: string; name?: string; [k: string]: unknown }[];
  [k: string]: unknown;
}

interface UsageTenant {
  tenant?: string;
  tenantId?: string;
  costCents?: number;
  cost?: number;
  requests?: number;
  [k: string]: unknown;
}

interface UsageResponse {
  configured?: boolean;
  tenants?: UsageTenant[];
  data?: UsageTenant[];
  totalCostCents?: number;
  [k: string]: unknown;
}

// ── Data hooks ────────────────────────────────────────────────────────────

function useSubstitutions(days: number) {
  return useQuery({
    queryKey: ["admin", "ai", "substitutions", days],
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiClient.get<SubstitutionsResponse>(
        `/api/admin/impersonate/ai/substitutions?days=${days}`,
      );
      return res.data;
    },
  });
}

function useUseCases() {
  return useQuery({
    queryKey: ["admin", "ai", "use-cases"],
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiClient.get<UseCaseRow[]>(
        `/api/admin/impersonate/ai/use-cases`,
      );
      return res.data;
    },
  });
}

function useCatalogAudit() {
  return useQuery({
    queryKey: ["admin", "ai", "catalog-audit"],
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiClient.get<CatalogAudit>(
        `/api/admin/impersonate/ai/catalog-audit`,
      );
      return res.data;
    },
  });
}

function useModels() {
  return useQuery({
    queryKey: ["admin", "ai", "models"],
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiClient.get<ModelsResponse>(
        `/api/admin/impersonate/ai/models`,
      );
      return res.data;
    },
  });
}

function useUsage(days: number) {
  return useQuery({
    queryKey: ["admin", "ai", "usage", days],
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiClient.get<UsageResponse>(
        `/api/admin/impersonate/ai/usage?days=${days}`,
      );
      return res.data;
    },
  });
}

// ── Small presentational helpers ──────────────────────────────────────────

function ModelHint({ hint }: { hint: string }) {
  return (
    <code className="text-[11px] rounded bg-muted px-1.5 py-0.5">{hint}</code>
  );
}

function GatewayNotConfigured({ what }: { what: string }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Gateway API key is not set — {what} is unavailable in this environment.
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AIVendors() {
  const [subWindow, setSubWindow] = useState(7);
  const [usageWindow, setUsageWindow] = useState(30);

  const subs = useSubstitutions(subWindow);
  const useCases = useUseCases();
  const catalog = useCatalogAudit();
  const models = useModels();
  const usage = useUsage(usageWindow);

  const refreshAll = () => {
    subs.refetch();
    useCases.refetch();
    catalog.refetch();
    models.refetch();
    usage.refetch();
  };

  const breachCount =
    subs.data?.bySwap?.filter((s) => isSlaBreach(s.featureKey)).reduce(
      (acc, s) => acc + Number(s.count ?? 0),
      0,
    ) ?? 0;

  const modelsConfigured = models.data?.configured !== false;
  const usageConfigured = usage.data?.configured !== false;
  const usageTenants = usage.data?.tenants ?? usage.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cpu className="h-6 w-6" /> AI Vendors
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Gateway observability. We ask the gateway for a model per use case
            (our <strong>hint</strong>); the gateway may silently substitute a
            different vendor. For latency-pinned use cases like{" "}
            <code>match</code> that swap is an SLA breach — those rows are
            flagged below.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* ── 1. Model substitutions (closes #2210) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Model substitutions
            {breachCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {breachCount} SLA breach{breachCount === 1 ? "" : "es"}
              </Badge>
            )}
            <div className="ml-auto flex gap-1.5">
              {[7, 30].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={subWindow === d ? "default" : "outline"}
                  onClick={() => setSubWindow(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subs.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">
                  {subs.data?.totalSubstituted ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  silent substitutions in the last {subs.data?.windowDays ?? subWindow} days
                  {subs.data?.since && (
                    <> · since {fmtDate(subs.data.since)}</>
                  )}
                </span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested</TableHead>
                    <TableHead />
                    <TableHead>Resolved</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subs.data?.bySwap?.map((s, i) => {
                    const breach = isSlaBreach(s.featureKey);
                    return (
                      <TableRow
                        key={`${s.requestedModel}-${s.resolvedModel}-${s.featureKey}-${i}`}
                        className={breach ? "bg-destructive/5" : undefined}
                      >
                        <TableCell>
                          <ModelHint hint={s.requestedModel ?? "—"} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </TableCell>
                        <TableCell>
                          <ModelHint hint={s.resolvedModel ?? "—"} />
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="flex items-center gap-1.5">
                            {s.featureKey ?? "—"}
                            {breach && (
                              <Badge variant="destructive" className="text-[10px]">
                                SLA breach
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.count}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmtDate(s.lastSeen)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!subs.isLoading && (subs.data?.bySwap?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No substitutions in this window — every request resolved
                        to the model we asked for.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Use-case profiles ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Use-case profiles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {useCases.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Use case</TableHead>
                  <TableHead>Model hint</TableHead>
                  <TableHead className="text-right">Temp</TableHead>
                  <TableHead className="text-right">Max tokens</TableHead>
                  <TableHead>Fallback chain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {useCases.data?.map((row) => (
                  <TableRow key={row.useCase}>
                    <TableCell className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        {row.useCase}
                        {SLA_CRITICAL_USE_CASES.has(row.useCase) && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                            latency-pinned
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ModelHint hint={row.modelHint} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {row.temperature}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {row.maxTokens ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {row.fallbacks.length === 0 ? (
                          <span className="text-xs text-muted-foreground">none</span>
                        ) : (
                          row.fallbacks.map((f, i) => (
                            <span key={`${f.modelHint}-${i}`} className="flex items-center gap-1">
                              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                              <ModelHint hint={f.modelHint} />
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── 3. Catalog audit ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Catalog audit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Each unique model hint our profiles ask for, joined against the live
            gateway catalog. Hints the gateway no longer carries are drift —
            update the use-case profile.
          </p>
          {catalog.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : catalog.data?.configured === false ? (
            <GatewayNotConfigured what="live catalog cross-check" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model hint</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(catalog.data?.hints ?? []).map((h) => (
                  <TableRow key={h.modelHint} className={h.inCatalog === false ? "bg-destructive/5" : undefined}>
                    <TableCell>
                      <ModelHint hint={h.modelHint} />
                    </TableCell>
                    <TableCell>
                      {h.inCatalog === false ? (
                        <Badge variant="destructive" className="text-[10px]">
                          not in catalog (drift)
                        </Badge>
                      ) : h.inCatalog === true ? (
                        <Badge variant="secondary" className="text-[10px]">
                          resolvable
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">unknown</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(catalog.data?.hints?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                      No hints to audit.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── 4. Live gateway models ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" /> Live gateway models
            </CardTitle>
          </CardHeader>
          <CardContent>
            {models.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !modelsConfigured ? (
              <GatewayNotConfigured what="the live model list" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(models.data?.data ?? []).map((m, i) => (
                  <Badge key={m.id ?? m.name ?? i} variant="secondary" className="text-[10px]">
                    {m.id ?? m.name ?? "(unnamed)"}
                  </Badge>
                ))}
                {(models.data?.data?.length ?? 0) === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Gateway returned no models.
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 5. Gateway usage ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Gateway usage
              <div className="ml-auto flex gap-1.5">
                {[7, 30].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={usageWindow === d ? "default" : "outline"}
                    onClick={() => setUsageWindow(d)}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usage.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !usageConfigured ? (
              <GatewayNotConfigured what="per-tenant cost reporting" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageTenants.map((t, i) => {
                    const cents = t.costCents ?? (typeof t.cost === "number" ? t.cost * 100 : undefined);
                    return (
                      <TableRow key={t.tenantId ?? t.tenant ?? i}>
                        <TableCell className="text-xs">
                          {t.tenant ?? t.tenantId ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {t.requests ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {cents !== undefined ? `$${(cents / 100).toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {usageTenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                        No usage in this window.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
