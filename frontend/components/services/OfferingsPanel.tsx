// Offerings sub-tab inside Content Creator. Owns the user's paid services
// list (CRUD + dialog) and renders the YourProgramsPanel (Video Promo,
// Voice Clone, Services, Articles, Courses) when the user is enrolled as a
// creator. This used to be a top-level tab at /services/offerings — see
// ServicesManagement's path-to-subtab mapping for the legacy URL handling.
//
// `openCreate` is exposed via ref so the parent (CreatorWorkspace) can
// trigger the Add-Service dialog from buttons rendered in the tabs row.

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import AddFirstServiceCTA from "@/components/services/AddFirstServiceCTA";
import YourProgramsPanel from "@/components/creator/YourProgramsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  servicesService,
  type CreateServiceInput,
  type ServiceOffering,
} from "@/lib/services/services-service";
import { confirmDialog } from "@/lib/dialogs";
import { userService } from "@/lib/services/user-service";
import type { CreatorProfile } from "@/lib/services/creator-service";

const SERVICE_CATEGORIES = [
  "Resume Review",
  "LinkedIn Optimization",
  "Interview Coaching",
  "Career Coaching",
  "Cover Letter Writing",
  "Job Search Strategy",
  "Salary Negotiation",
  "Personal Branding",
  "Headhunting / Lead Generation",
  "Recruitment Services",
  "Other",
];

const defaultForm: CreateServiceInput = {
  title: "",
  description: "",
  category: "",
  priceCents: 0,
  priceVisible: true,
  deliveryDays: undefined,
};

function formatPrice(cents: number | null) {
  if (cents === null) return "Contact for pricing";
  return `$${(cents / 100).toFixed(2)}`;
}

interface Props {
  services: ServiceOffering[];
  loading: boolean;
  setServices: React.Dispatch<React.SetStateAction<ServiceOffering[]>>;
  /** Creator profile (null when not enrolled). Drives YourProgramsPanel. */
  profile: CreatorProfile | null;
  onProfileChange: (next: CreatorProfile | null) => void;
}

export interface OfferingsPanelHandle {
  openCreate: () => void;
}

const OfferingsPanel = forwardRef<OfferingsPanelHandle, Props>(function OfferingsPanel({
  services,
  loading,
  setServices,
  profile,
  onProfileChange,
}, ref) {
  const [providesServices, setProviderServices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateServiceInput>(defaultForm);

  // providesServices is only used by openCreate's first-time opt-in path;
  // load it once so the toggle doesn't fire when the user already has it on.
  useEffect(() => {
    let cancelled = false;
    userService
      .getCurrentUser()
      .then((u) => {
        if (!cancelled) setProviderServices(u.providesServices ?? false);
      })
      .catch(() => {
        // verification gate / transient failure — the toggle path still works
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openCreate() {
    // First-time opt-in: enable providesServices on the user profile so
    // their offerings surface publicly. After they've created their first
    // service, this is managed in /settings → Lead Generation.
    if (!providesServices) {
      setSaving(true);
      try {
        await servicesService.toggleProvideServices(true);
        setProviderServices(true);
        toast.success("Lead generation enabled — your services will appear on your profile.");
      } catch {
        toast.error("Failed to enable lead generation");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate }), [openCreate]);

  function openEdit(s: ServiceOffering) {
    setEditingId(s.id);
    setForm({
      title: s.title,
      description: s.description ?? "",
      category: s.category ?? "",
      priceCents: s.priceCents ?? 0,
      priceVisible: s.priceVisible,
      deliveryDays: s.deliveryDays ?? undefined,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await servicesService.updateService(editingId, form);
        setServices((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
        toast.success("Service updated");
      } else {
        const created = await servicesService.createService(form);
        setServices((prev) => [created, ...prev]);
        toast.success("Service created");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save service");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(s: ServiceOffering) {
    try {
      const updated = await servicesService.updateService(s.id, { isActive: !s.isActive });
      setServices((prev) => prev.map((item) => (item.id === s.id ? updated : item)));
    } catch {
      toast.error("Failed to update service");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ title: "Delete service", description: "Delete this service?", confirmText: "Delete", destructive: true }))) return;
    try {
      await servicesService.deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      toast.success("Service deleted");
    } catch {
      toast.error("Failed to delete service");
    }
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
      {/* Left: user-created services. Add Service / Lead Gen Settings
          buttons live in the tabs row in CreatorWorkspace (triggered via
          the imperative ref handle exposed below). */}
      <div className="space-y-4 min-w-0">
        {/* `#my-services` anchor — YourProgramsPanel's "Services" card
            deep-links here so the list scrolls into view. */}
        <div id="my-services" className="scroll-mt-24 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : services.length === 0 ? (
            <AddFirstServiceCTA onClick={openCreate} loading={saving} />
          ) : (
            <div className="space-y-3">
              {services.map((s) => (
                <Card key={s.id} className={!s.isActive ? "opacity-60" : undefined}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{s.title}</h3>
                          {s.category && (
                            <Badge variant="secondary" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {s.category}
                            </Badge>
                          )}
                          {!s.isActive && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {s.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="flex items-center gap-1 font-medium text-violet-600">
                            <DollarSign className="h-3.5 w-3.5" />
                            {formatPrice(s.priceCents)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {s.priceVisible ? (
                              <>
                                <Eye className="h-3.5 w-3.5" /> Price visible
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3.5 w-3.5" /> Price on inquiry
                              </>
                            )}
                          </span>
                          {s.deliveryDays && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {s.deliveryDays}d delivery
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={s.isActive ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleActive(s)}
                        >
                          {s.isActive ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: creator programs */}
      {profile && (
        <div className="lg:sticky lg:top-4">
          <YourProgramsPanel profile={profile} onProfileChange={onProfileChange} />
        </div>
      )}
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              Define what you offer. Set a price and choose whether to show it publicly or
              only after an inquiry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="svc-title">Title *</Label>
              <Input
                id="svc-title"
                placeholder="e.g. Resume Review & Feedback"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea
                id="svc-desc"
                rows={3}
                placeholder="What's included, turnaround time, what you need from the client..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="svc-category">Category</Label>
                <Select
                  value={form.category || ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger id="svc-category">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-delivery">Delivery (days)</Label>
                <Input
                  id="svc-delivery"
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={form.deliveryDays ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      deliveryDays: e.target.value ? parseInt(e.target.value) : undefined,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="svc-price">Price (USD)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="svc-price"
                    type="number"
                    min={0}
                    step={0.01}
                    className="pl-8"
                    placeholder="0.00"
                    value={form.priceCents ? (form.priceCents / 100).toFixed(2) : ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        priceCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Price Visibility</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch
                    checked={form.priceVisible}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, priceVisible: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.priceVisible ? (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> Publicly visible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <EyeOff className="h-3.5 w-3.5" /> Inquiry only
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingId ? "Save Changes" : "Create Service"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default OfferingsPanel;
