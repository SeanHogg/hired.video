/**
 * Template kind labels — what a studio template MAKES, as an i18n key.
 *
 * A template is a `studio_templates` row: `media_kind` says the output axis
 * (video, podcast, document…) and, for documents, `document_kind` says which
 * document (résumé, job, article, blog — shared/document-entity-kinds.ts).
 * Every surface that labels a template's kind (the marketplace / search
 * template card, the studio kind badge, the kind-filtered empty states)
 * resolves its label through `templateKindLabelKey` so the copy lives in
 * ONE place: the `templateKind.*` keys in frontend/public/locales/*.json.
 *
 * Pure leaf module — only imports the two sibling kind registries.
 */

import { MEDIA_KINDS, type MediaKind } from "./media-kinds.js";
import { isDocumentEntityKind, type DocumentEntityKind } from "./document-entity-kinds.js";

/** Label key per media kind (the output axis). */
export const MEDIA_KIND_LABEL_KEYS: Record<MediaKind, string> = {
  video: "templateKind.media.video",
  podcast: "templateKind.media.podcast",
  voice: "templateKind.media.voice",
  animation: "templateKind.media.animation",
  game: "templateKind.media.game",
  comic: "templateKind.media.comic",
  interactive_comic: "templateKind.media.interactive_comic",
  image: "templateKind.media.image",
  cad: "templateKind.media.cad",
  cad_3d: "templateKind.media.cad_3d",
  document: "templateKind.media.document",
};

/** Label key per document kind — wins over the generic "Document" label. */
export const DOCUMENT_KIND_LABEL_KEYS: Record<DocumentEntityKind, string> = {
  resume: "templateKind.document.resume",
  article: "templateKind.document.article",
  job: "templateKind.document.job",
  blog: "templateKind.document.blog",
  company: "templateKind.document.company",
};

/** Fallback for a row whose media kind this build doesn't know yet. */
export const GENERIC_TEMPLATE_KIND_LABEL_KEY = "templateKind.generic";

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && (MEDIA_KINDS as readonly string[]).includes(value);
}

/** i18n key for a media kind's short label ("Video", "Podcast"…). */
export function mediaKindLabelKey(mediaKind: MediaKind): string {
  return MEDIA_KIND_LABEL_KEYS[mediaKind];
}

/**
 * i18n key for a template's kind label.
 *   - document + known document kind → that document's label ("Résumé")
 *   - any known media kind            → the media label ("Video", "Document")
 *   - unknown / missing media kind    → the generic "Template" label
 * Accepts loose strings because API payloads are not narrowed yet.
 */
export function templateKindLabelKey(
  mediaKind: string | null | undefined,
  documentKind?: string | null,
): string {
  if (!isMediaKind(mediaKind)) return GENERIC_TEMPLATE_KIND_LABEL_KEY;
  if (mediaKind === "document" && isDocumentEntityKind(documentKind)) {
    return DOCUMENT_KIND_LABEL_KEYS[documentKind];
  }
  return MEDIA_KIND_LABEL_KEYS[mediaKind];
}
