import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  DollarSign,
  Eye,
  EyeOff,
  Clock,
  Tag,
  Loader2,
  Bell,
  BellOff,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import {
  servicesService,
  type ServiceOffering,
  type CreateServiceInput,
} from "@/lib/services/services-service";
import {
  isPushSupported,
  getPushPermission,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentPushSubscription,
} from "@/lib/push-notifications";
import { toast } from "sonner";

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

export default function ServicesManagement() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { user } = useAuth();

  const [providesServices, setProviderServices] = useState(false);
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateServiceInput>(defaultForm);

  // Push notification state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    loadData();
    checkPushStatus();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch own services
      const data = await servicesService.listMyServices();
      setServices(data);

      // We need profile info to know if providesServices is on.
      // The /api/users/me endpoint should include this; fall back gracefully.
      try {
        const { apiClient } = await import("@/lib/api-client");
        const res = await apiClient.get<any>("/api/users/me");
        const profile = (res as any)?.data?.profile ?? (res as any)?.data;
        setProviderServices(profile?.providesServices ?? false);
      } catch {
        // ignore — toggle will still work
      }
    } catch (err) {
      toast.error("Failed to load services");
    } finally {
      setLoading(false);
    }
  }

  async function checkPushStatus() {
    if (!isPushSupported()) return;
    setPushSupported(true);
    const sub = await getCurrentPushSubscription();
    setPushSubscribed(!!sub);
  }

  async function handleToggleProvider(checked: boolean) {
    setSaving(true);
    try {
      await servicesService.toggleProvideServices(checked);
      setProviderServices(checked);
      toast.success(
        checked
          ? "Lead generation enabled. Your services will appear on your profile."
          : "Lead generation disabled.",
      );
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePush() {
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        toast.success("Push notifications disabled");
      } else {
        const granted = await requestPushPermission();
        if (!granted) {
          toast.error("Permission denied. Please allow notifications in your browser settings.");
          return;
        }
        const sub = await subscribeToPush();
        setPushSubscribed(!!sub);
        if (sub) toast.success("Push notifications enabled");
      }
    } catch {
      toast.error("Failed to update push notifications");
    } finally {
      setPushLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

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
    if (!confirm("Delete this service?")) return;
    try {
      await servicesService.deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      toast.success("Service deleted");
    } catch {
      toast.error("Failed to delete service");
    }
  }

  const formatPrice = (cents: number | null) => {
    if (cents === null) return "Contact for pricing";
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation
        sidebarOpen={sidebarOpen}
        onSidebarToggle={toggleSidebar}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">My Services</h1>
              <p className="text-muted-foreground mt-1">
                Offer services to other users and manage incoming leads
              </p>
            </div>
            <Link to="/services/inquiries">
              <Button variant="outline">View Inquiries</Button>
            </Link>
          </div>

          {/* Provider toggle */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Lead Generation</CardTitle>
              <CardDescription>
                Enable this to list your services publicly on your profile. Other users can
                browse and purchase them directly or submit an inquiry.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {providesServices ? (
                    <ToggleRight className="h-5 w-5 text-violet-600" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">Provide Services</p>
                    <p className="text-sm text-muted-foreground">
                      {providesServices
                        ? "Your services are publicly visible on your profile"
                        : "Your services are hidden from your profile"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={providesServices}
                  onCheckedChange={handleToggleProvider}
                  disabled={saving}
                />
              </div>

              {/* Push notification toggle */}
              {pushSupported && (
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-3">
                    {pushSubscribed ? (
                      <Bell className="h-5 w-5 text-violet-600" />
                    ) : (
                      <BellOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">Push Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        Get notified on this device when someone messages you or requests a service
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={pushSubscribed ? "outline" : "default"}
                    size="sm"
                    onClick={handleTogglePush}
                    disabled={pushLoading}
                  >
                    {pushLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : pushSubscribed ? (
                      "Disable"
                    ) : (
                      "Enable"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Services list */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Service Offerings</h2>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : services.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You haven't added any services yet. Click{" "}
                <button
                  className="underline font-medium"
                  onClick={openCreate}
                >
                  Add Service
                </button>{" "}
                to get started.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {services.map((s) => (
                <Card
                  key={s.id}
                  className={!s.isActive ? "opacity-60" : undefined}
                >
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
                                <Eye className="h-3.5 w-3.5" />
                                Price visible
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3.5 w-3.5" />
                                Price on inquiry
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
        </main>
      </div>
      <Footer />

      {/* Create / Edit dialog */}
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
    </div>
  );
}
