import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Building2,
  Users,
  Mail,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard, AuthLoadingCard, AuthStatusIcon } from "@/components/auth/AuthCard";
import MonoChip from "@/components/templates/MonoChip";
import { useAuth } from "@/lib/auth";
import { accountService } from "@/lib/services/account-service";
import { InvitationDetailsResponse } from "@/types/account";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { toast } from "@/hooks/use-toast";
import { intlLocale } from "@shared/i18n";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();

  const [invitationDetails, setInvitationDetails] =
    useState<InvitationDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get("token");
  // The accept URL the visitor is on — used to bounce through login/signup
  // and land back here so an unauthenticated invitee can complete the flow.
  const acceptPath = `/accept-invitation?token=${encodeURIComponent(token ?? "")}`;
  const loginHref = `/login?redirectTo=${encodeURIComponent(acceptPath)}`;
  const signupHref = `/signup?redirectTo=${encodeURIComponent(acceptPath)}`;

  useEffect(() => {
    if (!token) {
      setError(t("errors.invalidInvitationLink"));
      setLoading(false);
      return;
    }

    loadInvitationDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadInvitationDetails = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const details = await accountService.getInvitationDetails(token);
      setInvitationDetails(details);
      setError(null);
    } catch (err) {
      console.error("Error loading invitation details:", err);
      setError(t("errors.invitationLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!token) return;

    try {
      setAccepting(true);
      const result = await accountService.acceptInvitation(token);

      if (result.success) {
        toast({
          title: t("headings.invitationAccepted"),
          description: t("messages.invitationAcceptedDesc", { company: result.companyName }),
        });

        if (result.redirectUrl) {
          navigate(result.redirectUrl);
        } else {
          navigate("/dashboard");
        }
      } else {
        if (result.requiredRegistration && result.redirectUrl) {
          navigate(result.redirectUrl);
        } else if (result.redirectUrl) {
          navigate(result.redirectUrl);
        } else {
          setError(result.message || t("errors.invitationAcceptFailed"));
        }
      }
    } catch (err) {
      console.error("Error accepting invitation:", err);
      setError(t("errors.invitationAcceptFailed"));
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    navigate("/");
  };

  const layoutProps = {
    seoPath: "/accept-invitation",
    breadcrumbs: [{ name: t("headings.youreInvited"), url: "/accept-invitation" }],
    panel: "signIn" as const,
  };

  if (loading) {
    return (
      <AuthLayout {...layoutProps}>
        <AuthLoadingCard label={t("status.loadingInvitation")} />
      </AuthLayout>
    );
  }

  if (error || !invitationDetails) {
    return (
      <AuthLayout {...layoutProps}>
        <AuthCard
          media={<AuthStatusIcon icon={AlertCircle} tone="destructive" />}
          title={t("headings.invalidInvitation")}
          subtitle={error || t("messages.invalidInvitationAlert")}
        >
          <Button size="lg" onClick={() => navigate("/")} className="w-full">
            {t("actions.backToHome")}
          </Button>
        </AuthCard>
      </AuthLayout>
    );
  }

  const emailMatches =
    user?.email?.toLowerCase() === invitationDetails.invitedEmail.toLowerCase();

  return (
    <AuthLayout {...layoutProps}>
      <AuthCard
        media={
          invitationDetails.companyLogoUrl ? (
            <img
              src={invitationDetails.companyLogoUrl}
              alt={t("labels.companyLogoAlt", { company: invitationDetails.companyName })}
              className="h-12 w-12 rounded-xl border border-border object-cover"
            />
          ) : (
            <AuthStatusIcon icon={Building2} />
          )
        }
        title={t("headings.youreInvited")}
        subtitle={
          <Trans
            i18nKey="messages.invitationSubtitle"
            values={{ inviter: invitationDetails.inviterName, company: invitationDetails.companyName }}
            components={{ inviter: <span />, company: <strong className="text-foreground" /> }}
          />
        }
      >
        <div className="space-y-6">
          {/* Company information */}
          <div className="rounded-2xl bg-muted p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              {invitationDetails.companyName}
            </h2>
            {invitationDetails.companyDescription && (
              <p className="mt-2 text-sm text-muted-foreground">{invitationDetails.companyDescription}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5 break-all">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("labels.invited")}: {invitationDetails.invitedEmail}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("labels.from")}: {invitationDetails.inviterName}
              </span>
            </div>
          </div>

          {/* Roles */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t("messages.invitationRolesHeading")}</h3>
            <div className="flex flex-wrap gap-2">
              {invitationDetails.rolesToAssign.map((role) => (
                <MonoChip key={role}>{getRoleDisplayLabel(role)}</MonoChip>
              ))}
            </div>
          </div>

          {/* Personal message */}
          {invitationDetails.personalMessage && (
            <blockquote className="rounded-2xl border-l-4 border-primary bg-accent p-4 italic text-accent-foreground">
              &ldquo;{invitationDetails.personalMessage}&rdquo;
            </blockquote>
          )}

          {/* Authentication status */}
          {!isAuthenticated && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {invitationDetails.userExists
                  ? t("messages.invitationLogin")
                  : t("messages.invitationSignup")}
              </AlertDescription>
            </Alert>
          )}

          {isAuthenticated && user?.email !== invitationDetails.invitedEmail && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t("messages.invitationWrongAccount", { invited: invitationDetails.invitedEmail, current: user?.email ?? "" })}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          {!isAuthenticated ? (
            // Unauthenticated invitees must sign in (or sign up) with the
            // invited email first — accept then matches their account to the
            // invite server-side. Both links bounce back to this page.
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="sm:flex-1">
                <a href={invitationDetails.userExists ? loginHref : signupHref}>
                  {invitationDetails.userExists
                    ? t("messages.invitationLogin")
                    : t("messages.invitationSignup")}
                </a>
              </Button>
              <Button variant="outline" size="lg" onClick={handleDecline} className="sm:flex-1">
                {t("actions.decline")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={handleAcceptInvitation}
                disabled={accepting || !emailMatches}
                className="sm:flex-1"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t("status.acceptingInvitation")}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {t("actions.acceptInvitation")}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleDecline}
                disabled={accepting}
                className="sm:flex-1"
              >
                {t("actions.decline")}
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {t("messages.invitedOn", {
              date: new Date(invitationDetails.invitedAt).toLocaleDateString(intlLocale(i18n.language)),
            })}
          </p>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
