// DeclarativeJobRenderer — renders a UIJob through a declarative
// JobTemplateDescriptor. Mirrors DeclarativeResumeRenderer's hero + body +
// sidebar + section-block pattern, but with job-specific section kinds.
//
// Themes, fonts, heading styles, and density tokens are shared with the
// resume renderer via lib/resume-template-themes — jobs and resumes
// consume the same visual system so agency brand kits apply uniformly.

import {
  Briefcase,
  Building,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  ExternalLink,
  Gift,
  GraduationCap,
  ListChecks,
  Mail,
  MapPin,
  Send,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Markdown from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// One section chrome for résumés and jobs (heading per headingStyle, card style).
import { SectionHeading, cardClass } from "@/components/resume-renderer/section-heading";
import {
  DENSITY_CLASS,
  FONT_FAMILY_CLASS,
  THEMES,
  type ThemeStyles,
} from "@/lib/resume-template-themes";
import type {
  JobCardStyle,
  JobIconKey,
  JobSectionBlock,
  JobSectionKey,
  JobSectionTitleSize,
  JobTemplateDescriptor,
} from "@/types/job-template";

// UIJob shape matches JobDetail.tsx's mapApiJobToUI output. Kept minimal
// here to avoid a circular import; extend as new fields become required.
export interface RendererJobCompany {
  name: string;
  logo?: string;
  description?: string;
  industry?: string;
  size?: string;
  website?: string;
}

export interface RendererJobLocation {
  city?: string;
  state?: string;
  remote: boolean;
}

export interface RendererJobRequirement {
  skill: string;
  level: string;
  required: boolean;
}

export interface RendererJobBenefit {
  type: string;
  description: string;
}

export interface RendererJobData {
  title: string;
  description: string;
  company: RendererJobCompany;
  location: RendererJobLocation;
  contactEmail?: string;
  applicationDeadline?: string;
  applyUrl?: string;
  responsibilities?: string[];
  requirements?: RendererJobRequirement[];
  qualifications?: string[];
  skills?: string[];
  benefits?: RendererJobBenefit[];
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
}

export interface RendererJob {
  id: string;
  data: RendererJobData;
}

interface DeclarativeJobRendererProps {
  job: RendererJob;
  descriptor: JobTemplateDescriptor;
  embedded?: boolean;
  /** Renders into the hero video slot when descriptor.hero.showVideo is true. */
  videoSlot?: React.ReactNode;
  /** Optional action element (Apply button) injected into the hero for owners/viewers. */
  heroActionSlot?: React.ReactNode;
}

const ICONS: Record<JobIconKey, LucideIcon> = {
  briefcase: Briefcase,
  "list-checks": ListChecks,
  target: Target,
  "graduation-cap": GraduationCap,
  sparkles: Sparkles,
  gift: Gift,
  building: Building,
  send: Send,
};

function gridColsClass(cols: 1 | 2 | 3 | 4 = 3): string {
  switch (cols) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 md:grid-cols-2";
    case 4:
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
    case 3:
    default:
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  }
}

function formatSalary(t: TFunction, min?: number, max?: number, currency = "USD"): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return t("labels.salaryFrom", { amount: fmt(min) });
  if (max) return t("labels.salaryUpTo", { amount: fmt(max) });
  return null;
}

