// HiringOnboarding — Pro employer/recruiter surface for offer letters
// and onboarding checklists. Lives at /people/hiring alongside the rest
// of the People surfaces.
//
// Backed by /api/hiring (offers + checklists). Pro-gated server-side via
// `requirePro("Hiring & Onboarding")` so a 402 on load means the user
// needs to upgrade — we surface that as a friendly upgrade prompt.

import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileSignature,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { confirmDialog } from "@/lib/dialogs";
import { usePeopleTabs } from "@/hooks/use-people-tabs";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { TIER_COPY } from "@shared/tier-copy";
import {
  hiringService,
  type CreateChecklistInput,
  type CreateOfferInput,
  type OfferLetter,
  type OfferStatus,
  type OnboardingChecklist,
} from "@/lib/services/hiring-service";

// Map status → badge variant + i18n key. The label itself flows through
// useTranslation so each row reads in the active locale; only the
// variant is static.
const OFFER_STATUS_VARIANT: Record<
  OfferStatus,
  { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft:    { labelKey: "hiring.status.draft",    variant: "secondary" },
  sent:     { labelKey: "hiring.status.sent",     variant: "default" },
  viewed:   { labelKey: "hiring.status.viewed",   variant: "default" },
  accepted: { labelKey: "hiring.status.accepted", variant: "default" },
  signed:   { labelKey: "hiring.status.signed",   variant: "default" },
  declined: { labelKey: "hiring.status.declined", variant: "destructive" },
};

const EMPTY_OFFER: CreateOfferInput = {
  candidateName: "",
  candidateEmail: "",
  jobTitle: "",
  companyName: "",
  currency: "USD",
  expiresInDays: 7,
  bodyHtml: "",
};

interface ChecklistTaskDraft {
  title: string;
  description: string;
  category: string;
  dueDate: string;
}

const EMPTY_CHECKLIST_TASK: ChecklistTaskDraft = {
  title: "",
  description: "",
  category: "general",
  dueDate: "",
};

interface ChecklistDraft {
  candidateName: string;
  jobTitle: string;
  startDate: string;
  tasks: ChecklistTaskDraft[];
}

