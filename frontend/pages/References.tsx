/**
 * /references — owner reference management (#1677). Add reference
 * contacts, then create NDA-gated, revocable share links granting a
 * chosen subset to a specific recipient. Built for the senior-exec
 * audience (confidential, selectively-shared references).
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/lib/seo";
import {
  referencesService,
  type ReferenceContact,
  type ReferenceShare,
} from "@/lib/services/references-service";

export default function References(): JSX.Element {
  const location = useLocation();
  const { toast } = useToast();
  useSEO(location.pathname, {
    title: "Reference Management · hired.video",
    description: "Manage confidential references and share NDA-gated reference packets selectively.",
  });

  const [contacts, setContacts] = useState<ReferenceContact[]>([]);
  const [shares, setShares] = useState<ReferenceShare[]>([]);
  const [draft, setDraft] = useState({ name: "", title: "", company: "", email: "", relationship: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareEmail, setShareEmail] = useState("");
  const [shareLabel, setShareLabel] = useState("");

  const reload = () => {
    void referencesService.listContacts().then(setContacts).catch(() => {});
    void referencesService.listShares().then(setShares).catch(() => {});
  };
  useEffect(reload, []);

  const addContact = async () => {
    if (!draft.name.trim()) return;
    try {
      await referencesService.createContact(draft);
      setDraft({ name: "", title: "", company: "", email: "", relationship: "" });
      reload();
    } catch {
      toast({ title: "Couldn't add contact", variant: "destructive" });
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
      toast({ title: "Pick contacts + a recipient email", variant: "destructive" });
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
      toast({ title: "Share link created" });
    } catch {
      toast({ title: "Couldn't create share", variant: "destructive" });
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/references/shared/${token}`;
    void navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  const revoke = async (id: string) => {
    try {
      await referencesService.revokeShare(id);
      reload();
    } catch {
      toast({ title: "Couldn't revoke", variant: "destructive" });
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-12 max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-3xl font-bold mb-2">References</h1>
          <p className="text-muted-foreground">
            Keep your references private. Share a chosen subset with one recipient via an
            NDA-gated link you can revoke anytime.
          </p>
        </div>

        {/* Add contact */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold">Add a reference</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-sm">Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div><Label className="text-sm">Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div><Label className="text-sm">Company</Label><Input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></div>
              <div><Label className="text-sm">Email</Label><Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
              <div><Label className="text-sm">Relationship</Label><Input value={draft.relationship} onChange={(e) => setDraft({ ...draft, relationship: e.target.value })} placeholder="Former manager, Board chair…" /></div>
            </div>
            <Button onClick={addContact} disabled={!draft.name.trim()}>Add reference</Button>
          </CardContent>
        </Card>

        {/* Contacts + share builder */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold">Your references ({contacts.length})</h2>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No references yet — add one above.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-3 rounded border p-3 cursor-pointer">
                    <Checkbox checked={selected.has(ct.id)} onCheckedChange={() => toggle(ct.id)} />
                    <div>
                      <p className="font-medium">{ct.name}{ct.title ? `, ${ct.title}` : ""}</p>
                      <p className="text-sm text-muted-foreground">
                        {[ct.company, ct.relationship].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold">Share {selected.size} selected with a recipient (NDA-gated)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-sm">Recipient email</Label><Input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} /></div>
                <div><Label className="text-sm">Label (optional)</Label><Input value={shareLabel} onChange={(e) => setShareLabel(e.target.value)} placeholder="References for the Acme CEO role" /></div>
              </div>
              <Button onClick={createShare} disabled={selected.size === 0 || !shareEmail.trim()}>Create share link</Button>
            </div>
          </CardContent>
        </Card>

        {/* Active shares */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold">Share links</h2>
            {shares.length === 0 ? (
              <p className="text-sm text-muted-foreground">No share links yet.</p>
            ) : (
              <div className="space-y-2">
                {shares.map((s) => {
                  const revoked = !!s.revokedAt;
                  const expired = s.expiresAt && new Date(s.expiresAt).getTime() < Date.now();
                  return (
                    <div key={s.id} className="flex items-center justify-between rounded border p-3">
                      <div>
                        <p className="font-medium">{s.label || s.sharedWithEmail}</p>
                        <p className="text-sm text-muted-foreground">
                          {s.sharedWithEmail} · {s.contactIds.length} refs
                          {s.ndaAcceptedAt ? " · NDA accepted" : s.requireNda ? " · NDA pending" : ""}
                          {s.firstViewedAt ? " · viewed" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {revoked ? <Badge variant="destructive">Revoked</Badge>
                          : expired ? <Badge variant="outline">Expired</Badge>
                          : <>
                              <Button size="sm" variant="outline" onClick={() => copyLink(s.token)}>Copy link</Button>
                              <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>Revoke</Button>
                            </>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
