/**
 * The standard "captcha goes here" slot for every unauthenticated entry
 * form (Login password / Login magic-link / Signup / Forgot Password /
 * Affiliate). Owns the wrapper layout (centered, top padding) AND the
 * configured-gate — consumers don't repeat `{captcha.configured && (...)}`
 * around every mount.
 *
 * Self-decides visibility: returns null when `VITE_TURNSTILE_SITE_KEY`
 * isn't set in this build. Per the project DRY rule — shared components
 * decide their own entitlement; no prop-drilled `canShow` booleans the
 * caller could compute itself.
 *
 * Usage:
 *   const captcha = useTurnstile();
 *   <AuthCaptchaSlot captcha={captcha} />
 *   // ... submit button uses captcha.ready to gate
 */

import { TurnstileWidget } from "@/components/TurnstileWidget";
import type { UseTurnstileResult } from "@/lib/hooks/use-turnstile";

interface AuthCaptchaSlotProps {
  captcha: UseTurnstileResult;
}

export function AuthCaptchaSlot({ captcha }: AuthCaptchaSlotProps) {
  if (!captcha.configured) return null;
  return (
    <div className="flex justify-center pt-2">
      <TurnstileWidget ref={captcha.ref} onToken={captcha.onToken} />
    </div>
  );
}
