import {
  Award,
  BookOpen,
  Building,
  Calendar,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  GraduationCap,
  Heart,
  Languages as LanguagesIcon,
  Lightbulb,
  Mail,
  Phone,
  Star,
  Trophy,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COMPONENT_REGISTRY } from "@/lib/resume-template-components";
import {
  DENSITY_CLASS,
  FONT_FAMILY_CLASS,
  THEMES,
  type ThemeStyles,
} from "@/lib/resume-template-themes";
import type { Resume } from "@/types/resume";
import type {
  CardStyle,
  ResumeBlock,
  ResumeSectionKey,
  ResumeTemplateDescriptor,
  SectionTitleSize,
  TemplateIconKey,
} from "@/types/resume-template";
import { blockId } from "@/types/resume-template";

interface DeclarativeResumeRendererProps {
  resume: Resume;
  descriptor: ResumeTemplateDescriptor;
  embedded?: boolean;
  videoSlot?: React.ReactNode;
}

const ICONS: Record<TemplateIconKey, React.ComponentType<any>> = {
  building: Building,
  "graduation-cap": GraduationCap,
  heart: Heart,
  star: Star,
  languages: LanguagesIcon,
  "folder-open": FolderOpen,
  trophy: Trophy,
  award: Award,
  "book-open": BookOpen,
  lightbulb: Lightbulb,
  "user-check": UserCheck,
};

const TITLE_SIZE_CLASS: Record<SectionTitleSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl md:text-4xl",
};

