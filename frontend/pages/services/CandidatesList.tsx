// CandidatesList — recruiter-facing list of candidate_resumes scoped to
// the agency's company. Companion detail page at /recruit/candidates/:id
// handles variants + share creation.
//
// MVP import flow: paste a JSON Resume. File upload + PDF extraction
// reuses the existing tool pipeline and lands in a follow-up (same
// surface, bigger drawer).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2,
  Calendar,
  Eye,
  MapPin,
  Plus,
  Search,
  UserCheck,
} from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import RecruitTabs from "@/components/recruit/RecruitTabs";
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
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import {
  recruitService,
  type CandidateResumeRow,
  type RecruitScope,
} from "@/lib/services/recruit-service";

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

export default function CandidatesList() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [candidates, setCandidates] = useState<CandidateResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  // Load scope + candidates on mount and whenever the selected company changes.
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
      } catch {
        if (!isMounted) return;
        setCandidates([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [selectedCompanyId]);

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
      setCandidates((prev) => [row, ...prev]);
      setImportOpen(false);
      setImportJson("");
      toast({
        title: "Candidate imported",
        description: "The resume is saved privately to your company.",
      });
      navigate(`/recruit/candidates/${row.id}`);
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
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <div className="max-w-6xl mx-auto p-6">
            <RecruitTabs />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                  <UserCheck className="w-7 h-7 text-primary" />
                  Candidates
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Private to your company. Source, annotate, and share with hiring clients
                  through redacted + branded links.
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                <Button onClick={() => setImportOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Import Candidate
                </Button>
              </div>
            </div>

            {/* Search */}
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

            {/* No scope state */}
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

            {/* Empty state */}
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

            {/* Candidate grid */}
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
                  return (
                    <Link
                      key={row.id}
                      to={`/recruit/candidates/${row.id}`}
                      className="group rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex flex-col gap-3"
                    >
                      <div className="flex items-start gap-3">
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
          </div>
          <Footer />
        </div>
      </div>

      {/* Import dialog — JSON Resume paste for MVP. PDF upload lands in a
          follow-up that reuses the existing extract-text pipeline. */}
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
    </div>
  );
}
