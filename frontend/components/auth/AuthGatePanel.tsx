/**
 * AuthGatePanel — a compact tabbed Sign in / Create account panel that reuses
 * the SAME [LoginForm] / [SignupForm] cores as the full auth pages. Hosted in a
 * <Sheet> by [useAuthGate]; opened when an unauthenticated visitor reaches a
 * gated action (Save / Publish / Export) so they can authenticate WITHOUT
 * leaving their work-in-progress canvas.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import LoginForm from "@/components/auth/LoginForm";
import SignupForm from "@/components/auth/SignupForm";

export interface AuthGatePanelProps {
  /** One-line headline explaining WHY auth is being asked for, e.g.
   *  "Create a free account to save your video resume". */
  reason?: string;
  /** Post-verify return target for the signup flow (e.g. `/studio/new?claim=1`).
   *  Also the redirect Sign-in OAuth/magic-link carry. */
  redirectTo?: string;
  /** Fired on a fully-authenticated Sign-in result — the host resumes the
   *  pending action in place. */
  onAuthenticated: () => void;
  /** Fired right before the signup success redirect (no session yet) — the
   *  host stamps a pending claim so the draft is reclaimed on return. */
  onSignupSubmitted?: () => void;
  defaultTab?: "login" | "signup";
}

export default function AuthGatePanel({
  reason,
  redirectTo,
  onAuthenticated,
  onSignupSubmitted,
  defaultTab = "signup",
}: AuthGatePanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"login" | "signup">(defaultTab);

  return (
    <div className="space-y-5">
      {reason && (
        <p className="text-sm text-muted-foreground">{reason}</p>
      )}

      <div className="flex gap-1 p-1 bg-muted rounded-md">
        <button
          type="button"
          onClick={() => setTab("signup")}
          className={cn(
            "flex-1 py-1.5 text-sm rounded transition-colors",
            tab === "signup" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("actions.createAccount")}
        </button>
        <button
          type="button"
          onClick={() => setTab("login")}
          className={cn(
            "flex-1 py-1.5 text-sm rounded transition-colors",
            tab === "login" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("actions.signIn")}
        </button>
      </div>

      {tab === "login" ? (
        <LoginForm
          redirectParam={redirectTo || "/dashboard"}
          onAuthenticated={onAuthenticated}
          onSwitchToSignup={() => setTab("signup")}
        />
      ) : (
        <SignupForm
          redirectTo={redirectTo}
          onBeforeRedirect={onSignupSubmitted}
          onSwitchToLogin={() => setTab("login")}
          compact
        />
      )}
    </div>
  );
}
