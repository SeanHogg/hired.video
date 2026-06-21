// PitchDecksList — grid of agency-authored pitch decks. Each deck bundles
// multiple redacted candidates with fit summaries + match scores for a
// hiring client. Clicking a deck opens the builder at /people/pitch-decks/:id.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  Building2,
  FileText,
  LayoutPanelLeft,
  Plus,
  Search,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { usePeopleTabs } from "@/hooks/use-people-tabs";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  recruitService,
  type PitchDeckRow,
} from "@/lib/services/recruit-service";

const STATUS_ICON: Record<PitchDeckRow["status"], React.ComponentType<any>> = {
  draft: FileText,
  sent: Send,
  archived: Archive,
};

export default function PitchDecksList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const peopleTabs = usePeopleTabs();

  // #905 — One scope fetch per surface. The hook owns getMyScope() +
  // selected-company state so the page-level + tabs hook share the
  // round-trip instead of each firing its own.
  const { scope, companyId: selectedCompanyId, setCompanyId: setSelectedCompanyId } = useCurrentCompanyScope();
  const [decks, setDecks] = useState<PitchDeckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newBusy, setNewBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const rows = await recruitService.listPitchDecks(selectedCompanyId ?? undefined);
        if (!isMounted) return;
        setDecks(rows);
      } catch {
        if (!isMounted) return;
        setDecks([]);
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
    if (!q) return decks;
    return decks.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q),
    );
  }, [decks, searchText]);

  const handleCreate = async () => {
    if (!selectedCompanyId) {
      toast({ title: "No company selected", variant: "destructive" });
      return;
    }
    if (!newName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      setNewBusy(true);
      // Default the deck's redaction profile to the company default so
      // sliding new candidates in works immediately without extra setup.
      const defaultProfile = scope?.redactionProfiles.find(
        (p) => p.companyId === selectedCompanyId && p.isDefault,
      );
      const defaultBrand = scope?.brandKits[0]?.id;
      const deck = await recruitService.createPitchDeck({
        companyId: selectedCompanyId,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        redactionProfileId: defaultProfile?.id,
        whitelabelTenantId: defaultBrand,
      });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      navigate(`/people/pitch-decks/${deck.id}`);
    } catch (e) {
      toast({
        title: "Failed to create deck",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setNewBusy(false);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
        <div className="p-4 md:p-6">
            {/* One action panel: the People tab strip, the deck search, the
                company scope switcher and the New Deck button all live in the
                single sticky band. The redundant "Pitch Decks" title is gone —
                the active tab already names the surface. */}
            <PageHeader
              tabs={peopleTabs}
              activeTabKey="pitch-decks"
              search={
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search decks by name or description"
                    className="pl-9"
                  />
                </div>
              }
              actions={
                <>
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
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    New Deck
                  </Button>
                </>
              }
            />

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-28 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <LayoutPanelLeft className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold">
                  {decks.length === 0
                    ? "No pitch decks yet"
                    : "No decks match your search"}
                </h3>
                {decks.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    Bundle 3–8 candidates into a shareable deck. Pick a deck-wide brand kit
                    and redaction profile, drop in candidates, generate a share link.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((deck) => {
                  const StatusIcon = STATUS_ICON[deck.status];
                  return (
                    <Link
                      key={deck.id}
                      to={`/people/pitch-decks/${deck.id}`}
                      className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-tight truncate">{deck.name}</h3>
                        <Badge variant="outline" className="shrink-0 capitalize">
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {deck.status}
                        </Badge>
                      </div>
                      {deck.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {deck.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-auto">
                        Updated{" "}
                        {new Date(deck.updatedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
        </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New pitch deck</DialogTitle>
            <DialogDescription>
              Give it a name you'd send to a client — e.g. "Q2 Senior Engineers — Contoso".
              Add candidates on the next screen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Q2 Senior Engineers — Contoso"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Short context — what role, why these candidates, any notes for the reviewer."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={newBusy}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={newBusy || !newName.trim()}>
              {newBusy ? "Creating…" : "Create deck"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
