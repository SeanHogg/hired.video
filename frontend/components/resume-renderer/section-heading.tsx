/**
 * Section chrome of the declarative résumé renderer: the heading (per
 * `descriptor.theme.headingStyle`, optionally collapsible, with an action
 * slot), the whitelisted section icons and the card style classes. Split
 * from DeclarativeResumeRenderer.tsx.
 */
import {
  Award,
  BookOpen,
  Building,
  ChevronRight,
  FolderOpen,
  GraduationCap,
  Heart,
  Languages as LanguagesIcon,
  Lightbulb,
  Star,
  Trophy,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { ThemeStyles } from "@/lib/resume-template-themes";
import type { CardStyle, SectionTitleSize, TemplateIconKey } from "@/types/resume-template";

export const ICONS: Record<TemplateIconKey, LucideIcon> = {
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


export function cardClass(style: CardStyle | undefined): string {
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


// -----------------------------------------------------------------------------
// Section heading — renders per descriptor.theme.headingStyle
// -----------------------------------------------------------------------------

export interface SectionHeadingProps {
  title: string;
  Icon: LucideIcon;
  theme: ThemeStyles;
  style: "underlined" | "divider" | "caps" | "plain";
  size: SectionTitleSize;
  showIcon?: boolean;
  /** Optional trailing slot — e.g. an edit pencil for owners. */
  action?: React.ReactNode;
  /** When set, the heading becomes a button that toggles section visibility.
   *  The chevron rotates 90° when expanded (open). */
  collapsible?: { expanded: boolean; onToggle: () => void };
  /** Space under a "plain" heading: résumés breathe (`relaxed`, mb-6),
   *  job pages sit tighter (`tight`, mb-4) — each keeps its own rhythm. */
  plainSpacing?: "relaxed" | "tight";
}

export function SectionHeading({ title, Icon, theme, style, size, showIcon = true, action, collapsible, plainSpacing = "relaxed" }: SectionHeadingProps) {
  const sizeClass = TITLE_SIZE_CLASS[size];

  // The chevron + icon + title cluster. When `collapsible` is provided, we
  // wrap this in a button so the whole row toggles the section. Action slot
  // (e.g. edit pencil) stays outside the button so its click doesn't bubble.
  const titleCluster = (
    <>
      {collapsible && (
        <ChevronRight
          className={`w-4 h-4 shrink-0 transition-transform ${theme.accentText} ${collapsible.expanded ? "rotate-90" : ""}`}
        />
      )}
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

  const body = collapsible ? (
    <button
      type="button"
      onClick={collapsible.onToggle}
      aria-expanded={collapsible.expanded}
      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      {titleCluster}
    </button>
  ) : (
    <>{titleCluster}</>
  );

  if (style === "underlined") {
    return (
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          {body}
          {action && <div className="ml-auto">{action}</div>}
        </div>
        <div className={`border-b-2 ${theme.accentBorder}`} />
      </div>
    );
  }
  if (style === "divider") {
    return (
      <div className="mb-4 flex items-center gap-3">
        {body}
        <div className={`flex-1 border-t ${theme.accentBorder}`} />
        {action}
      </div>
    );
  }
  if (style === "caps") {
    return (
      <div className="mb-4 flex items-center gap-3">
        {body}
        {action && <div className="ml-auto">{action}</div>}
      </div>
    );
  }
  return (
    <div className={`${plainSpacing === "tight" ? "mb-4" : "mb-6"} flex items-center gap-3`}>
      {body}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
