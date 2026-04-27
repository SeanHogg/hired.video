import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    const redirect = searchParams.get("redirect") || "/dashboard";
    const errorParam = searchParams.get("error");

    if (errorParam) {
      const messages: Record<string, string> = {
        unknown_provider: t("auth.oauth.errors.unknownProvider"),
        auth_failed: t("common.errors.authFailed"),
        no_email: t("auth.oauth.errors.noEmail"),
        invalid_state: t("auth.oauth.errors.invalidState"),
        account_disabled: t("auth.oauth.errors.accountDisabled"),
        missing_params: t("auth.oauth.errors.missingParams"),
      };
      setErrorMsg(messages[errorParam] ?? t("common.errors.authFailed"));
      setTimeout(() => navigate("/login"), 3000);
      return;
    }

    if (!token) {
      setErrorMsg(t("auth.oauth.errors.noToken"));
      setTimeout(() => navigate("/login"), 2000);
      return;
    }

    loginWithToken(token)
      .then(() => navigate(redirect))
      .catch(() => {
        setErrorMsg(t("auth.oauth.errors.completeFailed"));
        setTimeout(() => navigate("/login"), 2000);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{errorMsg}</p>
          <p className="text-sm text-muted-foreground">{t("auth.oauth.redirecting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">{t("auth.oauth.completing")}</p>
      </div>
    </div>
  );
}
