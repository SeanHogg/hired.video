import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthStatusScreen } from "@/components/auth/AuthCard";
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
        unknown_provider: t("errors.oauthUnknownProvider"),
        auth_failed: t("errors.authFailed"),
        no_email: t("errors.oauthNoEmail"),
        invalid_state: t("errors.oauthInvalidState"),
        account_disabled: t("errors.oauthAccountDisabled"),
        missing_params: t("errors.oauthMissingParams"),
      };
      setErrorMsg(messages[errorParam] ?? t("errors.authFailed"));
      setTimeout(() => navigate("/login"), 3000);
      return;
    }

    if (!token) {
      setErrorMsg(t("errors.oauthNoToken"));
      setTimeout(() => navigate("/login"), 2000);
      return;
    }

    loginWithToken(token)
      .then(() => navigate(redirect))
      .catch(() => {
        setErrorMsg(t("errors.completeSignInFailed"));
        setTimeout(() => navigate("/login"), 2000);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorMsg) {
    return <AuthStatusScreen state="error" title={errorMsg} body={t("status.redirectingToLogin")} />;
  }

  return <AuthStatusScreen state="loading" title={t("status.completingSignIn")} />;
}
