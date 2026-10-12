/**
 * What a verified webhook delivery says (#2048), reduced to the two things
 * the ingest acts on — per each network's documented payload:
 *
 *   postIds        the network post ids the event is about (a like, a
 *                  comment, a view milestone, a publish) → refresh their
 *                  counts now instead of waiting for the daily sync
 *   confirmations  an async publish finished: the job id the publish first
 *                  answered with (TikTok `publish_id`) → the real post id
 *
 * Unknown shapes yield nothing (the delivery is acknowledged and ignored).
 * Bounded: at most MAX_EVENT_POSTS ids per delivery.
 */
import type { VideoPublishPlatform } from "../../../../../shared/social-platforms.js";

export const MAX_EVENT_POSTS = 20;

export interface WebhookEvents {
  postIds: string[];
  confirmations: Array<{ pendingId: string; postId: string }>;
}

const EMPTY: WebhookEvents = { postIds: [], confirmations: [] };

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0 && v.length <= 200) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Meta (Page `feed`, Instagram `comments` / `mentions` …): entry[].changes[].value. */
function metaPostIds(payload: unknown): string[] {
  const ids: string[] = [];
  for (const entry of arr(obj(payload)?.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const value = obj(obj(change)?.value);
      if (!value) continue;
      for (const id of [value.video_id, value.post_id, value.media_id, obj(value.media)?.id]) {
        const s = str(id);
        if (s) ids.push(s);
      }
    }
  }
  return ids;
}

/** TikTok: { event, content: "<JSON string>" } — post.publish.* events. */
function tiktokEvents(payload: unknown): WebhookEvents {
  const raw = obj(payload)?.content;
  const content = obj(typeof raw === "string" ? parseJson(raw) : raw);
  if (!content) return EMPTY;
  const publishId = str(content.publish_id);
  const postId = str(content.post_id) ?? str(arr(content.publicaly_available_post_id)[0]) ?? str(arr(content.publicly_available_post_id)[0]);
  return {
    postIds: postId ? [postId] : [],
    confirmations: publishId && postId ? [{ pendingId: publishId, postId }] : [],
  };
}

/** X Account Activity: the posts a like / reply / repost / quote touched. */
function xPostIds(payload: unknown): string[] {
  const p = obj(payload);
  if (!p) return [];
  const ids: string[] = [];
  for (const e of arr(p.favorite_events)) {
    const s = str(obj(obj(e)?.favorited_status)?.id_str);
    if (s) ids.push(s);
  }
  for (const e of arr(p.tweet_create_events)) {
    const t = obj(e);
    for (const id of [t?.in_reply_to_status_id_str, obj(t?.quoted_status)?.id_str, obj(t?.retweeted_status)?.id_str]) {
      const s = str(id);
      if (s) ids.push(s);
    }
  }
  return ids;
}

const LINKEDIN_POST_URN = /^urn:li:(?:share|ugcPost):[\w-]+$/;

/** LinkedIn social-action notifications: any share / ugcPost URN in the payload. */
function linkedInPostIds(payload: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 5 || out.length >= MAX_EVENT_POSTS) return out;
  if (typeof payload === "string") {
    if (LINKEDIN_POST_URN.test(payload)) out.push(payload);
  } else if (Array.isArray(payload)) {
    for (const v of payload) linkedInPostIds(v, depth + 1, out);
  } else if (payload && typeof payload === "object") {
    for (const v of Object.values(payload)) linkedInPostIds(v, depth + 1, out);
  }
  return out;
}

/** YouTube WebSub: an Atom feed entry per new / updated video. */
function youtubeVideoIds(body: string): string[] {
  return [...body.matchAll(/<yt:videoId>([\w-]{6,20})<\/yt:videoId>/g)].map((m) => m[1]);
}

export function parseWebhookEvents(platform: VideoPublishPlatform, body: string): WebhookEvents {
  let events: WebhookEvents;
  switch (platform) {
    case "facebook":
    case "instagram":
      events = { postIds: metaPostIds(parseJson(body)), confirmations: [] };
      break;
    case "tiktok":
      events = tiktokEvents(parseJson(body));
      break;
    case "x":
      events = { postIds: xPostIds(parseJson(body)), confirmations: [] };
      break;
    case "linkedin":
      events = { postIds: linkedInPostIds(parseJson(body)), confirmations: [] };
      break;
    case "youtube":
      events = { postIds: youtubeVideoIds(body), confirmations: [] };
      break;
  }
  return {
    postIds: [...new Set(events.postIds)].slice(0, MAX_EVENT_POSTS),
    confirmations: events.confirmations.slice(0, MAX_EVENT_POSTS),
  };
}
