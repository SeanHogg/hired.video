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
  VENDOR_CATEGORY_LABEL,
  VENDOR_CATEGORY_ORDER,
  type VendorCategory,
} from "@/components/sync/category-labels";
import { useExtensionBridge } from "@/hooks/use-extension-bridge";
import MergeResumeDialog from "@/components/MergeResumeDialog";

type CategoryFilter = VendorCategory | "all";

export default function VendorSync() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [connectors, setConnectors] = useState<VendorConnectorListItem[]>([]);
  const [resumes, setResumes] = useState<ResumeWithOwnership[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const master = rs.find((r) => r.isMaster) ?? rs[0] ?? null;
        if (master) setSelectedResumeId(master.id);
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
  }, [isAuthenticated]);

  // Bridge: send the request when a card asks. The actual roundtrip is
  // service-worker → profile-tab → service-worker → broadcast back.
  const { send } = useExtensionBridge({});
  const handleRequestExtensionSync = useCallback((connectorId: string) => {
    pendingConnectorRef.current = connectorId;
    send("vendor-sync:request-focused-html", { connectorId });
  }, [send]);

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
          title: "Couldn't identify the vendor",
          description: payload.error ?? "Open your profile on a supported site (LinkedIn, Indeed) and try again.",
          variant: "destructive",
        });
        return;
      }
      if (!payload.html) {
        toast({
          title: "No profile detected",
          description: payload.error === "NO_PROFILE_TAB"
            ? "Open your profile on a supported site (LinkedIn, Indeed) in another tab, then click Sync again."
            : payload.error === "NO_FOCUSED_PANE"
            ? "We couldn't read the profile pane on that page. Make sure you're on your own /in/<handle> page."
            : payload.error ?? "Try again with the profile tab focused.",
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
          title: "Failed to extract profile",
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
        icon: <Chrome className="h-6 w-6 text-blue-600" />,
        iconBgClassName: "bg-blue-100 dark:bg-blue-900/30",
        title: "LinkedIn & Profile Sync",
        description:
          "Manage your master resume on hired.video — push it out to LinkedIn, Indeed, Glassdoor, GitHub and more, and pull updates back.",
      }}
      authOverlay={{
        show: !isAuthenticated,
        message:
          "Sign in to sync your master resume out to LinkedIn, Indeed, Glassdoor, GitHub and more — and pull profile updates back.",
      }}
      containerClassName="max-w-7xl mx-auto space-y-6"
    >
        {/* Extension highlight */}
        <Card className="border-blue-300/50 bg-blue-50/30 dark:bg-blue-950/20">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <div className="p-2 rounded-md bg-background border">
              <Chrome className="h-5 w-5 text-blue-600" />
            </div>
            <div className="text-sm">
              <div className="font-semibold mb-1">
                Faster with the hired.video Chrome extension
              </div>
              <p className="text-muted-foreground">
                Install the extension to sync changes directly between your hired.video master and your live profile pages —
                no copy/paste required. The cards below highlight which vendors support extension-driven sync today.
                {" "}
                <a
                  href="https://chromewebstore.google.com/search/hired.video"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Get the extension
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
              <Label htmlFor="resume-picker">Resume to sync</Label>
              <Select value={selectedResumeId ?? ""} onValueChange={(v) => setSelectedResumeId(v)}>
                <SelectTrigger id="resume-picker" className="mt-1">
                  <SelectValue placeholder="Choose a resume" />
                </SelectTrigger>
                <SelectContent>
                  {resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}{r.isMaster ? " (master)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Imports always merge into your master. Exports render from the resume you pick here.
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
            Extracting your profile and analyzing for merge…
          </div>
        )}

        {!loading && !error && connectors.length > 0 && (
          <>
            {/* Single horizontally-scrollable filter row. Replaces the
                prior "one section per category" layout per #438. */}
            <CategoryFilterBar
              value={activeCategory}
              onChange={setActiveCategory}
              allLabel="All vendors"
              allCount={connectors.length}
              options={VENDOR_CATEGORY_ORDER.map((cat) => ({
                value: cat,
                label: VENDOR_CATEGORY_LABEL[cat],
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
                No vendors in this category yet — switch the filter or pick All vendors.
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

