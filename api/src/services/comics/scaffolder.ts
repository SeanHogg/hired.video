/**
 * Comic AI scaffolder.
 *
 * Single entry point: `scaffoldComic()`. Takes the user's intake fields
 * (prompt, genreId, source) plus any source artefact text (resume /
 * profile / services) and returns a fully-populated CanvasState the
 * studio editor can mount as-is.
 *
 * Boundary: this module owns the LLM prompt + the LLM-output → comic-
 * page CanvasState mapping. The route handler (`/api/studio/generate-
 * comic`) is responsible for auth + workspace + source-artefact
 * resolution + persistence; it does NOT inline any prompt or canvas-
 * shape logic.
 *
 * Single source of truth for genres lives in `@shared/comic-genres`.
 * Adding a new genre requires NO changes here — the system prompt
 * derives tone / art-direction / narrative beats / SFX palette from
 * the catalog entry.
 */

import { z } from "zod";
import {
  COMIC_GENRES,
  getComicGenre,
  getNarrativeShape,
  pickStockAsset,
  type ComicGenre,
  type ComicGenreId,
} from "../../../../shared/comic-genres.js";
import {
  COMIC_DEFAULT_LAYOUT,
  type ComicSpec,
  type ComicSpecPage,
} from "../../../../shared/comic-spec.js";
import type { LLMClient } from "../adapters/llm-client.js";

// ─── Public input ──────────────────────────────────────────────────────────

export interface ComicScaffoldInput {
  /** Free-form creative direction from the user. The single most
   *  important signal — every other field shades it. */
  prompt: string;
  /** Genre id the user picked. Falls back to "hero" for unknown ids. */
  genreId: ComicGenreId | string | undefined;
  /** Protagonist name shown in captions + closing card. */
  protagonistName: string;
  /** Source artefact body used to ground the story in real material.
   *  Resume text, profile bio + services, or just the prompt's prose
   *  when none is available. */
  sourceText: string;
  /** Kind of source artefact (for the system prompt's framing line —
   *  helps the model pick the right register). */
  sourceKind: "resume" | "profile" | "services" | "auto";
}

// ─── LLM-side schema ───────────────────────────────────────────────────────
// What the model is asked to emit. Deliberately FLAT (no nested per-
// panel widget arrays) so free-tier models stay on schema — the
// post-process step expands each beat into widgets via the deterministic
// layout below.

const PageSchema = z.object({
  pageNumber: z.number().int().min(1).max(6),
  caption: z.string().min(1).max(180),
  protagonistLine: z.string().min(1).max(220),
  /** "speech" for spoken dialogue, "thought" for internal voice. The
   *  model picks per beat — the post-process maps both to bubble shapes. */
  protagonistMode: z.enum(["speech", "thought"]),
  /** A second speaker's line, if the beat is a dialogue. Empty string
   *  means no second speaker on this page. */
  otherLine: z.string().max(220).default(""),
  otherLabel: z.string().max(40).default(""),
  /** Loud sound effect (POW / DOKI / DRIP). Empty string when the genre
   *  doesn't use SFX or the beat is quiet. */
  sfx: z.string().max(20).default(""),
  /** One-line visual brief the model wrote for itself. Carried into
   *  the saved canvas as a hidden note so editors can see the model's
   *  intent when they re-arrange panels. */
  visualBrief: z.string().max(220).default(""),
});

const ScaffoldedComicSchema = z.object({
  title: z.string().min(1).max(80),
  pages: z.array(PageSchema).length(6),
});

export type ScaffoldedComic = z.infer<typeof ScaffoldedComicSchema>;

// ─── System prompt builder ─────────────────────────────────────────────────

function buildSystemPrompt(genre: ComicGenre, protagonistName: string): string {
  const beats = getNarrativeShape(genre)
    .map(
      (b) =>
        `  ${b.pageNumber}. ${b.label} (${b.beatId}) — ${b.brief}`,
    )
    .join("\n");
  const sfx = genre.sfxPalette.length > 0
    ? `Sound-effect vocabulary you can draw from: ${genre.sfxPalette.join(", ")}.`
    : `This genre is quiet — only use SFX on a page if it's earned. Most pages will leave the field blank.`;
  return [
    `You are a comic writer turning a person's career story into a 6-page pitch comic.`,
    ``,
    `Genre: ${genre.label}.`,
    `Tone: ${genre.tone.join(", ")}.`,
    `Art direction: ${genre.artDirection}.`,
    `Protagonist archetype: ${genre.protagonistArchetype}.`,
    `Protagonist name: ${protagonistName || "the protagonist"}.`,
    ``,
    `Narrative arc (one page per beat — DO NOT MERGE BEATS):`,
    beats,
    ``,
    sfx,
    ``,
    `Rules:`,
    `- Each page returns ONE caption (≤140 chars), ONE protagonist line, optional second speaker, optional SFX, and a visual brief.`,
    `- The story must end with a pitch: page 6's protagonistLine should be a direct call-to-action ("Hire me to do X", "Bring me on for Y", "Let's talk if Z").`,
    `- Use the source material the user provides (their resume, profile, or services) — make the achievements specific. NEVER invent jobs / employers / numbers; if the source is thin, keep the page abstract.`,
    `- Voice every line in the genre's tone — a noir comic narrates differently from a romance.`,
    `- Output strict JSON conforming to the supplied schema. No prose around the JSON.`,
  ].join("\n");
}