const EMPTY_CHECKLIST: ChecklistDraft = {
  candidateName: "",
  jobTitle: "",
  startDate: "",
  tasks: [{ ...EMPTY_CHECKLIST_TASK }],
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function HiringOnboarding() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const peopleTabs = usePeopleTabs();

  // Data
  const [offers, setOffers] = useState<OfferLetter[]>([]);
  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingChecklists, setLoadingChecklists] = useState(true);
  const [proGated, setProGated] = useState(false);

  // Offer dialog
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerDraft, setOfferDraft] = useState<CreateOfferInput>(EMPTY_OFFER);
  const [savingOffer, setSavingOffer] = useState(false);

  // Checklist dialog
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraft>(EMPTY_CHECKLIST);
  const [savingChecklist, setSavingChecklist] = useState(false);

  // Per-row busy
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    loadOffers();
    loadChecklists();
  }, [isAuthenticated]);

  async function loadOffers() {
    setLoadingOffers(true);
    try {
      const data = await hiringService.listOffers();
      setOffers(data);
      setProGated(false);
    } catch (e) {
      // 402 from the Pro gate surfaces as a thrown error — show upgrade prompt.
      // Match on the structured envelope code AND any human-readable
      // upgrade/forbidden hint so we don't depend on the exact wording.
      const msg = (e as Error)?.message ?? "";
      if (msg.includes("PRO_REQUIRED") || /upgrade|forbidden/i.test(msg)) setProGated(true);
      else toast({ title: t("hiring.toast.loadOffersFailed"), variant: "destructive" });
    } finally {
      setLoadingOffers(false);
    }
  }

  async function loadChecklists() {
    setLoadingChecklists(true);
    try {
      const data = await hiringService.listChecklists();
      setChecklists(data);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (/premium|upgrade|forbidden/i.test(msg)) setProGated(true);
      else toast({ title: t("hiring.toast.loadChecklistsFailed"), variant: "destructive" });
    } finally {
      setLoadingChecklists(false);
    }
  }

  // ─── Offer handlers ─────────────────────────────────────────────────────

  function openOfferCreate() {
    setOfferDraft(EMPTY_OFFER);
    setOfferDialogOpen(true);
  }

  async function saveOffer() {
    if (!offerDraft.candidateName.trim() || !offerDraft.candidateEmail.trim() || !offerDraft.jobTitle.trim() || !offerDraft.companyName.trim()) {
      toast({ title: t("hiring.toast.offerFieldsRequired"), variant: "destructive" });
      return;
    }
    if (!offerDraft.bodyHtml.trim()) {
      toast({ title: t("hiring.toast.offerBodyEmpty"), variant: "destructive" });
      return;
    }
    try {
      setSavingOffer(true);
      const created = await hiringService.createOffer(offerDraft);
      setOffers((prev) => [created, ...prev]);
      setOfferDialogOpen(false);
      toast({ title: t("hiring.toast.offerCreated") });
    } catch (e) {
      toast({
        title: t("hiring.toast.offerCreateFailed"),
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setSavingOffer(false);
    }
  }

  async function sendOffer(id: string) {
    try {
      setBusyOfferId(id);
      const updated = await hiringService.sendOffer(id);
      setOffers((prev) => prev.map((o) => (o.id === id ? updated : o)));
      toast({ title: t("hiring.toast.offerSent") });
    } catch (e) {
      toast({
        title: t("hiring.toast.offerSendFailed"),
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setBusyOfferId(null);
    }
  }

  async function deleteOffer(id: string) {
    if (!(await confirmDialog({ title: t("dialogs.hiring.deleteOfferTitle"), description: t("hiring.confirm.deleteOffer"), confirmText: t("dialogs.hiring.deleteOfferConfirm"), destructive: true }))) return;
    try {
      setBusyOfferId(id);
      await hiringService.deleteOffer(id);
      setOffers((prev) => prev.filter((o) => o.id !== id));
      toast({ title: t("hiring.toast.offerDeleted") });
    } catch (e) {
      toast({
        title: t("hiring.toast.offerDeleteFailed"),
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setBusyOfferId(null);
    }
  }

  // ─── Checklist handlers ─────────────────────────────────────────────────

  function openChecklistCreate() {
    setChecklistDraft({ ...EMPTY_CHECKLIST, tasks: [{ ...EMPTY_CHECKLIST_TASK }] });
    setChecklistDialogOpen(true);
  }

  function addChecklistTask() {
    setChecklistDraft((d) => ({ ...d, tasks: [...d.tasks, { ...EMPTY_CHECKLIST_TASK }] }));
  }

  function updateChecklistTask(idx: number, patch: Partial<ChecklistTaskDraft>) {
    setChecklistDraft((d) => ({
      ...d,
      tasks: d.tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  }

  function removeChecklistTask(idx: number) {
    setChecklistDraft((d) => ({
      ...d,
      tasks: d.tasks.length > 1 ? d.tasks.filter((_, i) => i !== idx) : d.tasks,
    }));
  }

  async function saveChecklist() {
    const tasks = checklistDraft.tasks
      .filter((t) => t.title.trim().length > 0)
      .map((t) => ({
        title: t.title.trim(),
        description: t.description.trim() || undefined,
        category: t.category.trim() || "general",
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
      }));

    if (!checklistDraft.candidateName.trim()) {
      toast({ title: t("hiring.toast.checklistCandidateRequired"), variant: "destructive" });
      return;
    }
    if (tasks.length === 0) {
      toast({ title: t("hiring.toast.checklistTaskRequired"), variant: "destructive" });
      return;
    }

    const payload: CreateChecklistInput = {
      candidateName: checklistDraft.candidateName.trim(),
      jobTitle: checklistDraft.jobTitle.trim() || undefined,
      startDate: checklistDraft.startDate ? new Date(checklistDraft.startDate).toISOString() : undefined,
      tasks,
    };

    try {
      setSavingChecklist(true);
      const created = await hiringService.createChecklist(payload);
      setChecklists((prev) => [created, ...prev]);
      setChecklistDialogOpen(false);
      toast({ title: t("hiring.toast.checklistCreated") });
    } catch (e) {
      toast({
        title: t("hiring.toast.checklistCreateFailed"),
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    } finally {
      setSavingChecklist(false);
    }
  }

  async function toggleTask(checklistId: string, taskId: string, currentlyCompleted: boolean) {
    if (currentlyCompleted) return; // server endpoint only marks complete; un-complete is N/A in MVP
    try {
      const result = await hiringService.completeTask(checklistId, taskId);
      setChecklists((prev) =>
        prev.map((c) => {
          if (c.id !== checklistId) return c;
          const nextTasks = (c.tasks ?? []).map((t) =>
            t.id === taskId ? { ...t, isCompleted: true, completedAt: new Date().toISOString() } : t,
          );
          return {
            ...c,
            tasks: nextTasks,
            status: result.checklist.status,
            completionPercentage: String(result.completionPercentage),
          };
        }),
      );
    } catch (e) {
      toast({
        title: t("hiring.toast.taskUpdateFailed"),
        description: (e as Error)?.message ?? undefined,
        variant: "destructive",
      });
    }
  }

  // ─── Derived ────────────────────────────────────────────────────────────

  const offerStats = useMemo(() => {
    const draft   = offers.filter((o) => o.status === "draft").length;
    const pending = offers.filter((o) => o.status === "sent" || o.status === "viewed").length;
    const signed  = offers.filter((o) => o.status === "accepted" || o.status === "signed").length;
    return { draft, pending, signed };
  }, [offers]);

  const activeChecklists = useMemo(
    () => checklists.filter((c) => c.status !== "completed").length,
    [checklists],
  );

  return (
    <AppShell bgClassName="bg-background">
        <div>
          <div className="p-4 md:p-6">
            <PageHeader tabs={peopleTabs} activeTabKey="hiring" sticky />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">{t("hiring.pageTitle")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("hiring.pageSubtitle")} {TIER_COPY.proFeatureLabel()}.
                </p>
              </div>
            </div>

            {proGated ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <FileSignature className="h-10 w-10 text-muted-foreground" />
                  <h3 className="text-lg font-medium">{TIER_COPY.featureIsProOnly(t("hiring.pageTitle"))}</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {t("hiring.upgradePrompt")}
                  </p>
                  <Button asChild className="mt-2">
                    <a href="/pricing">{t("hiring.viewPricing")}</a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatCard label={t("hiring.stat.drafts")}            value={offerStats.draft}   icon={FileSignature} />
                  <StatCard label={t("hiring.stat.pending")}           value={offerStats.pending} icon={Send} />
                  <StatCard label={t("hiring.stat.signed")}            value={offerStats.signed}  icon={CheckCircle2} />
                  <StatCard label={t("hiring.stat.activeChecklists")}  value={activeChecklists}   icon={ClipboardList} />
                </div>

                <Tabs defaultValue="offers">
                  <TabsList className="mb-4">
                    <TabsTrigger value="offers" className="flex items-center gap-2">
                      <FileSignature className="h-4 w-4" />
                      {t("hiring.tab.offers")}
                    </TabsTrigger>
                    <TabsTrigger value="checklists" className="flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" />
                      {t("hiring.tab.checklists")}
                    </TabsTrigger>
                  </TabsList>

                  {/* ─── Offers ─────────────────────────────────────────────── */}
                  <TabsContent value="offers" className="space-y-3">
                    <div className="flex justify-end">
                      <Button onClick={openOfferCreate}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t("hiring.offers.new")}
                      </Button>
                    </div>

                    {loadingOffers ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : offers.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                          <FileSignature className="h-10 w-10 text-muted-foreground" />
                          <h3 className="text-lg font-medium">{t("hiring.offers.emptyTitle")}</h3>
                          <p className="text-sm text-muted-foreground">
                            {t("hiring.offers.emptyBody")}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      offers.map((offer) => {
                        const cfg = OFFER_STATUS_VARIANT[offer.status];
                        const busy = busyOfferId === offer.id;
                        return (
                          <Card key={offer.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold truncate">{offer.candidateName}</span>
                                    <Badge variant={cfg.variant}>{t(cfg.labelKey)}</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                                    {offer.jobTitle} · {offer.companyName}
                                  </p>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                    <span className="truncate">{offer.candidateEmail}</span>
                                    {offer.salary && (
                                      <span>
                                        {offer.currency} {Number(offer.salary).toLocaleString()}
                                      </span>
                                    )}
                                    {offer.startDate && <span>{t("hiring.offers.startsPrefix", { date: formatDate(offer.startDate) })}</span>}
                                    {offer.expiresAt && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {t("hiring.offers.expiresPrefix", { date: formatDate(offer.expiresAt) })}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {offer.status === "draft" && (
                                    <Button
                                      size="sm"
                                      onClick={() => sendOffer(offer.id)}
                                      disabled={busy}
                                    >
                                      {busy ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                      ) : (
                                        <Send className="h-4 w-4 mr-1" />
                                      )}
                                      {t("hiring.offers.send")}
                                    </Button>
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => deleteOffer(offer.id)}
                                    title={t("hiring.offers.deleteTitle")}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </TabsContent>

                  {/* ─── Checklists ─────────────────────────────────────────── */}
                  <TabsContent value="checklists" className="space-y-3">
                    <div className="flex justify-end">
                      <Button onClick={openChecklistCreate}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t("hiring.checklists.new")}
                      </Button>
                    </div>

                    {loadingChecklists ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : checklists.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                          <ClipboardList className="h-10 w-10 text-muted-foreground" />
                          <h3 className="text-lg font-medium">{t("hiring.checklists.emptyTitle")}</h3>
                          <p className="text-sm text-muted-foreground">
                            {t("hiring.checklists.emptyBody")}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      checklists.map((c) => (
                        <ChecklistCard
                          key={c.id}
                          checklist={c}
                          onToggleTask={(taskId, currentlyCompleted) =>
                            toggleTask(c.id, taskId, currentlyCompleted)
                          }
                        />
                      ))
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>

      {/* ─── Offer dialog ─────────────────────────────────────────────────── */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("hiring.dialog.offer.title")}</DialogTitle>
            <DialogDescription>
              <Trans
                i18nKey="hiring.dialog.offer.description"
                components={[<span key="b" className="font-medium" />]}
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.offer.candidateName")}</Label>
                <Input
                  value={offerDraft.candidateName}
                  onChange={(e) => setOfferDraft((d) => ({ ...d, candidateName: e.target.value }))}
                  placeholder={t("hiring.dialog.offer.candidateNamePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.offer.candidateEmail")}</Label>
                <Input
                  type="email"
                  value={offerDraft.candidateEmail}
                  onChange={(e) => setOfferDraft((d) => ({ ...d, candidateEmail: e.target.value }))}
                  placeholder={t("hiring.dialog.offer.candidateEmailPlaceholder")}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.offer.jobTitle")}</Label>
                <Input
                  value={offerDraft.jobTitle}
                  onChange={(e) => setOfferDraft((d) => ({ ...d, jobTitle: e.target.value }))}
                  placeholder={t("hiring.dialog.offer.jobTitlePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.offer.companyName")}</Label>
                <Input
                  value={offerDraft.companyName}
                  onChange={(e) => setOfferDraft((d) => ({ ...d, companyName: e.target.value }))}
                  placeholder={t("hiring.dialog.offer.companyNamePlaceholder")}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.offer.salary")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={offerDraft.salary ?? ""}
                  onChange={(e) =>
                    setOfferDraft((d) => ({
                      ...d,
                      salary: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  placeholder={t("hiring.dialog.offer.salaryPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.currency.label")}</Label>
                <Input
                  value={offerDraft.currency}
                  maxLength={3}
                  onChange={(e) =>
                    setOfferDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.offer.expiresInDays")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={offerDraft.expiresInDays ?? 7}
                  onChange={(e) =>
                    setOfferDraft((d) => ({
                      ...d,
                      expiresInDays: e.target.value ? Number(e.target.value) : 7,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hiring.dialog.offer.startDate")}</Label>
              <Input
                type="date"
                value={offerDraft.startDate ? offerDraft.startDate.slice(0, 10) : ""}
                onChange={(e) =>
                  setOfferDraft((d) => ({
                    ...d,
                    startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hiring.dialog.offer.body")}</Label>
              <Textarea
                rows={10}
                value={offerDraft.bodyHtml}
                onChange={(e) => setOfferDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
                placeholder={t("hiring.dialog.offer.bodyPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)} disabled={savingOffer}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={saveOffer} disabled={savingOffer}>
              {savingOffer ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("hiring.dialog.offer.saveDraft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Checklist dialog ─────────────────────────────────────────────── */}
      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("hiring.dialog.checklist.title")}</DialogTitle>
            <DialogDescription>
              {t("hiring.dialog.checklist.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.checklist.candidateName")}</Label>
                <Input
                  value={checklistDraft.candidateName}
                  onChange={(e) =>
                    setChecklistDraft((d) => ({ ...d, candidateName: e.target.value }))
                  }
                  placeholder={t("hiring.dialog.offer.candidateNamePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hiring.dialog.checklist.jobTitle")}</Label>
                <Input
                  value={checklistDraft.jobTitle}
                  onChange={(e) =>
                    setChecklistDraft((d) => ({ ...d, jobTitle: e.target.value }))
                  }
                  placeholder={t("hiring.dialog.offer.jobTitlePlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hiring.dialog.checklist.startDate")}</Label>
              <Input
                type="date"
                value={checklistDraft.startDate}
                onChange={(e) =>
                  setChecklistDraft((d) => ({ ...d, startDate: e.target.value }))
                }
              />
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("hiring.dialog.checklist.tasksLabel")}</Label>
                <Button size="sm" variant="outline" onClick={addChecklistTask}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("hiring.dialog.checklist.addTask")}
                </Button>
              </div>
              {checklistDraft.tasks.map((task, idx) => (
                <div key={idx} className="border rounded p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={task.title}
                      onChange={(e) => updateChecklistTask(idx, { title: e.target.value })}
                      placeholder={t("hiring.dialog.checklist.taskTitlePlaceholder", { n: idx + 1 })}
                      className="flex-1"
                    />
                    {checklistDraft.tasks.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeChecklistTask(idx)}
                        title={t("hiring.dialog.checklist.removeTaskTitle")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    value={task.description}
                    onChange={(e) =>
                      updateChecklistTask(idx, { description: e.target.value })
                    }
                    placeholder={t("hiring.dialog.checklist.descriptionPlaceholder")}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={task.category}
                      onChange={(e) => updateChecklistTask(idx, { category: e.target.value })}
                      placeholder={t("hiring.dialog.checklist.categoryPlaceholder")}
                    />
                    <Input
                      type="date"
                      value={task.dueDate}
                      onChange={(e) => updateChecklistTask(idx, { dueDate: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChecklistDialogOpen(false)}
              disabled={savingChecklist}
            >
              {t("actions.cancel")}
            </Button>
            <Button onClick={saveChecklist} disabled={savingChecklist}>
              {savingChecklist ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("hiring.dialog.checklist.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium uppercase">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChecklistCard({
  checklist,
  onToggleTask,
}: {
  checklist: OnboardingChecklist;
  onToggleTask: (taskId: string, currentlyCompleted: boolean) => void;
}) {
  const { t } = useTranslation();
  const tasks = checklist.tasks ?? [];
  const pct = Number(checklist.completionPercentage ?? 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">{checklist.candidateName}</CardTitle>
            {checklist.jobTitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{checklist.jobTitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={checklist.status === "completed" ? "default" : "secondary"}>
              {checklist.status === "in_progress"
                ? t("hiring.status.inProgress")
                : checklist.status === "completed"
                ? t("hiring.status.completed")
                : t("hiring.status.pending")}
            </Badge>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hiring.checklists.noTasks")}</p>
        ) : (
          tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onToggleTask(task.id, task.isCompleted)}
              disabled={task.isCompleted}
              className={`w-full flex items-start gap-3 rounded p-2 text-left transition-colors ${
                task.isCompleted ? "opacity-60" : "hover:bg-muted/40"
              }`}
            >
              {task.isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium ${
                    task.isCompleted ? "line-through" : ""
                  }`}
                >
                  {task.title}
                </div>
                {task.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{task.description}</div>
                )}
                {task.dueDate && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {t("hiring.checklists.duePrefix", { date: formatDate(task.dueDate) })}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
