import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, LogOut, CheckCircle } from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
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
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const { user, isAuthenticated, resendEmailVerification, getVerificationStatus, logout } = useAuth();

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
      .post("/api/auth/verify-email", { token: verifyToken })
      .then(async () => {
        setTokenVerified(true);
        setTokenVerifying(false);
        try {
          await getVerificationStatus();
        } catch {
          // gate will re-check on next request
        }
        setTimeout(() => navigate(redirect, { replace: true }), 2500);
      })
      .catch(() => {
        setTokenVerifying(false);
        setError(t("auth.verify.errors.invalidLink"));
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
      setMessage(t("auth.verify.resendSent"));
      setCooldown(60);
    } else {
      setError(t("auth.verify.resendThrottled"));
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-xl">
            <Card>
              <CardHeader>
                <CardTitle>{t("auth.verify.title")}</CardTitle>
              </CardHeader>
        <CardContent className="space-y-4">
          {tokenVerifying && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">{t("auth.verify.verifying")}</span>
            </div>
          )}
          {tokenVerified && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {t("auth.verify.successAlert")}
              </AlertDescription>
            </Alert>
          )}
          {!tokenVerifying && !tokenVerified && (
            <p className="text-sm text-muted-foreground">
              {t("auth.verify.intro")}
            </p>
          )}
          {email && !tokenVerifying && !tokenVerified && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                <Trans
                  i18nKey="auth.verify.linkSent"
                  values={{ email }}
                  components={{ strong: <strong /> }}
                />
              </AlertDescription>
            </Alert>
          )}

          {!tokenVerifying && !tokenVerified && (
            <>
              <p className="text-sm text-muted-foreground">
                {t("auth.verify.updateEmailHint")}
              </p>

              {!isAuthenticated && (
                <Alert>
                  <AlertDescription>
                    {t("auth.verify.notSignedIn")}
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("common.sending")}
                </>
              ) : cooldown > 0 ? (
                <>{t("auth.verify.buttons.resendIn", { seconds: cooldown })}</>
              ) : (
                <>{t("auth.verify.buttons.resend")}</>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => checkAndRedirectIfVerified()}
              disabled={statusLoading}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {statusLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("auth.verify.buttons.alreadyVerified")}
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full sm:w-auto min-h-[44px] sm:ml-auto"
            >
              <LogOut className="h-4 w-4 mr-2" /> {t("common.actions.signOut")}
            </Button>
          </div>
        </CardFooter>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
