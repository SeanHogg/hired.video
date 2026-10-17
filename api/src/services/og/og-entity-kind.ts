/**
 * Entity-kind descriptors for the OG worker. Each kind is DATA: how to load
 * its row (via a repository) + how to turn it into a social card or crawler
 * meta JSON. `defineOgImage` / `defineOgMeta` close over the row type and
 * return a type-erased runner, so the registry is a plain array the routes
 * iterate to register `/v/:videoId`, `/voice/:slug/meta`, … unchanged.
 */
import { getDb, type Db } from "../../db/index.js";
import { ogCached } from "./og-cache.js";

/** Route params of the matched path (e.g. `{ userRef, slug }`). */
export type OgParams = Record<string, string>;

/** What an image endpoint answers with: a 302 to a baked thumbnail, or an
 *  SVG card (`longCache` = day-long edge cache, else 10 min / 1 h). */
export type OgImageResult =
  | { type: "redirect"; url: string }
  | { type: "svg"; svg: string; longCache: boolean };

/** Crawler meta JSON. Some kinds only emit title + description. */
export interface OgMetaBody {
  title: string | null;
  description: string | null;
  image?: string | null;
  jsonLd?: unknown[];
}

/** Cache-Control the crawler-facing entity meta endpoints send. */
export const OG_META_CACHE_CONTROL = "public, max-age=300, s-maxage=3600";

export interface OgImageEntity<Row> {
  kind: string;
  /** Hono paths served by this kind (aliases share one descriptor). */
  paths: readonly string[];
  /** Edge-cache key of the loaded row (rows are JSON-safe). */
  cacheKey(p: OgParams): string;
  load(db: Db, p: OgParams): Promise<Row>;
  toCard(row: Row, p: OgParams): OgImageResult;
}

export interface OgMetaEntity<Row> {
  kind: string;
  paths: readonly string[];
  /** When set, the endpoint sends this Cache-Control header. */
  cacheControl?: string;
  /** "body" caches the final JSON (row may hold Dates); "row" caches the
   *  JSON-safe row and builds the body per request (origin-dependent). */
  cache: "row" | "body";
  cacheKey(p: OgParams, origin: string): string;
  load(db: Db, p: OgParams): Promise<Row>;
  toMeta(row: Row, p: OgParams, origin: string): OgMetaBody;
}

export interface RegisteredOgImage {
  kind: string;
  paths: readonly string[];
  render(p: OgParams): Promise<OgImageResult>;
}

export interface RegisteredOgMeta {
  kind: string;
  paths: readonly string[];
  cacheControl?: string;
  build(p: OgParams, origin: string): Promise<OgMetaBody>;
}

export function defineOgImage<Row>(e: OgImageEntity<Row>): RegisteredOgImage {
  return {
    kind: e.kind,
    paths: e.paths,
    async render(p) {
      const db = getDb();
      const row = await ogCached(e.cacheKey(p), () => e.load(db, p));
      return e.toCard(row, p);
    },
  };
}

export function defineOgMeta<Row>(e: OgMetaEntity<Row>): RegisteredOgMeta {
  return {
    kind: e.kind,
    paths: e.paths,
    cacheControl: e.cacheControl,
    async build(p, origin) {
      const db = getDb();
      const key = e.cacheKey(p, origin);
      if (e.cache === "row") {
        const row = await ogCached(key, () => e.load(db, p));
        return e.toMeta(row, p, origin);
      }
      return ogCached(key, async () => e.toMeta(await e.load(db, p), p, origin));
    },
  };
}
