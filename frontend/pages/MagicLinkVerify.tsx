import { TokenSignInVerifier } from "@/components/auth/TokenSignInVerifier";

/** /auth/magic-link — exchanges the emailed magic-link token for a
 *  session. Thin wrapper over the shared [TokenSignInVerifier]. */
export default function MagicLinkVerify() {
  return (
    <TokenSignInVerifier
      buildVerifyPath={(token) => `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`}
      missingTokenKey="errors.magicLinkNoToken"
    />
  );
}
