// Long-form legal page chrome (Privacy, Terms, Cookies, opt-out): a 760px
// reading column with a display h1 + muted meta line, and section parts that
// mirror the Card API (Header / Title / Description / Content) so the legal
// pages read as one document instead of a stack of boxed cards.

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LegalPageProps {
  title: ReactNode;
  /** Muted meta line under the title ("Last updated …"). */
  meta?: ReactNode;
  intro?: ReactNode;
  /** Extra controls under the intro (e.g. jurisdiction selector). */
  actions?: ReactNode;
  children: ReactNode;
}

export function LegalPage({ title, meta, intro, actions, children }: LegalPageProps) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-12 sm:pt-16">
      <header className="flex flex-col gap-4 border-b border-border pb-10">
        <h1 className="font-display text-[clamp(36px,4.6vw,56px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        {intro && <p className="text-lg leading-relaxed text-muted-foreground">{intro}</p>}
        {actions && <div className="flex flex-wrap items-center gap-3 pt-2">{actions}</div>}
      </header>
      <div className="flex flex-col gap-12 pt-10">{children}</div>
    </main>
  );
}

export function LegalSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("flex scroll-mt-24 flex-col gap-4", className)} {...props} />;
}

export function LegalSectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function LegalSectionTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

export function LegalSectionDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-base leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function LegalSectionContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_h4]:font-semibold [&_h4]:text-foreground", className)}
      {...props}
    />
  );
}

/** Highlighted notice inside the reading column (agreement, age, warnings). */
export function LegalCallout({
  tone = "primary",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "primary" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-[20px] border p-6",
        tone === "primary"
          ? "border-primary/20 bg-accent text-foreground"
          : "border-amber-300/60 bg-amber-50 text-foreground dark:border-amber-500/30 dark:bg-amber-950/40",
        className,
      )}
      {...props}
    />
  );
}
