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
import { useTranslation } from "react-i18next";
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
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { confirmDialog } from "@/lib/dialogs";
import { usePeopleTabs } from "@/hooks/use-people-tabs";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
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

function displayName(row: CandidateResumeRow, unnamedFallback: string): string {
  const basics = (row.content as any)?.basics;
  return row.label || basics?.name || unnamedFallback;
}

export default function PitchDeckBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const peopleTabs = usePeopleTabs();

  const [deck, setDeck] = useState<PitchDeckRow | null>(null);
  const [slides, setSlides] = useState<PitchDeckSlideRow[]>([]);
  const [candidatesById, setCandidatesById] = useState<Record<string, CandidateResumeRow>>({});
  const [shares, setShares] = useState<PitchDeckShareRow[]>([]);
  // #905 — Shared scope hook so the builder + the tabs hook + the list
  // page all hit getMyScope() once per surface instead of fanning out.
  const { scope } = useCurrentCompanyScope();
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
        const [full, allShares] = await Promise.all([
          recruitService.getPitchDeck(id),
          recruitService.listDeckShares(id),
        ]);
        if (!isMounted) return;
        setDeck(full);
        setSlides(full.slides);
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
      toast({ title: t("messages.pitchDeck.deckUpdated") });
    } catch (e) {
      toast({
        title: t("messages.pitchDeck.saveFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
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
      toast({ title: t("messages.pitchDeck.deckUpdated") });
    } catch (e) {
      toast({
        title: t("messages.pitchDeck.saveFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
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
        title: t("messages.pitchDeck.addFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
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
        title: t("messages.pitchDeck.removeFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
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
        title: t("messages.pitchDeck.reorderFailed"),
        description: (e as Error)?.message ?? t("messages.pitchDeck.pleaseRefresh"),
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
        title: t("messages.pitchDeck.slideSaveFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
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
          title: t("messages.pitchDeck.shareCreatedCopied"),
          description: t("messages.pitchDeck.shareCreatedCopiedDesc"),
        });
      } catch {
        toast({
          title: t("messages.pitchDeck.shareCreated"),
          description: url,
        });
      }
    } catch (e) {
      toast({
        title: t("messages.pitchDeck.shareCreateFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
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
      toast({ title: t("messages.pitchDeck.clipboardUnavailable"), description: url, variant: "destructive" });
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      await recruitService.revokeDeckShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (e) {
      toast({
        title: t("messages.pitchDeck.revokeFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
        variant: "destructive",
      });
    }
  };

  const handleDeleteDeck = async () => {
    if (!deck) return;
    if (!(await confirmDialog({ title: t("messages.pitchDeck.deleteDeckTitle"), description: t("messages.pitchDeck.deleteDeckConfirm"), confirmText: t("actions.delete"), destructive: true }))) return;
    try {
      await recruitService.deletePitchDeck(deck.id);
      toast({ title: t("messages.pitchDeck.deckDeleted") });
      navigate("/people/pitch-decks");
    } catch (e) {
      toast({
        title: t("messages.pitchDeck.deleteFailed"),
        description: (e as Error)?.message ?? t("messages.pleaseTryAgain"),
        variant: "destructive",
      });
    }
  };

  return (
    <AppShell bgClassName="bg-background">
        <div>
          <div className="p-6">
            <PageHeader tabs={peopleTabs} activeTabKey="pitch-decks" />

            <div className="mb-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/people/pitch-decks">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  {t("actions.pitchDeck.allDecks")}
                </Link>
              </Button>
            </div>

            {loading && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
                {t("messages.pitchDeck.loadingDeck")}
              </div>
            )}

            {!loading && (notFound || !deck) && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <h2 className="font-semibold">{t("messages.pitchDeck.deckNotFound")}</h2>
              </div>
            )}

            {!loading && deck && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                <div className="space-y-6">
                  {/* Metadata card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{t("headings.pitchDeck.deckDetails")}</CardTitle>
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
                              <SelectItem value="draft">{t("status.draftStatus")}</SelectItem>
                              <SelectItem value="sent">{t("labels.sent")}</SelectItem>
                              <SelectItem value="archived">{t("status.archivedStatus")}</SelectItem>
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
                        <Label>{t("labels.name")}</Label>
                        <Input
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            setMetaDirty(true);
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("fields.description.label")}</Label>
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
                          <Label>{t("headings.pitchDeck.brandKit")}</Label>
                          <Select
                            value={deck.whitelabelTenantId ?? NONE}
                            onValueChange={(v) =>
                              patchDeck({
                                whitelabelTenantId: v === NONE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("headings.pitchDeck.pickBrandKit")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t("headings.pitchDeck.noneePlainChrome")}</SelectItem>
                              {companyBrandKits.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("headings.pitchDeck.defaultRedaction")}</Label>
                          <Select
                            value={deck.redactionProfileId ?? NONE}
                            onValueChange={(v) =>
                              patchDeck({
                                redactionProfileId: v === NONE ? null : v,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("headings.pitchDeck.pickProfile")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t("headings.pitchDeck.noneFallbackDefaults")}</SelectItem>
                              {companyProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {p.isDefault ? t("headings.pitchDeck.defaultSuffix") : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {metaDirty && (
                        <Button size="sm" onClick={handleSaveMeta} disabled={metaSaving}>
                          <Save className="w-4 h-4 mr-1" />
                          {metaSaving ? t("messages.pitchDeck.saving") : t("actions.saveChanges")}
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
                          {t("headings.pitchDeck.slides")}
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
                          {t("actions.addCandidate")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {slides.length === 0 && (
                        <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                          {t("messages.pitchDeck.noSlidesPrefix")}{" "}
                          <span className="font-medium">{t("actions.addCandidate")}</span>{" "}
                          {t("messages.pitchDeck.noSlidesSuffix")}
                        </div>
                      )}
                      {slides.map((slide, idx) => {
                        const candidate = candidatesById[slide.candidateResumeId];
                        const candidateName = candidate
                          ? displayName(candidate, t("messages.pitchDeck.unnamedCandidate"))
                          : t("messages.pitchDeck.unknownCandidate");
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
                                      {t("messages.pitchDeck.matchPercent", { score: slide.matchScore })}
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
                                  title={t("actions.pitchDeck.moveUp")}
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={idx === slides.length - 1}
                                  onClick={() => handleReorderSlide(slide.id, 1)}
                                  title={t("actions.pitchDeck.moveDown")}
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
                          {t("headings.pitchDeck.shareLinks")}
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
                          {t("actions.pitchDeck.new")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {slides.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t("messages.pitchDeck.addCandidateBeforeShare")}
                        </p>
                      )}
                      {slides.length > 0 && shares.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t("messages.pitchDeck.noSharesPrefix")}{" "}
                          <span className="font-medium">{t("actions.pitchDeck.new")}</span>{" "}
                          {t("messages.pitchDeck.noSharesSuffix")}
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
                                  {share.recipientName || share.recipientEmail || t("messages.pitchDeck.linkFallback")}
                                </div>
                                <div className="text-muted-foreground">
                                  {t("messages.pitchDeck.viewCount", { count: share.viewCount })}
                                  {share.lastViewedAt && (
                                    <>
                                      {" "}{t("messages.pitchDeck.lastViewed", { date: new Date(share.lastViewedAt).toLocaleDateString() })}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {!share.isActive && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {t("status.pitchDeck.revoked")}
                                  </Badge>
                                )}
                                {expired && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {t("status.pitchDeck.expired")}
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
                                    {t("labels.copied")}
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 mr-1" />
                                    {t("actions.copyLink")}
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
        </div>

      {/* Add candidate dialog */}
      <Dialog open={addSlideOpen} onOpenChange={setAddSlideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("headings.pitchDeck.addCandidateToDeck")}</DialogTitle>
            <DialogDescription>
              {t("messages.pitchDeck.addCandidateDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto divide-y">
            {availableCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {t("messages.pitchDeck.allCandidatesInDeck")}
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
                      {initials(displayName(candidate, t("messages.pitchDeck.unnamedCandidate")))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{displayName(candidate, t("messages.pitchDeck.unnamedCandidate"))}</div>
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
              {t("actions.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share creation dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("headings.pitchDeck.shareThisDeck")}</DialogTitle>
            <DialogDescription>
              {t("messages.pitchDeck.shareDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("headings.pitchDeck.recipientName")}</Label>
                <Input
                  value={shareRecipientName}
                  onChange={(e) => setShareRecipientName(e.target.value)}
                  placeholder={t("headings.pitchDeck.recipientNamePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("headings.pitchDeck.recipientEmail")}</Label>
                <Input
                  type="email"
                  value={shareRecipientEmail}
                  onChange={(e) => setShareRecipientEmail(e.target.value)}
                  placeholder={t("headings.pitchDeck.recipientEmailPlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("headings.pitchDeck.expiresOptional")}</Label>
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
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleCreateShare} disabled={shareBusy}>
              {shareBusy ? t("messages.pitchDeck.creating") : t("actions.pitchDeck.createCopyLink")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
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
