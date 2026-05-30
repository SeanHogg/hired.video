// RedactionProfilesSection — reusable card for managing redaction profiles
// (which PII gets stripped at share time) scoped to a recruiter's selected
// company. Surfaces in /settings (Recruiter > Sharing) and anywhere else
// the profile list needs to render.
//
// Self-gates: profiles are company-scoped, so the section renders a
// company picker only when the recruiter belongs to more than one company.

import { useState } from "react";
import { Check, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import { confirmDialog } from "@/lib/dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  recruitService,
  type RecruitScope,
  type RedactionProfileRow,
} from "@/lib/services/recruit-service";

interface ProfileDraft {
  name: string;
  description: string;
  isDefault: boolean;
  hideName: boolean;
  hideEmail: boolean;
  hidePhone: boolean;
  hideAddress: boolean;
  hideLinkedin: boolean;
  hideOtherUrls: boolean;
  hideAvatar: boolean;
  replacementName: string;
  hideCompanyNames: boolean;
  hideSchoolNames: boolean;
}

const EMPTY_PROFILE: ProfileDraft = {
  name: "",
  description: "",
  isDefault: false,
  hideName: true,
  hideEmail: true,
  hidePhone: true,
  hideAddress: true,
  hideLinkedin: true,
  hideOtherUrls: false,
  hideAvatar: true,
  replacementName: "Candidate",
  hideCompanyNames: false,
  hideSchoolNames: false,
};

function profileToDraft(row: RedactionProfileRow): ProfileDraft {
  return {
    name: row.name,
    description: row.description ?? "",
    isDefault: row.isDefault,
    hideName: row.hideName,
    hideEmail: row.hideEmail,
    hidePhone: row.hidePhone,
    hideAddress: row.hideAddress,
    hideLinkedin: row.hideLinkedin,
    hideOtherUrls: row.hideOtherUrls,
    hideAvatar: row.hideAvatar,
    replacementName: row.replacementName,
    hideCompanyNames: row.hideCompanyNames,
    hideSchoolNames: row.hideSchoolNames,
  };
}

interface RedactionProfilesSectionProps {
  scope: RecruitScope;
  selectedCompanyId: string | null;
  /** Called after a successful create/edit/delete so the caller can re-fetch scope. */
  onChange: () => Promise<void> | void;
}

