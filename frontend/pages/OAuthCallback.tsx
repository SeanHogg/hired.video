import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    const redirect = searchParams.get("redirect") || "/dashboard";
    const errorParam = searchParams.get("error");

    if (errorParam) {
      const messages: Record<string, string> = {
        unknown_provider: "Unknown authentication provider.",
        auth_failed: "Authentication failed. Please try again.",
        no_email: "Could not retrieve your email. Please use email/password sign-in.",
        invalid_state: "Authentication session expired. Please try again.",
        account_disabled: "Your account is disabled.",
        missing_params: "Authentication was cancelled.",
      };
      setErrorMsg(messages[errorParam] ?? "Authentication failed. Please try again.");
      setTimeout(() => navigate("/login"), 3000);
      return;
    }

    if (!token) {
      setErrorMsg("No authentication token received.");
      setTimeout(() => navigate("/login"), 2000);
      return;
    }

    loginWithToken(token)
      .then(() => navigate(redirect))
      .catch(() => {
        setErrorMsg("Failed to complete sign-in. Please try again.");
        setTimeout(() => navigate("/login"), 2000);
      });
  }, []);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{errorMsg}</p>
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Completing sign-in...</p>
      </div>
    </div>
  );
}
