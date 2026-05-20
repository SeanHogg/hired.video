// BrandKitsSection — reusable card listing the recruiter's brand kits with
// a create/edit dialog. Surfaces in /settings (Recruiter > Sharing tab) and
// anywhere else the brand kit list needs to render.
//
// Self-gates: returns null when scope has zero brand kits AND the user has
// no company access (nothing to manage). Consumers don't have to compute
// visibility themselves.

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  recruitService,
  type RecruitScope,
  type RecruitScopeBrandKit,
} from "@/lib/services/recruit-service";

interface BrandKitDraft {
  name: string;
  subdomain: string;
  primaryColor: string;
  logoUrl: string;
  heroHeadline: string;
  contactEmail: string;
  website: string;
}

const EMPTY_BRAND_KIT: BrandKitDraft = {
  name: "",
  subdomain: "",
  primaryColor: "#2563eb",
  logoUrl: "",
  heroHeadline: "",
  contactEmail: "",
  website: "",
};

interface BrandKitsSectionProps {
  scope: RecruitScope;
  /** Called after a successful create/edit so the caller can re-fetch scope. */
  onChange: () => Promise<void> | void;
}

export default function BrandKitsSection({ scope, onChange }: BrandKitsSectionProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BrandKitDraft>(EMPTY_BRAND_KIT);
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setDraft(EMPTY_BRAND_KIT);
    setDialogOpen(true);
  };

  const openEdit = (kit: RecruitScopeBrandKit) => {
    setEditingId(kit.id);
    setDraft({
      name: kit.name,
      subdomain: kit.subdomain,
      primaryColor: kit.primaryColor ?? "#2563eb",
      logoUrl: kit.logoUrl ?? "",
      heroHeadline: "",
      contactEmail: "",
      website: "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      setBusy(true);
      if (editingId) {
        await recruitService.updateBrandKit(editingId, {
          name: draft.name.trim(),
          primaryColor: draft.primaryColor,
          logoUrl: draft.logoUrl.trim() || null,
          heroHeadline: draft.heroHeadline.trim() || null,
          contactEmail: draft.contactEmail.trim() || undefined,
          website: draft.website.trim() || null,
        });
      } else {
        if (!draft.subdomain.trim()) {
          toast({
            title: "Subdomain is required",
            description: "E.g. 'contoso' → contoso.hired.video",
            variant: "destructive",
          });
          return;
        }
        if (!/^[a-z0-9-]+$/.test(draft.subdomain)) {
          toast({
            title: "Subdomain must be lowercase letters, digits, or dashes.",
            variant: "destructive",
          });
          return;
        }
        await recruitService.createBrandKit({
          name: draft.name.trim(),
          subdomain: draft.subdomain.trim(),
          tenantType: "agency",
          primaryColor: draft.primaryColor,
          logoUrl: draft.logoUrl.trim() || null,
          heroHeadline: draft.heroHeadline.trim() || null,
          contactEmail: draft.contactEmail.trim() || undefined,
          website: draft.website.trim() || null,
        });
      }
      setDialogOpen(false);
      await onChange();
      toast({ title: editingId ? "Brand kit updated" : "Brand kit created" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Brand kits
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Applied to shared candidate resumes and pitch decks. Logo + primary
                colour render on the reviewer's page.
              </p>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" />
              New brand kit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {scope.brandKits.length === 0 && (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No brand kits yet. Add one so your agency's logo appears on every
              share link you send to a hiring client.
            </div>
          )}
          {scope.brandKits.map((kit) => (
            <button
              key={kit.id}
              type="button"
              onClick={() => openEdit(kit)}
              className="w-full flex items-center gap-3 border rounded p-3 text-left hover:bg-muted/30"
            >
              <div
                className="w-10 h-10 rounded flex items-center justify-center text-white text-xs font-semibold shrink-0"
                style={{ background: kit.primaryColor ?? "#2563eb" }}
              >
                {kit.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{kit.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {kit.subdomain}.hired.video · {kit.primaryColor ?? "#2563eb"}
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit brand kit" : "New brand kit"}
            </DialogTitle>
            <DialogDescription>
              Shown as a banner at the top of every share link sent with this kit applied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Agency name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Contoso Staffing"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Subdomain{" "}
                  {editingId && (
                    <span className="text-[10px] text-muted-foreground">(immutable)</span>
                  )}
                </Label>
                <Input
                  value={draft.subdomain}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, subdomain: e.target.value.toLowerCase() }))
                  }
                  placeholder="contoso"
                  disabled={Boolean(editingId)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Primary colour</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="color"
                    className="w-14 h-10 p-1 shrink-0"
                    value={draft.primaryColor}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, primaryColor: e.target.value }))
                    }
                  />
                  <Input
                    value={draft.primaryColor}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, primaryColor: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Logo URL</Label>
                <Input
                  value={draft.logoUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, logoUrl: e.target.value }))}
                  placeholder="https://contoso.com/logo.png"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tagline (optional)</Label>
              <Input
                value={draft.heroHeadline}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, heroHeadline: e.target.value }))
                }
                placeholder="Senior engineering talent, matched precisely."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact email</Label>
                <Input
                  type="email"
                  value={draft.contactEmail}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contactEmail: e.target.value }))
                  }
                  placeholder="hiring@contoso.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  value={draft.website}
                  onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                  placeholder="https://contoso.com"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !draft.name.trim()}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Create brand kit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
