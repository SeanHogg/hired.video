/**
 * What a studio template stores — pure helpers, no I/O.
 *
 * A studio template is a reusable snapshot of a studio project in the
 * generic `video_script` payload column, for EVERY media kind:
 *   • video-style kinds  → the VideoScript, user-specific fields stripped;
 *   • `document`         → the content-stripped DocumentState (a résumé /
 *                          job / article / blog design). Its `entityKind`
 *                          becomes the row's `document_kind`, so a résumé
 *                          template is simply document_kind = 'resume'.
 *
 * Split out of StudioTemplatesService so the service keeps the workflow and
 * these stay unit-testable on their own.
 */

import { documentEntityKindOf, type DocumentEntityKind } from "../../../../shared/document-entity-kinds.js";
import { stripResumeDocumentForTemplate } from "../../../../shared/resume-template-snapshot.js";

/** Everything a template row derives from its source payload. */
export interface TemplateSnapshot {
  videoScript: Record<string, unknown>;
  documentKind: DocumentEntityKind | null;
  durationSec: number | null;
  motion: string | null;
  language: string | null;
}

/** Build the stored snapshot for a source project of `mediaKind`. Documents
 *  keep their DocumentState (content-stripped) and name their document kind;
 *  every other kind keeps its stripped VideoScript + catalog metadata.
 *
 *  THE one place the strip is chosen: a résumé document — from a studio
 *  project or the career kit alike — always takes the strict allow-list
 *  strip (resumeTemplateSnapshot), so a headshot or contact detail is never
 *  published; other document kinds keep the structural strip. */
export function templateSnapshotFor(mediaKind: string, source: unknown): TemplateSnapshot {
  if (mediaKind === "document") {
    if (documentEntityKindOf(source) === "resume") return resumeTemplateSnapshot(source);
    const videoScript = sanitiseDocumentForTemplate(source);
    // Catalog metadata is video-shaped; documents have no duration/motion.
    return {
      videoScript,
      documentKind: documentEntityKindOf(videoScript),
      durationSec: null,
      motion: null,
      language: null,
    };
  }
  const videoScript = sanitiseScriptForTemplate(source);
  return { videoScript, documentKind: null, ...extractScriptMeta(videoScript) };
}

/** The snapshot of a résumé's OWN design (published from the career kit):
 *  a résumé document with every personal value removed — the allow-list
 *  strip in shared/resume-template-snapshot.ts (names, contact details,
 *  work text, photos and links never survive; layout, theme and section
 *  structure do). Always document_kind 'resume'. */
export function resumeTemplateSnapshot(design: unknown): TemplateSnapshot {
  return {
    videoScript: stripResumeDocumentForTemplate(design),
    documentKind: "resume",
    durationSec: null,
    motion: null,
    language: null,
  };
}

/** Strip user-specific fields from a VideoScript so the same JSON can be
 *  reused as a template. Keeps theme + scene structure + animations intact;
 *  drops resumeText-derived strings, narrator-name overlays, and any
 *  `meta.ownerName` style fields if present. */
export function sanitiseScriptForTemplate(script: unknown): Record<string, unknown> {
  if (!script || typeof script !== "object") return {};
  const cloned = JSON.parse(JSON.stringify(script)) as Record<string, unknown>;
  // Drop top-level user-identifying fields.
  delete cloned.resumeText;
  delete cloned.resumeId;
  delete cloned.ownerName;
  delete cloned.ownerEmail;
  // Scenes may carry hardcoded names in element.text — replace with
  // placeholder tokens so the template loader can substitute the new
  // user's data (scene 1 / scene 4 commonly carry the candidate's name).
  const scenes = cloned.scenes;
  if (Array.isArray(scenes)) {
    for (const scene of scenes) {
      const elements = (scene as { elements?: unknown } | null)?.elements;
      if (!Array.isArray(elements)) continue;
      for (const el of elements) {
        if (!el || typeof el !== "object") continue;
        const element = el as { role?: unknown; text?: unknown };
        if (typeof element.text !== "string") continue;
        if (element.role === "name") element.text = "{{name}}";
        if (element.role === "headline") element.text = "{{headline}}";
      }
    }
  }
  return cloned;
}

/** Strip the per-document CONTENT binding from a `DocumentState` so the
 *  same JSON is reusable as a template (a template is structure, not
 *  content — see the structure-vs-content note in document-state.ts). Keeps
 *  page geometry, theme, columns, flow-block layout and free overlays;
 *  clears the bound `entityId` and any overlay `mediaBinding` (which points
 *  at a specific resume's section items by id and must not leak into a
 *  shared template). Resilient to non-document JSON (returns a shallow
 *  clone) so a mis-routed payload never throws. */
export function sanitiseDocumentForTemplate(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object") return {};
  const cloned = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  // Unbind from the source entity — the template carries no content.
  cloned.entityId = null;
  // Drop item-bound overlay handles so a template never references the
  // original document's section-item ids.
  const pages = cloned.pages;
  if (Array.isArray(pages)) {
    for (const page of pages) {
      const overlays = (page as { overlays?: unknown } | null)?.overlays;
      if (!Array.isArray(overlays)) continue;
      for (const overlay of overlays) {
        if (overlay && typeof overlay === "object" && "mediaBinding" in overlay) {
          delete (overlay as { mediaBinding?: unknown }).mediaBinding;
        }
      }
    }
  }
  return cloned;
}

/** Pull catalog-card metadata out of the script JSON so we can show
 *  duration/motion/language on the marketplace card without parsing the
 *  whole script on every render. */
export function extractScriptMeta(script: unknown): {
  durationSec: number | null;
  motion: string | null;
  language: string | null;
} {
  if (!script || typeof script !== "object") return { durationSec: null, motion: null, language: null };
  const video = (script as { video?: { duration?: unknown; theme?: { motion?: unknown }; audio?: { language?: unknown } } })
    .video;
  return {
    durationSec: typeof video?.duration === "number" ? Math.round(video.duration) : null,
    motion: typeof video?.theme?.motion === "string" ? video.theme.motion : null,
    language: typeof video?.audio?.language === "string" ? video.audio.language : null,
  };
}

/** 8 hex chars for slug suffixes. `crypto` is a Workers global (see
 *  api/tsconfig.json types entry); the Math.random() fallback only fires in
 *  test environments that stub it. */
export function randomShortId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
