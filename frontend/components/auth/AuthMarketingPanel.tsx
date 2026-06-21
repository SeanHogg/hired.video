// Shared marketing panel for the Login + Signup pages (the desktop-only
// right rail). Both pages previously hand-rolled near-identical stat-tile
// + feature-checklist markup; this component owns that layout once and
// resolves all copy from i18n by `variant`, so adding/altering a persona
// is a data change here, not a copy-paste between two pages.
//
// The visual centerpiece is the live Career 360 health wheel — the same
// pure <CareerHealthWheel> the tool renders — primed with a demo snapshot
// so a signed-out visitor sees the flagship tool in motion before they
// create an account.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Compass, Sparkles, ArrowRight } from "lucide-react";
import {
  CareerHealthWheel,
  HEALTH_FILL_COLORS,
  useHealthLabels,
  type SegmentHealth,
  type WheelSegment,
} from "@/components/career360/CareerHealthWheel";
import { type UserRole, USER_ROLES } from "@/lib/auth";

/** Panel personas. "signIn" is the generic returning-user variant used by
 *  the Login page; the three user roles drive the Signup page's
 *  role-reactive copy. */
export type AuthMarketingVariant = "signIn" | UserRole;

interface StatTile {
  value: string;
  label: string;
}

/** A believable Career 360 snapshot for the logged-out preview. Mixed
 *  health bands keep the wheel colorful (green/amber/red) and tell the
 *  before-state story — there are gaps to close, which is the hook. The
 *  segment ids match the real blueprint so labels resolve through the same
 *  `tools.career360.segment.*` catalog the tool uses. */
const DEMO_OUTER: Array<{ id: string; health: SegmentHealth }> = [
  { id: "resume", health: "good" },
  { id: "profile", health: "good" },
  { id: "skills", health: "moderate" },
  { id: "experience", health: "good" },
  { id: "certifications", health: "poor" },
  { id: "narrative", health: "moderate" },
  { id: "outreach", health: "moderate" },
  { id: "salary", health: "unknown" },
];

const DEMO_INNER: Array<{ id: string; health: SegmentHealth }> = [
  { id: "callback-rate", health: "moderate" },
  { id: "interview-conversion", health: "good" },
  { id: "offer-rate", health: "poor" },
  { id: "goal-fit", health: "good" },
];

const LEGEND_ORDER: SegmentHealth[] = ["good", "moderate", "poor", "unknown"];

