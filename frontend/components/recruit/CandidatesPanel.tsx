// CandidatesPanel — agency-scoped candidate list extracted so the same
// surface can render inside the dedicated `/services/candidates` page and
// inside the `/jobs` Candidates tab without duplicating fetch / search /
// import behaviour.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2,
  Calendar,
  Eye,
  MapPin,
  Plus,
  Search,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import {
  recruitService,
  type CandidateResumeRow,
  type RecruitScope,
} from "@/lib/services/recruit-service";
import BulkScoreDialog from "@/components/recruit/BulkScoreDialog";
import CsvImportCandidatesDialog from "@/components/recruit/CsvImportCandidatesDialog";

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

function displayName(row: CandidateResumeRow): string {
  const basics = basicsOf(row);
  return row.label || basics.name || "Unnamed candidate";
}

function displayTitle(row: CandidateResumeRow): string | null {
  return basicsOf(row).label ?? null;
}

function displayLocation(row: CandidateResumeRow): string | null {
  const loc = basicsOf(row).location;
  if (!loc) return null;
  return [loc.city, loc.region].filter(Boolean).join(", ") || null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}

interface CandidatesPanelProps {
  /** Fires whenever the loaded candidate count changes. Lets callers show a count badge. */
  onCountChange?: (count: number) => void;
  /** Hide the company picker + import button when the host page already exposes them. */
  hideHeaderControls?: boolean;
}

export default function CandidatesPanel({
  onCountChange,
  hideHeaderControls = false,
}: CandidatesPanelProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [candidates, setCandidates] = useState<CandidateResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkScoreOpen, setBulkScoreOpen] = useState(false);

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
    if (!isAuthenticated) return;
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const s = await recruitService.getMyScope();
        if (!isMounted) return;
        setScope(s);
        setSelectedCompanyId(s.primaryCompanyId ?? s.companies[0]?.id ?? null);
      } catch {
        if (!isMounted) return;
        toast({
          title: "Failed to load recruiting scope",
          description: "Check that you own or belong to at least one company.",
          variant: "destructive",
        });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, toast]);

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
  }, [selectedCompanyId, onCountChange]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((row) => {
      const name = displayName(row).toLowerCase();
      const title = (displayTitle(row) ?? "").toLowerCase();
      const loc = (displayLocation(row) ?? "").toLowerCase();
      return name.includes(q) || title.includes(q) || loc.includes(q);
    });
  }, [candidates, searchText]);

  const handleImport = async () => {
    if (!selectedCompanyId) {
      toast({
        title: "No company selected",
        description: "Pick the company this candidate should be scoped to.",
        variant: "destructive",
      });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      toast({
        title: "Could not parse JSON",
        description: "Paste a valid JSON Resume payload (basics / work / education / ...).",
        variant: "destructive",
      });
      return;
    }
    try {
      setImportBusy(true);
      const row = await recruitService.createCandidateResume({
        companyId: selectedCompanyId,
        content: parsed as Record<string, unknown>,
      });
      setCandidates((prev) => {
        const next = [row, ...prev];
        onCountChange?.(next.length);
        return next;
      });
      setImportOpen(false);
      setImportJson("");
      toast({
        title: "Candidate imported",
        description: "The resume is saved privately to your company.",
      });
      navigate(`/services/candidates/${row.id}`);
    } catch (e) {
      toast({
        title: "Import failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div>
      {!hideHeaderControls && (
        <div className="flex items-center justify-end gap-2 mb-4">
          {scope && scope.companies.length > 1 && (
            <Select
              value={selectedCompanyId ?? ""}
              onValueChange={(v) => setSelectedCompanyId(v)}
            >
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
          <Button variant="outline" onClick={() => setCsvOpen(true)}>
            <Upload className="w-4 h-4 mr-1" />
            Import CSV
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Import JSON
          </Button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 mb-3 p-2 border rounded bg-muted/40">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setBulkScoreOpen(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Bulk score
            </Button>
          </div>
        </div>
      )}

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by name, title, or location"
          className="pl-9"
        />
      </div>

      {scope && scope.companies.length === 0 && !loading && (
        <div className="rounded-lg border bg-muted/30 p-10 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">No recruiting company yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Create a company profile first. Candidates, brand kits, and pitch decks are
            all scoped to a company so your data stays private to your agency.
          </p>
          <Button asChild className="mt-4">
            <Link to="/companies/create">Create a company</Link>
          </Button>
        </div>
      )}

      {scope && scope.companies.length > 0 && !loading && filtered.length === 0 && (
        <div className="rounded-lg border bg-muted/30 p-10 text-center">
          <UserCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">
            {candidates.length === 0
              ? "No candidates yet"
              : "No candidates match your search"}
          </h3>
          {candidates.length === 0 && (
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Paste a JSON Resume to get started — your candidate's data stays private to
              your company, and you can share a redacted version with hiring clients.
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
            const name = displayName(row);
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
                    <Checkbox checked={isSelected} aria-label={`Select ${name}`} />
                  </div>
                  <Avatar className="w-12 h-12">
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold truncate">{name}</h3>
                      {row.isActive && (
                        <Badge variant="default" className="text-xs">
                          Active
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
                    Added{" "}
                    {new Date(row.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-auto flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Button>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import candidate resume</DialogTitle>
            <DialogDescription>
              Paste a JSON Resume payload (
              <a
                href="https://jsonresume.org/schema"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                schema
              </a>
              ). The candidate is scoped privately to your company; you can create variants
              and share a redacted version with hiring clients from the detail page.
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
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importBusy || !importJson.trim()}>
              {importBusy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkScoreDialog
        open={bulkScoreOpen}
        onOpenChange={setBulkScoreOpen}
        resumeIds={Array.from(selectedIds)}
      />

      <CsvImportCandidatesDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        companyId={selectedCompanyId}
        onImported={(rows) => {
          setCandidates((prev) => [...rows, ...prev]);
          onCountChange?.(candidates.length + rows.length);
        }}
      />
    </div>
  );
}
