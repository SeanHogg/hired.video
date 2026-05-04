import { useAuth } from "@/lib/auth";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";

/**
 * The role that should drive UI branching for the current viewer.
 * Precedence: active impersonation > persona preview > the user's own role.
 * Components that gate themselves on role should consume this rather than
 * reading user.role directly so they respect both employer/recruiter
 * persona previews and SuperAdmin impersonation sessions.
 */
export function useEffectiveRole(): string | null {
  const { user, impersonationSession } = useAuth();
  const { personaPreview } = usePersonaPreview();
  return impersonationSession?.role ?? personaPreview ?? user?.role ?? null;
}
