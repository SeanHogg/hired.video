import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import {
  partnerAccountService,
  type PartnerView,
  type PartnerApiKeyView,
  type CreatedPartnerApiKey,
} from "@/lib/services/partner-account-service";

const SDK_PACKAGE = "@seanhogg/hired-video-sdk";

/**
 * Self-service "Partner Access" card. An account owner requests partner
 * platform access; once a SuperAdmin approves it they self-issue API keys
 * from the same surface. Owns its own data load — drop into settings without
 * prop-drilling.
 */
export default function PartnerAccessCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [partner, setPartner] = useState<PartnerView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    partnerAccountService
      .getMyPartner()
      .then((p) => {
        if (!cancelled) setPartner(p);
      })
      .catch(() => {
        /* leave null; owner can still submit a request */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("partnerAccess.title")}
        </CardTitle>
        <CardDescription>{t("partnerAccess.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !partner || partner.status === "rejected" ? (
          <RequestForm
            rejected={partner?.status === "rejected"}
            onRequested={setPartner}
          />
        ) : partner.status === "pending" ? (
          <PendingState partner={partner} />
        ) : partner.status === "suspended" ? (
          <SuspendedState />
        ) : (
          <KeysManager />
        )}
      </CardContent>
    </Card>
  );

  function RequestForm({
    rejected,
    onRequested,
  }: {
    rejected: boolean;
    onRequested: (p: PartnerView) => void;
  }) {
    const [name, setName] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [requestNote, setRequestNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSubmitting(true);
      try {
        const created = await partnerAccountService.requestPartner({
          name: name.trim(),
          websiteUrl: websiteUrl.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          requestNote: requestNote.trim() || undefined,
        });
        toast({ title: t("partnerAccess.requestSubmittedToast") });
        onRequested(created);
      } catch (err) {
        const conflict =
          (err as { code?: string } | undefined)?.code === "CONFLICT" ||
          (err as { context?: { serverCode?: string } } | undefined)?.context
            ?.serverCode === "CONFLICT";
        toast({
          title: conflict
            ? t("partnerAccess.requestConflictToast")
            : t("partnerAccess.requestErrorToast"),
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <form onSubmit={submit} className="space-y-4">
        {rejected ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>{t("partnerAccess.rejectedTitle")}</AlertTitle>
            <AlertDescription>{t("partnerAccess.rejectedBody")}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("partnerAccess.requestIntro")}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="partner-name">{t("partnerAccess.nameLabel")}</Label>
          <Input
            id="partner-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("partnerAccess.namePlaceholder")}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="partner-website">{t("partnerAccess.websiteLabel")}</Label>
            <Input
              id="partner-website"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="partner-email">{t("partnerAccess.contactEmailLabel")}</Label>
            <Input
              id="partner-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="team@example.com"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-note">{t("partnerAccess.useCaseLabel")}</Label>
          <Textarea
            id="partner-note"
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            placeholder={t("partnerAccess.useCasePlaceholder")}
            rows={3}
          />
        </div>
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("partnerAccess.submitting")}
            </>
          ) : (
            t("partnerAccess.submitRequest")
          )}
        </Button>
      </form>
    );
  }

  function PendingState({ partner }: { partner: PartnerView }) {
    return (
      <div className="space-y-4">
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>{t("partnerAccess.pendingTitle")}</AlertTitle>
          <AlertDescription>{t("partnerAccess.pendingBody")}</AlertDescription>
        </Alert>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <DetailRow label={t("partnerAccess.nameLabel")} value={partner.name} />
          {partner.websiteUrl ? (
            <DetailRow label={t("partnerAccess.websiteLabel")} value={partner.websiteUrl} />
          ) : null}
          {partner.contactEmail ? (
            <DetailRow label={t("partnerAccess.contactEmailLabel")} value={partner.contactEmail} />
          ) : null}
          {partner.requestNote ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t("partnerAccess.useCaseLabel")}</dt>
              <dd className="text-foreground">{partner.requestNote}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  function SuspendedState() {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>{t("partnerAccess.suspendedTitle")}</AlertTitle>
        <AlertDescription>{t("partnerAccess.suspendedBody")}</AlertDescription>
      </Alert>
    );
  }

  function DetailRow({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="break-words text-foreground">{value}</dd>
      </div>
    );
  }
}

