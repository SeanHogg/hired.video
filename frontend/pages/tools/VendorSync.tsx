/**
 * Vendor Sync — `/tools/vendor-sync`
 *
 * One master resume, many profile updates. The page is the seeker-facing
 * launchpad for syncing the user's hired.video master (or a chosen
 * variant) out to LinkedIn, Indeed, Glassdoor, GitHub, and friends —
 * and pulling vendor-side updates back via the Chrome extension.
 *
 * Layout:
 *   - Hero + master/variant selector
 *   - Provider grid grouped by category. Each card is the shared
 *     <VendorCard> — registry-driven, self-gating per the DRY rule.
 *   - When the extension broadcasts `vendor-sync:focused-html`, this
 *     page hands the HTML to the import API and pops <MergeResumeDialog>
 *     pre-loaded with the analysis. No UI lives behind a vendor switch
 *     — the dialog is the same one used by /tools/resume-consolidator.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { useTranslation } from "react-i18next";
import { Chrome, Loader2 } from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { CategoryFilterBar } from "@/components/CategoryFilterBar";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { resumeService, type ResumeWithOwnership } from "@/lib/services/resume-service";
import {
  vendorSyncService,
  type VendorConnectorListItem,
  type VendorImportResult,
} from "@/lib/services/vendor-sync-service";
import VendorCard, { useVendorSyncFocusedListener } from "@/components/sync/VendorCard";
import {
  useCategoryLabels,
  VENDOR_CATEGORY_ORDER,
  type VendorCategory,
} from "@/components/sync/category-labels";
import { useExtensionBridge } from "@/hooks/use-extension-bridge";
import MergeResumeDialog from "@/components/MergeResumeDialog";
import { CHROME_EXTENSION_STORE_URL } from "@/lib/chrome-extension";

type CategoryFilter = VendorCategory | "all";

export default function VendorSync() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const categoryLabels = useCategoryLabels();
  const [searchParams, setSearchParams] = useSearchParams();

  const [connectors, setConnectors] = useState<VendorConnectorListItem[]>([]);
  const [resumes, setResumes] = useState<ResumeWithOwnership[]>([]);
  const { resumeId: deepLinkResumeId } = useToolEntityParams();
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The jobseeker Chrome extension's side panel deep-links here as
  // `?autoSync=<connectorId>` when the user clicks "Sync to master" on
  // its profile-detected banner. Auto-fire the same handler the cards
  // call so the user doesn't have to scroll + click again.
  const autoSyncConnectorId = searchParams.get("autoSync");
  const autoSyncFiredRef = useRef(false);

  // Import-merge dialog state — populated when an extension push lands.
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeImportResult, setMergeImportResult] = useState<VendorImportResult | null>(null);
  const [mergeConnectorId, setMergeConnectorId] = useState<string | null>(null);
  const [importingFromExt, setImportingFromExt] = useState(false);

  // The card that initiated the request — used to namespace the
  // single bridge listener so we know which connector to associate
  // with the next `vendor-sync:focused-html` event.
  const pendingConnectorRef = useRef<string | null>(null);

  // Active category filter chip. "all" shows every connector; otherwise
  // restricts the grid to one VendorCategory.
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");

  // Initial load: connectors are public (registry-only for anon; with
  // last-synced overlay when authed). Resumes are user-specific so we
  // only fetch them when the visitor is signed in. This keeps the anon
  // surface useful — it shows the same vendor catalog the seeker would
  // see post-signup, gated only at the "Sync" action.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tasks: [Promise<VendorConnectorListItem[]>, Promise<ResumeWithOwnership[]>] = [
      vendorSyncService.listConnectors(),
      isAuthenticated
        ? resumeService.getResumesForDisplay()
        : Promise.resolve([] as ResumeWithOwnership[]),
    ];
    Promise.all(tasks)
      .then(([conns, rs]) => {
        if (cancelled) return;
        setConnectors(conns);
        setResumes(rs);
        // The linked résumé (the one open in the kit workspace when embedded), else the master.
        const linked = deepLinkResumeId ? rs.find((r) => r.id === deepLinkResumeId) : undefined;
        const initial = linked ?? rs.find((r) => r.isMaster) ?? rs[0] ?? null;
        if (initial) setSelectedResumeId(initial.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, deepLinkResumeId]);

  // Bridge: send the request when a card asks. The actual roundtrip is
  // service-worker → profile-tab → service-worker → broadcast back.
  const { send } = useExtensionBridge({});
  const handleRequestExtensionSync = useCallback((connectorId: string) => {
    pendingConnectorRef.current = connectorId;
    send("vendor-sync:request-focused-html", { connectorId });
  }, [send]);

  // Auto-fire the sync when the extension deep-links us with
  // ?autoSync=<id>. Wait until both (a) connectors have loaded so we
  // can validate the id and (b) a resume is selected so the import
  // route accepts the request. Strip the param after firing so a
  // refresh doesn't re-trigger.
  useEffect(() => {
    if (autoSyncFiredRef.current) return;
    if (!autoSyncConnectorId) return;
    if (loading) return;
    if (!isAuthenticated) return;
    if (!selectedResumeId) return;
    const connector = connectors.find((c) => c.id === autoSyncConnectorId);
    if (!connector) return;
    if (!connector.supportsExtensionExtract) {
      toast({
        title: t("tools.vendorSync.error.notSupportedTitle", { vendor: connector.label }),
        description: t("tools.vendorSync.error.notSupportedDesc"),
        variant: "destructive",
      });
      autoSyncFiredRef.current = true;
      return;
    }
    autoSyncFiredRef.current = true;
    handleRequestExtensionSync(connector.id);
    const next = new URLSearchParams(searchParams);
    next.delete("autoSync");
    setSearchParams(next, { replace: true });
  }, [
    autoSyncConnectorId, loading, isAuthenticated, selectedResumeId,
    connectors, handleRequestExtensionSync, searchParams, setSearchParams, toast,
  ]);

  // Bridge listener: handle the broadcast back. Calls the import API,
  // pops the merge dialog with the analysis. The whole flow doesn't
  // touch <VendorCard>'s internals — DRY rule, the cards just trigger
  // the request and forget.
  useVendorSyncFocusedListener({
    onResult: async (payload) => {
      if (!selectedResumeId) return;
      const connectorId = pendingConnectorRef.current ?? payload.connectorId;
      pendingConnectorRef.current = null;
      if (!connectorId) {
        toast({
          title: t("tools.vendorSync.error.couldNotIdentify"),
          description: payload.error ?? t("tools.vendorSync.error.couldNotIdentifyDesc"),
          variant: "destructive",
        });
        return;
      }
      if (!payload.html) {
        toast({
          title: t("tools.vendorSync.error.noProfileDetected"),
          description: payload.error === "NO_PROFILE_TAB"
            ? t("tools.vendorSync.error.noProfileTab")
            : payload.error === "NO_FOCUSED_PANE"
            ? t("tools.vendorSync.error.paneNotFound")
            : payload.error ?? t("tools.vendorSync.error.tryAgain"),
          variant: "destructive",
        });
        return;
      }
      setImportingFromExt(true);
      try {
        const result = await vendorSyncService.importFromHtml(connectorId, {
          html: payload.html,
          sourceUrl: payload.originUrl ?? "",
          targetResumeId: selectedResumeId,
        });
        setMergeImportResult(result);
        setMergeConnectorId(connectorId);
        setMergeDialogOpen(true);
      } catch (err) {
        toast({
          title: t("tools.vendorSync.error.failedToExtract"),
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setImportingFromExt(false);
      }
    },
  });

  // Counts per category drive the chip labels (e.g. "Job boards · 5").
  // Pure derivation off the registry.
  const categoryCounts = useMemo(() => {
    const map = new Map<VendorCategory, number>();
    for (const c of connectors) {
      map.set(c.category, (map.get(c.category) ?? 0) + 1);
    }
    return map;
  }, [connectors]);

  // Cards visible after the chip filter. Order preserves registry order
  // so LinkedIn lands first regardless of the active chip.
  const visibleConnectors = useMemo(() => {
    if (activeCategory === "all") return connectors;
    return connectors.filter((c) => c.category === activeCategory);
  }, [connectors, activeCategory]);

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId],
  );

  return (
    <ToolShell
      toolId="vendor-sync"
      header={{
        icon: <Chrome className="h-6 w-6" />,
        title: t("tools.vendorSync.title"),
        description: t("tools.vendorSync.subtitle"),
      }}
    >
        {/* Extension highlight */}
        <Card className="border-primary/50 bg-accent/30">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <div className="p-2 rounded-md bg-background border">
              <Chrome className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm">
              <div className="font-semibold mb-1">
                {t("tools.vendorSync.extensionCard.title")}
              </div>
              <p className="text-muted-foreground">
                {t("tools.vendorSync.extensionCard.body")}
                {" "}
                <a
                  href={CHROME_EXTENSION_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {t("tools.vendorSync.extensionCard.cta")}
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Resume picker — only for authenticated users with at least one
            resume. Anonymous visitors and brand-new accounts see the
            vendor catalog directly; the per-card Sync button still
            requires auth via VendorCard's own gating. */}
        {isAuthenticated && resumes.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="resume-picker">{t("tools.vendorSync.resumePicker.label")}</Label>
              <Select value={selectedResumeId ?? ""} onValueChange={(v) => setSelectedResumeId(v)}>
                <SelectTrigger id="resume-picker" className="mt-1">
                  <SelectValue placeholder={t("tools.vendorSync.resumePicker.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}{r.isMaster ? ` (${t("tools.vendorSync.master")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("tools.vendorSync.resumePicker.help")}
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md p-3">
            {error}
          </div>
        )}

        {importingFromExt && (
          <div className="bg-muted border rounded-md p-3 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("tools.vendorSync.importingProgress")}
          </div>
        )}

        {!loading && !error && connectors.length > 0 && (
          <>
            {/* Single horizontally-scrollable filter row. Replaces the
                prior "one section per category" layout per #438. */}
            <CategoryFilterBar
              value={activeCategory}
              onChange={(next) => setActiveCategory(next)}
              allLabel={t("tools.vendorSync.allVendors")}
              allCount={connectors.length}
              options={VENDOR_CATEGORY_ORDER.map((cat) => ({
                value: cat,
                label: categoryLabels.long[cat],
                count: categoryCounts.get(cat) ?? 0,
              }))}
            />

            {/* Single unified grid — every visible card in one place,
                category surfaced via the in-card chip on <VendorCard>. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleConnectors.map((c) => (
                <VendorCard
                  key={c.id}
                  connector={c}
                  selectedResumeId={selectedResume?.id ?? null}
                  selectedResumeTitle={selectedResume?.title ?? null}
                  onRequestExtensionSync={handleRequestExtensionSync}
                />
              ))}
            </div>

            {visibleConnectors.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                {t("tools.vendorSync.emptyCategory")}
              </div>
            )}
          </>
        )}

      {/* Reuse MergeResumeDialog with preloaded analysis + a custom
          executor that hits /api/vendor-sync/:id/execute (so the audit
          row gets finalized atomically with the merge). */}
      {mergeDialogOpen && mergeImportResult && selectedResumeId && mergeConnectorId && (
        <MergeResumeDialog
          isOpen={mergeDialogOpen}
          onClose={() => {
            setMergeDialogOpen(false);
            setMergeImportResult(null);
            setMergeConnectorId(null);
          }}
          resumes={resumes}
          preselectedTargetId={selectedResumeId}
          preloaded={{
            analysis: mergeImportResult.analysis,
            sourceContent: mergeImportResult.sourceContent,
            targetContent: mergeImportResult.targetContent,
            defaultNewTitle: `${selectedResume?.title ?? "Resume"} (synced from ${
              connectors.find((c) => c.id === mergeConnectorId)?.label ?? mergeConnectorId
            })`,
          }}
          customExecutor={async (args) => {
            const res = await vendorSyncService.executeMerge(mergeConnectorId, {
              syncRunId: mergeImportResult.syncRunId,
              sourceContent: args.sourceContent,
              targetResumeId: args.targetResumeId,
              decisions: args.decisions,
              basicDecisions: args.basicDecisions,
              createNew: args.createNew,
              newTitle: args.newTitle,
            });
            return res;
          }}
          onMergeComplete={() => {
            setMergeDialogOpen(false);
            setMergeImportResult(null);
            setMergeConnectorId(null);
            // Refresh connectors so the "Last synced" badge updates.
            vendorSyncService.listConnectors().then(setConnectors).catch(() => {});
          }}
        />
      )}
    </ToolShell>
  );
}

