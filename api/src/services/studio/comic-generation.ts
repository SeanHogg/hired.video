/**
 * Comic generation use case behind POST /api/studio/generate-comic: resolve
 * the source artefact (resume / profile / services / auto), run the LLM
 * scaffolder, and optionally add ONE genre-styled AI portrait of the
 * protagonist (#939). Token metering for the scaffold happens inside
 * `LLMClient.callJson`; the portrait is metered by `runWorkersAi`.
 * Split out of routes/studio.ts (W2-3a).
 */
import { z } from "zod";
import type { JwtPayload } from "../../types/index.js";
import { getDb, type Db } from "../../db/index.js";
import { createLLMClient, type LLMEnv } from "../adapters/llm-client.js";
import { resolveWorkersAi, runWorkersAi } from "../adapters/workers-ai.js";
import { getVideoBucket } from "../storage/object-store.js";
import {
  findProfileSource,
  findResumeContentForUser,
  listServiceSources,
} from "../../repositories/studioGenerationSourcesRepository.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { ComicSpec } from "../../../../shared/comic-spec.js";
import { AI_IMAGE_FIXED_TOKENS, persistAiImage } from "./ai-images.js";
import { toGenerationDomainError } from "./ai-generation-error.js";

export const GenerateComicSchema = z.object({
  prompt: z.string().max(2000).default(""),
  genreId: z.string().max(40).optional(),
  protagonistName: z.string().max(80).default(""),
  sourceKind: z.enum(["resume", "profile", "services", "auto"]).default("auto"),
  /** When the source is "auto" the use case picks the richest artefact
   *  available (resume > profile + services > prompt alone). The client
   *  can pin a specific resume by id; otherwise the user's resume is
   *  loaded. */
  resumeId: UuidLikeSchema.optional(),
  /** When true (#939 hybrid AI character portrait) also generate ONE
   *  genre-styled portrait of the protagonist via Workers AI
   *  SDXL-Lightning and thread its CDN URL into every page's
   *  `characterUrl` slot. Off by default to keep the fast path cheap. */
  generateCharacterPortrait: z.boolean().default(false),
});
export type GenerateComicInput = z.infer<typeof GenerateComicSchema>;
type SourceKind = GenerateComicInput["sourceKind"];

async function loadResumeText(db: Db, userId: string, resumeId: string | undefined): Promise<string> {
  const content = await findResumeContentForUser(db, userId, resumeId);
  if (!content) return "";
  // `resumeContentToText` is the SSoT JSONB → plaintext flattening (modern +
  // legacy formats); 8000 chars matches the storyboard slicing (the
  // scaffolder additionally caps at 6000 before sending to the LLM).
  const { resumeContentToText } = await import("../resume/parse.js");
  return resumeContentToText(content, 8000);
}

async function loadProfileText(db: Db, userId: string): Promise<string> {
  const row = await findProfileSource(db, userId);
  if (!row) return "";
  const lines: string[] = [];
  if (row.name)     lines.push(`Name: ${row.name}`);
  if (row.headline) lines.push(`Headline: ${row.headline}`);
  if (row.summary)  lines.push(`Summary: ${row.summary}`);
  if (row.location) lines.push(`Location: ${row.location}`);
  return lines.join("\n");
}

async function loadServicesText(db: Db, userId: string): Promise<string> {
  const rows = await listServiceSources(db, userId);
  return rows
    .map(
      (s) =>
        `• ${s.title}${s.category ? ` (${s.category})` : ""}: ${s.description ?? ""}${s.priceCents ? ` — $${(s.priceCents / 100).toFixed(0)}` : ""}`,
    )
    .join("\n");
}

/** Resolve exactly the artefact asked for; "auto" walks resume → profile +
 *  services → empty (the scaffolder accepts an empty source and falls back
 *  to the prompt-only path). */
async function resolveComicSource(
  userId: string,
  input: GenerateComicInput,
): Promise<{ sourceText: string; sourceKind: SourceKind }> {
  const db = getDb();
  if (input.sourceKind === "resume") return { sourceText: await loadResumeText(db, userId, input.resumeId), sourceKind: "resume" };
  if (input.sourceKind === "profile") return { sourceText: await loadProfileText(db, userId), sourceKind: "profile" };
  if (input.sourceKind === "services") return { sourceText: await loadServicesText(db, userId), sourceKind: "services" };

  const resumeText = await loadResumeText(db, userId, input.resumeId);
  if (resumeText) return { sourceText: resumeText, sourceKind: "resume" };
  const [profileText, servicesText] = await Promise.all([loadProfileText(db, userId), loadServicesText(db, userId)]);
  return {
    sourceText: [profileText, servicesText].filter(Boolean).join("\n\n"),
    sourceKind: profileText ? (servicesText ? "auto" : "profile") : servicesText ? "services" : "auto",
  };
}

/** Best-effort portrait pass — a failure never fails the scaffold (the spec
 *  already carries stock silhouettes as fallback). */
async function addCharacterPortrait(
  env: unknown,
  user: JwtPayload,
  input: GenerateComicInput,
  spec: ComicSpec,
): Promise<void> {
  try {
    const ai = resolveWorkersAi(env);
    if (!ai || !getVideoBucket(env)) return;
    const { getComicGenre } = await import("../../../../shared/comic-genres.js");
    const genre = getComicGenre(input.genreId);
    const portraitPrompt =
      `${genre.artDirection ?? "cinematic illustration"}, ` +
      `hero portrait of ${input.protagonistName || "a determined protagonist"}, ` +
      `${Object.values(genre.palette ?? {}).join(" ")}, head-and-shoulders, ` +
      `clean background, dramatic lighting, comic-book panel style`;
    const response = await runWorkersAi(
      ai,
      "@cf/bytedance/stable-diffusion-xl-lightning",
      { prompt: portraitPrompt.slice(0, 500), num_steps: 4 },
      { user, featureKey: "comic_portrait", fixedTokens: AI_IMAGE_FIXED_TOKENS },
    );
    const characterUrl = await persistAiImage(user.sub, response);
    spec.pages = spec.pages.map((p) => ({
      ...p,
      assets: {
        backgroundUrl: null,
        propUrl: null,
        sfxUrl: null,
        ...(p.assets ?? {}),
        characterUrl,
      },
    }));
  } catch (err) {
    console.warn("[studio/generate-comic] portrait pass failed:", err);
  }
}

/** Generate a ComicSpec. Scaffold failures throw a DomainError (typed AI_*
 *  envelope, or 500 GENERATION_FAILED). */
export async function generateComic(
  env: LLMEnv | undefined,
  user: JwtPayload,
  input: GenerateComicInput,
): Promise<{ spec: ComicSpec; sourceKindResolved: SourceKind }> {
  const { sourceText, sourceKind } = await resolveComicSource(user.sub, input);
  const llm = createLLMClient(env, user);
  try {
    const { scaffoldComic } = await import("../comics/scaffolder.js");
    const { spec } = await scaffoldComic(llm, {
      prompt: input.prompt,
      genreId: input.genreId,
      protagonistName: input.protagonistName,
      sourceText,
      sourceKind,
    });
    if (input.generateCharacterPortrait) await addCharacterPortrait(env, user, input, spec);
    return { spec, sourceKindResolved: sourceKind };
  } catch (err) {
    throw toGenerationDomainError(err, "[studio/generate-comic]", "Comic generation failed");
  }
}
