/**
 * InboxProcessorEditor — the single shared builder for role-aware inbox
 * processors (#1983). One component for every role; it self-gates which
 * tabs/sections show based on the active profile's `roles` (no
 * prop-drilled `canEdit` — the editor derives capability from the
 * profile it's handed).
 *
 * Tabs: Taxonomy · Prompt (+ extraction schema) · Rules (reuses
 * <EmailRulesPanel>) · Actions · Dry-run preview.
 *
 * Presets are read-only; the user clones one into an owner-scoped copy to
 * edit. Saving PATCHes the profile (bumps version + invalidates the
 * server cache). Dry-run re-classifies a sample of recent mail WITHOUT
 * persisting so a bad prompt can't wreck the live inbox.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Trash2, Play, Copy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  emailIntegrationService,
  type InboxProfile,
  type InboxAction,
  type InboxCategory,
  type DryRunRow,
} from "@/lib/services/email-integration-service";
import { EmailRulesPanel } from "@/components/email/EmailRulesPanel";

const TRIGGER_TYPES = ["category", "rule", "always"] as const;
const HANDLERS = [
  "notify",
  "upsert_contact",
  "link_to_pipeline",
  "create_sourcing_lead",
  "draft_tailored_jd",
  "webhook",
] as const;

export interface InboxProcessorEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Profile to open on first render; falls back to the first available. */
  initialProfileId?: string | null;
  onSaved?: () => void;
}

