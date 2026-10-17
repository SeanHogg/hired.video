/**
 * Minimal title + description meta for the voice / creator / résumé share
 * pages — the two fields LinkedIn/X preview cards actually surface.
 */
import type { OgCreatorRow, OgResumeRow, OgVoiceRow } from "../../repositories/ogMediaRepository.js";
import type { OgMetaBody } from "./og-entity-kind.js";

export function buildVoiceMeta(row: OgVoiceRow): OgMetaBody {
  if (!row || row.visibility !== "public") {
    return { title: "Voice Clone on hired.video", description: null };
  }

  const meta = [row.language, row.gender].filter(Boolean).join(" · ");
  const price = row.priceCents != null ? `$${(row.priceCents / 100).toFixed(2)}` : null;
  return {
    title: `${row.name} — AI Voice Clone on hired.video${price ? ` (${price})` : ""}`,
    description: row.description ?? `License this AI voice clone${meta ? ` (${meta})` : ""} for your videos. Created by ${row.ownerName ?? "a creator"} on hired.video.`,
  };
}

export function buildCreatorMeta(row: OgCreatorRow): OgMetaBody {
  if (!row || !row.isActive) {
    return { title: "Creator on hired.video", description: null };
  }

  const name = row.displayName ?? row.ownerName ?? "Creator";
  const stats = row.completedProjectsCount && row.completedProjectsCount > 0
    ? `${row.completedProjectsCount} project${row.completedProjectsCount === 1 ? "" : "s"} delivered`
    : "Available for new briefs";
  return {
    title: `${name} — Creator on hired.video`,
    description: row.tagline ?? row.bio ?? `${name} is a creator on hired.video — book a custom promo video, pitch, or intro. ${stats}.`,
  };
}

export function buildResumeMeta(row: OgResumeRow): OgMetaBody {
  if (!row) {
    return { title: "Resume on hired.video", description: null };
  }

  const owner = row.ownerName ?? "this candidate";
  return {
    title: `${row.title ?? owner + "'s Resume"} — hired.video`,
    description: row.headline
      ? `${owner} — ${row.headline}. View the full resume on hired.video.`
      : `${owner}'s resume on hired.video — watch their video, see their skills, and get in touch.`,
  };
}
