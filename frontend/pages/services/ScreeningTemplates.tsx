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
import { ClipboardList, Plus, Send, Archive, Loader2, Link as LinkIcon } from "lucide-react";
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
  useSEO("/services/screening");
  useBreadcrumbs([{ name: "Screening", url: "/services/screening" }]);
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
      toast({ title: "Couldn't load templates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetBuilder() {
    setName("");
    setRoleFamily("");
    setDescription("");
    setAssessmentKinds([]);
    setIncludeReferences(false);
    setMinReferences(2);
    setQuestions([]);
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
      await screeningService.createTemplate({
        companyId,
        name: name.trim(),
        roleFamily: roleFamily.trim() || null,
        description: description.trim() || null,
        items: buildItems(),
      });
      toast({ title: "Template created" });
      setBuilderOpen(false);
      resetBuilder();
      await load();
    } catch (e) {
      toast({
        title: "Couldn't save template",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function archive(t: ScreeningTemplateRow) {
    try {
      await screeningService.archiveTemplate(t.id);
      await load();
    } catch {
      toast({ title: "Couldn't archive", variant: "destructive" });
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
      toast({ title: "Screening sent", description: `Invitation emailed to ${candEmail.trim()}.` });
      setCandEmail("");
      setCandName("");
      setSendMessage("");
    } catch (e) {
      toast({
        title: "Couldn't send",
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
            <h1 className="text-2xl font-bold tracking-tight">Screening</h1>
            <p className="text-muted-foreground">
              Build a per-role screening checklist once, then send it to candidates by magic link.
            </p>
          </div>
          <Button onClick={() => setBuilderOpen(true)} disabled={!companyId}>
            <Plus className="mr-1.5 h-4 w-4" /> New template
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" /> No screening templates yet
              </CardTitle>
              <CardDescription>
                Create a template to define what each candidate must complete — résumé and contact
                details are always required; add validated assessments, references, and application
                questions as needed.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <CardDescription>
                    {t.roleFamily ? <Badge variant="secondary" className="mr-2">{t.roleFamily}</Badge> : null}
                    {t.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" onClick={() => { setSendFor(t); setLastMagicLink(null); }}>
                    <Send className="mr-1.5 h-3.5 w-3.5" /> Send to candidate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void archive(t)}>
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Builder dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New screening template</DialogTitle>
            <DialogDescription>Résumé and contact confirmation are always required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Senior Backend Engineer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-role">Role family (optional)</Label>
              <Input id="tpl-role" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Engineering" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Description (optional)</Label>
              <Textarea id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label>Validated AI assessments</Label>
              <p className="text-xs text-muted-foreground">Optional — skipped automatically if the candidate has already taken them.</p>
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
                <Label htmlFor="tpl-refs">Request references</Label>
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
                  <Label htmlFor="tpl-minrefs" className="text-sm">Minimum</Label>
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
                <Label>Application questions</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setQuestions((q) => [...q, { id: uid(), prompt: "", kind: "custom", answerType: "text" }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Work authorization, visa sponsorship, EEO self-ID, knockouts, or custom.</p>
              {questions.map((q, idx) => (
                <div key={q.id} className="space-y-2 border-t pt-2">
                  <Input
                    value={q.prompt}
                    placeholder="e.g. Are you authorized to work in the US?"
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
                        <SelectItem value="custom">Custom</SelectItem>
                        <SelectItem value="work_authorization">Work authorization</SelectItem>
                        <SelectItem value="visa_sponsorship">Visa sponsorship</SelectItem>
                        <SelectItem value="eeo_disability">EEO / disability</SelectItem>
                        <SelectItem value="knockout">Knockout</SelectItem>
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
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="boolean">Yes / No</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                    >
                      Remove
                    </Button>
                  </div>
                  <span className="sr-only">Question {idx + 1}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBuilderOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveTemplate()} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send dialog */}
      <Dialog open={!!sendFor} onOpenChange={(o) => !o && setSendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send “{sendFor?.name}” to a candidate</DialogTitle>
            <DialogDescription>
              They'll get a magic link to complete only the steps we don't already have on file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cand-email">Candidate email</Label>
              <Input id="cand-email" type="email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-name">Candidate name (optional)</Label>
              <Input id="cand-name" value={candName} onChange={(e) => setCandName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-msg">Message (optional)</Label>
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
            <Button variant="ghost" onClick={() => setSendFor(null)}>Close</Button>
            <Button onClick={() => void sendRequest()} disabled={sending || !candEmail.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send screening"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
