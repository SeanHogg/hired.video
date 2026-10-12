/**
 * Shared "exchange a token in the URL for a signed-in session" verifier.
 * Backs both the magic-link page (/auth/magic-link) and the one-tap 2FA
 * approve page (/auth/2fa-approve, gap #2225) — they were byte-identical
 * apart from the API path, so the loading/success/error UI + the
 * read-token → POST → loginWithToken → redirect flow lives here once.
 *
 * The caller supplies how to build the verify request path from the raw
 * token; everything else (states, i18n copy, redirect) is uniform.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthStatusScreen } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";

interface TokenSignInVerifierProps {
  /** Build the GET path that exchanges the token for a session payload
   *  `{ token, redirect? }`. e.g. `(t) => `/api/auth/magic-link/verify?token=${encodeURIComponent(t)}``. */
  buildVerifyPath: (token: string) => string;
  /** i18n key for the "no token in the URL" error. */
  missingTokenKey: string;
}

export function TokenSignInVerifier({ buildVerifyPath, missingTokenKey }: TokenSignInVerifierProps) {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg(t(missingTokenKey));
      return;
    }

    apiClient
      .get(buildVerifyPath(token))
      .then(async (res: any) => {
        const data = res.data;
        if (data?.token) {
          await loginWithToken(data.token);
          setStatus("success");
          setTimeout(() => navigate(data.redirect || "/dashboard"), 1000);
        } else {
          throw new Error("No token in response");
        }
      })
      .catch((err: any) => {
        setStatus("error");
        setErrorMsg(err?.message ?? t("errors.magicLinkExpired"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return <AuthStatusScreen state="loading" title={t("status.verifyingSignInLink")} />;
  }

  if (status === "success") {
    return <AuthStatusScreen state="success" title={t("status.signedIn")} body={t("status.redirectingNow")} />;
  }

  return (
    <AuthStatusScreen
      state="error"
      title={t("headings.linkExpired")}
      body={errorMsg}
      action={
        <Button size="lg" className="w-full" onClick={() => navigate("/login")}>
          {t("actions.backToSignIn")}
        </Button>
      }
    />
  );
}
