/**
 * /privacy/opt-out — CCPA / CPRA "Do Not Sell or Share My Personal
 * Information" self-service page. Closes gap #1149.
 *
 * Two flows:
 *   - Authenticated: server-side toggle on `users.do_not_share` via
 *     /api/Settings/privacy/do-not-share. Cascades marketing +
 *     personalization cookies to false on the server so the next pixel
 *     install pass short-circuits.
 *   - Anonymous: localStorage-only reject-optional via the cookie hook
 *     (best we can do without identifying the visitor), plus a mailto:
 *     fallback to privacy@hired.video for a verifiable request the DPO
 *     can process manually.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldCheck, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { settingsService } from "@/lib/services/settings-service";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import {
  LegalPage,
  LegalSection,
  LegalSectionContent,
  LegalSectionHeader,
  LegalSectionTitle,
} from "@/components/legal/LegalDocument";

export default function PrivacyOptOut() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("legal.privacy.contact.dpo.doNotSellLabel"), url: "/privacy/opt-out" }]);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { rejectOptional, preferences } = useCookiePreferences();
  const [doNotShare, setDoNotShare] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setDoNotShare(null);
      return;
    }
    let cancelled = false;
    settingsService
      .getDoNotShare()
      .then((r) => { if (!cancelled) setDoNotShare(r.doNotShare); })
      .catch(() => { if (!cancelled) setDoNotShare(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleToggle = async (next: boolean) => {
    if (!isAuthenticated) return;
    setBusy(true);
    try {
      const r = await settingsService.setDoNotShare(next);
      setDoNotShare(r.doNotShare);
      if (r.doNotShare) await rejectOptional();
      toast({
        title: t(r.doNotShare ? "privacyOptOut.toast.recorded" : "privacyOptOut.toast.reversed"),
        description: t(r.doNotShare ? "privacyOptOut.toast.recordedBody" : "privacyOptOut.toast.reversedBody"),
      });
    } catch {
      toast({
        title: t("privacyOptOut.toast.failed"),
        description: t("privacyOptOut.toast.failedBody"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAnonymousReject = async () => {
    setBusy(true);
    try {
      await rejectOptional();
      toast({
        title: t("privacyOptOut.toast.browserDisabled"),
        description: t("privacyOptOut.toast.browserDisabledBody"),
      });
    } finally {
      setBusy(false);
    }
  };

  const linkClass = "font-medium text-primary hover:underline";

  return (
    <AppShell bgClassName="bg-background">
      <LegalPage
        title={t("legal.privacy.contact.dpo.doNotSellLabel")}
        intro={t("privacyOptOut.intro")}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              {t("privacyOptOut.status.title")}
            </CardTitle>
            <CardDescription>{t("privacyOptOut.status.body")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAuthenticated ? (
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                <div className="space-y-1">
                  <Label htmlFor="do-not-share" className="text-base font-medium">
                    {t("privacyOptOut.toggle.label")}
                  </Label>
                  <p className="text-sm text-muted-foreground">{t("privacyOptOut.toggle.hint")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
                  <Switch
                    id="do-not-share"
                    checked={doNotShare === true}
                    disabled={doNotShare === null || busy}
                    onCheckedChange={(v) => void handleToggle(!!v)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>{t("privacyOptOut.anon.title")}</AlertTitle>
                  <AlertDescription>{t("privacyOptOut.anon.body")}</AlertDescription>
                </Alert>
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg">
                    <Link to="/login?next=/privacy/opt-out">{t("privacyOptOut.anon.signIn")}</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => void handleAnonymousReject()}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {t("privacyOptOut.anon.browserOnly")}
                  </Button>
                </div>
                {preferences.consentedAt && !preferences.marketing && !preferences.personalization && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-brand-green-text" aria-hidden="true" />
                    {t("privacyOptOut.anon.disabledNote")}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <LegalSection>
          <LegalSectionHeader>
            <LegalSectionTitle>{t("privacyOptOut.other.title")}</LegalSectionTitle>
          </LegalSectionHeader>
          <LegalSectionContent className="text-muted-foreground">
            <p>
              <strong className="text-foreground">{t("privacyOptOut.other.email.label")}</strong>
              {" — "}
              {t("privacyOptOut.other.email.body")}{" "}
              <a className={linkClass} href="mailto:privacy@hired.video">
                privacy@hired.video
              </a>
              . {t("privacyOptOut.other.email.response")}
            </p>
            <p>
              <strong className="text-foreground">{t("privacyOptOut.other.settings.label")}</strong>
              {" — "}
              {t("privacyOptOut.other.settings.body")}{" "}
              <Link className={linkClass} to="/settings?tab=cookies">
                {t("privacyOptOut.other.settings.link")}
              </Link>
              .
            </p>
            <p>
              <strong className="text-foreground">{t("privacyOptOut.other.delete.label")}</strong>
              {" — "}
              {t("privacyOptOut.other.delete.body")}{" "}
              <Link className={linkClass} to="/settings?tab=privacy">
                {t("privacyOptOut.other.delete.link")}
              </Link>
              .
            </p>
            <p>
              <strong className="text-foreground">{t("privacyOptOut.other.gpc.label")}</strong>
              {" — "}
              {t("privacyOptOut.other.gpc.before")}{" "}
              <a
                className={`${linkClass} inline-flex items-center gap-0.5`}
                href="https://globalprivacycontrol.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Global Privacy Control (GPC) <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>{" "}
              {t("privacyOptOut.other.gpc.after")}
            </p>
            <p>
              {t("privacyOptOut.other.policy.before")}{" "}
              <Link className={linkClass} to="/privacy">
                {t("labels.privacyPolicy")}
              </Link>{" "}
              {t("privacyOptOut.other.policy.after")}
            </p>
          </LegalSectionContent>
        </LegalSection>
      </LegalPage>
    </AppShell>
  );
}