export function AuthMarketingPanel({ variant }: { variant: AuthMarketingVariant }) {
  const { t } = useTranslation();
  const healthLabels = useHealthLabels();

  // Hiring-side personas get candidate-framed Career 360 copy; everyone
  // else (job seekers + returning users) gets the seeker framing.
  const isHiring = variant === USER_ROLES.RECRUITER || variant === USER_ROLES.EMPLOYER;
  const featuredKey = isHiring ? "hiring" : "seeker";

  const outer: WheelSegment[] = useMemo(
    () =>
      DEMO_OUTER.map((s) => ({
        ...s,
        label: t(`tools.career360.segment.${s.id}`),
      })),
    [t],
  );
  const inner: WheelSegment[] = useMemo(
    () =>
      DEMO_INNER.map((s) => ({
        ...s,
        label: t(`tools.career360.segment.${s.id}`),
      })),
    [t],
  );

  const { title, body, statTiles, features } = useMemo(
    () => resolveCopy(variant, t),
    [variant, t],
  );

  return (
    <div className="hidden md:flex flex-col justify-center gap-6 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-2 text-muted-foreground">{body}</p>
      </div>

      {/* Featured tool: live Career 360 wheel */}
      <div className="rounded-2xl border bg-background/80 p-5 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-purple/10 px-2.5 py-1 text-xs font-semibold text-brand-purple">
            <Sparkles className="h-3.5 w-3.5" />
            {t("marketing.featured.badge")}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("marketing.featured.previewLabel")}
          </span>
        </div>

        <div className="flex items-center gap-2 text-brand-purple">
          <Compass className="h-5 w-5" />
          <span className="text-lg font-semibold">{t("tools.career360.title")}</span>
        </div>
        <p className="mt-0.5 text-sm font-medium">
          {t(`marketing.career360.${featuredKey}.tagline`)}
        </p>

        <div className="mx-auto my-4 w-full max-w-[260px]">
          <CareerHealthWheel outer={outer} inner={inner} size={320} />
        </div>

        {/* Legend — reuses the wheel's localized health labels + fill map */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {LEGEND_ORDER.map((h) => (
            <span key={h} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: HEALTH_FILL_COLORS[h] }}
              />
              {healthLabels[h]}
            </span>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {t(`marketing.career360.${featuredKey}.body`)}
        </p>

        <Link
          to="/tools/career-360"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-purple hover:underline"
        >
          {t("tools.career360.title")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statTiles.map((tile) => (
          <div key={tile.value + tile.label} className="rounded-xl bg-background p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-primary">{tile.value}</div>
            <div className="text-xs text-muted-foreground">{tile.label}</div>
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Resolve all role-reactive copy from the existing marketing catalog.
 *  Kept a pure function (takes `t`, returns strings) so the JSX above stays
 *  declarative and the variant→copy mapping lives in one readable place. */
function resolveCopy(
  variant: AuthMarketingVariant,
  t: ReturnType<typeof useTranslation>["t"],
): { title: string; body: string; statTiles: StatTile[]; features: string[] } {
  if (variant === "signIn") {
    return {
      title: t("marketing.signIn.title"),
      body: t("marketing.signIn.body"),
      statTiles: [
        { value: t("marketing.signIn.stat.free"), label: t("marketing.noCreditCard") },
        { value: t("marketing.signIn.stat.videoTime"), label: t("marketing.signIn.stat.videoTimeDesc") },
        { value: t("marketing.signIn.stat.tools"), label: t("marketing.signIn.stat.toolsDesc") },
        { value: t("marketing.signIn.stat.users"), label: t("marketing.signIn.stat.usersDesc") },
      ],
      features: (["signInOptions", "magicLink", "dashboard", "scoringHistory"] as const).map((k) =>
        t(`marketing.signIn.feature.${k}`),
      ),
    };
  }

  const marketingKey =
    variant === USER_ROLES.RECRUITER ? "recruiter" : variant === USER_ROLES.EMPLOYER ? "employer" : "jobSeeker";

  const statTiles: StatTile[] =
    variant === USER_ROLES.RECRUITER
      ? [
          { value: t("marketing.signUp.stat.freeStat"), label: t("marketing.noCreditCard") },
          { value: t("marketing.signUp.stat.matching"), label: t("marketing.signUp.stat.matchingDesc") },
          { value: t("labels.videoResumes"), label: t("marketing.signUp.stat.videoResDesc") },
          { value: t("marketing.signUp.stat.users"), label: t("marketing.signUp.stat.usersDescTalent") },
        ]
      : variant === USER_ROLES.EMPLOYER
        ? [
            { value: t("marketing.signUp.stat.freeStat"), label: t("marketing.noCreditCard") },
            { value: t("marketing.signUp.stat.companyPage"), label: t("marketing.signUp.stat.companyPageDesc") },
            { value: t("marketing.signUp.stat.aiJobPosts"), label: t("marketing.signUp.stat.aiJobPostsDesc") },
            { value: t("marketing.signUp.stat.users"), label: t("marketing.signUp.stat.usersDescPros") },
          ]
        : [
            { value: t("marketing.signUp.stat.freeStat"), label: t("marketing.noCreditCard") },
            { value: t("marketing.signUp.stat.videoTime"), label: t("marketing.signUp.stat.videoTimeDesc") },
            { value: t("marketing.signUp.stat.tools"), label: t("marketing.signUp.stat.toolsDesc") },
            { value: t("marketing.signUp.stat.users"), label: t("marketing.signUp.stat.usersDescPros") },
          ];

  const features = (t(`marketing.signUp.features.${marketingKey}`, { returnObjects: true }) as string[]) ?? [];

  return {
    title: t(`marketing.signUp.title.${marketingKey}`),
    body: t(`marketing.signUp.body.${marketingKey}`),
    statTiles,
    features,
  };
}
