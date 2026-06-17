// ScreeningTemplates — recruiter/employer surface for authoring reusable,
// per-role screening checklists and sending one to a candidate as a magic-link
// screening request. Mounted at /services/screening.
//
// v1 builder supports the always-required floor (résumé + contact confirmation,
// shown locked) plus validated AI assessments, references, and application
// questions (work authorization / visa sponsorship / EEO / custom). Competency
// tests, async video interview, and tool-run items need a ref picker loaded from
// their own libraries — tracked in the Consolidated Gap Register; the backend
// already accepts them. A results dashboard for returned screenings is also
// tracked there.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Send, Archive, Loader2, Link as LinkIcon, Pencil } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ScreeningResultsPanel from "@/components/jobs/ScreeningResultsPanel";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { ASSESSMENT_KINDS } from "@shared/assessments/kinds";
import {
  screeningService,
  type ScreeningTemplateRow,
  type ScreeningTemplateItemInput,
} from "@/lib/services/screening-service";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface DraftQuestion {
  id: string;
  prompt: string;
  kind: "custom" | "work_authorization" | "visa_sponsorship" | "eeo_disability" | "knockout";
  answerType: "text" | "boolean";
}

export default function ScreeningTemplates() {
  const { t } = useTranslation();
  useSEO("/services/screening");
  useBreadcrumbs([{ name: t("headings.screeningTemplates.screening"), url: "/services/screening" }]);
  const { companyId } = useCurrentCompanyScope();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<ScreeningTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleFamily, setRoleFamily] = useState("");
  const [description, setDescription] = useState("");
  const [assessmentKinds, setAssessmentKinds] = useState<string[]>([]);
  const [includeReferences, setIncludeReferences] = useState(false);
  const [minReferences, setMinReferences] = useState(2);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  // #1854 — null = create mode, a template id = editing that template.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Send state
  const [sendFor, setSendFor] = useState<ScreeningTemplateRow | null>(null);
  const [candEmail, setCandEmail] = useState("");
  const [candName, setCandName] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [lastMagicLink, setLastMagicLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setTemplates(await screeningService.listTemplates(companyId));
    } catch {
      toast({ title: t("messages.screeningTemplates.couldntLoadTemplates"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetBuilder() {
    setEditingId(null);
    setName("");
    setRoleFamily("");
    setDescription("");
    setAssessmentKinds([]);
    setIncludeReferences(false);
    setMinReferences(2);
    setQuestions([]);
  }

  function openNew() {
    resetBuilder();
    setBuilderOpen(true);
  }

  // #1854 — load an existing template into the builder. Reverses buildItems():
  // the always-required floor (résumé + contact) is implicit, so we hydrate the
  // optional items (assessments / references / questions) back into draft state.
  async function startEdit(tpl: ScreeningTemplateRow) {
    setEditingId(tpl.id);
    setBuilderOpen(true);
    setLoadingEdit(true);
    try {
      const { template, items } = await screeningService.getTemplate(tpl.id);
      setName(template.name);
      setRoleFamily(template.roleFamily ?? "");
      setDescription(template.description ?? "");

      const kinds: string[] = [];
      let refs = false;
      let minRefs = 2;
      let qs: DraftQuestion[] = [];
      for (const it of items) {
        if (it.itemType === "predictive_assessment") {
          const k = (it.config?.assessmentKind as string | undefined) ?? "";
          if (k) kinds.push(k);
        } else if (it.itemType === "references") {
          refs = true;
          minRefs = Math.max(1, Number(it.config?.minReferences ?? 2) || 2);
        } else if (it.itemType === "application_questions") {
          const raw = Array.isArray(it.config?.questions) ? (it.config!.questions as any[]) : [];
          qs = raw.map((q) => ({
            id: typeof q.id === "string" && q.id ? q.id : uid(),
            prompt: String(q.prompt ?? ""),
            kind: (q.kind as DraftQuestion["kind"]) ?? "custom",
            answerType: (q.answerType as DraftQuestion["answerType"]) ?? "text",
          }));
        }
      }
      setAssessmentKinds(kinds);
      setIncludeReferences(refs);
      setMinReferences(minRefs);
      setQuestions(qs);
    } catch (e) {
      toast({
        title: t("messages.screeningTemplates.couldntSaveTemplate"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
      setBuilderOpen(false);
      resetBuilder();
    } finally {
      setLoadingEdit(false);
    }
  }

  function buildItems(): ScreeningTemplateItemInput[] {
    const items: ScreeningTemplateItemInput[] = [];
    // résumé + contact_info are injected server-side as the always-required
    // floor, but we send them explicitly so display order is deterministic.
    items.push({ itemType: "resume", isRequired: true });
    items.push({ itemType: "contact_info", isRequired: true });
    for (const kind of assessmentKinds) {
      items.push({ itemType: "predictive_assessment", config: { assessmentKind: kind }, isRequired: false });
    }
    if (includeReferences) {
      items.push({ itemType: "references", config: { minReferences }, isRequired: false });
    }
    if (questions.length > 0) {
      items.push({
        itemType: "application_questions",
        isRequired: true,
        config: {
          questions: questions
            .filter((q) => q.prompt.trim().length > 0)
            .map((q) => ({
              id: q.id,
              prompt: q.prompt.trim(),
              kind: q.kind,
              answerType: q.answerType,
              required: true,
            })),
        },
      });
    }
    return items;
  }

  async function saveTemplate() {
    if (!companyId || !name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        // updateTemplate replaces items wholesale (the route's documented
        // semantics), so we resend the full draft — same builder, same shape.
        await screeningService.updateTemplate(editingId, {
          name: name.trim(),
          roleFamily: roleFamily.trim() || null,
          description: description.trim() || null,
          items: buildItems(),
        });
        toast({ title: t("messages.screeningTemplates.templateUpdated", "Template updated") });
      } else {
        await screeningService.createTemplate({
          companyId,
          name: name.trim(),
          roleFamily: roleFamily.trim() || null,
          description: description.trim() || null,
          items: buildItems(),
        });
        toast({ title: t("messages.screeningTemplates.templateCreated") });
      }
      setBuilderOpen(false);
      resetBuilder();
      await load();
    } catch (e) {
      toast({
        title: t("messages.screeningTemplates.couldntSaveTemplate"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function archive(tpl: ScreeningTemplateRow) {
    try {
      await screeningService.archiveTemplate(tpl.id);
      await load();
    } catch {
      toast({ title: t("messages.screeningTemplates.couldntArchive"), variant: "destructive" });
    }
  }

  async function sendRequest() {
    if (!companyId || !sendFor || !candEmail.trim()) return;
    setSending(true);
    setLastMagicLink(null);
    try {
      const res = await screeningService.sendRequest({
        companyId,
        templateId: sendFor.id,
        candidateEmail: candEmail.trim(),
        candidateName: candName.trim() || undefined,
        message: sendMessage.trim() || undefined,
      });
      setLastMagicLink(res.magicLink);
      toast({
        title: t("messages.screeningTemplates.screeningSent"),
        description: t("messages.screeningTemplates.invitationEmailed", { email: candEmail.trim() }),
      });
      setCandEmail("");
      setCandName("");
      setSendMessage("");
    } catch (e) {
      toast({
        title: t("messages.screeningTemplates.couldntSend"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("headings.screeningTemplates.screening")}</h1>
            <p className="text-muted-foreground">
              {t("messages.screeningTemplates.intro")}
            </p>
          </div>
          <Button onClick={openNew} disabled={!companyId}>
            <Plus className="mr-1.5 h-4 w-4" /> {t("actions.screeningTemplates.newTemplate")}
          </Button>
        </div>

        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="templates">{t("tabs.screeningTemplates.templates", "Templates")}</TabsTrigger>
            <TabsTrigger value="sent">{t("tabs.screeningTemplates.sent", "Sent screenings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="sent">
            {/* #1852 — recruiter review of returned screenings (the results half
                of the loop). Self-contained; reads the existing requests API. */}
            <ScreeningResultsPanel companyId={companyId} />
          </TabsContent>

          <TabsContent value="templates">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" /> {t("headings.screeningTemplates.noTemplatesYet")}
              </CardTitle>
              <CardDescription>
                {t("messages.screeningTemplates.emptyState")}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((tpl) => (
              <Card key={tpl.id}>
                <CardHeader>
                  <CardTitle className="text-base">{tpl.name}</CardTitle>
                  <CardDescription>
                    {tpl.roleFamily ? <Badge variant="secondary" className="mr-2">{tpl.roleFamily}</Badge> : null}
                    {tpl.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" onClick={() => { setSendFor(tpl); setLastMagicLink(null); }}>
                    <Send className="mr-1.5 h-3.5 w-3.5" /> {t("actions.screeningTemplates.sendToCandidate")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void startEdit(tpl)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("actions.edit", "Edit")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void archive(tpl)}>
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> {t("actions.archive")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Builder dialog */}
      <Dialog open={builderOpen} onOpenChange={(o) => { setBuilderOpen(o); if (!o) resetBuilder(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("headings.screeningTemplates.editScreeningTemplate", "Edit screening template")
                : t("headings.screeningTemplates.newScreeningTemplate")}
            </DialogTitle>
            <DialogDescription>{t("messages.screeningTemplates.alwaysRequired")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">{t("labels.screeningTemplates.templateName")}</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("labels.screeningTemplates.templateNamePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-role">{t("labels.screeningTemplates.roleFamily")}</Label>
              <Input id="tpl-role" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder={t("labels.screeningTemplates.roleFamilyPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">{t("labels.screeningTemplates.descriptionOptional")}</Label>
              <Textarea id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label>{t("labels.screeningTemplates.validatedAiAssessments")}</Label>
              <p className="text-xs text-muted-foreground">{t("messages.screeningTemplates.assessmentsHint")}</p>
              <div className="flex flex-wrap gap-2">
                {ASSESSMENT_KINDS.map((a) => {
                  const on = assessmentKinds.includes(a.kind);
                  return (
                    <Button
                      key={a.kind}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() =>
                        setAssessmentKinds((prev) =>
                          on ? prev.filter((k) => k !== a.kind) : [...prev, a.kind],
                        )
                      }
                    >
                      {a.title}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-refs">{t("labels.screeningTemplates.requestReferences")}</Label>
                <input
                  id="tpl-refs"
                  type="checkbox"
                  checked={includeReferences}
                  onChange={(e) => setIncludeReferences(e.target.checked)}
                  className="h-4 w-4"
                />
              </div>
              {includeReferences ? (
                <div className="flex items-center gap-2">
                  <Label htmlFor="tpl-minrefs" className="text-sm">{t("labels.screeningTemplates.minimum")}</Label>
                  <Input
                    id="tpl-minrefs"
                    type="number"
                    min={1}
                    max={10}
                    value={minReferences}
                    onChange={(e) => setMinReferences(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label>{t("labels.screeningTemplates.applicationQuestions")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setQuestions((q) => [...q, { id: uid(), prompt: "", kind: "custom", answerType: "text" }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> {t("actions.add")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("messages.screeningTemplates.questionsHint")}</p>
              {questions.map((q, idx) => (
                <div key={q.id} className="space-y-2 border-t pt-2">
                  <Input
                    value={q.prompt}
                    placeholder={t("labels.screeningTemplates.questionPromptPlaceholder")}
                    onChange={(e) =>
                      setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)))
                    }
                  />
                  <div className="flex gap-2">
                    <Select
                      value={q.kind}
                      onValueChange={(v) =>
                        setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, kind: v as DraftQuestion["kind"] } : x)))
                      }
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">{t("labels.screeningTemplates.kindCustom")}</SelectItem>
                        <SelectItem value="work_authorization">{t("labels.screeningTemplates.kindWorkAuthorization")}</SelectItem>
                        <SelectItem value="visa_sponsorship">{t("labels.screeningTemplates.kindVisaSponsorship")}</SelectItem>
                        <SelectItem value="eeo_disability">{t("labels.screeningTemplates.kindEeoDisability")}</SelectItem>
                        <SelectItem value="knockout">{t("labels.screeningTemplates.kindKnockout")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={q.answerType}
                      onValueChange={(v) =>
                        setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, answerType: v as DraftQuestion["answerType"] } : x)))
                      }
                    >
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t("labels.screeningTemplates.answerTypeText")}</SelectItem>
                        <SelectItem value="boolean">{t("labels.screeningTemplates.answerTypeBoolean")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                    >
                      {t("actions.remove")}
                    </Button>
                  </div>
                  <span className="sr-only">{t("labels.screeningTemplates.questionNumber", { number: idx + 1 })}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setBuilderOpen(false); resetBuilder(); }}>{t("actions.cancel")}</Button>
            <Button onClick={() => void saveTemplate()} disabled={saving || loadingEdit || !name.trim()}>
              {saving || loadingEdit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                t("actions.screeningTemplates.saveTemplate", "Save changes")
              ) : (
                t("actions.screeningTemplates.createTemplate")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send dialog */}
      <Dialog open={!!sendFor} onOpenChange={(o) => !o && setSendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("headings.screeningTemplates.sendToCandidateTitle", { name: sendFor?.name })}</DialogTitle>
            <DialogDescription>
              {t("messages.screeningTemplates.sendDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cand-email">{t("labels.screeningTemplates.candidateEmail")}</Label>
              <Input id="cand-email" type="email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-name">{t("labels.screeningTemplates.candidateName")}</Label>
              <Input id="cand-name" value={candName} onChange={(e) => setCandName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-msg">{t("labels.screeningTemplates.messageOptional")}</Label>
              <Textarea id="cand-msg" value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} />
            </div>
            {lastMagicLink ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
                <LinkIcon className="h-4 w-4 shrink-0" />
                <code className="truncate">{lastMagicLink}</code>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendFor(null)}>{t("actions.close")}</Button>
            <Button onClick={() => void sendRequest()} disabled={sending || !candEmail.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("actions.screeningTemplates.sendScreening")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
