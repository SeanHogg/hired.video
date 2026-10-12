/**
 * Shared password input with a show/hide toggle — the one implementation
 * behind sign in, sign up (password + confirm) and reset password. Mirrors
 * [EmailField]: the field owns its label wiring, toggle state, accessible
 * toggle label and touch-target sizing; callers pass id + value + onChange
 * and the autofill token that fits the form.
 */
import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label?: string;
  placeholder?: string;
  /** "current-password" for sign in, "new-password" for create / reset. */
  autoComplete: "current-password" | "new-password";
  /** Lock glyph at the input's left edge. */
  withIcon?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export function PasswordField({
  id,
  value,
  onChange,
  label,
  placeholder,
  autoComplete,
  withIcon = false,
  disabled,
  required = true,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;

  const field = (
    <div className="relative">
      {withIcon && (
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      )}
      <Input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pr-12", withIcon && "pl-10")}
        disabled={disabled}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword")}
        aria-pressed={visible}
        className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <ToggleIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  if (!label) return field;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {field}
    </div>
  );
}
