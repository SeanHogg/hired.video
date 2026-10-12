/**
 * #785 — `useImpersonation` reads the active impersonation session
 * from the auth context and surfaces (a) the boolean used by gates
 * + (b) a human-readable label for the impersonated user. Lives as
 * its own hook so consumers don't have to know about the surrounding
 * `useAuth` shape (DRY + SoC).
 */

import { useAuth } from "@/lib/auth";

export interface ImpersonationState {
  isImpersonating: boolean;
  targetUserId: string | null;
  targetUserLabel: string | null;
}

export function useImpersonation(): ImpersonationState {
  const ctx = useAuth() as unknown as {
    isImpersonating?: boolean;
    impersonationSession?: {
      targetUserId?: string | null;
      targetUserEmail?: string | null;
      targetUserName?: string | null;
    } | null;
  };
  const session = ctx.impersonationSession ?? null;
  const label =
    session?.targetUserName?.trim() ||
    session?.targetUserEmail?.trim() ||
    session?.targetUserId ||
    null;
  return {
    isImpersonating: !!ctx.isImpersonating,
    targetUserId: session?.targetUserId ?? null,
    targetUserLabel: label ?? null,
  };
}