export function InboxProcessorEditor({
  open,
  onOpenChange,
  initialProfileId,
  onSaved,
}: InboxProcessorEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<InboxProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialProfileId ?? null);
  const [working, setWorking] = useState<InboxProfile | null>(null);
  const [actions, setActions] = useState<InboxAction[]>([]);
  const [dryRows, setDryRows] = useState<DryRunRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );
  const editable = !!working && !working.isPreset;
  const isRecruiter = !!working?.roles?.includes("recruiter");

  // Load the available profiles whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    emailIntegrationService
      .listProfiles()
      .then((list) => {
        setProfiles(list);
        setSelectedId((cur) => cur ?? initialProfileId ?? list[0]?.id ?? null);
      })
      .catch(() => setProfiles([]));
  }, [open, initialProfileId]);

  // Snapshot the selected profile into the working copy + load its actions.
  useEffect(() => {
    if (!selected) {
      setWorking(null);
      setActions([]);
      return;
    }
    setWorking(structuredClone(selected));
    setDirty(false);
    setDryRows(null);
    emailIntegrationService
      .listProfileActions(selected.id)
      .then(setActions)
      .catch(() => setActions([]));
  }, [selected]);

  const patchWorking = (patch: Partial<InboxProfile>) => {
    setWorking((w) => (w ? { ...w, ...patch } : w));
    setDirty(true);
  };

  const visibleCategoryKeys = useMemo(
    () => (working?.taxonomy ?? []).filter((c) => c.visible).map((c) => c.key),
    [working],
  );

  const handleClone = async () => {
    if (!working) return;
    setBusy(true);
    try {
      const cloned = await emailIntegrationService.cloneProfile(working.id);
      setProfiles((prev) => [...prev, cloned]);
      setSelectedId(cloned.id);
      toast({ title: t("outreach.processor.clonedToast", "Profile cloned — you can edit this copy.") });
    } catch {
      toast({ title: t("outreach.processor.cloneError", "Could not clone profile"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!working || !editable) return;
    setBusy(true);
    try {
      const updated = await emailIntegrationService.updateProfile(working.id, {
        name: working.name,
        description: working.description,
        taxonomy: working.taxonomy,
        classifyPrompt: working.classifyPrompt,
        summaryPrompt: working.summaryPrompt,
        extractSchema: working.extractSchema,
        minRelevanceScore: working.minRelevanceScore,
      });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDirty(false);
      onSaved?.();
      toast({ title: t("outreach.processor.savedToast", "Inbox processor saved") });
    } catch {
      toast({ title: t("outreach.processor.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!working || !editable) return;
    setBusy(true);
    try {
      await emailIntegrationService.deleteProfile(working.id);
      setProfiles((prev) => prev.filter((p) => p.id !== working.id));
      setSelectedId(profiles.find((p) => p.id !== working.id)?.id ?? null);
    } finally {
      setBusy(false);
    }
  };

  const handleDryRun = async () => {
    if (!working) return;
    setBusy(true);
    setDryRows(null);
    try {
      const res = await emailIntegrationService.dryRunProfile(working.id, 10);
      setDryRows(res.rows);
    } catch {
      toast({ title: t("outreach.processor.dryRunError", "Dry-run failed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleCategoryVisible = (key: string, visible: boolean) => {
    if (!working) return;
    patchWorking({
      taxonomy: working.taxonomy.map((c) => (c.key === key ? { ...c, visible } : c)),
    });
  };

  const updateCategoryLabel = (key: string, label: string) => {
    if (!working) return;
    patchWorking({
      taxonomy: working.taxonomy.map((c) => (c.key === key ? { ...c, label } : c)),
    });
  };

  const handleAddAction = async () => {
    if (!working || !editable) return;
    setBusy(true);
    try {
      const created = await emailIntegrationService.createAction(working.id, {
        name: t("outreach.processor.newActionName", "New action"),
        triggerType: "always",
        triggerValue: null,
        handler: "notify",
        isEnabled: true,
        priority: 100,
      });
      setActions((prev) => [...prev, created]);
    } finally {
      setBusy(false);
    }
  };

  const patchAction = async (id: string, patch: Partial<InboxAction>) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    await emailIntegrationService.patchAction(id, patch).catch(() => undefined);
  };

  const removeAction = async (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
    await emailIntegrationService.deleteAction(id).catch(() => undefined);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col" aria-describedby="processor-desc">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>{t("outreach.processor.title", "Inbox processor")}</SheetTitle>
          <SheetDescription id="processor-desc">
            {t(
              "outreach.processor.description",
              "Configure how each mailbox classifies and acts on synced mail.",
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder={t("outreach.processor.selectProfile", "Select a profile")} /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.isPreset ? ` · ${t("outreach.processor.presetBadge", "preset")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {working && (working.roles ?? []).map((r) => (
            <Badge key={r} variant="secondary" className="capitalize">{r.replace(/_/g, " ")}</Badge>
          ))}
        </div>

        {!working ? (
          <div className="p-5 text-sm text-muted-foreground">
            {t("outreach.processor.empty", "No profiles available.")}
          </div>
        ) : (
          <>
            {!editable && (
              <div className="mx-5 mt-3 rounded border bg-muted/40 p-3 text-sm flex items-center justify-between gap-2">
                <span>{t("outreach.processor.presetReadOnly", "System preset — clone it to make changes.")}</span>
                <Button size="sm" onClick={handleClone} disabled={busy}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> {t("outreach.processor.clone", "Clone")}
                </Button>
              </div>
            )}

            <Tabs defaultValue="taxonomy" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-5 mt-3 flex-wrap h-auto">
                <TabsTrigger value="taxonomy">{t("outreach.processor.tabTaxonomy", "Taxonomy")}</TabsTrigger>
                <TabsTrigger value="prompt">{t("outreach.processor.tabPrompt", "Prompt")}</TabsTrigger>
                <TabsTrigger value="rules">{t("outreach.processor.tabRules", "Rules")}</TabsTrigger>
                <TabsTrigger value="actions">{t("outreach.processor.tabActions", "Actions")}</TabsTrigger>
                <TabsTrigger value="dryrun">{t("outreach.processor.tabDryRun", "Dry-run")}</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <div className="p-5">
                  {/* ── Taxonomy ── */}
                  <TabsContent value="taxonomy" className="mt-0 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {t("outreach.processor.taxonomyHelp", "Visible categories reach the inbox feed; hidden ones stay classified but out of view.")}
                    </p>
                    {working.taxonomy.map((cat: InboxCategory) => (
                      <div key={cat.key} className="flex items-center gap-2 border rounded p-2">
                        <div className="flex-1 min-w-0">
                          <Input
                            value={cat.label}
                            disabled={!editable}
                            onChange={(e) => updateCategoryLabel(cat.key, e.target.value)}
                            className="h-8"
                          />
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{cat.key}</div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {t("outreach.processor.visible", "Visible")}
                          <Switch
                            checked={cat.visible}
                            disabled={!editable}
                            onCheckedChange={(v) => toggleCategoryVisible(cat.key, v)}
                          />
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  {/* ── Prompt ── */}
                  <TabsContent value="prompt" className="mt-0 space-y-4">
                    <div className="space-y-1">
                      <Label>{t("outreach.processor.classifyPrompt", "Classification prompt")}</Label>
                      <Textarea
                        value={working.classifyPrompt}
                        disabled={!editable}
                        rows={10}
                        onChange={(e) => patchWorking({ classifyPrompt: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t("outreach.processor.summaryPrompt", "Summary prompt")}</Label>
                      <Textarea
                        value={working.summaryPrompt ?? ""}
                        disabled={!editable}
                        rows={4}
                        onChange={(e) => patchWorking({ summaryPrompt: e.target.value || null })}
                        className="font-mono text-xs"
                      />
                    </div>
                    {(isRecruiter || working.extractSchema) && (
                      <div className="space-y-1">
                        <Label>{t("outreach.processor.extractSchema", "Extraction schema (JSON)")}</Label>
                        <Textarea
                          value={working.extractSchema ? JSON.stringify(working.extractSchema, null, 2) : ""}
                          disabled={!editable}
                          rows={8}
                          placeholder='{ "type": "object", "properties": { ... } }'
                          onChange={(e) => {
                            try {
                              patchWorking({ extractSchema: e.target.value.trim() ? JSON.parse(e.target.value) : null });
                            } catch {
                              /* keep typing; only valid JSON commits */
                            }
                          }}
                          className="font-mono text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {t("outreach.processor.extractHelp", "Fields the classifier pulls out of each message (role, company, …).")}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── Rules (reuses the shared panel) ── */}
                  <TabsContent value="rules" className="mt-0">
                    <EmailRulesPanel profileId={working.id} categories={working.taxonomy.map((c) => c.key)} />
                  </TabsContent>

                  {/* ── Actions ── */}
                  <TabsContent value="actions" className="mt-0 space-y-3">
                    {!editable && (
                      <p className="text-xs text-muted-foreground">
                        {t("outreach.processor.actionsReadOnly", "Clone this profile to configure actions.")}
                      </p>
                    )}
                    {actions.length === 0 && editable && (
                      <p className="text-xs text-muted-foreground">{t("outreach.processor.noActions", "No actions yet.")}</p>
                    )}
                    {actions.map((a) => (
                      <div key={a.id} className="border rounded p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={a.name}
                            disabled={!editable}
                            onChange={(e) => patchAction(a.id, { name: e.target.value })}
                            className="h-8 flex-1"
                          />
                          <Switch checked={a.isEnabled} disabled={!editable} onCheckedChange={(v) => patchAction(a.id, { isEnabled: v })} />
                          {editable && (
                            <Button variant="ghost" size="sm" onClick={() => removeAction(a.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Select value={a.triggerType} disabled={!editable} onValueChange={(v) => patchAction(a.id, { triggerType: v as any })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TRIGGER_TYPES.map((tt) => <SelectItem key={tt} value={tt}>{tt}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {a.triggerType === "category" ? (
                            <Select value={a.triggerValue ?? undefined} disabled={!editable} onValueChange={(v) => patchAction(a.id, { triggerValue: v })}>
                              <SelectTrigger className="h-8"><SelectValue placeholder={t("outreach.processor.category", "category")} /></SelectTrigger>
                              <SelectContent>
                                {visibleCategoryKeys.map((k) => <SelectItem key={k} value={k}>{k.replace(/_/g, " ")}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={a.triggerValue ?? ""}
                              disabled={!editable || a.triggerType === "always"}
                              placeholder={a.triggerType === "rule" ? t("outreach.processor.ruleName", "rule name") : ""}
                              onChange={(e) => patchAction(a.id, { triggerValue: e.target.value || null })}
                              className="h-8"
                            />
                          )}
                          <Select value={a.handler} disabled={!editable} onValueChange={(v) => patchAction(a.id, { handler: v })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {HANDLERS.map((h) => <SelectItem key={h} value={h}>{h.replace(/_/g, " ")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {a.handler === "webhook" && (
                          <Input
                            value={(a.config?.url as string) ?? ""}
                            disabled={!editable}
                            placeholder="https://example.com/hook"
                            onChange={(e) => patchAction(a.id, { config: { ...(a.config ?? {}), url: e.target.value } })}
                            className="h-8"
                          />
                        )}
                      </div>
                    ))}
                    {editable && (
                      <Button variant="outline" size="sm" onClick={handleAddAction} disabled={busy}>
                        <Plus className="h-4 w-4 mr-1" /> {t("outreach.processor.addAction", "Add action")}
                      </Button>
                    )}
                  </TabsContent>

                  {/* ── Dry-run ── */}
                  <TabsContent value="dryrun" className="mt-0 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {t("outreach.processor.dryRunHelp", "Re-classify your last 10 synced emails with this profile — nothing is saved.")}
                      </p>
                      <Button size="sm" onClick={handleDryRun} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Play className="h-3.5 w-3.5 mr-1" />{t("outreach.processor.runPreview", "Run preview")}</>}
                      </Button>
                    </div>
                    {dryRows && dryRows.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("outreach.processor.noSample", "No recent messages to preview.")}</p>
                    )}
                    {dryRows?.map((row) => (
                      <div key={row.messageId} className="border rounded p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{row.subject || row.from}</span>
                          <Badge variant={row.visible ? "default" : "secondary"}>{row.category}</Badge>
                        </div>
                        <div className="text-muted-foreground">
                          {row.from} · {t("outreach.processor.score", "score")} {row.score.toFixed(2)} · {row.source}
                        </div>
                        {row.extracted && Object.keys(row.extracted).length > 0 && (
                          <pre className="bg-muted/40 rounded p-1 overflow-x-auto">{JSON.stringify(row.extracted)}</pre>
                        )}
                      </div>
                    ))}
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>

            {editable && (
              <div className="px-5 py-3 border-t flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> {t("outreach.processor.deleteProfile", "Delete")}
                </Button>
                <div className="flex items-center gap-2">
                  <Input
                    value={working.name}
                    onChange={(e) => patchWorking({ name: e.target.value })}
                    className="h-9 w-48"
                  />
                  <Button onClick={handleSave} disabled={!dirty || busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("outreach.processor.save", "Save")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default InboxProcessorEditor;
