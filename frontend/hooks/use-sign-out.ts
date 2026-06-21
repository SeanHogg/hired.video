import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

interface SignOutOptions {
  /** Runs after sign-out, before any redirect (e.g. close a drawer/menu). */
  onAfter?: () => void;
  /** Navigate here (replace) after sign-out — e.g. "/login". */
  redirectTo?: string;
}

/**
 * Single source of truth for the sign-out action: owns the `useAuth().logout`
 * call plus the optional post-logout redirect. Both the <SignOutButton> chrome
 * and the avatar <UserMenu> consume it, so logout is wired in exactly one place.
 */
export function useSignOut() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    async ({ onAfter, redirectTo }: SignOutOptions = {}) => {
      await logout();
      onAfter?.();
      if (redirectTo) navigate(redirectTo, { replace: true });
    },
    [logout, navigate],
  );
}
