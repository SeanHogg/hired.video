// ServicesSettings — settings tab inside the My Services hub. Two stacked
// sections (not tabbed) so a recruiter setting up their first share can see
// brand kits + redaction profiles together without losing context.
//
//   • Brand kits (whitelabel_tenants) — logo, primaryColor, contact info
//     surfaced in the banner on every shared link. Outbound branding.
//   • Redaction profiles — per-company rule sets that strip PII before
//     sharing. One default per company is enforced server-side.

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ServicesNav from "@/components/services/ServicesNav";
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
import { useAuth } from "@/lib/auth";
import {
  recruitService,
  type RecruitScope,
  type RecruitScopeBrandKit,
  type RedactionProfileRow,
} from "@/lib/services/recruit-service";

// -------------------------------------------------------------------------
// Brand kit dialog
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// Redaction profile dialog
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export default function ServicesSettings() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Brand kit state
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [brandEditingId, setBrandEditingId] = useState<string | null>(null);
  const [brandDraft, setBrandDraft] = useState<BrandKitDraft>(EMPTY_BRAND_KIT);
  const [brandBusy, setBrandBusy] = useState(false);

  // Profile state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileEditingId, setProfileEditingId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [profileBusy, setProfileBusy] = useState(false);

  const refresh = async () => {
    try {
      const s = await recruitService.getMyScope();
      setScope(s);
      if (!selectedCompanyId) {
        setSelectedCompanyId(s.primaryCompanyId ?? s.companies[0]?.id ?? null);
      }
    } catch {
      toast({ title: "Failed to load settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const companyProfiles = (scope?.redactionProfiles ?? []).filter(
    (p) => p.companyId === selectedCompanyId,
  );

  // ─── Brand kit handlers ───────────────────────────────────────────────────

  const openBrandCreate = () => {
    setBrandEditingId(null);
    setBrandDraft(EMPTY_BRAND_KIT);
    setBrandDialogOpen(true);
  };

  const openBrandEdit = (kit: RecruitScopeBrandKit) => {
    setBrandEditingId(kit.id);
    setBrandDraft({
      name: kit.name,
      subdomain: kit.subdomain,
      primaryColor: kit.primaryColor ?? "#2563eb",
      logoUrl: kit.logoUrl ?? "",
      heroHeadline: "",
      contactEmail: "",
      website: "",
    });
    setBrandDialogOpen(true);
  };

  const saveBrand = async () => {
    if (!brandDraft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      setBrandBusy(true);
      if (brandEditingId) {
        await recruitService.updateBrandKit(brandEditingId, {
          name: brandDraft.name.trim(),
          primaryColor: brandDraft.primaryColor,
          logoUrl: brandDraft.logoUrl.trim() || null,
          heroHeadline: brandDraft.heroHeadline.trim() || null,
          contactEmail: brandDraft.contactEmail.trim() || undefined,
          website: brandDraft.website.trim() || null,
        });
      } else {
        if (!brandDraft.subdomain.trim()) {
          toast({
            title: "Subdomain is required",
            description: "E.g. 'contoso' → contoso.hired.video",
            variant: "destructive",
          });
          return;
        }
        if (!/^[a-z0-9-]+$/.test(brandDraft.subdomain)) {
          toast({
            title: "Subdomain must be lowercase letters, digits, or dashes.",
            variant: "destructive",
          });
          return;
        }
        await recruitService.createBrandKit({
          name: brandDraft.name.trim(),
          subdomain: brandDraft.subdomain.trim(),
          tenantType: "agency",
          primaryColor: brandDraft.primaryColor,
          logoUrl: brandDraft.logoUrl.trim() || null,
          heroHeadline: brandDraft.heroHeadline.trim() || null,
          contactEmail: brandDraft.contactEmail.trim() || undefined,
          website: brandDraft.website.trim() || null,
        });
      }
      setBrandDialogOpen(false);
      await refresh();
      toast({ title: brandEditingId ? "Brand kit updated" : "Brand kit created" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBrandBusy(false);
    }
  };

  // ─── Redaction profile handlers ───────────────────────────────────────────

  const openProfileCreate = () => {
    setProfileEditingId(null);
    // If this is the first profile, offer it as the default.
    setProfileDraft({ ...EMPTY_PROFILE, isDefault: companyProfiles.length === 0 });
    setProfileDialogOpen(true);
  };

  const openProfileEdit = (profile: RedactionProfileRow) => {
    setProfileEditingId(profile.id);
    setProfileDraft(profileToDraft(profile));
    setProfileDialogOpen(true);
  };

  const saveProfile = async () => {
    if (!selectedCompanyId) {
      toast({ title: "No company selected", variant: "destructive" });
      return;
    }
    if (!profileDraft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      setProfileBusy(true);
      const payload = {
        name: profileDraft.name.trim(),
        description: profileDraft.description.trim() || undefined,
        isDefault: profileDraft.isDefault,
        hideName: profileDraft.hideName,
        hideEmail: profileDraft.hideEmail,
        hidePhone: profileDraft.hidePhone,
        hideAddress: profileDraft.hideAddress,
        hideLinkedin: profileDraft.hideLinkedin,
        hideOtherUrls: profileDraft.hideOtherUrls,
        hideAvatar: profileDraft.hideAvatar,
        replacementName: profileDraft.replacementName.trim() || "Candidate",
        hideCompanyNames: profileDraft.hideCompanyNames,
        hideSchoolNames: profileDraft.hideSchoolNames,
      };
      if (profileEditingId) {
        await recruitService.updateRedactionProfile(profileEditingId, payload);
      } else {
        await recruitService.createRedactionProfile({
          companyId: selectedCompanyId,
          ...payload,
        });
      }
      setProfileDialogOpen(false);
      await refresh();
      toast({
        title: profileEditingId ? "Profile updated" : "Profile created",
      });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const deleteProfile = async (id: string) => {
    if (!window.confirm("Delete this redaction profile? Shares using it will fall back to defaults.")) {
      return;
    }
    try {
      await recruitService.deleteRedactionProfile(id);
      await refresh();
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
      await refresh();
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
          <div className="max-w-5xl mx-auto p-6">
            <ServicesNav hasCompanyAccess={(scope?.companies.length ?? 0) > 0} />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">Services Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Brand kits and redaction profiles used when you share candidates or decks
                  with hiring clients.
                </p>
              </div>
              {scope && scope.companies.length > 1 && (
                <Select
                  value={selectedCompanyId ?? ""}
                  onValueChange={(v) => setSelectedCompanyId(v)}
                >
                  <SelectTrigger className="w-[220px]">
                    <Building2 className="w-4 h-4 mr-1" />
                    <SelectValue placeholder="Company" />
                  </SelectTrigger>
                  <SelectContent>
                    {scope.companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loading && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
                Loading settings…
              </div>
            )}

            {!loading && scope && (
              <div className="space-y-8">
                {/* Brand kits */}
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
                      <Button size="sm" onClick={openBrandCreate}>
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
                        onClick={() => openBrandEdit(kit)}
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

                {/* Redaction profiles */}
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
                        <Button size="sm" onClick={openProfileCreate}>
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
                      <div
                        key={profile.id}
                        className="flex items-center gap-3 border rounded p-3"
                      >
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openProfileEdit(profile)}
                          >
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
              </div>
            )}
          </div>
          <Footer />
        </div>
      </div>

      {/* ─── Brand kit dialog ──────────────────────────────────────────────── */}
      <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {brandEditingId ? "Edit brand kit" : "New brand kit"}
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
                  value={brandDraft.name}
                  onChange={(e) =>
                    setBrandDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Contoso Staffing"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subdomain {brandEditingId && <span className="text-[10px] text-muted-foreground">(immutable)</span>}</Label>
                <Input
                  value={brandDraft.subdomain}
                  onChange={(e) =>
                    setBrandDraft((d) => ({
                      ...d,
                      subdomain: e.target.value.toLowerCase(),
                    }))
                  }
                  placeholder="contoso"
                  disabled={Boolean(brandEditingId)}
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
                    value={brandDraft.primaryColor}
                    onChange={(e) =>
                      setBrandDraft((d) => ({ ...d, primaryColor: e.target.value }))
                    }
                  />
                  <Input
                    value={brandDraft.primaryColor}
                    onChange={(e) =>
                      setBrandDraft((d) => ({ ...d, primaryColor: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Logo URL</Label>
                <Input
                  value={brandDraft.logoUrl}
                  onChange={(e) =>
                    setBrandDraft((d) => ({ ...d, logoUrl: e.target.value }))
                  }
                  placeholder="https://contoso.com/logo.png"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tagline (optional)</Label>
              <Input
                value={brandDraft.heroHeadline}
                onChange={(e) =>
                  setBrandDraft((d) => ({ ...d, heroHeadline: e.target.value }))
                }
                placeholder="Senior engineering talent, matched precisely."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact email</Label>
                <Input
                  type="email"
                  value={brandDraft.contactEmail}
                  onChange={(e) =>
                    setBrandDraft((d) => ({ ...d, contactEmail: e.target.value }))
                  }
                  placeholder="hiring@contoso.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  value={brandDraft.website}
                  onChange={(e) =>
                    setBrandDraft((d) => ({ ...d, website: e.target.value }))
                  }
                  placeholder="https://contoso.com"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBrandDialogOpen(false)}
              disabled={brandBusy}
            >
              Cancel
            </Button>
            <Button onClick={saveBrand} disabled={brandBusy || !brandDraft.name.trim()}>
              {brandBusy ? "Saving…" : brandEditingId ? "Save changes" : "Create brand kit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Redaction profile dialog ──────────────────────────────────────── */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {profileEditingId ? "Edit redaction profile" : "New redaction profile"}
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
                value={profileDraft.name}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, name: e.target.value }))
                }
                placeholder="Strict redaction"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={profileDraft.description}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, description: e.target.value }))
                }
                rows={2}
                placeholder="When to use this profile — e.g. 'For new hiring clients we haven't vetted yet'."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Replacement name</Label>
                <Input
                  value={profileDraft.replacementName}
                  onChange={(e) =>
                    setProfileDraft((d) => ({
                      ...d,
                      replacementName: e.target.value,
                    }))
                  }
                  placeholder="Candidate"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="isDefault"
                  checked={profileDraft.isDefault}
                  onCheckedChange={(v) =>
                    setProfileDraft((d) => ({ ...d, isDefault: v === true }))
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
                    checked={profileDraft[key]}
                    onCheckedChange={(v) =>
                      setProfileDraft((d) => ({ ...d, [key]: v === true }))
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
            <Button
              variant="outline"
              onClick={() => setProfileDialogOpen(false)}
              disabled={profileBusy}
            >
              Cancel
            </Button>
            <Button onClick={saveProfile} disabled={profileBusy || !profileDraft.name.trim()}>
              {profileBusy
                ? "Saving…"
                : profileEditingId
                ? "Save changes"
                : "Create profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