function locationLabel(t: TFunction, loc?: RendererJobLocation): string | null {
  if (!loc) return null;
  if (loc.remote) return t("labels.remote");
  const city = [loc.city, loc.state].filter(Boolean).join(", ");
  return city || null;
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({
  descriptor,
  job,
  theme,
  videoSlot,
  actionSlot,
  t,
}: {
  descriptor: JobTemplateDescriptor;
  job: RendererJob;
  theme: ThemeStyles;
  videoSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
  t: TFunction;
}) {
  const { data } = job;
  const salary = formatSalary(t, data.salaryMin, data.salaryMax, data.salaryCurrency);
  const location = locationLabel(t, data.location);

  // Print mode: plain centered header with title + company + contact strip.
  if (descriptor.documentMode === "print") {
    return (
      <div className={`${theme.pageBg} pt-6`}>
        <div className={`max-w-[880px] mx-auto ${theme.paperBg} shadow-sm px-8 md:px-12 pt-10 pb-6 text-center`}>
          <h1
            className={`text-4xl font-bold ${theme.nameText} ${
              descriptor.theme.headingStyle === "caps" ? "uppercase tracking-widest" : ""
            }`}
          >
            {data.title}
          </h1>
          <p className={`text-lg mt-1 ${theme.accentText}`}>{data.company.name}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-3">
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {location}
              </span>
            )}
            {descriptor.hero.showEmploymentType && data.employmentType && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {data.employmentType}
              </span>
            )}
            {descriptor.hero.showSalary && salary && (
              <span className="inline-flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                {salary}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Hero (gradient) mode.
  return (
    <div className={`${theme.heroGradient} ${theme.heroForeground}`}>
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <div
          className={
            descriptor.hero.layout === "split"
              ? "grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-start"
              : "space-y-6"
          }
        >
          <div className="space-y-4 min-w-0">
            <div className="flex items-center gap-4">
              {descriptor.hero.showCompanyLogo && data.company.logo && (
                <Avatar className="w-14 h-14 border-2 border-white/40">
                  <AvatarImage src={data.company.logo} alt={data.company.name} />
                  <AvatarFallback className="bg-white/20 text-inherit">
                    {data.company.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                <p className="text-sm uppercase tracking-widest opacity-80">{data.company.name}</p>
                <h1
                  className={`text-3xl md:text-5xl font-bold leading-tight ${
                    descriptor.theme.headingStyle === "caps" ? "uppercase tracking-wide" : ""
                  }`}
                >
                  {data.title}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm opacity-95">
              {descriptor.hero.showLocation && location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {location}
                </span>
              )}
              {descriptor.hero.showEmploymentType && data.employmentType && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {data.employmentType}
                </span>
              )}
              {descriptor.hero.showSalary && salary && (
                <span className="inline-flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  {salary}
                </span>
              )}
              {data.experienceLevel && (
                <Badge variant="secondary" className="bg-white/15 text-inherit border-0">
                  {data.experienceLevel}
                </Badge>
              )}
            </div>
            {descriptor.hero.showApplyButton && (
              <div className="pt-2 flex items-center gap-3">
                {actionSlot ?? (
                  <Button size="lg" className="bg-white text-black hover:bg-white/90">
                    <Send className="w-4 h-4 mr-2" />
                    {t("actions.applyNow")}
                  </Button>
                )}
              </div>
            )}
          </div>
          {descriptor.hero.showVideo && videoSlot && (
            <div className="w-full md:w-[360px]">{videoSlot}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section renderers — dispatch by key + layout
// ---------------------------------------------------------------------------

function DescriptionSection({ job, t }: { job: RendererJob; t: TFunction }) {
  const body = job.data.description?.trim();
  if (!body) return <p className="text-muted-foreground">{t("messages.noDescriptionProvided")}</p>;
  return (
    <div className="prose prose-neutral max-w-none dark:prose-invert">
      <Markdown>{body}</Markdown>
    </div>
  );
}

function BulletList({ items, t }: { items: string[]; t: TFunction }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("messages.noneListed")}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function RequirementsList({ items, theme, t }: { items: RendererJobRequirement[]; theme: ThemeStyles; t: TFunction }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("messages.noneListed")}</p>;
  return (
    <ul className="space-y-2">
      {items.map((r, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-1 border-b last:border-b-0">
          <div className="flex items-center gap-2">
            <CheckCircle className={`w-4 h-4 ${theme.accentText}`} />
            <span className="font-medium">{r.skill}</span>
            {r.level && <span className="text-xs text-muted-foreground">· {r.level}</span>}
          </div>
          {r.required ? (
            <Badge variant="default">{t("labels.required")}</Badge>
          ) : (
            <Badge variant="secondary">{t("labels.preferred")}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function SkillsGrid({
  items,
  columns,
  theme,
  t,
}: {
  items: string[];
  columns: 1 | 2 | 3 | 4;
  theme: ThemeStyles;
  t: TFunction;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("messages.noSkillsListed")}</p>;
  return (
    <div className={`grid gap-2 ${gridColsClass(columns)}`}>
      {items.map((s, i) => (
        <div
          key={i}
          className={`px-3 py-2 rounded-md ${theme.accentBgSoft} ${theme.accentText} text-sm font-medium`}
        >
          {s}
        </div>
      ))}
    </div>
  );
}

function BenefitsCards({
  items,
  columns,
  cardStyleKey,
  t,
}: {
  items: RendererJobBenefit[];
  columns: 1 | 2 | 3 | 4;
  cardStyleKey: JobCardStyle | undefined;
  t: TFunction;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("messages.noBenefitsListed")}</p>;
  return (
    <div className={`grid gap-4 ${gridColsClass(columns)}`}>
      {items.map((b, i) => (
        <Card key={i} className={cardClass(cardStyleKey)}>
          <CardContent className="p-4">
            <div className="font-semibold mb-1">{b.type}</div>
            {b.description && (
              <p className="text-sm text-muted-foreground">{b.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CompanySection({ company, t }: { company: RendererJobCompany; t: TFunction }) {
  return (
    <div className="flex items-start gap-4">
      {company.logo && (
        <Avatar className="w-16 h-16">
          <AvatarImage src={company.logo} alt={company.name} />
          <AvatarFallback>{company.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-lg">{company.name}</h3>
        <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
          {company.industry && <span>{company.industry}</span>}
          {company.size && <span>· {company.size}</span>}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("labels.website")}
            </a>
          )}
        </div>
        {company.description && (
          <p className="text-sm mt-3 text-muted-foreground">{company.description}</p>
        )}
      </div>
    </div>
  );
}

function ApplySection({
  job,
  actionSlot,
  t,
}: {
  job: RendererJob;
  actionSlot?: React.ReactNode;
  t: TFunction;
}) {
  const { data } = job;
  const hasApplyTarget = Boolean(data.applyUrl || data.contactEmail);
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Send className="w-5 h-5" />
            {t("headings.readyToApply")}
          </h3>
          {data.applicationDeadline && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {t("labels.applyByDate", { date: new Date(data.applicationDeadline).toLocaleDateString() })}
            </p>
          )}
          {data.contactEmail && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              {data.contactEmail}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {actionSlot ??
            (hasApplyTarget ? (
              <Button asChild>
                <a
                  href={data.applyUrl || `mailto:${data.contactEmail}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("actions.applyNow")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            ) : (
              <Button>{t("actions.applyNow")}</Button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface RenderSectionArgs {
  block: JobSectionBlock;
  job: RendererJob;
  theme: ThemeStyles;
  headingStyle: "underlined" | "divider" | "caps" | "plain";
  headingSize: JobSectionTitleSize;
  showIconInHeading: boolean;
  cardStyleKey: JobCardStyle | undefined;
  heroActionSlot?: React.ReactNode;
  t: TFunction;
}

function renderSection({
  block,
  job,
  theme,
  headingStyle,
  headingSize,
  showIconInHeading,
  cardStyleKey,
  heroActionSlot,
  t,
}: RenderSectionArgs): React.ReactNode {
  if (!block.enabled) return null;
  const Icon = ICONS[block.icon ?? defaultIconForKey(block.key)] ?? Briefcase;
  const title = block.title ?? defaultTitleForKey(block.key, t);

  const heading = (
    <SectionHeading
      title={title}
      Icon={Icon}
      theme={theme}
      style={headingStyle}
      size={headingSize}
      showIcon={showIconInHeading}
      plainSpacing="tight"
    />
  );

  let body: React.ReactNode = null;
  switch (block.key) {
    case "description":
      body = <DescriptionSection job={job} t={t} />;
      break;
    case "responsibilities":
      body = <BulletList items={job.data.responsibilities ?? []} t={t} />;
      break;
    case "requirements":
      body = <RequirementsList items={job.data.requirements ?? []} theme={theme} t={t} />;
      break;
    case "qualifications":
      body = <BulletList items={job.data.qualifications ?? []} t={t} />;
      break;
    case "skills":
      body = <SkillsGrid items={job.data.skills ?? []} columns={block.columns ?? 3} theme={theme} t={t} />;
      break;
    case "benefits":
      body = (
        <BenefitsCards
          items={job.data.benefits ?? []}
          columns={block.columns ?? 2}
          cardStyleKey={cardStyleKey}
          t={t}
        />
      );
      break;
    case "company":
      body = <CompanySection company={job.data.company} t={t} />;
      break;
    case "apply":
      body = <ApplySection job={job} actionSlot={heroActionSlot} t={t} />;
      break;
  }

  return (
    <section key={block.key}>
      {heading}
      {body}
    </section>
  );
}

function defaultTitleForKey(key: JobSectionKey, t: TFunction): string {
  switch (key) {
    case "description":
      return t("headings.aboutThisRole");
    case "responsibilities":
      return t("headings.whatYoullDo");
    case "requirements":
      return t("headings.requirements");
    case "qualifications":
      return t("headings.qualifications");
    case "skills":
      return t("headings.skills");
    case "benefits":
      return t("headings.benefits");
    case "company":
      return t("headings.aboutTheCompany");
    case "apply":
      return t("headings.apply");
  }
}

function defaultIconForKey(key: JobSectionKey): JobIconKey {
  switch (key) {
    case "description":
      return "briefcase";
    case "responsibilities":
      return "list-checks";
    case "requirements":
      return "target";
    case "qualifications":
      return "graduation-cap";
    case "skills":
      return "sparkles";
    case "benefits":
      return "gift";
    case "company":
      return "building";
    case "apply":
      return "send";
  }
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export default function DeclarativeJobRenderer({
  job,
  descriptor,
  embedded = false,
  videoSlot,
  heroActionSlot,
}: DeclarativeJobRendererProps) {
  const { t } = useTranslation();
  const theme = THEMES[descriptor.theme.themeKey] ?? THEMES["hired-purple"];
  const fontFamily = FONT_FAMILY_CLASS[descriptor.theme.fontFamily] ?? FONT_FAMILY_CLASS.sans;
  const density = DENSITY_CLASS[descriptor.theme.density] ?? DENSITY_CLASS.comfortable;

  const cardStyleKey =
    descriptor.theme.cardStyle ?? (descriptor.documentMode === "print" ? "ghost" : "elevated");
  const showIconInHeading = descriptor.documentMode === "hero";

  const sidebarKeys = new Set<JobSectionKey>(descriptor.layout.sidebar ?? []);
  const mainBlocks = descriptor.sections.filter((b) => !sidebarKeys.has(b.key));
  const sidebarBlocks = (descriptor.layout.sidebar ?? [])
    .map((key) => descriptor.sections.find((b) => b.key === key))
    .filter((b): b is JobSectionBlock => Boolean(b));

  // A rendered job document is a fixed paper artifact (mirrors the exported
  // PDF, always light). Non-embedded documents establish their own surface
  // (pageBg + baseText) AND a forced-light token scope so hero-mode templates
  // never drop their fixed-palette headings onto the app's dark canvas.
  // Embedded thumbnails stay theme-adaptive to blend into app cards.
  const rootClass = embedded
    ? fontFamily
    : `force-light-scope ${theme.pageBg} ${theme.baseText} ${fontFamily}`;

  const renderArgs: Omit<RenderSectionArgs, "block"> = {
    job,
    theme,
    headingStyle: descriptor.theme.headingStyle,
    headingSize: descriptor.theme.sectionTitleSize ?? "md",
    showIconInHeading,
    cardStyleKey,
    heroActionSlot,
    t,
  };

  return (
    <div data-doc-surface className={`w-full ${rootClass}`}>
      {descriptor.hero.enabled && (
        <Hero
          descriptor={descriptor}
          job={job}
          theme={theme}
          videoSlot={videoSlot}
          actionSlot={heroActionSlot}
          t={t}
        />
      )}

      <div
        className={
          descriptor.documentMode === "print"
            ? `max-w-[880px] mx-auto ${theme.paperBg} shadow-sm my-6 px-8 md:px-12 py-8 ${density.section}`
            : `max-w-6xl mx-auto px-6 ${embedded ? "py-6" : "py-12"} ${density.section}`
        }
      >
        {descriptor.layout.columns === 2 ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] print:grid-cols-[1fr_280px] gap-10">
            <div className={density.section}>
              {mainBlocks.map((block) => renderSection({ ...renderArgs, block }))}
            </div>
            <aside className={density.section}>
              {sidebarBlocks.map((block) => renderSection({ ...renderArgs, block }))}
            </aside>
          </div>
        ) : (
          <>{descriptor.sections.map((block) => renderSection({ ...renderArgs, block }))}</>
        )}
      </div>
    </div>
  );
}