function buildUserMessage(input: ComicScaffoldInput, genre: ComicGenre): string {
  const sourceLabel = (() => {
    switch (input.sourceKind) {
      case "resume":   return "RESUME";
      case "profile":  return "PROFILE";
      case "services": return "SERVICES";
      case "auto":     return "SOURCE";
    }
  })();
  const trimmedSource = input.sourceText.trim().slice(0, 6000);
  return [
    `Creative direction:`,
    input.prompt.trim() || `Pitch ${input.protagonistName || "the protagonist"} as a ${genre.label.toLowerCase()} hero.`,
    ``,
    `${sourceLabel}:`,
    trimmedSource || "(no source artefact supplied — base the story on the creative direction alone)",
    ``,
    `Return a 6-page comic. JSON only.`,
  ].join("\n");
}

// ─── Canvas state assembly ─────────────────────────────────────────────────
// Once the LLM has returned a `ScaffoldedComic`, this section
// deterministically lays out the canvas. The layout intentionally
// matches `comicSeedFor()` in `template-seeds.ts` so users see the
// same visual structure whether they ran the AI or not — the only
// difference is the words / SFX / stock-asset rotation.

// Per-page layout — single source of truth lives in `shared/comic-spec.ts`
// (`COMIC_DEFAULT_LAYOUT`). The scaffolder stamps it on every page so
// the spec is self-contained — the editor renders straight from the
// spec without re-importing the layout module.

function attachAssets(
  page: z.infer<typeof PageSchema>,
  genre: ComicGenre,
  index: number,
): ComicSpecPage["assets"] {
  const bg = pickStockAsset(genre.stockAssets.backgrounds, index);
  const character = pickStockAsset(genre.stockAssets.characters, index);
  const prop = pickStockAsset(genre.stockAssets.props, index);
  const sfx = page.sfx ? pickStockAsset(genre.stockAssets.sfx, index) : null;
  return {
    backgroundUrl: bg?.path ?? null,
    characterUrl: character?.path ?? null,
    propUrl: prop?.path ?? null,
    sfxUrl: sfx?.path ?? null,
  };
}

// ─── Entry point ───────────────────────────────────────────────────────────

export async function scaffoldComic(
  llm: LLMClient,
  input: ComicScaffoldInput,
): Promise<{ spec: ComicSpec; rawTitle: string }> {
  const genre = getComicGenre(input.genreId);
  const systemPrompt = buildSystemPrompt(genre, input.protagonistName);
  const userMessage = buildUserMessage(input, genre);

  const { data } = await llm.callJson(
    "comic_scaffold",
    {
      useCase: "studio_script",
      systemPrompt,
      userMessage,
      responseFormat: "json_object",
    },
    ScaffoldedComicSchema,
  );

  const labels = getNarrativeShape(genre).map((b) => b.label);
  const pages: ComicSpecPage[] = data.pages.map((page, idx) => ({
    pageNumber: page.pageNumber,
    label: labels[idx] ?? `Page ${page.pageNumber}`,
    caption: page.caption,
    protagonistLine: page.protagonistLine,
    protagonistMode: page.protagonistMode,
    otherLine: page.otherLine,
    otherLabel: page.otherLabel,
    sfx: page.sfx,
    visualBrief: page.visualBrief,
    assets: attachAssets(page, genre, idx),
  }));

  return {
    spec: {
      genreId: genre.id,
      title: data.title,
      palette: genre.palette,
      pages,
      layout: COMIC_DEFAULT_LAYOUT,
    },
    rawTitle: data.title,
  };
}

// ─── Lookup re-exports ─────────────────────────────────────────────────────

/** Re-exported so route handlers can validate `body.genreId` against
 *  the known set without re-importing the shared catalog directly. */
export const KNOWN_GENRE_IDS: readonly ComicGenreId[] = COMIC_GENRES.map(
  (g) => g.id,
);
