import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard, AuthStatusIcon } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, LogOut, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function VerifyEmail(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const query = useQuery();
  const redirect = query.get("redirect") || "/dashboard";
  const hintedEmail = query.get("email") || undefined;
  const verifyToken = query.get("token") || undefined;

  const { user, isAuthenticated, resendEmailVerification, getVerificationStatus, logout, loginWithToken } = useAuth();

  const [email, setEmail] = useState<string | undefined>(hintedEmail);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [resendLoading, setResendLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const [tokenVerified, setTokenVerified] = useState<boolean>(false);
  const [tokenVerifying, setTokenVerifying] = useState<boolean>(false);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (!verifyToken) return;
    setTokenVerifying(true);
    apiClient
      .post<{ token?: string }>("/api/auth/verify-email", { token: verifyToken })
      .then(async (res) => {
        setTokenVerified(true);
        setTokenVerifying(false);
        // The backend returns a fresh JWT carrying `emailVerified: true`
        // so the next API call doesn't bounce off emailVerifiedMiddleware
        // with the stale claim. Swap it into the auth context BEFORE we
        // navigate to the redirect target. Falls back to a status refetch
        // for legacy responses without the token field.
        const freshToken = res?.data?.token;
        if (freshToken) {
          try {
            await loginWithToken(freshToken);
          } catch (e) {
            console.warn("verify-email: loginWithToken failed", e);
          }
        } else {
          try {
            await getVerificationStatus();
          } catch {
            // gate will re-check on next request
          }
        }
        setTimeout(() => navigate(redirect, { replace: true }), 2500);
      })
      .catch(() => {
        setTokenVerifying(false);
        setError(t("errors.invalidVerificationLink"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyToken]);

  const checkAndRedirectIfVerified = async () => {
    try {
      setStatusLoading(true);
      const status = await getVerificationStatus();
      if (status.emailConfirmed) {
        navigate(redirect, { replace: true });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      checkAndRedirectIfVerified();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    setResendLoading(true);
    const ok = await resendEmailVerification();
    setResendLoading(false);
    if (ok) {
      setMessage(t("messages.verificationEmailSent"));
      setCooldown(60);
    } else {
      setError(t("errors.resendThrottled"));
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <AuthLayout
      seoPath={location.pathname}
      breadcrumbs={[{ name: t("headings.verifyEmailToContinue"), url: "/verify-email" }]}
      panel="signIn"
    >
      <AuthCard
        media={
          tokenVerified ? (
            <AuthStatusIcon icon={CheckCircle2} tone="success" />
          ) : (
            <AuthStatusIcon icon={tokenVerifying ? Loader2 : Mail} spin={tokenVerifying} />
          )
        }
        title={t("headings.verifyEmailToContinue")}
      >
        <div className="space-y-5">
          {tokenVerifying && (
            <p role="status" className="text-sm text-muted-foreground">{t("status.verifyingEmail")}</p>
          )}
          {tokenVerified && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t("status.emailVerified")}</AlertDescription>
            </Alert>
          )}
          {!tokenVerifying && !tokenVerified && (
            <p className="text-base leading-relaxed text-muted-foreground">{t("messages.verifyIntro")}</p>
          )}
          {email && !tokenVerifying && !tokenVerified && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                <Trans
                  i18nKey="messages.verificationLinkSent"
                  values={{ email }}
                  components={{ strong: <strong /> }}
                />
              </AlertDescription>
            </Alert>
          )}

          {!tokenVerifying && !tokenVerified && (
            <>
              <p className="text-sm text-muted-foreground">{t("messages.updateEmailHint")}</p>
              {!isAuthenticated && (
                <Alert>
                  <AlertDescription>{t("messages.notSignedIn")}</AlertDescription>
                </Alert>
              )}
            </>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <Button
              size="lg"
              onClick={handleResend}
              disabled={!isAuthenticated || resendLoading || cooldown > 0}
              className="w-full"
            >
              {resendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("status.sending")}
                </>
              ) : cooldown > 0 ? (
                <>{t("actions.resendIn", { seconds: cooldown })}</>
              ) : (
                <>{t("actions.resendVerificationEmail")}</>
              )}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => checkAndRedirectIfVerified()}
                disabled={statusLoading}
                className="w-full sm:flex-1"
              >
                {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {t("actions.iAlreadyVerified")}
              </Button>
              <Button variant="ghost" onClick={handleLogout} className="w-full sm:flex-1">
                <LogOut className="h-4 w-4" aria-hidden="true" /> {t("actions.signOut")}
              </Button>
            </div>
          </div>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
