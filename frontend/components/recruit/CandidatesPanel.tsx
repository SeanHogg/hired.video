// CandidatesPanel — agency-scoped candidate list. Mounted by the
// `sourced` tab descriptor on `/resumes?tab=sourced` (see EntityHubShell
// + gap #400). Per-candidate detail at `/services/candidates/:id`.
// Self-gating row action "Add to Job" bridges pool → pipeline.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import {
  Briefcase,
  Building2,
  Calendar,
  Eye,
  MapPin,
  Plus,
  Sparkles,
  UserCheck,
  Upload,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  recruitService,
  type CandidateResumeRow,
  type RecruitScope,
} from "@/lib/services/recruit-service";
import { initials } from "@/lib/utils/initials";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import BulkScoreDialog from "@/components/recruit/BulkScoreDialog";
import CsvImportCandidatesDialog from "@/components/recruit/CsvImportCandidatesDialog";
import AddCandidateToJobDialog from "@/components/recruit/AddCandidateToJobDialog";

interface Basics {
  name?: string;
  label?: string;
  email?: string;
  location?: { city?: string; region?: string; countryCode?: string };
}

function basicsOf(row: CandidateResumeRow): Basics {
  const basics = (row.content as any)?.basics;
  return basics && typeof basics === "object" ? (basics as Basics) : {};
}

function displayName(row: CandidateResumeRow, fallback: string): string {
  const basics = basicsOf(row);
  return row.label || basics.name || fallback;
}

function displayTitle(row: CandidateResumeRow): string | null {
  return basicsOf(row).label ?? null;
}

function displayLocation(row: CandidateResumeRow): string | null {
  const loc = basicsOf(row).location;
  if (!loc) return null;
  return [loc.city, loc.region].filter(Boolean).join(", ") || null;
}


interface CandidatesPanelProps {
  /** Fires whenever the loaded candidate count changes. Lets callers show a count badge. */
  onCountChange?: (count: number) => void;
  /** Hide the company picker + import button when the host page already exposes them. */
  hideHeaderControls?: boolean;
  /** When the host owns the scope (sourced tab on /resumes), it passes
   *  these in so the panel reads the same companyId as the lifted header
   *  controls instead of mounting a second copy of the scope hook. */
  companyIdOverride?: string | null;
  scopeOverride?: RecruitScope | null;
  /** Bump to force the panel to refetch — the host uses this after the
   *  lifted import controls add a new candidate. */
  refreshNonce?: number;
}

