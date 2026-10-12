// Brand panel for every auth page (the desktop-only right column of
// <AuthLayout>). A calm ink surface: mono eyebrow, a short value statement,
// a small resume → video composition and three plain benefit lines. All copy
// resolves from i18n by `variant`, so adding/altering a persona is a data
// change here, not a copy-paste between pages.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import { type UserRole, USER_ROLES } from "@/lib/auth";

/** Panel personas. "signIn" is the returning-user variant (Login and the
 *  account-recovery pages); the user roles drive the Signup page's copy. The
 *  hiring roles only render while HIRING_PERSONAS_ENABLED offers them. */
export type AuthMarketingVariant = "signIn" | UserRole;

/** Illustrative persona shown on the composition (a proper name, not copy). */
const SAMPLE_NAME = "Sean Hogg";

const SEEKER_POINTS = ["build", "video", "post"] as const;

/** Paper resume → 16:9 video + 1:1 post, drawn with tokens only. */
function ResumeToVideo() {
  const { t } = useTranslation();
  return (
    <div role="img" aria-label={t("auth.panel.illustrationAria")} className="flex items-center gap-4">
      {/* Paper resume */}
      <div className="flex w-[38%] min-w-0 -rotate-3 flex-col gap-2 rounded-[10px] border border-border bg-card p-4 text-foreground">
        <div className="truncate font-display text-[15px] font-bold tracking-[-0.01em]">{SAMPLE_NAME}</div>
        <div className="truncate text-[11px] text-muted-foreground">{t("landing.illustration.jobTitle")}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
          {t("landing.illustration.experience")}
        </div>
        <div className="h-1.5 w-[90%] rounded-[3px] bg-border" />
        <div className="h-1.5 w-[74%] rounded-[3px] bg-border" />
        <div className="h-1.5 w-[82%] rounded-[3px] bg-border" />
      </div>

      <ArrowRight className="h-5 w-5 shrink-0 text-ink-accent" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* YouTube 16:9 */}
        <div className="relative flex aspect-video flex-col justify-center gap-1 overflow-hidden rounded-[14px] bg-ink-raised p-4">
          <span className="absolute right-3 top-2.5 font-mono text-[9px] uppercase text-ink-muted">
            {t("landing.illustration.youtubeTag")}
          </span>
          <div className="font-display text-lg font-bold leading-none text-ink-foreground">{SAMPLE_NAME}</div>
          <div className="line-clamp-2 text-[11px] text-ink-muted">{t("landing.illustration.tagline")}</div>
          <div className="absolute bottom-2.5 left-4 right-4 h-[3px] rounded-sm bg-ink">
            <div className="h-[3px] w-[38%] rounded-sm bg-ink-accent" />
          </div>
        </div>
        {/* LinkedIn 1:1 chip */}
        <div className="flex items-center justify-between gap-2 rounded-[10px] bg-ink-raised px-3 py-2">
          <span className="font-mono text-[9px] uppercase text-ink-accent">{t("landing.illustration.linkedinTag")}</span>
          <span className="truncate text-xs font-semibold text-ink-foreground">
            {t("landing.illustration.linkedinTitle")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AuthMarketingPanel({ variant }: { variant: AuthMarketingVariant }) {
  const { t } = useTranslation();
  const { title, body, points } = useMemo(() => resolveCopy(variant, t), [variant, t]);

  return (
    <aside
      aria-labelledby="auth-panel-title"
      className="hidden flex-col justify-between gap-10 rounded-[20px] bg-ink p-8 text-ink-foreground md:flex lg:p-10"
    >
      <div className="flex flex-col gap-4">
        <span className="w-fit rounded-full bg-ink-raised px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-accent">
          {t("persuasion.mantra")}
        </span>
        <h2
          id="auth-panel-title"
          className="font-display text-[clamp(30px,3.2vw,44px)] font-bold leading-[1.02] tracking-[-0.03em] text-ink-foreground"
        >
          {title}
        </h2>
        <p className="max-w-[32em] text-base leading-relaxed text-ink-muted">{body}</p>
      </div>

      <ResumeToVideo />

      <ul className="flex flex-col gap-2.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm text-ink-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-positive" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Resolve the variant's copy. Pure (takes `t`, returns strings) so the JSX
 *  above stays declarative and the variant→copy mapping lives in one place. */
function resolveCopy(
  variant: AuthMarketingVariant,
  t: ReturnType<typeof useTranslation>["t"],
): { title: string; body: string; points: string[] } {
  if (variant === USER_ROLES.RECRUITER || variant === USER_ROLES.EMPLOYER) {
    const key = variant === USER_ROLES.RECRUITER ? "recruiter" : "employer";
    const features = t(`marketing.signUp.features.${key}`, { returnObjects: true });
    return {
      title: t(`marketing.signUp.title.${key}`),
      body: t(`marketing.signUp.body.${key}`),
      points: Array.isArray(features) ? (features as string[]).slice(0, 3) : [],
    };
  }

  const mode = variant === "signIn" ? "signIn" : "signUp";
  return {
    title: t(`auth.panel.${mode}.title`),
    body: t(`auth.panel.${mode}.body`),
    points: SEEKER_POINTS.map((k) => t(`auth.panel.point.${k}`)),
  };
}
