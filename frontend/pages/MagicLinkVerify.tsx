import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";

export default function MagicLinkVerify() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No token found. The link may be broken.");
      return;
    }

    apiClient
      .get(`/auth/magic-link/verify?token=${encodeURIComponent(token)}`)
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
        setErrorMsg(err?.message ?? "This link has expired or already been used.");
      });
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying your sign-in link...</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <p className="font-medium">Signed in successfully!</p>
          <p className="text-sm text-muted-foreground">Redirecting you now...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm mx-auto px-4">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="font-medium">Link expired or invalid</p>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Button onClick={() => navigate("/login")}>Back to Sign In</Button>
      </div>
    </div>
  );
}
