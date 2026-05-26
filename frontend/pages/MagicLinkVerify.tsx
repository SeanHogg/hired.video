import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";

export default function MagicLinkVerify() {
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
      setErrorMsg(t("errors.magicLinkNoToken"));
      return;
    }

    apiClient
      .get(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`)
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">{t("status.verifyingSignInLink")}</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <p className="font-medium">{t("status.signedIn")}</p>
          <p className="text-sm text-muted-foreground">{t("status.redirectingNow")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4 px-4">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="font-medium">{t("headings.linkExpired")}</p>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Button onClick={() => navigate("/login")}>{t("actions.backToSignIn")}</Button>
      </div>
    </div>
  );
}