export default function RedactionProfilesSection({
  scope,
  selectedCompanyId,
  onChange,
}: RedactionProfilesSectionProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);

  const companyProfiles = scope.redactionProfiles.filter(
    (p) => p.companyId === selectedCompanyId,
  );

  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_PROFILE, isDefault: companyProfiles.length === 0 });
    setDialogOpen(true);
  };

  const openEdit = (profile: RedactionProfileRow) => {
    setEditingId(profile.id);
    setDraft(profileToDraft(profile));
    setDialogOpen(true);
  };

  const save = async () => {
    if (!selectedCompanyId) {
      toast({ title: "No company selected", variant: "destructive" });
      return;
    }
    if (!draft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      setBusy(true);
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        isDefault: draft.isDefault,
        hideName: draft.hideName,
        hideEmail: draft.hideEmail,
        hidePhone: draft.hidePhone,
        hideAddress: draft.hideAddress,
        hideLinkedin: draft.hideLinkedin,
        hideOtherUrls: draft.hideOtherUrls,
        hideAvatar: draft.hideAvatar,
        replacementName: draft.replacementName.trim() || "Candidate",
        hideCompanyNames: draft.hideCompanyNames,
        hideSchoolNames: draft.hideSchoolNames,
      };
      if (editingId) {
        await recruitService.updateRedactionProfile(editingId, payload);
      } else {
        await recruitService.createRedactionProfile({
          companyId: selectedCompanyId,
          ...payload,
        });
      }
      setDialogOpen(false);
      await onChange();
      toast({ title: editingId ? "Profile updated" : "Profile created" });
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

  const deleteProfile = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Delete profile",
        description:
          "Delete this redaction profile? Shares using it will fall back to defaults.",
        confirmText: "Delete",
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await recruitService.deleteRedactionProfile(id);
      await onChange();
      toast({ title: "Profile deleted" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const seedDefault = async () => {
    if (!selectedCompanyId) return;
    try {
      await recruitService.createRedactionProfile({
        companyId: selectedCompanyId,
        name: "Strict redaction (default)",
        description:
          "Hides every identifier — name, email, phone, LinkedIn, address, avatar. Use for cold outreach to hiring clients.",
        isDefault: true,
      });
      await onChange();
      toast({ title: "Default profile seeded" });
    } catch (e) {
      toast({
        title: "Seed failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Redaction profiles
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Controls which PII gets stripped at share time. One default per
                company — applied automatically when a recruiter forgets to pick a
                profile.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {companyProfiles.length === 0 && selectedCompanyId && (
                <Button size="sm" variant="outline" onClick={seedDefault}>
                  <Star className="w-4 h-4 mr-1" />
                  Seed default
                </Button>
              )}
              <Button size="sm" onClick={openCreate} disabled={!selectedCompanyId}>
                <Plus className="w-4 h-4 mr-1" />
                New profile
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {companyProfiles.length === 0 && (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No redaction profiles for this company yet. Shares fall back to strict
              defaults (name, email, phone, LinkedIn, address, avatar stripped).
            </div>
          )}
          {companyProfiles.map((profile) => (
            <div key={profile.id} className="flex items-center gap-3 border rounded p-3">
              <ShieldCheck className="w-6 h-6 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{profile.name}</span>
                  {profile.isDefault && (
                    <Badge variant="default" className="text-[10px]">
                      <Check className="w-3 h-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>
                {profile.description && (
                  <div className="text-xs text-muted-foreground truncate">
                    {profile.description}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Hides:{" "}
                  {[
                    profile.hideName && "name",
                    profile.hideEmail && "email",
                    profile.hidePhone && "phone",
                    profile.hideLinkedin && "linkedin",
                    profile.hideAddress && "address",
                    profile.hideAvatar && "avatar",
                    profile.hideCompanyNames && "company names",
                    profile.hideSchoolNames && "school names",
                    profile.hideOtherUrls && "other URLs",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "nothing — passthrough"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(profile)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteProfile(profile.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit redaction profile" : "New redaction profile"}
            </DialogTitle>
            <DialogDescription>
              Applied to a shared resume's JSON before rendering. The recruiter's own copy is
              never modified — these rules only affect the render pipeline on share links.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Strict redaction"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={2}
                placeholder="When to use this profile — e.g. 'For new hiring clients we haven't vetted yet'."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Replacement name</Label>
                <Input
                  value={draft.replacementName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, replacementName: e.target.value }))
                  }
                  placeholder="Candidate"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="isDefault"
                  checked={draft.isDefault}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, isDefault: v === true }))
                  }
                />
                <Label htmlFor="isDefault" className="cursor-pointer text-sm">
                  Company default
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3">
              {(
                [
                  ["hideName", "Hide name"],
                  ["hideEmail", "Hide email"],
                  ["hidePhone", "Hide phone"],
                  ["hideAddress", "Hide address"],
                  ["hideLinkedin", "Hide LinkedIn"],
                  ["hideOtherUrls", "Hide other URLs"],
                  ["hideAvatar", "Hide avatar / photo"],
                  ["hideCompanyNames", "Hide past company names"],
                  ["hideSchoolNames", "Hide school names"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={draft[key]}
                    onCheckedChange={(v) =>
                      setDraft((d) => ({ ...d, [key]: v === true }))
                    }
                  />
                  <Label htmlFor={key} className="cursor-pointer text-xs">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !draft.name.trim()}>
              {busy
                ? "Saving…"
                : editingId
                ? "Save changes"
                : "Create profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
