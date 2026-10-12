/**
 * The career kit's CURRENT design as a résumé DocumentState — the payload a
 * "Save design as template" publishes (the API strips it again with
 * shared/resume-template-snapshot.ts, so nothing personal is stored).
 *
 * The inverse of descriptorFromResumeDocument: what renders is a
 * `ResumeTemplateDescriptor` (a built-in template with the picked structure
 * and look over it). As a document it is
 *   templateId  the built-in template it starts from
 *   theme       palette / font / heading / density / card style / text size
 *   pageSize    the paper (Letter / A4)
 *   blocks      the header when shown + the enabled sections, in order
 * so wearing the template (resumeTemplateDesign → withDocumentLayout →
 * resolveResumeDescriptor) renders the same design. A résumé still showing
 * its OWN studio layout publishes that layout as is (free elements and all).
 *
 * Pure.
 */
import type { ResumeContent } from "@shared/resume";
import type { ResumeBlock, ResumeTemplateDescriptor } from "@/types/resume-template";
import {
  DOCUMENT_STATE_VERSION,
  type DocumentBlock,
  type DocumentState,
} from "@/lib/studio/editor-v2/document-state";
import { savedLayout } from "@/lib/resume-design";
import { resumePaper } from "@/lib/build/resume-style";

const FREE_KINDS = ["text", "image", "divider", "spacer"] as const;

function documentBlock(block: ResumeBlock, index: number): DocumentBlock {
  // A free block a résumé document carried (resume-document-descriptor.ts)
  // goes back to the free block it was.
  const free = block.kind === "component" && block.component === "document-block" ? block.props ?? {} : null;
  const freeKind = free ? FREE_KINDS.find((k) => k === free.kind) : undefined;
  if (free && freeKind) {
    return {
      id: block.kind === "component" && block.id ? block.id : `b-free-${index}`,
      kind: freeKind,
      ...(typeof free.text === "string" ? { text: free.text } : {}),
      ...(typeof free.imageUrl === "string" ? { imageUrl: free.imageUrl } : {}),
      mode: "flow",
    };
  }
  if (block.kind === "component") {
    return {
      id: `b-${block.id ?? block.component}-${index}`,
      kind: "component",
      component: block.component,
      ...(block.title ? { title: block.title } : {}),
      mode: "flow",
    };
  }
  return {
    id: `b-${block.key}-${index}`,
    kind: "section",
    sectionKey: block.key,
    ...(block.title ? { title: block.title } : {}),
    layout: block.layout,
    ...(block.columns ? { columns: block.columns } : {}),
    ...(block.showHighlights ? { showHighlights: true } : {}),
    ...(block.showMedia ? { showMedia: true } : {}),
    ...(block.sortBy ? { sortBy: block.sortBy } : {}),
    mode: "flow",
  };
}

/** A rendered résumé design as a content-free résumé document. */
export function documentFromDescriptor(descriptor: ResumeTemplateDescriptor): DocumentState {
  const { theme } = descriptor;
  const header: DocumentBlock[] = descriptor.hero.enabled
    ? [{ id: "b-basics", kind: "section", sectionKey: "basics", title: "Header", layout: "compact", mode: "flow" }]
    : [];
  return {
    schemaVersion: DOCUMENT_STATE_VERSION,
    pageSize: resumePaper(descriptor),
    orientation: "portrait",
    columns: 12,
    theme: {
      themeKey: theme.themeKey,
      fontFamily: theme.fontFamily,
      headingStyle: theme.headingStyle,
      density: theme.density,
      ...(theme.cardStyle ? { cardStyle: theme.cardStyle } : {}),
      ...(theme.fontScale !== undefined && theme.fontScale !== 1 ? { fontScale: theme.fontScale } : {}),
    },
    templateId: descriptor.id,
    pages: [
      {
        id: "page-1",
        blocks: [...header, ...descriptor.sections.filter((b) => b.enabled).map(documentBlock)],
        overlays: [],
      },
    ],
    entityKind: "resume",
    entityId: null,
  };
}

/** What the kit publishes: its own studio layout while it still shows one,
 *  else the design on screen. */
export function kitDesignDocument(
  content: ResumeContent | null,
  descriptor: ResumeTemplateDescriptor,
  usingSavedDesign: boolean,
): DocumentState {
  const layout = usingSavedDesign ? savedLayout(content) : null;
  return layout ?? documentFromDescriptor(descriptor);
}
