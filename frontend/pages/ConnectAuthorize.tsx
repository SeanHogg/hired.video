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
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard, AuthLoadingCard, AuthStatusIcon } from "@/components/auth/AuthCard";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
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
  const { t } = useTranslation();

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
      <Shell>
        <AuthLoadingCard label={t("partnerConnect.loading")} />
      </Shell>
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
        <AuthLoadingCard label={t("partnerConnect.loading")} />
      </Shell>
    );
  }

  if (loadError || !connectionId || !connection) {
    return (
      <Shell>
        <AuthCard
          media={<AuthStatusIcon icon={XCircle} tone="destructive" />}
          title={t("partnerConnect.notFoundTitle")}
          subtitle={t("partnerConnect.notFoundBody")}
        >
          <Button variant="outline" size="lg" className="w-full" onClick={() => finish("/settings")}>
            {t("partnerConnect.goToSettings")}
          </Button>
        </AuthCard>
      </Shell>
    );
  }

  // Already-approved connection — nothing to decide.
  if (connection.status === "active") {
    return (
      <Shell>
        <AuthCard
          media={<PartnerBadge partner={connection.partner} />}
          title={t("partnerConnect.alreadyConnectedTitle")}
          subtitle={t("partnerConnect.alreadyConnectedBody", { partner: partnerName })}
        >
          <Button size="lg" className="w-full" onClick={() => finish(redirectTarget)}>
            {t("partnerConnect.continue")}
          </Button>
        </AuthCard>
      </Shell>
    );
  }

  // Revoked connection — can't be approved from here.
  if (connection.status === "revoked") {
    return (
      <Shell>
        <AuthCard
          media={<PartnerBadge partner={connection.partner} />}
          title={t("partnerConnect.revokedTitle")}
          subtitle={t("partnerConnect.revokedBody", { partner: partnerName })}
        >
          <Button variant="outline" size="lg" className="w-full" onClick={() => finish("/settings")}>
            {t("partnerConnect.goToSettings")}
          </Button>
        </AuthCard>
      </Shell>
    );
  }

  // Pending — show the consent prompt.
  return (
    <Shell>
      <AuthCard
        media={<PartnerBadge partner={connection.partner} />}
        title={t("partnerConnect.title")}
        subtitle={t("partnerConnect.subtitle", { partner: partnerName })}
      >
        <div className="space-y-6">
          <div className="rounded-2xl bg-muted p-5">
            <p className="mb-3 text-sm font-semibold">
              {t("partnerConnect.requestsTitle", { partner: partnerName })}
            </p>
            <ul className="space-y-2.5">
              {connection.scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                  <span>{t(scopeLabelKey(scope), { scope })}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{t("partnerConnect.securityNote")}</span>
          </p>

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button size="lg" className="w-full sm:flex-1" onClick={handleApprove} disabled={submitting !== null}>
              {submitting === "approve" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("partnerConnect.approving")}
                </>
              ) : (
                t("partnerConnect.approve")
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:flex-1"
              onClick={handleDeny}
              disabled={submitting !== null}
            >
              {submitting === "deny" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("partnerConnect.denying")}
                </>
              ) : (
                t("partnerConnect.deny")
              )}
            </Button>
          </div>
        </div>
      </AuthCard>
    </Shell>
  );
}

/** Auth-page frame shared by every state. Module-scoped so it keeps a stable
 *  component identity across state transitions (no AppShell remount). Owns
 *  the page SEO + breadcrumbs through <AuthLayout>. */
function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <AuthLayout
      seoPath="/connect/authorize"
      breadcrumbs={[{ name: t("partnerConnect.breadcrumb"), url: "/connect/authorize" }]}
      panel="signIn"
    >
      {children}
    </AuthLayout>
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
    <div className="flex flex-col items-start gap-2">
      {partner.logoUrl ? (
        <img
          src={partner.logoUrl}
          alt={partner.name}
          className="h-14 w-14 rounded-xl border border-border bg-card object-contain"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent font-display text-xl font-bold text-primary">
          {partner.name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-base font-semibold text-foreground">{partner.name}</span>
      {partner.websiteUrl ? (
        <a
          href={partner.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {t("partnerConnect.visitWebsite")}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
