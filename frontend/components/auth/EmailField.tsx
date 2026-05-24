/**
 * Shared email input for sign-in / sign-up / forgot-password / magic-link
 * forms. Self-decides `autoComplete="username"` (per WHATWG autofill spec
 * + Chromium's password manager heuristics — the email field on auth
 * forms must declare itself as the "username" so a saved credential can
 * be bound to the field pair and so passkey conditional UI surfaces the
 * picker), `type="email"`, and `required` so callers can't accidentally
 * omit them. Gap #1123: prior to extraction, every email Input on every
 * auth surface had inconsistent autoComplete + repeated Label/Input/icon
 * markup; the consoles surfaced the browser warning "Input elements
 * should have autocomplete attributes (suggested: 'username')" on
 * /login + /signup.
 *
 * Per the project DRY rule: shared components decide their own contract
 * — consumers don't pass an `autoComplete` boolean or repeat the icon
 * wrapper. Mount with id + value + onChange and (optionally) label /
 * placeholder / withIcon overrides; the field owns the rest.
 */

import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EmailFieldProps {
  /** Stable input id — required so the surrounding form / Label /
   *  password-manager heuristics can target the right element. Use
   *  unique ids when multiple email fields coexist (e.g. "signin-email"
   *  + "signup-email" inside a tabbed modal). */
  id: string;
  value: string;
  onChange: (next: string) => void;
  /** Label text shown above the input. Omit to skip the label entirely
   *  for minimal modal-style forms. Resolve i18n in the caller; the
   *  field stays i18n-agnostic so it can host any copy. */
  label?: string;
  placeholder?: string;
  /** Mount the Mail icon at the input's left edge (Signup.tsx visual
   *  style). When true, the input automatically picks up `pl-10` so the
   *  text doesn't overlap the icon. */
  withIcon?: boolean;
  /** Defaults to true — auth forms always require the email. Pass false
   *  for optional fields like "where should we send the receipt to?". */
  required?: boolean;
  /** Defaults to "username" — the correct autofill token for sign-in,
   *  sign-up, forgot-password, and magic-link forms (it pairs with a
   *  `current-password` / `new-password` field). Pass "email" only for
   *  non-auth contexts where the email is unrelated to a credential
   *  pair (e.g. a contact form). */
  autoComplete?: "username" | "email";
  /** Optional Tailwind classes layered onto the input. */
  className?: string;
  /** Disable the input — useful while the form is mid-submit so the
   *  user can't change the email between captcha-pass and POST. */
  disabled?: boolean;
}

export function EmailField({
  id,
  value,
  onChange,
  label,
  placeholder,
  withIcon = false,
  required = true,
  autoComplete = "username",
  className,
  disabled,
}: EmailFieldProps) {
  const inputClasses = [withIcon ? "pl-10" : "", className ?? ""].filter(Boolean).join(" ");
  const input = (
    <Input
      id={id}
      type="email"
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClasses || undefined}
      required={required}
      disabled={disabled}
    />
  );
  const body = withIcon ? (
    <div className="relative">
      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      {input}
    </div>
  ) : input;
  if (!label) return body;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {body}
    </div>
  );
}
