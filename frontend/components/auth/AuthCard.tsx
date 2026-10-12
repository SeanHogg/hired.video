/**
 * Presentational building blocks for every auth surface:
 *   - <AuthCard>          the rounded-20 form card with a display h1
 *   - <AuthStatusIcon>    the 48px tinted icon tile (success / warning / …)
 *   - <AuthLoadingCard>   an AuthCard-shaped spinner state
 *   - <AuthStatusScreen>  a full-screen status card for chrome-less token
 *                         exchanges (OAuth callback, magic link, 2FA approve)
 *   - <AuthBackLink>      the "← Back to sign in / home" text link
 *   - <AuthDivider>       the "or continue with email" rule
 *   - <AuthSegmented>     the two-option segmented switch (password / magic
 *                         link, create account / sign in)
 *
 * Pure markup + tokens only; pages own the behaviour.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AuthTone = "primary" | "success" | "warning" | "destructive";

const TONE_CLASS: Record<AuthTone, string> = {
  primary: "bg-accent text-primary",
  success: "bg-brand-green/15 text-brand-green-text",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  destructive: "bg-destructive/10 text-destructive",
};

export function AuthStatusIcon({
  icon: Icon,
  tone = "primary",
  spin = false,
  className,
}: {
  icon: LucideIcon;
  tone?: AuthTone;
  spin?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", TONE_CLASS[tone], className)}>
      <Icon className={cn("h-6 w-6", spin && "animate-spin")} aria-hidden="true" />
    </div>
  );
}

/** Mono uppercase eyebrow chip (design-system hero label). */
export function AuthEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="w-fit rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
      {children}
    </span>
  );
}

export interface AuthCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small mono chip above the title. */
  eyebrow?: ReactNode;
  /** Icon tile / logo rendered above the title. */
  media?: ReactNode;
  align?: "start" | "center";
  className?: string;
  children?: ReactNode;
}

export function AuthCard({ title, subtitle, eyebrow, media, align = "start", className, children }: AuthCardProps) {
  return (
    <section className={cn("rounded-[20px] border border-border bg-card p-6 text-card-foreground sm:p-8", className)}>
      <header className={cn("flex flex-col gap-2.5", align === "center" && "items-center text-center", children ? "mb-6" : "")}>
        {media && <div className="mb-1">{media}</div>}
        {eyebrow && <AuthEyebrow>{eyebrow}</AuthEyebrow>}
        <h1 className="font-display text-[clamp(30px,3.4vw,40px)] font-bold leading-[1.02] tracking-[-0.03em]">
          {title}
        </h1>
        {subtitle && <p className="text-base leading-relaxed text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

/** Spinner state shaped like an AuthCard so the layout doesn't jump. */
export function AuthLoadingCard({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-[20px] border border-border bg-card px-6 py-16 text-center"
    >
      <AuthStatusIcon icon={Loader2} spin />
      <p className="text-sm text-muted-foreground">{label}</p>
    </section>
  );
}

const STATUS_ICON: Record<"loading" | "success" | "error", { icon: LucideIcon; tone: AuthTone; spin: boolean }> = {
  loading: { icon: Loader2, tone: "primary", spin: true },
  success: { icon: CheckCircle2, tone: "success", spin: false },
  error: { icon: XCircle, tone: "destructive", spin: false },
};

/** Full-screen status card for the chrome-less token-exchange routes. */
export function AuthStatusScreen({
  state,
  title,
  body,
  action,
}: {
  state: "loading" | "success" | "error";
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  const s = STATUS_ICON[state];
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        role={state === "error" ? "alert" : "status"}
        aria-live="polite"
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[20px] border border-border bg-card p-8 text-center"
      >
        <AuthStatusIcon icon={s.icon} tone={s.tone} spin={s.spin} />
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
        {action}
      </div>
    </div>
  );
}

/** Horizontal rule with a centred label ("or continue with email"). */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Two-option segmented switch on the Tabs primitive (44px triggers). The
 *  host renders the matching body itself — this only owns the switch. */
export function AuthSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  ariaLabel?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList aria-label={ariaLabel} className="grid h-[52px] w-full grid-cols-2">
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} className="h-11">
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** "← Back to …" text link (44px tap target). */
export function AuthBackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
