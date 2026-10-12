// eslint-page-chrome: skip — transient OAuth return route (usually a popup), chrome-less like OAuthCallback
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthStatusScreen } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  completeIntegrationOAuth,
  integrationOAuthErrorKey,
  isIntegrationOAuthProvider,
  type IntegrationOAuthOutcome,
} from "@/lib/studio/integration-oauth";

/** `/studio/:provider/callback` — where YouTube and social-network consent returns. */
export default function IntegrationOAuthCallback() {
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoading } = useAuth();
  const [outcome, setOutcome] = useState<IntegrationOAuthOutcome | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The code is single-use: run once, after the session token is restored.
    if (isLoading || started.current || !isIntegrationOAuthProvider(provider)) return;
    started.current = true;
    void completeIntegrationOAuth(provider, searchParams).then((result) => {
      if (result.returnTo) {
        const flag = "reason" in result ? `${provider}_error=${result.reason}` : `${provider}_success=true`;
        navigate(`${result.returnTo}${result.returnTo.includes("?") ? "&" : "?"}${flag}`, { replace: true });
        return;
      }
      setOutcome(result);
      if (result.ok) window.close();
    });
  }, [isLoading, provider, searchParams, navigate]);

  if (!isIntegrationOAuthProvider(provider)) {
    return <AuthStatusScreen state="error" title={t("integrationOAuth.failed")} />;
  }
  if (!outcome) {
    return <AuthStatusScreen state="loading" title={t("integrationOAuth.connecting")} />;
  }

  const backToStudio = (
    <Button asChild variant="outline">
      <Link to="/studio">{t("integrationOAuth.backToStudio")}</Link>
    </Button>
  );
  if (outcome.ok) {
    return (
      <AuthStatusScreen
        state="success"
        title={t("integrationOAuth.connected")}
        body={t("integrationOAuth.closeWindow")}
        action={backToStudio}
      />
    );
  }
  return (
    <AuthStatusScreen
      state="error"
      title={t(integrationOAuthErrorKey("reason" in outcome ? outcome.reason : null))}
      body={t("integrationOAuth.retry")}
      action={backToStudio}
    />
  );
}