function formatDate(dateString?: string): string {
  if (!dateString) return "";
  if (dateString === "Present") return "Present";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function dateRange(start?: string, end?: string) {
  const s = formatDate(start);
  const e = formatDate(end || "Present");
  if (!s && !e) return "";
  if (!s) return e;
  return `${s} - ${e}`;
}

// "Current" = no end date or explicit Present. Current roles/education always
// sort ahead of ended ones; within each bucket, date_desc uses end-date (fallback
// start-date) most-recent-first. date_asc inverts both buckets.
function isCurrent(endDate?: string): boolean {
  const v = (endDate ?? "").trim();
  return v === "" || v.toLowerCase() === "present";
}

function sortByDate<T extends { StartDate?: string; EndDate?: string }>(
  items: T[],
  order: "date_desc" | "date_asc" | "manual",
) {
  if (order === "manual") return items;
  const desc = order === "date_desc";

  return [...items].sort((a, b) => {
    const aCurrent = isCurrent(a.EndDate);
    const bCurrent = isCurrent(b.EndDate);

    // Current roles always lead, regardless of sort direction — a "present"
    // entry at the bottom of a work history looks broken either way.
    if (aCurrent && !bCurrent) return -1;
    if (!aCurrent && bCurrent) return 1;

    // Both current → order by start date.
    if (aCurrent && bCurrent) {
      const aStart = new Date(a.StartDate || "").getTime();
      const bStart = new Date(b.StartDate || "").getTime();
      if (isNaN(aStart) && isNaN(bStart)) return 0;
      if (isNaN(aStart)) return 1;
      if (isNaN(bStart)) return -1;
      return desc ? bStart - aStart : aStart - bStart;
    }

    // Both ended → order by end date, falling back to start date.
    const aEnd = new Date(a.EndDate || "").getTime();
    const bEnd = new Date(b.EndDate || "").getTime();
    if (!isNaN(aEnd) && !isNaN(bEnd) && aEnd !== bEnd) {
      return desc ? bEnd - aEnd : aEnd - bEnd;
    }
    const aStart = new Date(a.StartDate || "").getTime();
    const bStart = new Date(b.StartDate || "").getTime();
    if (isNaN(aStart) && isNaN(bStart)) return 0;
    if (isNaN(aStart)) return 1;
    if (isNaN(bStart)) return -1;
    return desc ? bStart - aStart : aStart - bStart;
  });
}

function cardClass(style: CardStyle | undefined): string {
  switch (style) {
    case "flat":
      return "border-0 shadow-none bg-muted/30";
    case "bordered":
      return "border-2 shadow-none";
    case "ghost":
      return "border-0 shadow-none bg-transparent";
    case "elevated":
    default:
      return "";
  }
}

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

// -----------------------------------------------------------------------------
// Section heading — renders per descriptor.theme.headingStyle
// -----------------------------------------------------------------------------

interface SectionHeadingProps {
  title: string;
  Icon: React.ComponentType<any>;
  theme: ThemeStyles;
  style: "underlined" | "divider" | "caps" | "plain";
  size: SectionTitleSize;
  showIcon?: boolean;
}

function SectionHeading({ title, Icon, theme, style, size, showIcon = true }: SectionHeadingProps) {
  const sizeClass = TITLE_SIZE_CLASS[size];
  const body = (
    <>
      {showIcon && (
        <div className={`w-10 h-10 ${theme.accentBgSoft} rounded-full flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${theme.accentText}`} />
        </div>
      )}
      <h2 className={`${sizeClass} font-bold ${theme.nameText} ${style === "caps" ? "uppercase tracking-widest" : ""}`}>
        {title}
      </h2>
    </>
  );

  if (style === "underlined") {
    return (
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">{body}</div>
        <div className={`border-b-2 ${theme.accentBorder}`} />
      </div>
    );
  }
  if (style === "divider") {
    return (
      <div className="mb-4 flex items-center gap-3">
        {body}
        <div className={`flex-1 border-t ${theme.accentBorder}`} />
      </div>
    );
  }
  if (style === "caps") {
    return (
      <div className="mb-4 flex items-center gap-3">{body}</div>
    );
  }
  return (
    <div className="mb-6 flex items-center gap-3">{body}</div>
  );
}

// -----------------------------------------------------------------------------
// Entry primitives
// -----------------------------------------------------------------------------

interface TimelineItemProps {
  title: string;
  subtitle: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  highlights?: string[];
  icon: React.ComponentType<any>;
  isLast?: boolean;
  theme: ThemeStyles;
}

function TimelineItem({
  title,
  subtitle,
  startDate,
  endDate,
  description,
  highlights,
  icon: Icon,
  isLast,
  theme,
}: TimelineItemProps) {
  const [expanded, setExpanded] = useState(false);
  const range = dateRange(startDate, endDate);

  return (
    <div className="relative">
      {!isLast && <div className={`absolute left-6 top-12 w-0.5 h-full ${theme.accentBgSoft}`} />}
      <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className={`flex-shrink-0 w-12 h-12 ${theme.accentBgSoft} rounded-full flex items-center justify-center relative z-10`}>
          <Icon className={`w-6 h-6 ${theme.accentText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className={`${theme.accentText} font-medium`}>{subtitle}</p>
            </div>
            <div className="text-right">
              {range && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{range}</span>
                </div>
              )}
              {highlights && highlights.length > 0 && (
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
              )}
            </div>
          </div>
          {description && <p className="text-muted-foreground mt-2">{description}</p>}
          {expanded && highlights && highlights.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Key Achievements</h4>
              <ul className="space-y-2">
                {highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <div className={`w-1.5 h-1.5 ${theme.accentBorder} border rounded-full mt-2 flex-shrink-0`} />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListEntry({ title, subtitle, startDate, endDate, description, highlights, theme }: Omit<TimelineItemProps, "icon" | "isLast">) {
  const range = dateRange(startDate, endDate);
  return (
    <div className="py-3 border-b last:border-b-0">
      <div className="flex justify-between items-baseline gap-4">
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          {subtitle && <div className={`text-sm ${theme.accentText}`}>{subtitle}</div>}
        </div>
        {range && <div className="text-sm text-muted-foreground whitespace-nowrap">{range}</div>}
      </div>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      {highlights && highlights.length > 0 && (
        <ul className="list-disc list-inside text-sm mt-2 space-y-1">
          {highlights.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main renderer
// -----------------------------------------------------------------------------

export default function DeclarativeResumeRenderer({
  resume,
  descriptor,
  embedded = false,
  videoSlot,
}: DeclarativeResumeRendererProps) {
  const theme = THEMES[descriptor.theme.themeKey] ?? THEMES["hired-purple"];
  const fontFamily = FONT_FAMILY_CLASS[descriptor.theme.fontFamily] ?? FONT_FAMILY_CLASS.sans;
  const density = DENSITY_CLASS[descriptor.theme.density] ?? DENSITY_CLASS.comfortable;

  const headingProps = {
    theme,
    style: descriptor.theme.headingStyle,
    size: descriptor.theme.sectionTitleSize ?? "md",
  };

  const cardStyle = descriptor.theme.cardStyle ?? (descriptor.documentMode === "print" ? "ghost" : "elevated");

  const showIconInHeading = descriptor.documentMode === "hero";

  const rootClass = descriptor.documentMode === "print" ? `${theme.pageBg} ${theme.baseText} ${fontFamily}` : fontFamily;

  return (
    <div className={`w-full ${rootClass}`}>
      {descriptor.hero.enabled && (
        <Hero descriptor={descriptor} resume={resume} theme={theme} embedded={embedded} videoSlot={videoSlot} />
      )}

      <div
        className={
          descriptor.documentMode === "print"
            ? `max-w-[880px] mx-auto ${theme.paperBg} shadow-sm my-6 px-8 md:px-12 py-8 ${density.section}`
            : `max-w-6xl mx-auto px-6 ${embedded ? "py-6" : "py-12"} ${density.section}`
        }
      >
        {descriptor.layout.columns === 2 ? (
          <TwoColumnBody
            descriptor={descriptor}
            resume={resume}
            theme={theme}
            cardStyle={cardStyle}
            headingProps={headingProps}
            showIconInHeading={showIconInHeading}
            density={density}
          />
        ) : (
          <OneColumnBody
            descriptor={descriptor}
            resume={resume}
            theme={theme}
            cardStyle={cardStyle}
            headingProps={headingProps}
            showIconInHeading={showIconInHeading}
            density={density}
          />
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hero
// -----------------------------------------------------------------------------

function Hero({
  descriptor,
  resume,
  theme,
  embedded,
  videoSlot,
}: {
  descriptor: ResumeTemplateDescriptor;
  resume: Resume;
  theme: ThemeStyles;
  embedded: boolean;
  videoSlot?: React.ReactNode;
}) {
  // Print mode: plain centered header with name + contact line.
  if (descriptor.documentMode === "print") {
    const basics = resume.data?.Basics;
    const contactBits = [basics?.Email, basics?.Phone, basics?.Url].filter(Boolean) as string[];
    return (
      <div className={`${theme.pageBg} pt-6`}>
        <div className={`max-w-[880px] mx-auto ${theme.paperBg} shadow-sm px-8 md:px-12 pt-10 pb-6 text-center`}>
          <h1 className={`text-4xl font-bold ${theme.nameText} ${descriptor.theme.headingStyle === "caps" ? "uppercase tracking-widest" : ""}`}>
            {basics?.Name || resume.name || "Untitled Resume"}
          </h1>
          {basics?.Label && <p className={`text-lg mt-1 ${theme.accentText}`}>{basics.Label}</p>}
          {contactBits.length > 0 && (
            <p className="text-sm text-muted-foreground mt-3">{contactBits.join(" · ")}</p>
          )}
          {descriptor.hero.showSummary && basics?.Summary && (
            <p className="text-sm mt-4 max-w-2xl mx-auto">{basics.Summary}</p>
          )}
        </div>
      </div>
    );
  }

  // Hero mode: gradient header with avatar, contact buttons, and optional video.
  const basics = resume.data?.Basics;
  const heroClass = embedded ? "bg-card border-b" : `relative ${theme.heroGradient} ${theme.heroForeground}`;
  const btnClass = embedded ? "" : "bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30";

  const heroContent = (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {descriptor.hero.showAvatar && (
          <Avatar className={`w-20 h-20 ${embedded ? "" : "border-4 border-white/30"}`}>
            <AvatarImage src={basics?.Image || ""} />
            <AvatarFallback className={`text-2xl ${embedded ? "" : "bg-white/20"}`}>
              {basics?.Name?.split(" ").map((n) => n[0]).join("") || "??"}
            </AvatarFallback>
          </Avatar>
        )}
        <div>
          <h1 className="text-4xl font-bold">{basics?.Name || resume.name || "Untitled Resume"}</h1>
          <p className={`text-xl ${embedded ? "text-muted-foreground" : "opacity-90"}`}>{basics?.Label || ""}</p>
        </div>
      </div>
      {descriptor.hero.showContactButtons && (
        <div className="flex flex-wrap gap-3">
          {basics?.Email && (
            <Button variant="secondary" size="sm" className={btnClass} onClick={() => window.open(`mailto:${basics.Email}`)}>
              <Mail className="w-4 h-4 mr-2" />Email
            </Button>
          )}
          {basics?.Phone && (
            <Button variant="secondary" size="sm" className={btnClass} onClick={() => window.open(`tel:${basics.Phone}`)}>
              <Phone className="w-4 h-4 mr-2" />Call
            </Button>
          )}
          {basics?.Url && (
            <Button variant="secondary" size="sm" className={btnClass} onClick={() => window.open(basics.Url, "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" />Portfolio
            </Button>
          )}
        </div>
      )}
      {descriptor.hero.showSummary && basics?.Summary && (
        <p className={`text-lg leading-relaxed ${embedded ? "" : "opacity-95"}`}>{basics.Summary}</p>
      )}
    </div>
  );

  if (descriptor.hero.layout === "compact") {
    return (
      <div className={heroClass}>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-4">
          {descriptor.hero.showAvatar && (
            <Avatar className="w-16 h-16">
              <AvatarImage src={basics?.Image || ""} />
              <AvatarFallback>{basics?.Name?.split(" ").map((n) => n[0]).join("") || "??"}</AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{basics?.Name || resume.name}</h1>
            <p className="text-sm opacity-80">{basics?.Label || ""}</p>
          </div>
          {basics?.Email && <Badge variant="secondary">{basics.Email}</Badge>}
        </div>
      </div>
    );
  }

  return (
    <div className={heroClass}>
      {!embedded && <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-10" />}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {descriptor.hero.layout === "split" ? (
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {heroContent}
            {descriptor.hero.showVideo && videoSlot ? <div>{videoSlot}</div> : null}
          </div>
        ) : (
          <div className="space-y-6">
            {heroContent}
            {descriptor.hero.showVideo && videoSlot ? <div>{videoSlot}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Body layouts (1-col vs 2-col)
// -----------------------------------------------------------------------------

interface BodyProps {
  descriptor: ResumeTemplateDescriptor;
  resume: Resume;
  theme: ThemeStyles;
  cardStyle: CardStyle;
  headingProps: { theme: ThemeStyles; style: "underlined" | "divider" | "caps" | "plain"; size: SectionTitleSize };
  showIconInHeading: boolean;
  density: { section: string; entry: string };
}

function OneColumnBody(props: BodyProps) {
  return (
    <>
      {props.descriptor.sections
        .filter((b) => b.enabled)
        .map((block) => (
          <BlockRenderer key={blockId(block)} block={block} {...props} />
        ))}
    </>
  );
}

function TwoColumnBody(props: BodyProps) {
  const sidebarIds = new Set(props.descriptor.layout.sidebar ?? []);
  const enabled = props.descriptor.sections.filter((b) => b.enabled);
  const sidebarBlocks = enabled.filter((b) => sidebarIds.has(blockId(b)));
  const mainBlocks = enabled.filter((b) => !sidebarIds.has(blockId(b)));

  return (
    <div className="grid md:grid-cols-[1fr_2fr] gap-8">
      <aside className={props.density.section}>
        {sidebarBlocks.map((block) => (
          <BlockRenderer key={blockId(block)} block={block} {...props} />
        ))}
      </aside>
      <main className={props.density.section}>
        {mainBlocks.map((block) => (
          <BlockRenderer key={blockId(block)} block={block} {...props} />
        ))}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section renderer
// -----------------------------------------------------------------------------

interface BlockRendererProps extends BodyProps {
  block: ResumeBlock;
}

function BlockRenderer({ block, descriptor, resume, theme, cardStyle, headingProps, showIconInHeading, density }: BlockRendererProps) {
  // Component block — render the registered widget, optionally under a heading.
  if (block.kind === "component") {
    const render = COMPONENT_REGISTRY[block.component];
    if (!render) return null;
    const body = render({ resume, props: block.props });
    if (!body) return null;
    if (!block.title) return <section>{body}</section>;
    const Icon = ICONS[block.icon ?? "star"] ?? Star;
    const heading = <SectionHeading title={block.title} Icon={Icon} {...headingProps} showIcon={showIconInHeading} />;
    return <section>{heading}{body}</section>;
  }

  // Section block — data-backed slice of the resume.
  const Icon = ICONS[block.icon ?? "star"] ?? Star;
  const title = block.title ?? block.key;
  const sectionBody = renderSectionBody(block.key, block, resume.data, theme, density);
  if (!sectionBody) return null;

  const heading = (
    <SectionHeading title={title} Icon={Icon} {...headingProps} showIcon={showIconInHeading} />
  );

  if (descriptor.documentMode === "print") {
    return (
      <section>
        {heading}
        {sectionBody}
      </section>
    );
  }

  return (
    <section>
      {heading}
      <Card className={cardClass(cardStyle)}>
        <CardContent className="p-6">{sectionBody}</CardContent>
      </Card>
    </section>
  );
}

function renderSectionBody(
  key: ResumeSectionKey,
  section: import("@/types/resume-template").SectionBlock,
  data: Resume["data"],
  theme: ThemeStyles,
  density: { section: string; entry: string },
): React.ReactNode {
  const layout = section.layout;

  switch (key) {
    case "work": {
      const items = data.Work ?? [];
      if (items.length === 0) return null;
      const sorted = sortByDate(items, section.sortBy ?? "date_desc");
      if (layout === "timeline") {
        return (
          <div className={density.entry}>
            {sorted.map((w, idx) => (
              <TimelineItem
                key={idx}
                title={w.Position || ""}
                subtitle={w.Name || ""}
                startDate={w.StartDate}
                endDate={w.EndDate || "Present"}
                description={w.Summary}
                highlights={section.showHighlights ? w.Highlights : undefined}
                icon={Building}
                isLast={idx === sorted.length - 1}
                theme={theme}
              />
            ))}
          </div>
        );
      }
      return (
        <div>
          {sorted.map((w, idx) => (
            <ListEntry
              key={idx}
              title={w.Position || ""}
              subtitle={w.Name || ""}
              startDate={w.StartDate}
              endDate={w.EndDate || "Present"}
              description={w.Summary}
              highlights={section.showHighlights ? w.Highlights : undefined}
              theme={theme}
            />
          ))}
        </div>
      );
    }
    case "education": {
      const items = data.Education ?? [];
      if (items.length === 0) return null;
      const sorted = sortByDate(items, section.sortBy ?? "date_desc");
      if (layout === "timeline") {
        return (
          <div className={density.entry}>
            {sorted.map((e, idx) => (
              <TimelineItem
                key={idx}
                title={`${e.StudyType || ""} ${e.Area ? "in " + e.Area : ""}`.trim()}
                subtitle={e.Institution || ""}
                startDate={e.StartDate}
                endDate={e.EndDate}
                description={e.Score ? `GPA: ${e.Score}` : undefined}
                icon={GraduationCap}
                isLast={idx === sorted.length - 1}
                theme={theme}
              />
            ))}
          </div>
        );
      }
      return (
        <div>
          {sorted.map((e, idx) => (
            <ListEntry
              key={idx}
              title={`${e.StudyType || ""} ${e.Area ? "in " + e.Area : ""}`.trim()}
              subtitle={e.Institution || ""}
              startDate={e.StartDate}
              endDate={e.EndDate}
              description={e.Score ? `GPA: ${e.Score}` : undefined}
              theme={theme}
            />
          ))}
        </div>
      );
    }
    case "volunteer": {
      const items = data.Volunteer ?? [];
      if (items.length === 0) return null;
      const sorted = sortByDate(items, section.sortBy ?? "date_desc");
      if (layout === "timeline") {
        return (
          <div className={density.entry}>
            {sorted.map((v, idx) => (
              <TimelineItem
                key={idx}
                title={v.Position || ""}
                subtitle={v.Organization || ""}
                startDate={v.StartDate}
                endDate={v.EndDate || "Present"}
                description={v.Summary}
                highlights={section.showHighlights ? v.Highlights ?? undefined : undefined}
                icon={Heart}
                isLast={idx === sorted.length - 1}
                theme={theme}
              />
            ))}
          </div>
        );
      }
      return (
        <div>
          {sorted.map((v, idx) => (
            <ListEntry
              key={idx}
              title={v.Position || ""}
              subtitle={v.Organization || ""}
              startDate={v.StartDate}
              endDate={v.EndDate || "Present"}
              description={v.Summary}
              highlights={section.showHighlights ? v.Highlights ?? undefined : undefined}
              theme={theme}
            />
          ))}
        </div>
      );
    }
    case "skills": {
      const items = data.Skills ?? [];
      if (items.length === 0) return null;
      if (layout === "grid") {
        return (
          <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
            {items.map((skill, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <h3 className="font-semibold mb-1">{skill.Name}</h3>
                {skill.Level && <p className="text-xs text-muted-foreground mb-1">{skill.Level}</p>}
                {skill.Keywords && skill.Keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.Keywords.map((kw, ki) => (
                      <span key={ki} className={`px-2 py-0.5 ${theme.accentBgSoft} ${theme.accentText} text-xs rounded`}>{kw}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      }
      // list / compact
      return (
        <ul className="space-y-2 text-sm">
          {items.map((skill, idx) => (
            <li key={idx} className="flex flex-wrap gap-2 items-baseline">
              <span className="font-semibold">{skill.Name}</span>
              {skill.Level && <span className="text-xs text-muted-foreground">· {skill.Level}</span>}
              {skill.Keywords && skill.Keywords.length > 0 && (
                <span className="text-muted-foreground">· {skill.Keywords.join(", ")}</span>
              )}
            </li>
          ))}
        </ul>
      );
    }
    case "languages": {
      const items = data.Languages ?? [];
      if (items.length === 0) return null;
      if (layout === "grid") {
        return (
          <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
            {items.map((lang, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <h3 className="font-semibold">{lang.Language}</h3>
                {lang.Fluency && <p className="text-sm text-muted-foreground">{lang.Fluency}</p>}
              </div>
            ))}
          </div>
        );
      }
      return (
        <ul className="space-y-1 text-sm">
          {items.map((l, i) => (
            <li key={i}>
              <span className="font-semibold">{l.Language}</span>
              {l.Fluency && <span className="text-muted-foreground"> · {l.Fluency}</span>}
            </li>
          ))}
        </ul>
      );
    }
    case "projects": {
      const items = data.Projects ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-4">
          {items.map((p, idx) => (
            <div key={idx} className="border-b pb-4 last:border-b-0 last:pb-0">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold">{p.Name}</h3>
                {p.Url && (
                  <a href={p.Url} target="_blank" rel="noopener noreferrer" className={`${theme.accentText} hover:underline flex items-center gap-1`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              {(p.StartDate || p.EndDate) && <p className="text-xs text-muted-foreground mb-1">{p.StartDate} - {p.EndDate || "Present"}</p>}
              {p.Entity && <p className="text-xs text-muted-foreground mb-1">{p.Entity}</p>}
              {p.Description && <p className="text-sm mb-2">{p.Description}</p>}
              {p.Highlights && p.Highlights.length > 0 && (
                <ul className="list-disc list-inside text-sm mb-2 space-y-1">
                  {p.Highlights.map((h, hi) => <li key={hi}>{h}</li>)}
                </ul>
              )}
              {p.Keywords && p.Keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.Keywords.map((k, ki) => (
                    <span key={ki} className={`px-2 py-0.5 ${theme.accentBgSoft} ${theme.accentText} text-xs rounded`}>{k}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "awards": {
      const items = data.Awards ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-3">
          {items.map((a, idx) => (
            <div key={idx} className="border-b pb-3 last:border-b-0 last:pb-0">
              <h3 className="font-semibold">{a.Title}</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
                {a.Awarder && <span>{a.Awarder}</span>}
                {a.Date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.Date}</span>}
              </div>
              {a.Summary && <p className="text-sm">{a.Summary}</p>}
            </div>
          ))}
        </div>
      );
    }
    case "certificates": {
      const items = data.Certificates ?? [];
      if (items.length === 0) return null;
      return (
        <ul className="space-y-2 text-sm">
          {items.map((c, idx) => (
            <li key={idx} className="flex justify-between gap-4">
              <div>
                <span className="font-semibold">{c.Name}</span>
                {c.Issuer && <span className="text-muted-foreground"> · {c.Issuer}</span>}
              </div>
              {c.Date && <span className="text-xs text-muted-foreground whitespace-nowrap">{c.Date}</span>}
            </li>
          ))}
        </ul>
      );
    }
    case "publications": {
      const items = data.Publications ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-3 text-sm">
          {items.map((p, idx) => (
            <div key={idx} className="border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex justify-between gap-4">
                <span className="font-semibold">{p.Name}</span>
                {p.ReleaseDate && <span className="text-xs text-muted-foreground whitespace-nowrap">{p.ReleaseDate}</span>}
              </div>
              {p.Publisher && <p className="text-xs text-muted-foreground">{p.Publisher}</p>}
              {p.Summary && <p className="mt-1">{p.Summary}</p>}
            </div>
          ))}
        </div>
      );
    }
    case "interests": {
      const items = data.Interests ?? [];
      if (items.length === 0) return null;
      if (layout === "grid") {
        return (
          <div className={`grid gap-3 ${gridColsClass(section.columns)}`}>
            {items.map((i, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <h3 className="font-semibold mb-1">{i.Name}</h3>
                {i.Keywords && i.Keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {i.Keywords.map((kw, ki) => (
                      <span key={ki} className={`px-2 py-0.5 ${theme.accentBgSoft} ${theme.accentText} text-xs rounded`}>{kw}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      }
      return (
        <ul className="text-sm space-y-1">
          {items.map((i, idx) => (
            <li key={idx}>
              <span className="font-semibold">{i.Name}</span>
              {i.Keywords && i.Keywords.length > 0 && <span className="text-muted-foreground"> — {i.Keywords.join(", ")}</span>}
            </li>
          ))}
        </ul>
      );
    }
    case "references": {
      const items = data.References ?? [];
      if (items.length === 0) return null;
      return (
        <div className="space-y-3 text-sm">
          {items.map((r, idx) => (
            <div key={idx} className="border-b pb-3 last:border-b-0 last:pb-0">
              <div className="font-semibold">{r.Name}</div>
              {r.Reference && <p className="text-muted-foreground">{r.Reference}</p>}
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}
