/**
 * What a public video is made of, for the explicit scan — pure.
 *
 * Text: title, description, the owner's name + headline (shown on the wall
 * card), the on-screen transcript (shared flattenTimelineTranscript), and any
 * other copy in the saved timeline / storyboard — voiceover script, captions,
 * subtitles, labels — found by walking the JSON for text-bearing keys.
 * Images: the thumbnail and every image URL the timeline / storyboard uses.
 */
import { flattenTimelineTranscript } from "../../../../../shared/timeline-transcript.js";

/** Keys whose string values are words a viewer reads or hears. */
const TEXT_KEY = /^(?:title|headline|subheadline|subtitle|subtitles|text|takeaway|ctatext|label|caption|captions|script|voiceover|voiceovertext|voiceoverscript|narration|narrationtext|transcript|quote|body|description|name|tagline|chips?)$/i;
/** Keys whose string values are image references. */
const IMAGE_KEY = /^(?:src|url|image|imageurl|imagesrc|photo|photourl|thumbnail|thumbnailurl|poster|posterurl|background|backgroundimage|backgroundurl|logo|logourl|avatar|avatarurl)$/i;
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i;
const NON_IMAGE_EXT = /\.(?:mp4|webm|mov|m4v|mp3|wav|m4a|ogg|aac|json|svg)(?:$|[?#])/i;

/** Most assets were scanned (and cached) at upload, so this is mostly lookups. */
export const MAX_SCAN_IMAGES = 40;
const MAX_TEXT_CHARS = 8000;
const MAX_DEPTH = 12;

export interface VideoScanSource {
  title: string | null;
  description: string | null;
  ownerName: string | null;
  ownerHeadline: string | null;
  thumbnailUrl: string | null;
  timelineSpec: unknown;
  storyboard: unknown;
}

export interface VideoScanInputs {
  text: string;
  imageUrls: string[];
  /** More images than MAX_SCAN_IMAGES: the rest can't be vouched for. */
  imagesTruncated: boolean;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function looksLikeImageUrl(key: string, value: string): boolean {
  if (!isHttpUrl(value) || NON_IMAGE_EXT.test(value)) return false;
  return IMAGE_EXT.test(value) || IMAGE_KEY.test(key);
}

function walk(node: unknown, key: string, depth: number, texts: Set<string>, images: Set<string>): void {
  if (depth > MAX_DEPTH || node == null) return;
  if (typeof node === "string") {
    const value = node.trim();
    if (!value) return;
    if (looksLikeImageUrl(key, value)) images.add(value);
    else if (TEXT_KEY.test(key) && !isHttpUrl(value) && !value.startsWith("data:")) texts.add(value);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, key, depth + 1, texts, images);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, k, depth + 1, texts, images);
  }
}

export function collectVideoScanInputs(src: VideoScanSource): VideoScanInputs {
  const texts = new Set<string>();
  const images = new Set<string>();
  for (const value of [src.title, src.description, src.ownerName, src.ownerHeadline]) {
    if (value?.trim()) texts.add(value.trim());
  }
  const transcript = flattenTimelineTranscript(src.timelineSpec);
  if (transcript) texts.add(transcript);
  walk(src.timelineSpec, "", 0, texts, images);
  walk(src.storyboard, "", 0, texts, images);
  if (src.thumbnailUrl && isHttpUrl(src.thumbnailUrl)) images.add(src.thumbnailUrl.trim());

  const ordered = orderWithThumbnailFirst([...images], src.thumbnailUrl);
  return {
    text: [...texts].join("\n").slice(0, MAX_TEXT_CHARS),
    imageUrls: ordered.slice(0, MAX_SCAN_IMAGES),
    imagesTruncated: ordered.length > MAX_SCAN_IMAGES,
  };
}

function orderWithThumbnailFirst(urls: string[], thumbnail: string | null): string[] {
  const thumb = thumbnail?.trim();
  if (!thumb || !urls.includes(thumb)) return urls;
  return [thumb, ...urls.filter((u) => u !== thumb)];
}
