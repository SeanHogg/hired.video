import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useSEO } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, LogOut, CheckCircle } from "lucide-react";
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

  useSEO(location.pathname);

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
    <AppShell>
      <div className="flex items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <Card>
              <CardHeader>
                <CardTitle>{t("headings.verifyEmailToContinue")}</CardTitle>
              </CardHeader>
        <CardContent className="space-y-4">
          {tokenVerifying && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">{t("status.verifyingEmail")}</span>
            </div>
          )}
          {tokenVerified && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {t("status.emailVerified")}
              </AlertDescription>
            </Alert>
          )}
          {!tokenVerifying && !tokenVerified && (
            <p className="text-sm text-muted-foreground">
              {t("messages.verifyIntro")}
            </p>
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
              <p className="text-sm text-muted-foreground">
                {t("messages.updateEmailHint")}
              </p>

              {!isAuthenticated && (
                <Alert>
                  <AlertDescription>
                    {t("messages.notSignedIn")}
                  </AlertDescription>
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
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Button
              onClick={handleResend}
              disabled={!isAuthenticated || resendLoading || cooldown > 0}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {resendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("status.sending")}
                </>
              ) : cooldown > 0 ? (
                <>{t("actions.resendIn", { seconds: cooldown })}</>
              ) : (
                <>{t("actions.resendVerificationEmail")}</>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => checkAndRedirectIfVerified()}
              disabled={statusLoading}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {statusLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("actions.iAlreadyVerified")}
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full sm:w-auto min-h-[44px] sm:ml-auto"
            >
              <LogOut className="h-4 w-4 mr-2" /> {t("actions.signOut")}
            </Button>
          </div>
        </CardFooter>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
