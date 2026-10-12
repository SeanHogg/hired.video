// The Articles panel's details form state (split from ArticlesManagerPanel):
// every field of a piece, reset for a new draft or hydrated from a saved
// one (including its geo + Resource-Map audience tags, best-effort), the
// save payload, and the tag write-back after a save.

import { useState } from "react";
import type { Article, ArticleKind } from "@/lib/services/article-service";
import { locationsService, type ContentLocationSet } from "@/lib/services/locations-service";
import { contentAudiencesService } from "@/lib/services/content-audiences-service";
import type { AudienceKey } from "@shared/audiences";
import { ARTICLE_AUDIENCES, type ArticleAudience, type Sector, isValidSector } from "@shared/sectors";

const NO_LOCATIONS: ContentLocationSet = { origin: null, serves: [] };


export function useArticleDetailsForm() {
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  // Tiptap JSON kept in lockstep with bodyMd via ArticleEditor's onChange.
  // Null on a fresh draft + on legacy rows that pre-date WYSIWYG wiring.
  const [bodyJson, setBodyJson] = useState<unknown | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [kind, setKind] = useState<ArticleKind>("article");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  // Sector + audience taxonomy (migration 0112). Both optional — articles
  // not bound to a vertical (general career advice) stay null.
  const [sector, setSector] = useState<Sector | null>(null);
  const [audience, setAudience] = useState<ArticleAudience | "">("");
  // Resource-Map audience tags (#1644) — multi-select across both
  // taxonomies, distinct from the legacy single-value `audience` above.
  // Persisted via content_audiences so the article surfaces on the
  // matching /for/[audience] Resource Maps.
  const [audienceTags, setAudienceTags] = useState<AudienceKey[]>([]);
  // Structured geo tags (gap #1138). Hydrated from the server on edit
  // open; persisted via locationsService.setForEntity after the article
  // save resolves. Optional — articles can be country-wide / global.
  const [locations, setLocations] = useState<ContentLocationSet>(NO_LOCATIONS);

  /** A fresh draft. */
  const reset = () => {
    setTitle("");
    setBodyMd("");
    setBodyJson(null);
    setWordCount(0);
    setKind("article");
    setCategory("");
    setTagsInput("");
    setCoverImageUrl("");
    setSector(null);
    setAudience("");
    setAudienceTags([]);
    setLocations(NO_LOCATIONS);
  };

  /** Open a saved piece; its tags hydrate in the background (a failure
   *  just opens with empty pickers — the creator can re-pick on re-save). */
  const load = (a: Article) => {
    setTitle(a.title);
    setBodyMd(a.bodyMd);
    setBodyJson(a.bodyJson ?? null);
    setWordCount(a.bodyMd.trim().split(/\s+/).filter(Boolean).length);
    setKind(a.kind);
    setCategory(a.category ?? "");
    setTagsInput((a.tags ?? []).join(", "));
    setCoverImageUrl(a.coverImageUrl ?? "");
    setSector(isValidSector(a.sector) ? a.sector : null);
    setAudience(a.audience && (ARTICLE_AUDIENCES as readonly string[]).includes(a.audience) ? (a.audience as ArticleAudience) : "");
    void locationsService
      .getSetForEntity("article", a.id)
      .then(setLocations)
      .catch(() => setLocations(NO_LOCATIONS));
    void contentAudiencesService
      .getForEntity("article", a.id)
      .then(setAudienceTags)
      .catch(() => setAudienceTags([]));
  };

  /** The create / update payload. */
  const toInput = () => ({
    title: title.trim(),
    bodyMd,
    bodyJson: bodyJson ?? undefined,
    kind,
    category: category.trim() || undefined,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    coverImageUrl: coverImageUrl.trim() || undefined,
    sector: sector ?? undefined,
    audience: audience || undefined,
  });

  /** After the piece saved: its geo + audience tags. Best-effort — the
   *  article is already saved, so a tag-write failure logs and carries on. */
  const saveTags = async (articleId: string) => {
    if (locations.origin || (locations.serves ?? []).length > 0) {
      try {
        await locationsService.setForEntity("article", articleId, locations);
      } catch (locErr) {
        console.warn("Failed to save article locations:", locErr);
      }
    }
    try {
      await contentAudiencesService.setForEntity("article", articleId, audienceTags);
    } catch (audErr) {
      console.warn("Failed to save article audience tags:", audErr);
    }
  };

  return {
    title, setTitle,
    bodyMd, bodyJson, wordCount,
    /** ArticleEditor's onChange. */
    setBody: ({ json, markdown, wordCount: wc }: { json: unknown; markdown: string; wordCount: number }) => {
      setBodyJson(json);
      setBodyMd(markdown);
      setWordCount(wc);
    },
    kind, setKind,
    category, setCategory,
    tagsInput, setTagsInput,
    coverImageUrl, setCoverImageUrl,
    sector, setSector,
    audience, setAudience,
    audienceTags, setAudienceTags,
    locations, setLocations,
    reset,
    load,
    toInput,
    saveTags,
  };
}

export type ArticleDetailsForm = ReturnType<typeof useArticleDetailsForm>;