/** API-key management surface, shown when partner.status === "active". */
function KeysManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [keys, setKeys] = useState<PartnerApiKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<CreatedPartnerApiKey | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    partnerAccountService
      .listKeys()
      .then((k) => {
        if (!cancelled) setKeys(k);
      })
      .catch(() => {
        /* 403 if not active — parent gates this, so treat as empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("partnerAccess.copiedToast") });
    } catch {
      toast({ title: t("partnerAccess.copyFailedToast"), variant: "destructive" });
    }
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    try {
      const parsedScopes = scopes
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const days = Number.parseInt(expiresInDays, 10);
      const created = await partnerAccountService.createKey({
        label: label.trim(),
        scopes: parsedScopes.length ? parsedScopes : undefined,
        expiresInDays: Number.isFinite(days) && days > 0 ? days : undefined,
      });
      setNewKey(created);
      // Surface the metadata row immediately (without the plaintext key).
      const { key: _key, warning: _warning, ...view } = created;
      setKeys((prev) => [view, ...prev]);
      setLabel("");
      setScopes("");
      setExpiresInDays("");
      setShowForm(false);
      toast({ title: t("partnerAccess.keyCreatedToast") });
    } catch {
      toast({ title: t("partnerAccess.keyCreateErrorToast"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    setRevoking(keyId);
    const previous = keys;
    setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, isActive: false } : k)));
    try {
      await partnerAccountService.revokeKey(keyId);
      toast({ title: t("partnerAccess.keyRevokedToast") });
    } catch {
      setKeys(previous);
      toast({ title: t("partnerAccess.keyRevokeErrorToast"), variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  };

  return (
    <div className="space-y-5">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>{t("partnerAccess.activeTitle")}</AlertTitle>
        <AlertDescription>
          {t("partnerAccess.sdkHint", { package: SDK_PACKAGE })}
        </AlertDescription>
      </Alert>

      {/* One-time plaintext key reveal */}
      {newKey ? (
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>{t("partnerAccess.newKeyTitle")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="font-medium text-destructive">
              {newKey.warning || t("partnerAccess.newKeyWarning")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                {newKey.key}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(newKey.key)}
                aria-label={t("partnerAccess.copyKey")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewKey(null)}>
              {t("partnerAccess.dismiss")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Key list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{t("partnerAccess.keysHeading")}</h4>
          {!showForm ? (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("partnerAccess.generateKey")}
            </Button>
          ) : null}
        </div>

        {showForm ? (
          <form onSubmit={createKey} className="space-y-3 rounded-lg border p-4">
            <div className="space-y-2">
              <Label htmlFor="key-label">{t("partnerAccess.keyLabelLabel")}</Label>
              <Input
                id="key-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("partnerAccess.keyLabelPlaceholder")}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="key-scopes">{t("partnerAccess.keyScopesLabel")}</Label>
                <Input
                  id="key-scopes"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  placeholder="read:profile write:resumes"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-expiry">{t("partnerAccess.keyExpiryLabel")}</Label>
                <Input
                  id="key-expiry"
                  type="number"
                  min={1}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="90"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={creating || !label.trim()}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("partnerAccess.generating")}
                  </>
                ) : (
                  t("partnerAccess.generateKey")
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
                disabled={creating}
              >
                {t("partnerAccess.cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {t("partnerAccess.noKeys")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {keys.map((k) => {
              const created = formatDate(k.createdAt);
              const lastUsed = formatDate(k.lastUsedAt);
              return (
                <li
                  key={k.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{k.label}</span>
                      {!k.isActive ? (
                        <Badge variant="outline">{t("partnerAccess.revoked")}</Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <code className="font-mono">{k.keyPrefix}•••</code>
                      {created ? (
                        <span>{t("partnerAccess.created", { date: created })}</span>
                      ) : null}
                      <span>
                        {lastUsed
                          ? t("partnerAccess.lastUsed", { date: lastUsed })
                          : t("partnerAccess.neverUsed")}
                      </span>
                    </div>
                  </div>
                  {k.isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => revokeKey(k.id)}
                      disabled={revoking === k.id}
                    >
                      {revoking === k.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("partnerAccess.revoke")}
                        </>
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
