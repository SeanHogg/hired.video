import { TokenSignInVerifier } from "@/components/auth/TokenSignInVerifier";

/** /auth/2fa-approve — one-tap "approve sign-in" from the 2FA email
 *  (gap #2225). Exchanges the signed approve token for a session so a
 *  mobile user never has to type the 6-digit code. Thin wrapper over the
 *  shared [TokenSignInVerifier]. */
export default function TwoFactorApprove() {
  return (
    <TokenSignInVerifier
      buildVerifyPath={(token) => `/api/auth/verify-2fa-link?token=${encodeURIComponent(token)}`}
      missingTokenKey="errors.magicLinkNoToken"
    />
  );
}
