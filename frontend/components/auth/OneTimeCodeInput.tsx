/**
 * Shared one-time-code (OTP) input for the email-2FA step-up, mirroring
 * [EmailField]'s "the field owns its contract" pattern. Built for the
 * mobile inbox → login round-trip, which is where users were getting
 * stuck: a returning user signing in on a phone hits the email-code
 * step-up (Turnstile routinely fails in in-app browsers, which forces
 * `requiresMfa`), then has to leave the browser, hand-select a 6-digit
 * code out of an email, and paste it back. Three things make that work:
 *
 *   1. `autoComplete="one-time-code"` + `inputMode="numeric"` — iOS Mail
 *      and Android surface the code as a QuickType suggestion straight
 *      above the keyboard, so the common case is ONE TAP, no copy/paste
 *      at all. The matching email template (sendTwoFactorEmail) places
 *      the digits next to the word "code" so the OS heuristic fires.
 *   2. Digit-only sanitisation on every change/paste — a value pasted
 *      out of a styled email often carries spaces / newlines / NBSPs;
 *      we strip everything but digits and clamp to `length` so the
 *      backend compare (`presented === pending.code`) doesn't fail on
 *      invisible whitespace.
 *   3. Auto-submit once `length` digits are present — the user never has
 *      to find the "Verify" button on a small screen.
 *
 * Per the project DRY rule the consumer passes value + onChange (+ an
 * optional onComplete); the field decides autofill token, input mode,
 * sanitisation, max length, and touch-target sizing itself.
 */

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OneTimeCodeInputProps {
  /** Stable input id so the surrounding Label / form can target it. */
  id: string;
  value: string;
  /** Receives the sanitised, digit-only, length-clamped value. */
  onChange: (next: string) => void;
  /** Fired once the value reaches `length` digits — wire to the verify
   *  submit so mobile users don't hunt for the button. Guarded so it
   *  only fires on the transition into "complete", not on every render. */
  onComplete?: (code: string) => void;
  /** Expected code length. Defaults to 6 (matches generateVerificationCode). */
  length?: number;
  /** Label text shown above the input. Resolve i18n in the caller. */
  label?: string;
  placeholder?: string;
  /** Disable while the form is mid-verify. */
  disabled?: boolean;
  className?: string;
}

export function OneTimeCodeInput({
  id,
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  placeholder,
  disabled,
  className,
}: OneTimeCodeInputProps) {
  // Track the last value we fired onComplete for, so re-renders (or the
  // user editing a complete code) don't re-submit the same digits.
  const completedFor = useRef<string | null>(null);

  const handleValue = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) {
      if (completedFor.current !== digits) {
        completedFor.current = digits;
        onComplete?.(digits);
      }
    } else {
      // Reset the guard once the field is no longer complete so a
      // corrected re-entry of the same code can still auto-submit.
      completedFor.current = null;
    }
  };

  const input = (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      // Pattern + numeric mode keep iOS/Android on the digit keypad and
      // strengthen the one-time-code autofill match.
      pattern="[0-9]*"
      maxLength={length}
      placeholder={placeholder}
      value={value}
      onChange={(e) => handleValue(e.target.value)}
      disabled={disabled}
      // Large, centred, spaced digits — readable + a comfortable touch
      // target on a phone (min-h-12 ≈ 48px, above the 44px floor).
      className={["min-h-12 text-center text-2xl tracking-[0.5em] font-mono", className ?? ""]
        .filter(Boolean)
        .join(" ") || undefined}
    />
  );

  if (!label) return input;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
    </div>
  );
}
