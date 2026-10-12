/**
 * Paid Media — connect ad accounts, build campaigns, push to platforms.
 *
 * One component renders at both /settings/ads (workspace-scoped:
 * personal | company | delegated) and /superadmin/ads (house workspace
 * — hired.video's own ad accounts for growth marketing).
 *
 * Workspace is read from ?workspace= and falls back to "personal", UNLESS
 * a `forceWorkspace` prop is supplied. The /superadmin/ads wrapper
 * (SuperAdminPaidMediaPage) passes forceWorkspace={{ kind: 'delegated',
 * subjectUserId: HOUSE_USER_ID }} so the internal route binds hired.video's
 * own house ad accounts instead of the calling SA's personal connections
 * (#986). The house workspace reuses the existing `delegated` kind +
 * canActFor SSoT — no 4th workspace kind.
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  paidMediaService,
  PAID_MEDIA_PLATFORMS,
  type Connection,
  type Campaign,
  type WorkspaceParam,
} from "@/lib/services/paid-media-service";
import { advertisingService, type AdSet as InternalAdSet } from "@/lib/services/advertising-service";
import { studioService } from "@/lib/services/studio-service";
import AdSetEditor from "@/components/advertising/AdSetEditor";
import {
  CampaignSizeViewToggle,
  CampaignSizeGroupedList,
  collectCampaignAssets,
  type CampaignViewMode,
  type SizeAwareCampaign,
} from "@/components/campaigns";
import { useToast } from "@/hooks/use-toast";

interface PaidMediaPageProps {
  /** When omitted, workspace is derived from ?workspace= query param. */
  forceWorkspace?: WorkspaceParam;
  /** Page title — defaults differ between /settings/ads and /superadmin/ads. */
  title?: string;
}

function parseWorkspaceQuery(value: string | null): WorkspaceParam {
  if (!value || value === "personal") return { kind: "personal" };
  if (value.startsWith("company:"))   return { kind: "company",   companyId:     value.slice("company:".length) };
  if (value.startsWith("delegated:")) return { kind: "delegated", subjectUserId: value.slice("delegated:".length) };
  return { kind: "personal" };
}

const PLATFORM_LABEL: Record<string, string> = {
  meta:     "Meta (Facebook + Instagram)",
  google:   "Google Ads",
  linkedin: "LinkedIn Ads",
  tiktok:   "TikTok Ads",
  bing:     "Microsoft Advertising (Bing)",
};

