import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { safeRedirectTo } from "@/lib/auth-redirect";
import {
  partnerConnectionService,
  scopeLabelKey,
  type PartnerConnection,
} from "@/lib/services/partner-connection-service";

/**
 * Partner consent screen. A partner platform sends the job seeker here to
 * approve (or deny) connecting to their existing hired.video account. Route:
 *   /connect/authorize?connection=<id>&redirect=<url>
 *
 * Requires the user to be signed in — signed-out visitors are bounced to
 * /login with a redirect back to this exact URL so they land here after auth.
 */
export default function ConnectAuthorize() {
  useSEO("/connect/authorize");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("partnerConnect.breadcrumb"), url: "/connect/authorize" }]);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get("connection");

  const [connection, setConnection] = useState<PartnerConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);

  // Where to send the user once the decision is recorded. Only same-origin
  // (relative) redirects are honored to prevent open-redirect abuse; anything
  // else falls back to /settings.
  const redirectTarget = safeRedirectTo(searchParams.get("redirect"), "/settings");

  useEffect(() => {
    if (!isAuthenticated || !connectionId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    partnerConnectionService
      .getConnection(connectionId)
      .then((c) => {
        if (!cancelled) setConnection(c);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, connectionId]);

  // Wait for auth to settle before deciding to redirect.
  if (authLoading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  // Signed out → login, carrying this URL forward so they return here.
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  const partnerName = connection?.partner.name ?? t("partnerConnect.thisPartner");

  const finish = (target: string) => navigate(target, { replace: true });

  const handleApprove = async () => {
    if (!connectionId) return;
    setSubmitting("approve");
    try {
      await partnerConnectionService.authorize(connectionId);
      toast({ title: t("partnerConnect.approvedToast") });
      finish(redirectTarget);
    } catch {
      toast({ title: t("partnerConnect.errorToast"), variant: "destructive" });
      setSubmitting(null);
    }
  };

  const handleDeny = async () => {
    if (!connectionId) return;
    setSubmitting("deny");
    try {
      await partnerConnectionService.revoke(connectionId);
      toast({ title: t("partnerConnect.deniedToast") });
      finish(redirectTarget);
    } catch {
      toast({ title: t("partnerConnect.errorToast"), variant: "destructive" });
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("partnerConnect.loading")}</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (loadError || !connectionId || !connection) {
    return (
      <Shell>
        <Card>
          <CardHeader className="items-center text-center">
            <XCircle className="mb-2 h-10 w-10 text-destructive" />
            <CardTitle>{t("partnerConnect.notFoundTitle")}</CardTitle>
            <CardDescription>{t("partnerConnect.notFoundBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => finish("/settings")}>
              {t("partnerConnect.goToSettings")}
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Already-approved connection — nothing to decide.
  if (connection.status === "active") {
    return (
      <Shell>
        <Card>
          <CardHeader className="items-center text-center">
            <PartnerBadge partner={connection.partner} />
            <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-600" />
            <CardTitle>{t("partnerConnect.alreadyConnectedTitle")}</CardTitle>
            <CardDescription>
              {t("partnerConnect.alreadyConnectedBody", { partner: partnerName })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => finish(redirectTarget)}>
              {t("partnerConnect.continue")}
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Revoked connection — can't be approved from here.
  if (connection.status === "revoked") {
    return (
      <Shell>
        <Card>
          <CardHeader className="items-center text-center">
            <PartnerBadge partner={connection.partner} />
            <XCircle className="mb-2 h-10 w-10 text-destructive" />
            <CardTitle>{t("partnerConnect.revokedTitle")}</CardTitle>
            <CardDescription>
              {t("partnerConnect.revokedBody", { partner: partnerName })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => finish("/settings")}>
              {t("partnerConnect.goToSettings")}
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Pending — show the consent prompt.
  return (
    <Shell>
      <Card>
        <CardHeader className="items-center text-center">
          <PartnerBadge partner={connection.partner} />
          <CardTitle>{t("partnerConnect.title")}</CardTitle>
          <CardDescription>
            {t("partnerConnect.subtitle", { partner: partnerName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="mb-3 text-sm font-medium">
              {t("partnerConnect.requestsTitle", { partner: partnerName })}
            </p>
            <ul className="space-y-2">
              {connection.scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{t(scopeLabelKey(scope), { scope })}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("partnerConnect.securityNote")}</span>
          </p>

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button className="w-full" onClick={handleApprove} disabled={submitting !== null}>
              {submitting === "approve" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("partnerConnect.approving")}
                </>
              ) : (
                t("partnerConnect.approve")
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDeny}
              disabled={submitting !== null}
            >
              {submitting === "deny" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("partnerConnect.denying")}
                </>
              ) : (
                t("partnerConnect.deny")
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}

/** Centered card layout shared by every state. Module-scoped so it keeps a
 *  stable component identity across state transitions (no AppShell remount). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell bgClassName="bg-background">
      <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">{children}</div>
    </AppShell>
  );
}

/** Partner logo + name + website link, shown atop every state. */
function PartnerBadge({
  partner,
}: {
  partner: PartnerConnection["partner"];
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-2 flex flex-col items-center gap-2">
      {partner.logoUrl ? (
        <img
          src={partner.logoUrl}
          alt={partner.name}
          className="h-14 w-14 rounded-xl border object-contain"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border bg-muted text-lg font-semibold text-muted-foreground">
          {partner.name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-base font-semibold text-foreground">{partner.name}</span>
      {partner.websiteUrl ? (
        <a
          href={partner.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {t("partnerConnect.visitWebsite")}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
