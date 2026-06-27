/**
 * /references — owner reference management (#1677). Add reference
 * contacts, then create NDA-gated, revocable share links granting a
 * chosen subset to a specific recipient. Built for the senior-exec
 * audience (confidential, selectively-shared references).
 *
 * The contact store here is the SSoT consumed by the profile References
 * section and the resume studio References section — edit once, surface
 * everywhere. Auth-gated (RequireVerified) at the route: these rows hold
 * private names/emails/phones and must never render to signed-out
 * visitors. Only the token-walled recipient view (/references/shared/:token)
 * is public.
 */
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  referencesService,
  type ReferenceContact,
  type ReferenceShare,
} from "@/lib/services/references-service";

type ContactDraft = Omit<ReferenceContact, "id"> & { id?: string };

const EMPTY_DRAFT: ContactDraft = {
  name: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  relationship: "",
  notes: "",
};

const toDraft = (c: ReferenceContact): ContactDraft => ({
  id: c.id,
  name: c.name,
  title: c.title ?? "",
  company: c.company ?? "",
  email: c.email ?? "",
  phone: c.phone ?? "",
  relationship: c.relationship ?? "",
  notes: c.notes ?? "",
});

export default function References(): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("references.title"), url: "/references" }]);

  const [contacts, setContacts] = useState<ReferenceContact[]>([]);
  const [shares, setShares] = useState<ReferenceShare[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareEmail, setShareEmail] = useState("");
  const [shareLabel, setShareLabel] = useState("");

  // Slide-out create/edit form state. `draft.id` present → editing.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const reload = () => {
    void referencesService.listContacts().then(setContacts).catch(() => {});
    void referencesService.listShares().then(setShares).catch(() => {});
  };
  useEffect(reload, []);

  const openAdd = () => {
    setDraft(EMPTY_DRAFT);
    setSheetOpen(true);
  };

  const openEdit = (c: ReferenceContact) => {
    setDraft(toDraft(c));
    setSheetOpen(true);
  };

  const saveContact = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    const { id, ...body } = draft;
    try {
      if (id) {
        await referencesService.updateContact(id, body);
      } else {
        await referencesService.createContact(body);
      }
      setSheetOpen(false);
      setDraft(EMPTY_DRAFT);
      reload();
      toast({ title: t("references.savedToast") });
    } catch {
      toast({ title: t("references.saveError"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (c: ReferenceContact) => {
    if (!window.confirm(t("references.deleteConfirm"))) return;
    try {
      await referencesService.deleteContact(c.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
      reload();
      toast({ title: t("references.deletedToast") });
    } catch {
      toast({ title: t("references.deleteError"), variant: "destructive" });
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const createShare = async () => {
    if (selected.size === 0 || !shareEmail.trim()) {
      toast({ title: t("references.share.pickError"), variant: "destructive" });
      return;
    }
    try {
      await referencesService.createShare({
        contactIds: [...selected],
        sharedWithEmail: shareEmail.trim(),
        label: shareLabel.trim() || undefined,
        requireNda: true,
      });
      setSelected(new Set());
      setShareEmail("");
      setShareLabel("");
      reload();
      toast({ title: t("references.share.created") });
    } catch {
      toast({ title: t("references.share.createError"), variant: "destructive" });
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/references/shared/${token}`;
    void navigator.clipboard.writeText(url);
    toast({ title: t("references.share.copied") });
  };

  const revoke = async (id: string) => {
    try {
      await referencesService.revokeShare(id);
      reload();
    } catch {
      toast({ title: t("references.share.revokeError"), variant: "destructive" });
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-8 max-w-4xl mx-auto">
        <PageHeader
          title={t("references.title")}
          description={t("references.subtitle")}
          actions={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              {t("references.add")}
            </Button>
          }
        />

        <div className="space-y-8">
          {/* Contacts list + share builder */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t("references.list.heading", { count: contacts.length })}
              </h2>
              {contacts.length === 0 ? (
                <div className="rounded border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">{t("references.empty")}</p>
                  <Button variant="outline" className="mt-3" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("references.add")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map((ct) => (
                    <div
                      key={ct.id}
                      className="flex items-center gap-3 rounded border p-3"
                    >
                      <Checkbox
                        checked={selected.has(ct.id)}
                        onCheckedChange={() => toggle(ct.id)}
                        aria-label={t("references.selectFor", { name: ct.name })}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {ct.name}
                          {ct.title ? `, ${ct.title}` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {[ct.company, ct.relationship].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(ct)}
                          aria-label={t("references.editAria", { name: ct.name })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteContact(ct)}
                          aria-label={t("references.deleteAria", { name: ct.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {contacts.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="text-sm font-semibold">
                    {t("references.share.heading", { count: selected.size })}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm">{t("references.share.recipientEmail")}</Label>
                      <Input
                        type="email"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-sm">{t("references.share.label")}</Label>
                      <Input
                        value={shareLabel}
                        onChange={(e) => setShareLabel(e.target.value)}
                        placeholder={t("references.share.labelPlaceholder")}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={createShare}
                    disabled={selected.size === 0 || !shareEmail.trim()}
                  >
                    {t("references.share.create")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active shares */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">{t("references.share.linksHeading")}</h2>
              {shares.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("references.share.noLinks")}</p>
              ) : (
                <div className="space-y-2">
                  {shares.map((s) => {
                    const revoked = !!s.revokedAt;
                    const expired = s.expiresAt && new Date(s.expiresAt).getTime() < Date.now();
                    const status = s.ndaAcceptedAt
                      ? t("references.share.ndaAccepted")
                      : s.requireNda
                        ? t("references.share.ndaPending")
                        : "";
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded border p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{s.label || s.sharedWithEmail}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {s.sharedWithEmail} · {t("references.share.refs", { count: s.contactIds.length })}
                            {status ? ` · ${status}` : ""}
                            {s.firstViewedAt ? ` · ${t("references.share.viewed")}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {revoked ? (
                            <Badge variant="destructive">{t("references.share.revoked")}</Badge>
                          ) : expired ? (
                            <Badge variant="outline">{t("references.share.expired")}</Badge>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => copyLink(s.token)}>
                                {t("references.share.copy")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>
                                {t("references.share.revoke")}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Slide-out create / edit form */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle>{draft.id ? t("references.edit") : t("references.add")}</SheetTitle>
            <SheetDescription>{t("references.formSubtitle")}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <Label className="text-sm">{t("references.field.name")}</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-sm">{t("references.field.title")}</Label>
                <Input
                  value={draft.title ?? ""}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">{t("references.field.company")}</Label>
                <Input
                  value={draft.company ?? ""}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">{t("references.field.email")}</Label>
                <Input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">{t("references.field.phone")}</Label>
                <Input
                  value={draft.phone ?? ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">{t("references.field.relationship")}</Label>
              <Input
                value={draft.relationship ?? ""}
                onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
                placeholder={t("references.field.relationshipPlaceholder")}
              />
            </div>
            <div>
              <Label className="text-sm">{t("references.field.notes")}</Label>
              <Textarea
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              {t("references.cancel")}
            </Button>
            <Button onClick={saveContact} disabled={!draft.name.trim() || saving}>
              {t("references.save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