export default function PaidMediaPage({ forceWorkspace, title }: PaidMediaPageProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const workspace = forceWorkspace ?? parseWorkspaceQuery(searchParams.get("workspace"));
  const status = searchParams.get("status");
  const platformParam = searchParams.get("platform");

  const [tab, setTab] = useState<"connections" | "campaigns" | "creatives" | "pixels" | "reporting">("connections");

  return (
    <div className="py-8 px-4">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{title ?? t("headings.paidMedia.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("messages.paidMedia.intro")}
        </p>
        {status === "connected" && (
          <div className="mt-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">
            {t("messages.paidMedia.connectedSuccess", { platform: platformParam ? PLATFORM_LABEL[platformParam] ?? platformParam : t("labels.paidMedia.platformFallback") })}
          </div>
        )}
        {status === "error" && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
            {t("messages.paidMedia.connectionFailed", { reason: searchParams.get("reason") ?? t("messages.paidMedia.unknownError") })}
          </div>
        )}
      </header>

      <nav className="border-b mb-6 flex gap-4 text-sm">
        {([
          ["connections", t("labels.paidMedia.tabConnections")],
          ["campaigns",   t("labels.paidMedia.tabCampaigns")],
          ["creatives",   t("labels.paidMedia.tabCreatives")],
          ["pixels",      t("labels.paidMedia.tabPixels")],
          ["reporting",   t("labels.paidMedia.tabReporting")],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pb-2 -mb-px border-b-2 transition-colors ${tab === key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "connections" && <ConnectionsTab workspace={workspace} />}
      {tab === "campaigns"   && <CampaignsTab workspace={workspace} />}
      {tab === "creatives"   && <CreativesTab workspace={workspace} />}
      {tab === "pixels"      && <PixelsTab workspace={workspace} />}
      {tab === "reporting"   && <ReportingTab workspace={workspace} />}
    </div>
  );
}

// ─── Connections tab ──────────────────────────────────────────────────────
function ConnectionsTab({ workspace }: { workspace: WorkspaceParam }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const platformsQ = useQuery({ queryKey: ["paid-media", "platforms"], queryFn: () => paidMediaService.listPlatforms() });
  const connectionsQ = useQuery({ queryKey: ["paid-media", "connections"], queryFn: () => paidMediaService.listConnections() });
  const accountsQ = useQuery({ queryKey: ["paid-media", "accounts"], queryFn: () => paidMediaService.listAccounts() });
  const disconnectM = useMutation({
    mutationFn: (id: string) => paidMediaService.deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paid-media"] }),
  });
  const connectM = useMutation({
    mutationFn: async (platform: typeof PAID_MEDIA_PLATFORMS[number]) => paidMediaService.startOAuth(platform, workspace),
    onSuccess: (url) => { window.location.href = url; },
  });

  if (platformsQ.isLoading || connectionsQ.isLoading) return <p className="text-sm text-muted-foreground">{t("status.loading")}</p>;

  const byPlatform = new Map((connectionsQ.data ?? []).map((c) => [c.platform, c]));
  const accountsByConnection = new Map<string, typeof accountsQ.data extends infer T ? (T extends Array<infer A> ? A[] : never) : never>();
  for (const a of accountsQ.data ?? []) {
    const list = accountsByConnection.get(a.connectionId) ?? [];
    list.push(a as any);
    accountsByConnection.set(a.connectionId, list as any);
  }

  return (
    <div className="space-y-4">
      {(platformsQ.data ?? []).map((p) => {
        const conn = byPlatform.get(p.platform);
        return (
          <div key={p.platform} className="rounded-lg border p-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-medium">{PLATFORM_LABEL[p.platform] ?? p.platform}</h3>
              {!p.configured && (
                <p className="text-xs text-amber-600 mt-1">
                  {t("messages.paidMedia.oauthNotConfigured")}
                </p>
              )}
              {conn ? (
                <div className="mt-2 text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">{t("labels.paidMedia.connectedAs")} </span>
                    {conn.externalUserHandle ?? conn.externalUserId ?? t("labels.paidMedia.unknownHandle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("labels.paidMedia.status")} <span className={conn.status === "active" ? "text-green-600" : "text-red-600"}>{conn.status}</span>
                    {conn.lastError && ` — ${conn.lastError}`}
                  </p>
                  {(accountsByConnection.get(conn.id) ?? []).length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                      {(accountsByConnection.get(conn.id) ?? []).map((a: any) => (
                        <li key={a.id}>· {a.name} ({a.externalAccountId}{a.currencyCode ? ` · ${a.currencyCode}` : ""})</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">{t("messages.paidMedia.notConnected")}</p>
              )}
            </div>
            <div className="flex gap-2">
              {conn ? (
                <>
                  <button
                    className="text-sm border rounded px-3 py-1.5 hover:bg-muted"
                    disabled={!p.configured || connectM.isPending}
                    onClick={() => connectM.mutate(p.platform)}
                  >
                    {t("actions.paidMedia.reconnect")}
                  </button>
                  <button
                    className="text-sm border border-red-200 text-red-700 rounded px-3 py-1.5 hover:bg-red-50"
                    disabled={disconnectM.isPending}
                    onClick={() => disconnectM.mutate(conn.id)}
                  >
                    {t("actions.disconnect")}
                  </button>
                </>
              ) : (
                <button
                  className="text-sm bg-primary text-primary-foreground rounded px-3 py-1.5 disabled:opacity-50"
                  disabled={!p.configured || connectM.isPending}
                  onClick={() => connectM.mutate(p.platform)}
                >
                  {t("actions.connect")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Campaigns tab ────────────────────────────────────────────────────────
function CampaignsTab({ workspace }: { workspace: WorkspaceParam }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const campaignsQ = useQuery({ queryKey: ["paid-media", "campaigns", workspace], queryFn: () => paidMediaService.listCampaigns(workspace) });
  const accountsQ = useQuery({ queryKey: ["paid-media", "accounts"], queryFn: () => paidMediaService.listAccounts() });
  const internalCampaignsQ = useQuery({
    queryKey: ["advertising", "campaigns"],
    queryFn: () => advertisingService.getCampaigns(),
  });
  const [showNew, setShowNew] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAdSet, setEditingAdSet] = useState<InternalAdSet | undefined>();
  const [view, setView] = useState<CampaignViewMode>("list");

  const creativesQ = useQuery({
    queryKey: ["paid-media", "creatives", workspace],
    queryFn: () => paidMediaService.listCreatives(workspace),
  });
  const studioCampaignsQ = useQuery({
    queryKey: ["studio", "campaigns"],
    queryFn: async () => (await studioService.getCampaigns()).data ?? [],
  });
  const studioProjectsQ = useQuery({
    queryKey: ["studio", "projects"],
    queryFn: async () => (await studioService.getProjects()).data ?? [],
  });

  const internalIds = new Set((internalCampaignsQ.data ?? []).map((c) => c.id));
  const adSetsEnabled = !!selectedCampaignId && internalIds.has(selectedCampaignId);

  const adSetsQ = useQuery({
    queryKey: ["advertising", "ad-sets", selectedCampaignId],
    queryFn: () => advertisingService.getAdSets(selectedCampaignId!),
    enabled: adSetsEnabled,
  });

  const createM = useMutation({
    mutationFn: (input: Partial<Campaign>) => paidMediaService.createCampaign(input, workspace),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paid-media", "campaigns"] }); setShowNew(false); },
  });
  const syncM = useMutation({
    mutationFn: ({ campaignId, accountId }: { campaignId: string; accountId: string }) =>
      paidMediaService.syncCampaign(campaignId, accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paid-media", "campaigns"] }),
  });
  const deleteAdSetM = useMutation({
    mutationFn: (id: string) => advertisingService.deleteAdSet(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["advertising", "ad-sets"] });
      toast({ title: t("messages.paidMedia.adSetDeleted") });
    },
  });

  type CampaignRow = {
    id: string;
    name: string;
    objective: string;
    status: string;
    budgetCents: number | null;
    spentCents: number;
    source: "paid-media" | "internal";
  };

  const paidIds = new Set((campaignsQ.data ?? []).map((c) => c.id));
  const rows: CampaignRow[] = [
    ...(campaignsQ.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      budgetCents: c.budgetCents,
      spentCents: c.spentCents,
      source: "paid-media" as const,
    })),
    ...(internalCampaignsQ.data ?? [])
      .filter((c) => !paidIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        budgetCents: c.budgetCents,
        spentCents: c.spentCents,
        source: "internal" as const,
      })),
  ];

  const projectsById = new Map(
    (studioProjectsQ.data ?? []).map((p) => [p.id, p] as const),
  );
  const studioCampaigns = studioCampaignsQ.data ?? [];
  const studioById = new Map(studioCampaigns.map((c) => [c.id, c]));
  const creatives = creativesQ.data ?? [];
  const sizeAwareFromRows: SizeAwareCampaign[] = rows.map((row) => {
    const paid = (campaignsQ.data ?? []).find((c) => c.id === row.id);
    const studio = studioById.get(row.id);
    const projectIdSet = new Set(studio?.projectIds ?? []);
    const linkedCreatives = creatives.filter((cr) => {
      const meta = cr.metadata ?? {};
      if (meta.campaignId === row.id || meta.campaign_id === row.id) return true;
      return !!(cr.studioProjectId && projectIdSet.has(cr.studioProjectId));
    });
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      assets: collectCampaignAssets({
        metadata: paid?.metadata ?? null,
        projectIds: studio?.projectIds,
        projectsById,
        creatives: linkedCreatives,
      }),
    };
  });
  const rowIds = new Set(rows.map((r) => r.id));
  const extraStudio: SizeAwareCampaign[] = studioCampaigns
    .filter((c) => !rowIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      assets: collectCampaignAssets({
        projectIds: c.projectIds,
        projectsById,
      }),
    }));
  const sizeAware = [...sizeAwareFromRows, ...extraStudio];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <CampaignSizeViewToggle value={view} onChange={setView} />
        <button className="text-sm bg-primary text-primary-foreground rounded px-3 py-1.5" onClick={() => setShowNew((v) => !v)}>
          {showNew ? t("actions.cancel") : t("actions.paidMedia.newCampaign")}
        </button>
      </div>

      {showNew && (
        <NewCampaignForm
          onSubmit={(input) => createM.mutate(input)}
          submitting={createM.isPending}
        />
      )}

      {view === "grouped" && (
        <CampaignSizeGroupedList
          campaigns={sizeAware}
          selectedId={selectedCampaignId}
          onSelect={setSelectedCampaignId}
        />
      )}

      {view === "list" && (campaignsQ.isLoading && internalCampaignsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("status.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("messages.paidMedia.noCampaigns")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2 font-medium">{t("labels.paidMedia.colName")}</th>
              <th className="text-left py-2 font-medium">{t("labels.paidMedia.colObjective")}</th>
              <th className="text-left py-2 font-medium">{t("labels.paidMedia.status")}</th>
              <th className="text-right py-2 font-medium">{t("labels.paidMedia.colBudget")}</th>
              <th className="text-right py-2 font-medium">{t("labels.paidMedia.colSpent")}</th>
              <th className="text-right py-2 font-medium">{t("labels.paidMedia.colSync")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={`${c.source}-${c.id}`}
                className={`border-b last:border-0 cursor-pointer ${selectedCampaignId === c.id ? "bg-muted/50" : "hover:bg-muted/30"}`}
                onClick={() => setSelectedCampaignId(c.id)}
              >
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-muted-foreground">{c.objective}</td>
                <td className="py-2"><StatusBadge status={c.status} /></td>
                <td className="py-2 text-right">{c.budgetCents != null ? `${(c.budgetCents / 100).toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right">${(c.spentCents / 100).toFixed(2)}</td>
                <td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  {c.source === "paid-media" ? (
                    <select
                      className="text-xs border rounded px-2 py-1"
                      defaultValue=""
                      onChange={(e) => {
                        const accountId = e.target.value;
                        if (accountId) syncM.mutate({ campaignId: c.id, accountId });
                        e.target.value = "";
                      }}
                    >
                      <option value="">{t("labels.paidMedia.syncTo")}</option>
                      {(accountsQ.data ?? []).map((a) => (
                        <option key={a.id} value={a.id}>{PLATFORM_LABEL[a.platform] ?? a.platform} · {a.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("labels.paidMedia.tabAdSets")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      <section className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t("labels.paidMedia.tabAdSets")}</h2>
          <button
            className="text-sm bg-primary text-primary-foreground rounded px-3 py-1.5 disabled:opacity-50"
            disabled={!adSetsEnabled}
            onClick={() => {
              setEditingAdSet(undefined);
              setEditorOpen(true);
            }}
          >
            {t("labels.paidMedia.newAdSet")}
          </button>
        </div>
        {!adSetsEnabled ? (
          <p className="text-sm text-muted-foreground">{t("labels.paidMedia.selectCampaign")}</p>
        ) : adSetsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("status.loading")}</p>
        ) : (adSetsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("labels.paidMedia.noAdSets")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 font-medium">{t("labels.paidMedia.colName")}</th>
                <th className="text-left py-2 font-medium">{t("labels.paidMedia.colPlacement")}</th>
                <th className="text-left py-2 font-medium">{t("labels.paidMedia.colPricing")}</th>
                <th className="text-left py-2 font-medium">{t("labels.paidMedia.colBidStrategy")}</th>
                <th className="text-left py-2 font-medium">{t("labels.paidMedia.colTargeting")}</th>
                <th className="text-right py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(adSetsQ.data ?? []).map((adSet) => (
                <tr key={adSet.id} className="border-b last:border-0">
                  <td className="py-2">{adSet.name}</td>
                  <td className="py-2 text-muted-foreground">{adSet.placementType}</td>
                  <td className="py-2 text-muted-foreground">{adSet.pricingModel}</td>
                  <td className="py-2 text-muted-foreground">{adSet.bidStrategy}</td>
                  <td className="py-2 text-muted-foreground">
                    {Object.keys(adSet.targetingJson ?? {}).length > 0 ? "•" : "—"}
                  </td>
                  <td className="py-2 text-right space-x-2">
                    <button
                      className="text-xs border rounded px-2 py-1 hover:bg-muted"
                      onClick={() => {
                        setEditingAdSet(adSet);
                        setEditorOpen(true);
                      }}
                    >
                      {t("actions.paidMedia.edit")}
                    </button>
                    <button
                      className="text-xs border border-red-200 text-red-700 rounded px-2 py-1 hover:bg-red-50"
                      disabled={deleteAdSetM.isPending}
                      onClick={() => deleteAdSetM.mutate(adSet.id)}
                    >
                      {t("actions.paidMedia.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {selectedCampaignId && adSetsEnabled && (
          <AdSetEditor
            campaignId={selectedCampaignId}
            adSet={editingAdSet}
            open={editorOpen}
            onOpenChange={(open) => {
              setEditorOpen(open);
              if (!open) setEditingAdSet(undefined);
            }}
            onSaved={() => qc.invalidateQueries({ queryKey: ["advertising", "ad-sets"] })}
          />
        )}
      </section>
    </div>
  );
}

function NewCampaignForm({ onSubmit, submitting }: { onSubmit: (input: Partial<Campaign>) => void; submitting: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("TRAFFIC");
  const [dailyBudget, setDailyBudget] = useState("");
  return (
    <form
      className="rounded-lg border p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          objective,
          dailyBudgetCents: dailyBudget ? Math.round(Number(dailyBudget) * 100) : null,
        });
      }}
    >
      <div className="col-span-1 md:col-span-2">
        <label className="text-xs text-muted-foreground">{t("labels.paidMedia.colName")}</label>
        <input
          required
          className="w-full mt-1 px-2 py-1.5 text-sm border rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("labels.paidMedia.campaignNamePlaceholder")}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">{t("labels.paidMedia.colObjective")}</label>
        <select className="w-full mt-1 px-2 py-1.5 text-sm border rounded" value={objective} onChange={(e) => setObjective(e.target.value)}>
          {["AWARENESS", "TRAFFIC", "LEAD_GENERATION", "CONVERSIONS", "VIDEO_VIEWS", "JOB_APPLICATIONS"].map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">{t("labels.paidMedia.dailyBudget")}</label>
        <input
          type="number"
          step="0.01"
          className="w-full mt-1 px-2 py-1.5 text-sm border rounded"
          value={dailyBudget}
          onChange={(e) => setDailyBudget(e.target.value)}
          placeholder="100"
        />
      </div>
      <div className="col-span-full flex justify-end">
        <button disabled={submitting} className="text-sm bg-primary text-primary-foreground rounded px-3 py-1.5 disabled:opacity-50">
          {submitting ? t("messages.paidMedia.creating") : t("actions.paidMedia.createCampaign")}
        </button>
      </div>
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "active" ? "bg-green-100 text-green-800" :
              status === "paused" ? "bg-amber-100 text-amber-800" :
              status === "archived" || status === "completed" ? "bg-muted text-muted-foreground" :
              "bg-accent text-accent-foreground";
  return <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{status}</span>;
}

// ─── Creatives tab ────────────────────────────────────────────────────────
function CreativesTab({ workspace }: { workspace: WorkspaceParam }) {
  const { t } = useTranslation();
  const creativesQ = useQuery({ queryKey: ["paid-media", "creatives", workspace], queryFn: () => paidMediaService.listCreatives(workspace) });
  if (creativesQ.isLoading) return <p className="text-sm text-muted-foreground">{t("status.loading")}</p>;
  if ((creativesQ.data ?? []).length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("messages.paidMedia.noCreatives")}
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {(creativesQ.data ?? []).map((c) => (
        <div key={c.id} className="rounded-lg border overflow-hidden">
          {c.assetThumbnailUrl || c.assetUrl ? (
            <img src={c.assetThumbnailUrl ?? c.assetUrl ?? ""} alt={c.name} className="w-full aspect-video object-cover" />
          ) : (
            <div className="w-full aspect-video bg-muted" />
          )}
          <div className="p-3">
            <p className="text-sm font-medium truncate">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.format} · {c.ctaText}</p>
            {c.headline && <p className="text-xs mt-1 line-clamp-2">{c.headline}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Pixels tab ───────────────────────────────────────────────────────────
function PixelsTab({ workspace }: { workspace: WorkspaceParam }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const pixelsQ = useQuery({ queryKey: ["paid-media", "pixels", workspace], queryFn: () => paidMediaService.getPixels(workspace) });
  const saveM = useMutation({
    mutationFn: (input: Parameters<typeof paidMediaService.savePixels>[0]) => paidMediaService.savePixels(input, workspace),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paid-media", "pixels"] }),
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const get = (k: string) => draft[k] ?? (pixelsQ.data as any)?.[k] ?? "";
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  if (pixelsQ.isLoading) return <p className="text-sm text-muted-foreground">{t("status.loading")}</p>;

  return (
    <form
      className="space-y-6 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        const payload: Parameters<typeof paidMediaService.savePixels>[0] = {};
        for (const [k, v] of Object.entries(draft)) {
          (payload as any)[k] = v === "" ? null : v;
        }
        saveM.mutate(payload);
      }}
    >
      <p className="text-sm text-muted-foreground">
        {t("messages.paidMedia.pixelsDisclaimer")}
      </p>

      <PixelSection title="Meta (Facebook + Instagram)">
        <PixelInput label={t("labels.paidMedia.pixelId")} k="metaPixelId" value={get("metaPixelId")} onChange={set} />
        <PixelInput label={t("labels.paidMedia.conversionsApiToken")} k="metaCapiToken" value={get("metaCapiToken")} onChange={set} secret hasValue={(pixelsQ.data as any)?.metaCapiTokenSet} />
      </PixelSection>

      <PixelSection title="Google">
        <PixelInput label={t("labels.paidMedia.ga4MeasurementId")} k="ga4MeasurementId" value={get("ga4MeasurementId")} onChange={set} />
        <PixelInput label={t("labels.paidMedia.ga4ApiSecret")} k="ga4ApiSecret" value={get("ga4ApiSecret")} onChange={set} secret hasValue={(pixelsQ.data as any)?.ga4ApiSecretSet} />
        <PixelInput label={t("labels.paidMedia.googleAdsConversionId")} k="googleAdsConversionId" value={get("googleAdsConversionId")} onChange={set} />
        <PixelInput label={t("labels.paidMedia.googleAdsConversionLabel")} k="googleAdsConversionLabel" value={get("googleAdsConversionLabel")} onChange={set} />
      </PixelSection>

      <PixelSection title="LinkedIn">
        <PixelInput label={t("labels.paidMedia.linkedInPartnerId")} k="linkedInPartnerId" value={get("linkedInPartnerId")} onChange={set} />
        <PixelInput label={t("labels.paidMedia.conversionsApiToken")} k="linkedInCapiToken" value={get("linkedInCapiToken")} onChange={set} secret hasValue={(pixelsQ.data as any)?.linkedInCapiTokenSet} />
      </PixelSection>

      <PixelSection title="TikTok">
        <PixelInput label={t("labels.paidMedia.pixelId")} k="tiktokPixelId" value={get("tiktokPixelId")} onChange={set} />
        <PixelInput label={t("labels.paidMedia.eventsApiToken")} k="tiktokAccessToken" value={get("tiktokAccessToken")} onChange={set} secret hasValue={(pixelsQ.data as any)?.tiktokAccessTokenSet} />
      </PixelSection>

      <PixelSection title="Microsoft Advertising (Bing)">
        <PixelInput label={t("labels.paidMedia.uetTagId")} k="bingUetTagId" value={get("bingUetTagId")} onChange={set} />
        <PixelInput label={t("labels.paidMedia.uetApiToken")} k="bingUetApiToken" value={get("bingUetApiToken")} onChange={set} secret hasValue={(pixelsQ.data as any)?.bingUetApiTokenSet} />
      </PixelSection>

      <div className="flex justify-end">
        <button disabled={saveM.isPending} className="text-sm bg-primary text-primary-foreground rounded px-3 py-1.5 disabled:opacity-50">
          {saveM.isPending ? t("messages.paidMedia.savingPixels") : t("actions.paidMedia.savePixels")}
        </button>
      </div>
    </form>
  );
}

function PixelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border p-4 space-y-3">
      <legend className="text-sm font-medium px-1">{title}</legend>
      {children}
    </fieldset>
  );
}

function PixelInput({ label, k, value, onChange, secret, hasValue }: {
  label: string;
  k: string;
  value: string;
  onChange: (k: string, v: string) => void;
  secret?: boolean;
  hasValue?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}{secret && hasValue ? t("labels.paidMedia.secretSetSuffix") : ""}</span>
      <input
        type={secret ? "password" : "text"}
        autoComplete="off"
        className="w-full mt-1 px-2 py-1.5 text-sm border rounded"
        value={value}
        onChange={(e) => onChange(k, e.target.value)}
        placeholder={secret ? (hasValue ? t("labels.paidMedia.secretSavedPlaceholder") : "") : ""}
      />
    </label>
  );
}

// ─── Reporting tab ────────────────────────────────────────────────────────
function ReportingTab({ workspace: _workspace }: { workspace: WorkspaceParam }) {
  const { t } = useTranslation();
  const today = new Date();
  const thirty = new Date(today.getTime() - 30 * 24 * 3600_000);
  const [since, setSince] = useState(thirty.toISOString().slice(0, 10));
  const [until, setUntil] = useState(today.toISOString().slice(0, 10));
  const accountsQ = useQuery({ queryKey: ["paid-media", "accounts"], queryFn: () => paidMediaService.listAccounts() });
  const insightsQ = useQuery({
    queryKey: ["paid-media", "insights", since, until],
    queryFn: () => paidMediaService.listInsights({ since, until }),
  });
  const pullM = useMutation({
    mutationFn: (accountId: string) => paidMediaService.pullInsights({ accountId, resourceKind: "campaign", since, until }),
    onSuccess: () => insightsQ.refetch(),
  });

  const rollup = (insightsQ.data ?? []).reduce((acc, r) => {
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.spendCents += r.spendCents;
    acc.conversions += r.conversions;
    return acc;
  }, { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">{t("labels.paidMedia.since")}</span>
          <input type="date" className="border rounded px-2 py-1" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">{t("labels.paidMedia.until")}</span>
          <input type="date" className="border rounded px-2 py-1" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <div className="ml-auto flex gap-2">
          {(accountsQ.data ?? []).map((a) => (
            <button
              key={a.id}
              className="text-xs border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={pullM.isPending}
              onClick={() => pullM.mutate(a.id)}
            >
              {t("actions.paidMedia.pull", { platform: PLATFORM_LABEL[a.platform] ?? a.platform })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("labels.paidMedia.impressions")} value={rollup.impressions.toLocaleString()} />
        <Stat label={t("labels.paidMedia.clicks")}      value={rollup.clicks.toLocaleString()} />
        <Stat label={t("labels.paidMedia.spend")}       value={`$${(rollup.spendCents / 100).toFixed(2)}`} />
        <Stat label={t("labels.paidMedia.conversions")} value={rollup.conversions.toLocaleString()} />
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground border-b">
          <tr>
            <th className="text-left py-2 font-medium">{t("labels.paidMedia.colDate")}</th>
            <th className="text-left py-2 font-medium">{t("labels.paidMedia.platform")}</th>
            <th className="text-right py-2 font-medium">{t("labels.paidMedia.impressions")}</th>
            <th className="text-right py-2 font-medium">{t("labels.paidMedia.clicks")}</th>
            <th className="text-right py-2 font-medium">{t("labels.paidMedia.spend")}</th>
            <th className="text-right py-2 font-medium">{t("labels.paidMedia.colConv")}</th>
          </tr>
        </thead>
        <tbody>
          {(insightsQ.data ?? []).map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2">{r.date}</td>
              <td className="py-2 text-muted-foreground">{PLATFORM_LABEL[r.platform] ?? r.platform}</td>
              <td className="py-2 text-right">{r.impressions.toLocaleString()}</td>
              <td className="py-2 text-right">{r.clicks.toLocaleString()}</td>
              <td className="py-2 text-right">${(r.spendCents / 100).toFixed(2)}</td>
              <td className="py-2 text-right">{r.conversions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
