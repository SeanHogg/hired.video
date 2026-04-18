import {
  Award,
  BookOpen,
  Building,
  Calendar,
  ChevronRight,
  Download,
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
import type { Resume } from "@/types/resume";
import type {
  CardStyle,
  ResumeTemplateDescriptor,
  SectionLayout,
  SectionTitleSize,
  TemplateIconKey,
} from "@/types/resume-template";

interface DeclarativeResumeRendererProps {
  resume: Resume;
  descriptor: ResumeTemplateDescriptor;
  embedded?: boolean;          // when true, removes hero video + outer page gradient
  videoSlot?: React.ReactNode; // host-provided video (Studio merge) — rendered when hero.showVideo
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
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
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

function sortByDate<T extends { StartDate?: string; EndDate?: string }>(items: T[], order: "date_desc" | "date_asc" | "manual") {
  if (order === "manual") return items;
  const dir = order === "date_desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const aStart = new Date(a.StartDate || "").getTime();
    const bStart = new Date(b.StartDate || "").getTime();
    if (isNaN(aStart) && isNaN(bStart)) return 0;
    if (isNaN(aStart)) return 1;
    if (isNaN(bStart)) return -1;
    return (bStart - aStart) * (dir === -1 ? 1 : -1);
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

interface TimelineItemProps {
  title: string;
  subtitle: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  highlights?: string[];
  icon: React.ComponentType<any>;
  isLast?: boolean;
  defaultExpanded?: boolean;
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
  defaultExpanded,
}: TimelineItemProps) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const range = dateRange(startDate, endDate);

  return (
    <div className="relative">
      {!isLast && <div className="absolute left-6 top-12 w-0.5 h-full bg-gradient-to-b from-primary to-primary/20" />}
      <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center relative z-10">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className="text-primary font-medium">{subtitle}</p>
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
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
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

function CompactEntry({ title, subtitle, startDate, endDate, description }: TimelineItemProps) {
  const range = dateRange(startDate, endDate);
  return (
    <div className="py-2 border-b last:border-b-0">
      <div className="flex justify-between gap-4">
        <div>
          <span className="font-semibold">{title}</span>
          {subtitle && <span className="text-primary ml-2">· {subtitle}</span>}
        </div>
        {range && <span className="text-sm text-muted-foreground whitespace-nowrap">{range}</span>}
      </div>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

interface SectionShellProps {
  title: string;
  Icon: React.ComponentType<any>;
  cardStyle?: CardStyle;
  titleSize: SectionTitleSize;
  children: React.ReactNode;
}

function SectionShell({ title, Icon, cardStyle, titleSize, children }: SectionShellProps) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h2 className={`${TITLE_SIZE_CLASS[titleSize]} font-bold`}>{title}</h2>
      </div>
      <Card className={cardClass(cardStyle)}>
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </section>
  );
}

export default function DeclarativeResumeRenderer({
  resume,
  descriptor,
  embedded = false,
  videoSlot,
}: DeclarativeResumeRendererProps) {
  const { data } = resume;
  const titleSize = descriptor.theme.sectionTitleSize ?? "xl";
  const cardStyle = descriptor.theme.cardStyle ?? "elevated";

  // Tailwind JIT can't resolve dynamic class strings, so descriptor.theme.heroGradient
  // picks a pre-baked preset rather than interpolating color tokens.
  const heroGradientKey = descriptor.theme.heroGradient?.[0] ?? "primary";
  const heroGradientClass =
    heroGradientKey === "foreground" || heroGradientKey === "muted-foreground"
      ? "bg-gradient-to-br from-foreground via-muted-foreground to-foreground text-background"
      : "bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground";
  const heroClass = embedded
    ? "bg-card border-b"
    : `relative ${heroGradientClass}`;

  return (
    <div className="w-full">
      {descriptor.hero.enabled && (
        <div className={heroClass}>
          {!embedded && <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-10" />}
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            {descriptor.hero.layout === "split" ? (
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <HeroContent descriptor={descriptor} resume={resume} embedded={embedded} />
                {descriptor.hero.showVideo && videoSlot ? <div>{videoSlot}</div> : null}
              </div>
            ) : descriptor.hero.layout === "stacked" ? (
              <div className="space-y-6">
                <HeroContent descriptor={descriptor} resume={resume} embedded={embedded} />
                {descriptor.hero.showVideo && videoSlot ? <div>{videoSlot}</div> : null}
              </div>
            ) : (
              <HeroCompact descriptor={descriptor} resume={resume} embedded={embedded} />
            )}
          </div>
        </div>
      )}

      <div className={`max-w-6xl mx-auto px-6 ${embedded ? "py-6 space-y-8" : "py-12 space-y-12"}`}>
        {descriptor.sections
          .filter((s) => s.enabled)
          .map((section) => {
            const Icon = ICONS[section.icon ?? "star"] ?? Star;
            const title = section.title ?? section.key;

            switch (section.key) {
              case "work": {
                const items = data.Work ?? [];
                if (items.length === 0) return null;
                const sorted = sortByDate(items, section.sortBy ?? "date_desc");
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {sorted.map((w, idx) =>
                        section.layout === "compact" ? (
                          <CompactEntry key={idx} title={w.Position || ""} subtitle={w.Name || ""} startDate={w.StartDate} endDate={w.EndDate || "Present"} description={w.Summary} icon={Icon} />
                        ) : (
                          <TimelineItem
                            key={idx}
                            title={w.Position || ""}
                            subtitle={w.Name || ""}
                            startDate={w.StartDate}
                            endDate={w.EndDate || "Present"}
                            description={w.Summary}
                            highlights={section.showHighlights ? w.Highlights : undefined}
                            icon={Icon}
                            isLast={idx === sorted.length - 1}
                          />
                        ),
                      )}
                    </div>
                  </SectionShell>
                );
              }
              case "education": {
                const items = data.Education ?? [];
                if (items.length === 0) return null;
                const sorted = sortByDate(items, section.sortBy ?? "date_desc");
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {sorted.map((e, idx) =>
                        section.layout === "compact" ? (
                          <CompactEntry key={idx} title={`${e.StudyType || ""} in ${e.Area || ""}`} subtitle={e.Institution || ""} startDate={e.StartDate} endDate={e.EndDate} description={e.Score ? `GPA: ${e.Score}` : undefined} icon={Icon} />
                        ) : (
                          <TimelineItem
                            key={idx}
                            title={`${e.StudyType || ""} in ${e.Area || ""}`}
                            subtitle={e.Institution || ""}
                            startDate={e.StartDate}
                            endDate={e.EndDate}
                            description={e.Score ? `GPA: ${e.Score}` : undefined}
                            icon={Icon}
                            isLast={idx === sorted.length - 1}
                          />
                        ),
                      )}
                    </div>
                  </SectionShell>
                );
              }
              case "volunteer": {
                const items = data.Volunteer ?? [];
                if (items.length === 0) return null;
                const sorted = sortByDate(items, section.sortBy ?? "date_desc");
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {sorted.map((v, idx) =>
                        section.layout === "compact" ? (
                          <CompactEntry key={idx} title={v.Position || ""} subtitle={v.Organization || ""} startDate={v.StartDate} endDate={v.EndDate || "Present"} description={v.Summary} icon={Icon} />
                        ) : (
                          <TimelineItem
                            key={idx}
                            title={v.Position || ""}
                            subtitle={v.Organization || ""}
                            startDate={v.StartDate}
                            endDate={v.EndDate || "Present"}
                            description={v.Summary}
                            highlights={section.showHighlights ? v.Highlights ?? undefined : undefined}
                            icon={Icon}
                            isLast={idx === sorted.length - 1}
                          />
                        ),
                      )}
                    </div>
                  </SectionShell>
                );
              }
              case "skills": {
                const items = data.Skills ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
                      {items.map((skill, idx) => (
                        <div key={idx} className="p-4 border rounded-lg">
                          <h3 className="font-semibold text-lg mb-2">{skill.Name}</h3>
                          {skill.Level && <p className="text-sm text-muted-foreground mb-2">Level: {skill.Level}</p>}
                          {skill.Keywords && skill.Keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {skill.Keywords.map((kw, ki) => (
                                <span key={ki} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded">{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "languages": {
                const items = data.Languages ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
                      {items.map((lang, idx) => (
                        <div key={idx} className="p-4 border rounded-lg">
                          <h3 className="font-semibold text-lg">{lang.Language}</h3>
                          {lang.Fluency && <p className="text-sm text-muted-foreground">{lang.Fluency}</p>}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "projects": {
                const items = data.Projects ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-6">
                      {items.map((p, idx) => (
                        <div key={idx} className="border-b pb-6 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">{p.Name}</h3>
                            {p.Url && (
                              <a href={p.Url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          {(p.StartDate || p.EndDate) && <p className="text-sm text-muted-foreground mb-2">{p.StartDate} - {p.EndDate || "Present"}</p>}
                          {p.Entity && <p className="text-sm text-muted-foreground mb-2">{p.Entity}</p>}
                          {p.Description && <p className="text-sm mb-3">{p.Description}</p>}
                          {p.Highlights && p.Highlights.length > 0 && (
                            <ul className="list-disc list-inside text-sm mb-3 space-y-1">
                              {p.Highlights.map((h, hi) => <li key={hi}>{h}</li>)}
                            </ul>
                          )}
                          {p.Keywords && p.Keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {p.Keywords.map((k, ki) => (
                                <span key={ki} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded">{k}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "awards": {
                const items = data.Awards ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {items.map((a, idx) => (
                        <div key={idx} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <h3 className="font-semibold text-lg">{a.Title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            {a.Awarder && <span>{a.Awarder}</span>}
                            {a.Date && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{a.Date}</span>}
                          </div>
                          {a.Summary && <p className="text-sm">{a.Summary}</p>}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "certificates": {
                const items = data.Certificates ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {items.map((c, idx) => (
                        <div key={idx} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">{c.Name}</h3>
                            {c.Url && (
                              <a href={c.Url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {c.Issuer && <span>{c.Issuer}</span>}
                            {c.Date && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{c.Date}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "publications": {
                const items = data.Publications ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {items.map((p, idx) => (
                        <div key={idx} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">{p.Name}</h3>
                            {p.Url && (
                              <a href={p.Url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            {p.Publisher && <span>{p.Publisher}</span>}
                            {p.ReleaseDate && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{p.ReleaseDate}</span>}
                          </div>
                          {p.Summary && <p className="text-sm">{p.Summary}</p>}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "interests": {
                const items = data.Interests ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className={`grid gap-4 ${gridColsClass(section.columns)}`}>
                      {items.map((i, idx) => (
                        <div key={idx} className="p-4 border rounded-lg">
                          <h3 className="font-semibold text-lg mb-2">{i.Name}</h3>
                          {i.Keywords && i.Keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {i.Keywords.map((kw, ki) => (
                                <span key={ki} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded">{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              case "references": {
                const items = data.References ?? [];
                if (items.length === 0) return null;
                return (
                  <SectionShell key={section.key} title={title} Icon={Icon} cardStyle={cardStyle} titleSize={titleSize}>
                    <div className="space-y-4">
                      {items.map((r, idx) => (
                        <div key={idx} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <h3 className="font-semibold text-lg">{r.Name}</h3>
                          {r.Reference && <p className="text-sm text-muted-foreground">{r.Reference}</p>}
                        </div>
                      ))}
                    </div>
                  </SectionShell>
                );
              }
              default:
                return null;
            }
          })}
      </div>
    </div>
  );
}

function HeroContent({ descriptor, resume, embedded }: { descriptor: ResumeTemplateDescriptor; resume: Resume; embedded: boolean }) {
  const basics = resume.data?.Basics;
  const nameColor = embedded ? "" : "text-primary-foreground";
  const btnClass = embedded
    ? ""
    : "bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30";

  return (
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
          <h1 className={`text-4xl font-bold ${nameColor}`}>{basics?.Name || resume.name || "Untitled Resume"}</h1>
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
          <Button variant="secondary" size="sm" className={btnClass}>
            <Download className="w-4 h-4 mr-2" />Download PDF
          </Button>
        </div>
      )}

      {descriptor.hero.showSummary && basics?.Summary && (
        <p className={`text-lg leading-relaxed ${embedded ? "" : "opacity-95"}`}>{basics.Summary}</p>
      )}
    </div>
  );
}

function HeroCompact({ descriptor, resume, embedded }: { descriptor: ResumeTemplateDescriptor; resume: Resume; embedded: boolean }) {
  const basics = resume.data?.Basics;
  return (
    <div className={`flex items-center gap-4 ${embedded ? "" : "text-primary-foreground"}`}>
      {descriptor.hero.showAvatar && (
        <Avatar className="w-16 h-16">
          <AvatarImage src={basics?.Image || ""} />
          <AvatarFallback>{basics?.Name?.split(" ").map((n) => n[0]).join("") || "??"}</AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1">
        <h1 className="text-2xl font-bold">{basics?.Name || resume.name}</h1>
        <p className="text-sm opacity-80">{basics?.Label || ""}</p>
        {descriptor.hero.showSummary && basics?.Summary && (
          <p className="text-sm mt-2 line-clamp-2 opacity-90">{basics.Summary}</p>
        )}
      </div>
      {descriptor.hero.showContactButtons && (
        <div className="flex gap-2">
          {basics?.Email && <Badge variant="secondary">{basics.Email}</Badge>}
        </div>
      )}
    </div>
  );
}
