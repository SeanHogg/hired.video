import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";

/**
 * Settings → Integrations → "API-key integrations" (#261).
 *
 * Self-serve generic vendor registry: a workspace admin pastes a provider
 * name + slug + credential for any vendor that doesn't have a custom
 * connector. The credential is WRITE-ONLY — the server never returns it;
 * this surface only ever shows the masked last-4 hint.
 *
 * Self-contained: fetches `/api/integrations`, renders the list, and owns
 * the add / toggle-active / delete mutations. The component self-gates by
 * relying on the API's admin authorization — a non-admin sees a 403 toast
 * rather than the list, so the card stays harmless if rendered broadly.
 */

interface VendorIntegration {
  id: string;
  provider: string;
  slug: string;
  isActive: boolean;
  last4: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  integrations: VendorIntegration[];
}

interface MutateResponse {
  integration: VendorIntegration;
}

export default function VendorIntegrationsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [items, setItems] = useState<VendorIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [provider, setProvider] = useState("");
  const [slug, setSlug] = useState("");
  const [credentials, setCredentials] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ListResponse>("/api/integrations");
      setItems(res.data.integrations ?? []);
      setForbidden(false);
    } catch (err) {
      // 403 → not a workspace admin; hide the management surface.
      const msg = err instanceof Error ? err.message : "";
      if (/403|forbidden|permission/i.test(msg)) {
        setForbidden(true);
      } else {
        toast({
          title: t("errors.generic"),
          description: t("vendorIntegrations.errors.loadFailed"),
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!provider.trim() || !slug.trim() || !credentials.trim()) {
      toast({
        title: t("vendorIntegrations.errors.missingFields"),
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post<MutateResponse>("/api/integrations", {
        provider: provider.trim(),
        slug: slug.trim(),
        credentials: credentials.trim(),
      });
      setItems((prev) => [res.data.integration, ...prev]);
      setProvider("");
      setSlug("");
      setCredentials("");
      toast({ title: t("vendorIntegrations.toast.added") });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: t("errors.generic"),
        description: /409|exists/i.test(msg)
          ? t("vendorIntegrations.errors.duplicate")
          : t("vendorIntegrations.errors.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (item: VendorIntegration, next: boolean) => {
    setBusyId(item.id);
    try {
      const res = await apiClient.patch<MutateResponse>(
        `/api/integrations/${item.id}`,
        { isActive: next },
      );
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? res.data.integration : i)),
      );
    } catch {
      toast({
        title: t("errors.generic"),
        description: t("vendorIntegrations.errors.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: VendorIntegration) => {
    setBusyId(item.id);
    try {
      await apiClient.delete(`/api/integrations/${item.id}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast({ title: t("vendorIntegrations.toast.removed") });
    } catch {
      toast({
        title: t("errors.generic"),
        description: t("vendorIntegrations.errors.deleteFailed"),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (forbidden) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          {t("vendorIntegrations.title")}
        </CardTitle>
        <CardDescription>{t("vendorIntegrations.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add form */}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="vi-provider">{t("vendorIntegrations.fields.provider")}</Label>
            <Input
              id="vi-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={t("vendorIntegrations.placeholders.provider")}
              maxLength={64}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vi-slug">{t("vendorIntegrations.fields.slug")}</Label>
            <Input
              id="vi-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t("vendorIntegrations.placeholders.slug")}
              maxLength={64}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vi-credentials">{t("vendorIntegrations.fields.credentials")}</Label>
            <Input
              id="vi-credentials"
              type="password"
              autoComplete="off"
              value={credentials}
              onChange={(e) => setCredentials(e.target.value)}
              placeholder={t("vendorIntegrations.placeholders.credentials")}
            />
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-2">{t("actions.add")}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("vendorIntegrations.writeOnlyNote")}
        </p>

        {/* List */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("vendorIntegrations.loading")}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("vendorIntegrations.empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("vendorIntegrations.fields.provider")}</TableHead>
                <TableHead>{t("vendorIntegrations.fields.slug")}</TableHead>
                <TableHead>{t("vendorIntegrations.fields.credential")}</TableHead>
                <TableHead>{t("vendorIntegrations.fields.active")}</TableHead>
                <TableHead className="text-right">{t("actions.delete")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.provider}</TableCell>
                  <TableCell>{item.slug}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {item.last4 ? `•••• ${item.last4}` : "••••"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={item.isActive}
                      disabled={busyId === item.id}
                      onCheckedChange={(next) => handleToggle(item, next)}
                      aria-label={t("vendorIntegrations.fields.active")}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === item.id}
                      onClick={() => handleDelete(item)}
                      aria-label={t("actions.delete")}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
