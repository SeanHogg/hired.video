/**
 * The declarative résumé renderer: a template descriptor (theme, layout,
 * section order) + résumé content → the page. Pieces: header
 * (ResumeHero.tsx), section bodies (section-bodies.tsx), entry rows
 * (entry-primitives.tsx), date helpers (resume-dates.ts), and the review
 * annotation layer (annotations.tsx) — `annotations` keyed by content path
 * mark what a merge / tailor / create-from-a-job review changes, on the page.
 * `inlineEdit` turns the page into the form (inline-edit.tsx, #1916/#2101):
 * every text field edits in place on the same columned layout.
 */
import { useState } from "react";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { COMPONENT_REGISTRY } from "@/components/resume-renderer/resume-template-components";
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
  ResumeTemplateDescriptor,
  SectionTitleSize,
} from "@/types/resume-template";
import { blockId } from "@/types/resume-template";
import SectionEditPencil from "./SectionEditPencil";
import ResumeHero from "./ResumeHero";
import { renderSectionBody } from "./section-bodies";
import { AnnotatedBlock, ResumeAnnotationsProvider, type ResumeAnnotations } from "./annotations";
import { ResumeInlineEditProvider, type ResumeInlineEdit } from "./inline-edit";
import { ICONS, SectionHeading, cardClass } from "./section-heading";

interface DeclarativeResumeRendererProps {
  resume: Resume;
  descriptor: ResumeTemplateDescriptor;
  embedded?: boolean;
  videoSlot?: React.ReactNode;
  /** Show inline edit affordances on each section heading. */
  isOwner?: boolean;
  /** Handler for the per-section pencil button. Called with the section key
   *  (for data sections) or the component id (for component blocks). */
  onEditSection?: (key: string) => void;
  /** Review annotations keyed by content path (annotations.tsx). */
  annotations?: ResumeAnnotations;
  /** Inline-edit mode: the page's text fields edit in place and each edit
   *  comes back as the whole content with only that field changed. */
  inlineEdit?: ResumeInlineEdit;
}

// -----------------------------------------------------------------------------
// Main renderer
// -----------------------------------------------------------------------------

export default function DeclarativeResumeRenderer({
  resume,
  descriptor,
  embedded = false,
  videoSlot,
  isOwner = false,
  onEditSection,
  annotations,
  inlineEdit,
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

  // A resume is a fixed paper artifact: its preview must mirror the exported
  // PDF (always light), so non-embedded documents always establish their own
  // surface (pageBg + baseText) AND a forced-light token scope. Without this,
  // hero-mode templates rendered only `fontFamily` and let their fixed-palette
  // headings fall onto the app's dark canvas → invisible black-on-dark text.
  // Embedded thumbnails intentionally blend into app-themed cards, so they opt
  // out and stay theme-adaptive.
  const rootClass = embedded
    ? fontFamily
    : `force-light-scope ${theme.pageBg} ${theme.baseText} ${fontFamily}`;

  return (
    <ResumeAnnotationsProvider value={annotations}>
    <ResumeInlineEditProvider value={inlineEdit}>
    <div data-doc-surface className={`w-full ${rootClass}`} style={descriptor.theme.fontScale ? { zoom: descriptor.theme.fontScale } : undefined}>
      {descriptor.hero.enabled && (
        <ResumeHero
          descriptor={descriptor}
          resume={resume}
          theme={theme}
          embedded={embedded}
          videoSlot={videoSlot}
          isOwner={isOwner}
          onEditSection={onEditSection}
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
          <TwoColumnBody
            descriptor={descriptor}
            resume={resume}
            theme={theme}
            cardStyle={cardStyle}
            headingProps={headingProps}
            showIconInHeading={showIconInHeading}
            density={density}
            isOwner={isOwner}
            onEditSection={onEditSection}
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
            isOwner={isOwner}
            onEditSection={onEditSection}
          />
        )}
      </div>
    </div>
    </ResumeInlineEditProvider>
    </ResumeAnnotationsProvider>
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
  isOwner: boolean;
  onEditSection?: (key: string) => void;
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
    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] print:grid-cols-[1fr_2fr] gap-8">
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

function BlockRenderer({ block, descriptor, resume, theme, cardStyle, headingProps, showIconInHeading, density, isOwner, onEditSection }: BlockRendererProps) {
  const id = blockId(block);
  const isPrint = descriptor.documentMode === "print";
  // Collapsible only in screen mode; print mode is always expanded so the
  // exported PDF includes every section.
  const [expanded, setExpanded] = useState(true);
  const collapsible = isPrint ? undefined : { expanded, onToggle: () => setExpanded((v) => !v) };

  const editAction = (
    <SectionEditPencil
      isOwner={isOwner}
      onEditSection={onEditSection}
      sectionKey={id}
      sectionName={block.title}
    />
  );

  // Component block — render the registered widget, optionally under a heading.
  if (block.kind === "component") {
    const render = COMPONENT_REGISTRY[block.component];
    if (!render) return null;
    const body = render({ resume, props: block.props });
    if (!body) return null;
    if (!block.title) return <section data-annot-section={id}>{body}</section>;
    const Icon = ICONS[block.icon ?? "star"] ?? Star;
    const heading = <SectionHeading title={block.title} Icon={Icon} {...headingProps} showIcon={showIconInHeading} action={editAction} collapsible={collapsible} />;
    return <section data-annot-section={id}>{heading}{(isPrint || expanded) && body}</section>;
  }

  // Section block — data-backed slice of the resume.
  const Icon = ICONS[block.icon ?? "star"] ?? Star;
  const title = block.title ?? block.key;
  const body = renderSectionBody(block.key, block, resume.content, theme, density);
  if (!body) return null;
  // Section-level review anchor (a card that belongs to the whole section).
  const sectionBody = <AnnotatedBlock path={block.key}>{body}</AnnotatedBlock>;

  const heading = (
    <SectionHeading title={title} Icon={Icon} {...headingProps} showIcon={showIconInHeading} action={editAction} collapsible={collapsible} />
  );

  if (isPrint) {
    return (
      <section data-annot-section={id}>
        {heading}
        {sectionBody}
      </section>
    );
  }

  return (
    <section data-annot-section={id}>
      {heading}
      {expanded && (
        <Card className={cardClass(cardStyle)}>
          <CardContent className="p-6">{sectionBody}</CardContent>
        </Card>
      )}
    </section>
  );
}