export default function CandidatesPanel({
  onCountChange,
  hideHeaderControls = false,
  companyIdOverride,
  scopeOverride,
  refreshNonce,
}: CandidatesPanelProps) {
  const { t } = useTranslation();
  const internalScope = useCurrentCompanyScope();
  const scope = scopeOverride !== undefined ? scopeOverride : internalScope.scope;
  const selectedCompanyId =
    companyIdOverride !== undefined ? companyIdOverride : internalScope.companyId;
  const setSelectedCompanyId = internalScope.setCompanyId;

  const unnamedFallback = t("labels.unnamedCandidate");
  // Read the search query from the URL (`?q=`) via the canonical 2-char
  // gate — the global HeaderSearch writes there, sub-threshold input
  // ("A") collapses to "" so the panel shows the full candidate list
  // until the query is meaningful.
  const { effective: searchText } = useSearchQueryParam();

  const [candidates, setCandidates] = useState<CandidateResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkScoreOpen, setBulkScoreOpen] = useState(false);
  // Pool → pipeline bridge: clicking "Add to Job" on a row opens the
  // job picker dialog with the candidate's basics pre-filled. The pool
  // row itself is unchanged — pool and pipeline are separate concepts.
  const [addToJobTarget, setAddToJobTarget] = useState<{
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    candidateUserId?: string | null;
  } | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const rows = await recruitService.listCandidateResumes(
          selectedCompanyId ? { companyId: selectedCompanyId } : undefined,
        );
        if (!isMounted) return;
        setCandidates(rows);
        onCountChange?.(rows.length);
      } catch {
        if (!isMounted) return;
        setCandidates([]);
        onCountChange?.(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [selectedCompanyId, onCountChange, refreshNonce]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((row) => {
      const name = displayName(row, unnamedFallback).toLowerCase();
      const title = (displayTitle(row) ?? "").toLowerCase();
      const loc = (displayLocation(row) ?? "").toLowerCase();
      return name.includes(q) || title.includes(q) || loc.includes(q);
    });
  }, [candidates, searchText, unnamedFallback]);

  const prependCandidates = (rows: CandidateResumeRow[]) => {
    setCandidates((prev) => {
      const next = [...rows, ...prev];
      onCountChange?.(next.length);
      return next;
    });
  };

  return (
    <div>
      {!hideHeaderControls && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <CandidatesHeaderActions
            scope={scope}
            companyId={selectedCompanyId}
            onCompanyChange={setSelectedCompanyId}
            onImported={prependCandidates}
          />
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 mb-3 p-2 border rounded bg-muted/40">
          <span className="text-sm font-medium">
            {t("labels.selectedCount", { count: selectedIds.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              {t("actions.clear")}
            </Button>
            <Button size="sm" onClick={() => setBulkScoreOpen(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              {t("actions.bulkScore")}
            </Button>
          </div>
        </div>
      )}

      {scope && scope.companies.length === 0 && !loading && (
        <div className="rounded-lg border bg-muted/30 p-10 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">{t("prompts.noRecruitingCompany")}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {t("messages.noRecruitingCompanyDesc")}
          </p>
          <Button asChild className="mt-4">
            <Link to="/companies/create">{t("actions.createCompany")}</Link>
          </Button>
        </div>
      )}

      {scope && scope.companies.length > 0 && !loading && filtered.length === 0 && (
        <div className="rounded-lg border bg-muted/30 p-10 text-center">
          <UserCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">
            {candidates.length === 0
              ? t("prompts.noCandidatesYet")
              : t("prompts.noCandidatesMatchSearch")}
          </h3>
          {candidates.length === 0 && (
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {t("prompts.noCandidatesPaste")}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((row) => {
            const name = displayName(row, unnamedFallback);
            const title = displayTitle(row);
            const location = displayLocation(row);
            const isSelected = selectedIds.has(row.id);
            return (
              <Link
                key={row.id}
                to={`/services/candidates/${row.id}`}
                className={`group rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex flex-col gap-3 ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSelect(row.id);
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      aria-label={t("labels.selectAriaName", { name })}
                    />
                  </div>
                  <Avatar className="w-12 h-12">
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold truncate">{name}</h3>
                      {row.isActive && (
                        <Badge variant="default" className="text-xs">
                          {t("candidateStatus.active")}
                        </Badge>
                      )}
                    </div>
                    {title && (
                      <p className="text-sm text-muted-foreground truncate">{title}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t("labels.addedDate", {
                      date: new Date(row.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }),
                    })}
                  </span>
                </div>
                <div className="mt-auto flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const basics = basicsOf(row);
                      setAddToJobTarget({
                        name: name,
                        email: basics.email ?? null,
                        location:
                          [basics.location?.city, basics.location?.region].filter(Boolean).join(", ") ||
                          null,
                        candidateUserId: row.linkedUserId ?? null,
                      });
                    }}
                  >
                    <Briefcase className="w-4 h-4 mr-1" />
                    Add to Job
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {t("actions.view")}
                  </Button>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <BulkScoreDialog
        open={bulkScoreOpen}
        onOpenChange={setBulkScoreOpen}
        resumeIds={Array.from(selectedIds)}
      />

      <AddCandidateToJobDialog
        open={addToJobTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAddToJobTarget(null);
        }}
        candidate={addToJobTarget}
      />
    </div>
  );
}

// ─── Header actions ──────────────────────────────────────────────────────────
// Standalone export so the host page (e.g. /resumes?tab=sourced) can lift the
// company picker + import buttons into the EntityHubShell page-header slot
// while CandidatesPanel itself renders the body. The component owns the
// dialog state internally and emits new candidate rows via `onImported` so
// callers can decide how to surface them (prepend, refetch, …).

interface CandidatesHeaderActionsProps {
  scope: RecruitScope | null;
  companyId: string | null;
  onCompanyChange: (id: string) => void;
  onImported: (rows: CandidateResumeRow[]) => void;
}

export function CandidatesHeaderActions({
  scope,
  companyId,
  onCompanyChange,
  onImported,
}: CandidatesHeaderActionsProps): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [csvOpen, setCsvOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const handleImport = async () => {
    if (!companyId) {
      toast({
        title: t("messages.noCompanySelected"),
        description: t("messages.noCompanySelectedDesc"),
        variant: "destructive",
      });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      toast({
        title: t("errors.couldNotParseJson"),
        description: t("errors.couldNotParseJsonDesc"),
        variant: "destructive",
      });
      return;
    }
    try {
      setImportBusy(true);
      const row = await recruitService.createCandidateResume({
        companyId,
        content: parsed as Record<string, unknown>,
      });
      onImported([row]);
      setImportOpen(false);
      setImportJson("");
      toast({
        title: t("messages.candidateImported"),
        description: t("messages.candidateImportedDesc"),
      });
      navigate(`/services/candidates/${row.id}`);
    } catch (e) {
      toast({
        title: t("errors.importFailed"),
        description: (e as Error)?.message ?? t("errors.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <>
      {scope && scope.companies.length > 1 && (
        <Select value={companyId ?? ""} onValueChange={onCompanyChange}>
          <SelectTrigger className="w-[220px]">
            <Building2 className="w-4 h-4 mr-1" />
            <SelectValue placeholder={t("labels.companies")} />
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
      <Button variant="outline" onClick={() => setCsvOpen(true)}>
        <Upload className="w-4 h-4 mr-1" />
        {t("actions.importCsv")}
      </Button>
      <Button onClick={() => setImportOpen(true)}>
        <Plus className="w-4 h-4 mr-1" />
        {t("actions.importJson")}
      </Button>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("headings.importCandidateResume")}</DialogTitle>
            <DialogDescription>
              <Trans
                i18nKey="messages.importJsonResumeDesc"
                components={{
                  link: (
                    <a
                      href="https://jsonresume.org/schema"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    />
                  ),
                }}
              />
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"basics": {"name": "...", "label": "...", ...}, "work": [...], "education": [...], ...}'
            rows={14}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importBusy}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleImport} disabled={importBusy || !importJson.trim()}>
              {importBusy ? t("status.importing") : t("actions.import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportCandidatesDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        companyId={companyId}
        onImported={(rows) => onImported(rows)}
      />
    </>
  );
}
