// OwnerAuthGate — SSoT for the anonymous sign-in mask on creator-output
// detail pages (#887). A page wraps its content in <OwnerAuthGate> and
// passes the OWNER's `promoteWithoutAuth` flag (exposed by the page's
// public detail API — see api/src/services/user/promotionFlags.ts). The
// gate decides for itself whether to render the AuthOverlay:
//
//   • signed-in viewer          → never gated
//   • owner opted into promote  → never gated (portfolio / promo link)
//   • otherwise (anonymous)     → blurred AuthOverlay over the content
//
// Pages never re-derive this rule; they only hand over the owner flag.

import type { ReactNode } from "react";
import AuthOverlay from "@/components/AuthOverlay";
import { useAuth } from "@/lib/auth";

type GatedContentType = "resume" | "person";

/** True when the current viewer should see the sign-in mask. `null` /
 *  `undefined` (flag not loaded yet, or not sent) means "gated" — the
 *  safe default; the mask lifts as soon as the owner flag arrives. */
export function useOwnerAuthGate(promoteWithoutAuth: boolean | null | undefined): boolean {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated && promoteWithoutAuth !== true;
}

interface OwnerAuthGateProps {
  /** The content OWNER's Settings → Privacy → promoteWithoutAuth. */
  promoteWithoutAuth: boolean | null | undefined;
  contentType: GatedContentType;
  title?: string;
  children: ReactNode;
}

export function OwnerAuthGate({ promoteWithoutAuth, contentType, title, children }: OwnerAuthGateProps) {
  const gated = useOwnerAuthGate(promoteWithoutAuth);
  return (
    <div className={gated ? "relative" : undefined}>
      {gated && <AuthOverlay contentType={contentType} title={title} />}
      {children}
    </div>
  );
}

export default OwnerAuthGate;
