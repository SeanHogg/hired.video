// PitchDeckBuilder — recruiter-facing editor for a single pitch deck.
// Three columns:
//   • Deck metadata (name, description, brand kit, deck-wide redaction,
//     status). Save-on-blur for inputs, save-on-change for selects.
//   • Slides — ordered list of candidates with fit summary + match score
//     + recruiter notes + per-slide redaction override. Reorder via
//     up/down arrows; remove inline.
//   • Share links panel — create a tokenized deck share + copy URL +
//     revoke, with view counters.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Plus,
  Save,
  Send,
  Share2,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import RecruitTabs from "@/components/recruit/RecruitTabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useSidebar } from "@/hooks/use-sidebar";
import {
  recruitService,
  type CandidateResumeRow,
  type PitchDeckRow,
  type PitchDeckShareRow,
  type PitchDeckSlideRow,
  type RecruitScope,
} from "@/lib/services/recruit-service";

const NONE = "__none__";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function displayName(row: CandidateResumeRow): string {
  const basics = (row.content as any)?.basics;
  return row.label || basics?.name || "Unnamed candidate";
}

export default function PitchDeckBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const [deck, setDeck] = useState<PitchDeckRow | null>(null);
  const [slides, setSlides] = useState<PitchDeckSlideRow[]>([]);
  const [candidatesById, setCandidatesById] = useState<Record<string, CandidateResumeRow>>({});
  const [shares, setShares] = useState<PitchDeckShareRow[]>([]);
  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Local metadata editor state — persists via save buttons, not live-updates.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metaDirty, setMetaDirty] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);

  const [addSlideOpen, setAddSlideOpen] = useState(false);
  const [availableCandidates, setAvailableCandidates] = useState<CandidateResumeRow[]>([]);
  const [expandedSlideId, setExpandedSlideId] = useState<string | null>(null);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareRecipientName, setShareRecipientName] = useState("");
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    (async () => {
      try {
        const [full, s, allShares] = await Promise.all([
          recruitService.getPitchDeck(id),
          recruitService.getMyScope(),
          recruitService.listDeckShares(id),
        ]);
        if (!isMounted) return;
        setDeck(full);
        setSlides(full.slides);
        setScope(s);
        setShares(allShares);
        setName(full.name);
        setDescription(full.description ?? "");
        setMetaDirty(false);

        // Hydrate candidate content for the slides.
        const companyCandidates = await recruitService.listCandidateResumes({
          companyId: full.companyId,
        });
        if (!isMounted) return;
        const byId: Record<string, CandidateResumeRow> = {};
        for (const c of companyCandidates) byId[c.id] = c;
        setCandidatesById(byId);
        const inDeck = new Set(full.slides.map((s) => s.candidateResumeId));
        setAvailableCandidates(companyCandidates.filter((c) => !inDeck.has(c.id)));
      } catch {
        if (!isMounted) return;
        setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const companyBrandKits = useMemo(
    () => scope?.brandKits ?? [],
    [scope],
  );
  const companyProfiles = useMemo(
    () =>
      (scope?.redactionProfiles ?? []).filter((p) => p.companyId === deck?.companyId),
    [scope, deck],
  );

  const handleSaveMeta = async () => {
    if (!deck) return;
    try {
      setMetaSaving(true);
      const updated = await recruitService.updatePitchDeck(deck.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setDeck((prev) => (prev ? { ...prev, ...updated } : prev));
      setMetaDirty(false);
      toast({ title: "Deck updated" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setMetaSaving(false);
    }
  };

  const patchDeck = async (patch: Partial<PitchDeckRow>) => {
    if (!deck) return;
    try {
      const updated = await recruitService.updatePitchDeck(deck.id, patch);
      setDeck((prev) => (prev ? { ...prev, ...updated } : prev));
      toast({ title: "Deck updated" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddSlide = async (candidateResumeId: string) => {
    if (!deck) return;
    try {
      const slide = await recruitService.addSlide(deck.id, {
        candidateResumeId,
        displayOrder: slides.length,
      });
      setSlides((prev) => [...prev, slide]);
      setAvailableCandidates((prev) =>
        prev.filter((c) => c.id !== candidateResumeId),
      );
      setAddSlideOpen(false);
      setExpandedSlideId(slide.id);
    } catch (e) {
      toast({
        title: "Add failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveSlide = async (slideId: string) => {
    if (!deck) return;
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) return;
    try {
      await recruitService.removeSlide(deck.id, slideId);
      setSlides((prev) => prev.filter((s) => s.id !== slideId));
      const candidate = candidatesById[slide.candidateResumeId];
      if (candidate) setAvailableCandidates((prev) => [...prev, candidate]);
    } catch (e) {
      toast({
        title: "Remove failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReorderSlide = async (slideId: string, direction: -1 | 1) => {
    if (!deck) return;
    const idx = slides.findIndex((s) => s.id === slideId);
    const nextIdx = idx + direction;
    if (idx === -1 || nextIdx < 0 || nextIdx >= slides.length) return;

    const reordered = [...slides];
    [reordered[idx], reordered[nextIdx]] = [reordered[nextIdx], reordered[idx]];

    // Optimistic update — persist both new displayOrders in the background.
    const withNewOrder = reordered.map((s, i) => ({ ...s, displayOrder: i }));
    setSlides(withNewOrder);

    try {
      await Promise.all(
        withNewOrder.map((s) =>
          recruitService.updateSlide(deck.id, s.id, { displayOrder: s.displayOrder }),
        ),
      );
    } catch (e) {
      toast({
        title: "Reorder failed",
        description: (e as Error)?.message ?? "Please refresh.",
        variant: "destructive",
      });
    }
  };

  const patchSlide = async (
    slideId: string,
    patch: Partial<
      Pick<
        PitchDeckSlideRow,
        "fitSummary" | "matchScore" | "recruiterNotes" | "redactionProfileId"
      >
    >,
  ) => {
    if (!deck) return;
    try {
      const updated = await recruitService.updateSlide(deck.id, slideId, patch);
      setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, ...updated } : s)));
    } catch (e) {
      toast({
        title: "Slide save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateShare = async () => {
    if (!deck) return;
    try {
      setShareBusy(true);
      const share = await recruitService.createDeckShare(deck.id, {
        recipientName: shareRecipientName.trim() || undefined,
        recipientEmail: shareRecipientEmail.trim() || undefined,
        expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : undefined,
      });
      setShares((prev) => [share, ...prev]);
      setShareDialogOpen(false);
      setShareRecipientName("");
      setShareRecipientEmail("");
      setShareExpiresAt("");
      // Auto-copy the URL to the clipboard for fast "create and send".
      const url = `${window.location.origin}/share/pitch-deck/${share.shareToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Share link created + copied",
          description: "Paste it into your email or Slack to the hiring client.",
        });
      } catch {
        toast({
          title: "Share link created",
          description: url,
        });
      }
    } catch (e) {
      toast({
        title: "Failed to create share",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShare = async (share: PitchDeckShareRow) => {
    const url = `${window.location.origin}/share/pitch-deck/${share.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareId(share.id);
      setTimeout(() => setCopiedShareId(null), 2000);
    } catch {
      toast({ title: "Clipboard unavailable", description: url, variant: "destructive" });
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      await recruitService.revokeDeckShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (e) {
      toast({
        title: "Revoke failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDeck = async () => {
    if (!deck) return;
    if (!window.confirm("Delete this deck? Slides and shares will also be removed.")) return;
    try {
      await recruitService.deletePitchDeck(deck.id);
      toast({ title: "Deck deleted" });
      navigate("/recruit/pitch-decks");
    } catch (e) {
      toast({
        title: "Delete failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
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

            <div className="mb-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/recruit/pitch-decks">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  All decks
                </Link>
              </Button>
            </div>

            {loading && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
                Loading deck…
              </div>
            )}

            {!loading && (notFound || !deck) && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <h2 className="font-semibold">Deck not found</h2>
              </div>
            )}

            {!loading && deck && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-6">
                  {/* Metadata card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">Deck details</CardTitle>
                        <div className="flex items-center gap-2">
                          <Select
                            value={deck.status}
                            onValueChange={(v: "draft" | "sent" | "archived") =>
                              patchDeck({ status: v })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="sent">Sent</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeleteDeck}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            setMetaDirty(true);
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea
                          value={description}
                          onChange={(e) => {
                            setDescription(e.target.value);
                            setMetaDirty(true);
                          }}
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Brand kit</Label>
                          <Select
                            value={deck.whitelabelTenantId ?? NONE}
                            onValueChange={(v) =>
                              patchDeck({
                                whitelabelTenantId: v === NONE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pick a brand kit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>None (plain chrome)</SelectItem>
                              {companyBrandKits.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Default redaction</Label>
                          <Select
                            value={deck.redactionProfileId ?? NONE}
                            onValueChange={(v) =>
                              patchDeck({
                                redactionProfileId: v === NONE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pick a profile" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>None (fallback defaults)</SelectItem>
                              {companyProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {p.isDefault ? " (default)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {metaDirty && (
                        <Button size="sm" onClick={handleSaveMeta} disabled={metaSaving}>
                          <Save className="w-4 h-4 mr-1" />
                          {metaSaving ? "Saving…" : "Save changes"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Slides list */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <UserCheck className="w-4 h-4" />
                          Slides
                          <Badge variant="outline" className="ml-1">
                            {slides.length}
                          </Badge>
                        </CardTitle>
                        <Button
                          size="sm"
                          onClick={() => setAddSlideOpen(true)}
                          disabled={availableCandidates.length === 0}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add candidate
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {slides.length === 0 && (
                        <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No candidates in this deck yet. Click{" "}
                          <span className="font-medium">Add candidate</span> to pull from your
                          company's candidate pool.
                        </div>
                      )}
                      {slides.map((slide, idx) => {
                        const candidate = candidatesById[slide.candidateResumeId];
                        const candidateName = candidate
                          ? displayName(candidate)
                          : "Unknown candidate";
                        const expanded = expandedSlideId === slide.id;
                        return (
                          <div
                            key={slide.id}
                            className="rounded border bg-card overflow-hidden"
                          >
                            <div className="flex items-center gap-2 p-3">
                              <div className="text-xs text-muted-foreground w-6 text-center">
                                {idx + 1}
                              </div>
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-xs">
                                  {initials(candidateName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{candidateName}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                  {typeof slide.matchScore === "number" && (
                                    <span className="inline-flex items-center gap-1">
                                      <Sparkles className="w-3 h-3" />
                                      {slide.matchScore}% match
                                    </span>
                                  )}
                                  {slide.fitSummary && (
                                    <span className="truncate italic">
                                      "{slide.fitSummary}"
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={idx === 0}
                                  onClick={() => handleReorderSlide(slide.id, -1)}
                                  title="Move up"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={idx === slides.length - 1}
                                  onClick={() => handleReorderSlide(slide.id, 1)}
                                  title="Move down"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setExpandedSlideId(expanded ? null : slide.id)
                                  }
                                >
                                  {expanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveSlide(slide.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            {expanded && (
                              <SlideEditor
                                slide={slide}
                                companyProfiles={companyProfiles}
                                deckDefaultProfileId={deck.redactionProfileId}
                                onPatch={(patch) => patchSlide(slide.id, patch)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>

                {/* Right sidebar — share links */}
                <aside className="space-y-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Share2 className="w-4 h-4" />
                          Share links
                          <Badge variant="outline" className="ml-1">
                            {shares.length}
                          </Badge>
                        </CardTitle>
                        <Button
                          size="sm"
                          onClick={() => setShareDialogOpen(true)}
                          disabled={slides.length === 0}
                        >
                          <Send className="w-4 h-4 mr-1" />
                          New
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {slides.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Add at least one candidate before creating a share link.
                        </p>
                      )}
                      {slides.length > 0 && shares.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No shares yet. Click <span className="font-medium">New</span> to
                          generate a public link for a hiring client.
                        </p>
                      )}
                      {shares.map((share) => {
                        const url = `${window.location.origin}/share/pitch-deck/${share.shareToken}`;
                        const expired =
                          share.expiresAt &&
                          new Date(share.expiresAt).getTime() < Date.now();
                        return (
                          <div
                            key={share.id}
                            className="rounded border p-2 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  {share.recipientName || share.recipientEmail || "Link"}
                                </div>
                                <div className="text-muted-foreground">
                                  {share.viewCount} view{share.viewCount === 1 ? "" : "s"}
                                  {share.lastViewedAt && (
                                    <>
                                      {" "}· last{" "}
                                      {new Date(share.lastViewedAt).toLocaleDateString()}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {!share.isActive && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Revoked
                                  </Badge>
                                )}
                                {expired && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Expired
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] flex-1 justify-start"
                                onClick={() => handleCopyShare(share)}
                              >
                                {copiedShareId === share.id ? (
                                  <>
                                    <Check className="w-3 h-3 mr-1" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy link
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px]"
                                asChild
                              >
                                <a href={url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </Button>
                              {share.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px]"
                                  onClick={() => handleRevokeShare(share.id)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </aside>
              </div>
            )}
          </div>
          <Footer />
        </div>
      </div>

      {/* Add candidate dialog */}
      <Dialog open={addSlideOpen} onOpenChange={setAddSlideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add candidate to deck</DialogTitle>
            <DialogDescription>
              Pick from your company's candidate pool. The slide inherits the deck's default
              redaction profile unless you override it inline.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto divide-y">
            {availableCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                All candidates are already in this deck. Import more candidates to add to a
                new deck.
              </p>
            ) : (
              availableCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleAddSlide(candidate.id)}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-muted/50 px-2 rounded"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs">
                      {initials(displayName(candidate))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{displayName(candidate)}</div>
                    {((candidate.content as any)?.basics?.label) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {(candidate.content as any).basics.label}
                      </div>
                    )}
                  </div>
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSlideOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share creation dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this deck</DialogTitle>
            <DialogDescription>
              Creates an unauthenticated link that applies this deck's brand kit + redaction
              profile at render time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Recipient name (optional)</Label>
                <Input
                  value={shareRecipientName}
                  onChange={(e) => setShareRecipientName(e.target.value)}
                  placeholder="Jane at Contoso"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Recipient email (optional)</Label>
                <Input
                  type="email"
                  value={shareRecipientEmail}
                  onChange={(e) => setShareRecipientEmail(e.target.value)}
                  placeholder="jane@contoso.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expires (optional)</Label>
              <Input
                type="datetime-local"
                value={shareExpiresAt}
                onChange={(e) => setShareExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShareDialogOpen(false)}
              disabled={shareBusy}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateShare} disabled={shareBusy}>
              {shareBusy ? "Creating…" : "Create + copy link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------------------------------------------------------------------
// Inline slide editor — rendered when a slide is expanded in the list.
// -------------------------------------------------------------------------

function SlideEditor({
  slide,
  companyProfiles,
  deckDefaultProfileId,
  onPatch,
}: {
  slide: PitchDeckSlideRow;
  companyProfiles: { id: string; name: string; isDefault: boolean }[];
  deckDefaultProfileId: string | null;
  onPatch: (
    patch: Partial<
      Pick<
        PitchDeckSlideRow,
        "fitSummary" | "matchScore" | "recruiterNotes" | "redactionProfileId"
      >
    >,
  ) => void;
}) {
  const [fitSummary, setFitSummary] = useState(slide.fitSummary ?? "");
  const [matchScore, setMatchScore] = useState<string>(
    slide.matchScore == null ? "" : String(slide.matchScore),
  );
  const [recruiterNotes, setRecruiterNotes] = useState(slide.recruiterNotes ?? "");
  const [dirty, setDirty] = useState(false);

  const save = () => {
    onPatch({
      fitSummary: fitSummary.trim() || null,
      matchScore: matchScore === "" ? null : Math.max(0, Math.min(100, Number(matchScore))),
      recruiterNotes: recruiterNotes.trim() || null,
    });
    setDirty(false);
  };

  const defaultLabel = deckDefaultProfileId
    ? companyProfiles.find((p) => p.id === deckDefaultProfileId)?.name ?? "deck default"
    : "deck default";

  return (
    <div className="border-t px-3 py-3 space-y-3 bg-muted/20 text-xs">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Fit summary (shown on reviewer slide)</Label>
          <Textarea
            value={fitSummary}
            onChange={(e) => {
              setFitSummary(e.target.value);
              setDirty(true);
            }}
            rows={2}
            placeholder="Why this candidate fits the role in 1–2 sentences."
            className="text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Match score (0–100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={matchScore}
            onChange={(e) => {
              setMatchScore(e.target.value);
              setDirty(true);
            }}
            className="h-8"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Recruiter notes (internal)</Label>
        <Textarea
          value={recruiterNotes}
          onChange={(e) => {
            setRecruiterNotes(e.target.value);
            setDirty(true);
          }}
          rows={2}
          placeholder="Only visible to your team. Skipped on the reviewer slide."
          className="text-xs"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1 flex-1">
          <Label className="text-xs">Redaction override</Label>
          <Select
            value={slide.redactionProfileId ?? NONE}
            onValueChange={(v) =>
              onPatch({ redactionProfileId: v === NONE ? null : v })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Inherit {defaultLabel}</SelectItem>
              {companyProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {dirty && (
          <Button size="sm" onClick={save} className="self-end h-8">
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
