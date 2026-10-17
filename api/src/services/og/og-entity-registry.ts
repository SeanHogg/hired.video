/**
 * The OG entity-kind REGISTRY — one descriptor per entity kind for social
 * card images and crawler meta JSON. routes/og/entity-*.ts iterate these
 * arrays to register every path; adding a kind = adding a descriptor here.
 * Array order is route registration order.
 */
import { isUuid } from "../../../../shared/value-types.js";
import {
  findOgCreatorProfile,
  findOgResume,
  findOgVoiceListing,
} from "../../repositories/ogMediaRepository.js";
import {
  findOgCompany,
  findOgJob,
  findOgPerson,
  findOgPublicEvent,
  findOgPublishedArticle,
  findOgPublishedCourse,
  resolveOgAuthorUserId,
} from "../../repositories/ogPageEntityRepository.js";
import { renderCompanyCard, renderCreatorCard, renderResumeCard, renderVoiceCard } from "./entity-cards.js";
import { buildCreatorMeta, buildResumeMeta, buildVoiceMeta } from "./meta-media.js";
import {
  buildArticleMeta,
  buildCompanyMeta,
  buildCourseMeta,
  buildEventMeta,
  buildJobMeta,
  buildPersonMeta,
} from "./meta-pages.js";
import {
  OG_META_CACHE_CONTROL,
  defineOgImage,
  defineOgMeta,
  type RegisteredOgImage,
  type RegisteredOgMeta,
} from "./og-entity-kind.js";
import { buildVideoMeta, loadOgVideoMeta, renderVideoCard } from "./video.js";

/** Social card images (SVG, or 302 to a baked thumbnail). */
export const OG_IMAGE_ENTITIES: readonly RegisteredOgImage[] = [
  defineOgImage({
    kind: "company",
    paths: ["/companies/:id"],
    cacheKey: (p) => `img:company:${p.id}`,
    load: (db, p) => findOgCompany(db, p.id),
    toCard: renderCompanyCard,
  }),
  defineOgImage({
    kind: "video",
    paths: ["/v/:videoId", "/m/:videoId"],
    cacheKey: (p) => `video:${p.videoId}`,
    load: (db, p) => loadOgVideoMeta(db, p.videoId),
    toCard: renderVideoCard,
  }),
  defineOgImage({
    kind: "resume",
    paths: ["/r/:id"],
    cacheKey: (p) => `img:resume:${p.id}`,
    load: (db, p) => findOgResume(db, p.id),
    toCard: renderResumeCard,
  }),
  defineOgImage({
    kind: "voice",
    paths: ["/voice/:slug"],
    cacheKey: (p) => `img:voice:${p.slug}`,
    load: (db, p) => findOgVoiceListing(db, p.slug),
    toCard: renderVoiceCard,
  }),
  defineOgImage({
    kind: "creator",
    paths: ["/creator/:userId"],
    cacheKey: (p) => `img:creator:${p.userId}`,
    load: (db, p) => findOgCreatorProfile(db, p.userId),
    toCard: renderCreatorCard,
  }),
];

/** Crawler meta JSON (rewritten into the SPA HTML by the Pages Function). */
export const OG_META_ENTITIES: readonly RegisteredOgMeta[] = [
  defineOgMeta({
    kind: "video",
    paths: ["/v/:videoId/meta", "/m/:videoId/meta"],
    // Shares the image endpoint's cached row; the body depends on origin.
    cache: "row",
    cacheKey: (p) => `video:${p.videoId}`,
    load: (db, p) => loadOgVideoMeta(db, p.videoId),
    toMeta: (row, p, origin) => buildVideoMeta(row, p.videoId, origin),
  }),
  defineOgMeta({
    kind: "voice",
    paths: ["/voice/:slug/meta"],
    cache: "body",
    cacheKey: (p) => `meta:voice:${p.slug}`,
    load: (db, p) => findOgVoiceListing(db, p.slug),
    toMeta: (row) => buildVoiceMeta(row),
  }),
  defineOgMeta({
    kind: "creator",
    paths: ["/creator/:userId/meta"],
    cache: "body",
    cacheKey: (p) => `meta:creator:${p.userId}`,
    load: (db, p) => findOgCreatorProfile(db, p.userId),
    toMeta: (row) => buildCreatorMeta(row),
  }),
  defineOgMeta({
    kind: "resume",
    paths: ["/r/:id/meta"],
    cache: "body",
    cacheKey: (p) => `meta:resume:${p.id}`,
    load: (db, p) => findOgResume(db, p.id),
    toMeta: (row) => buildResumeMeta(row),
  }),
  defineOgMeta({
    kind: "article",
    paths: ["/article/:userRef/:slug/meta"],
    cacheControl: OG_META_CACHE_CONTROL,
    cache: "body",
    cacheKey: (p, o) => `meta:article:${o}:${p.userRef}:${p.slug}`,
    load: async (db, p) => {
      const authorUserId = await resolveOgAuthorUserId(db, p.userRef);
      return authorUserId ? findOgPublishedArticle(db, authorUserId, p.slug) : null;
    },
    toMeta: (row, p, o) => buildArticleMeta(row, p.slug, o),
  }),
  defineOgMeta({
    kind: "person",
    paths: ["/person/:userRef/meta"],
    cacheControl: OG_META_CACHE_CONTROL,
    cache: "body",
    cacheKey: (p, o) => `meta:person:${o}:${p.userRef}`,
    load: (db, p) => findOgPerson(db, p.userRef),
    toMeta: (row, p, o) => buildPersonMeta(row, p.userRef, o),
  }),
  defineOgMeta({
    kind: "job",
    paths: ["/job/:id/meta"],
    cacheControl: OG_META_CACHE_CONTROL,
    cache: "body",
    cacheKey: (p, o) => `meta:job:${o}:${p.id}`,
    load: async (db, p) => (isUuid(p.id) ? findOgJob(db, p.id) : null),
    toMeta: (row, p, o) => buildJobMeta(row, p.id, o),
  }),
  defineOgMeta({
    kind: "company",
    paths: ["/company/:idOrSlug/meta"],
    cacheControl: OG_META_CACHE_CONTROL,
    cache: "body",
    cacheKey: (p, o) => `meta:company:${o}:${p.idOrSlug}`,
    load: (db, p) => findOgCompany(db, p.idOrSlug),
    toMeta: (row, _p, o) => buildCompanyMeta(row, o),
  }),
  defineOgMeta({
    kind: "course",
    paths: ["/course/:userRef/:slug/meta"],
    cacheControl: OG_META_CACHE_CONTROL,
    cache: "body",
    cacheKey: (p, o) => `meta:course:${o}:${p.userRef}:${p.slug}`,
    load: async (db, p) => {
      const authorUserId = await resolveOgAuthorUserId(db, p.userRef);
      return authorUserId ? findOgPublishedCourse(db, authorUserId, p.slug) : null;
    },
    toMeta: (row, p, o) => buildCourseMeta(row, p.slug, o),
  }),
  defineOgMeta({
    kind: "event",
    paths: ["/event/:idOrSlug/meta"],
    cacheControl: OG_META_CACHE_CONTROL,
    cache: "body",
    cacheKey: (p, o) => `meta:event:${o}:${p.idOrSlug}`,
    load: (db, p) => findOgPublicEvent(db, p.idOrSlug),
    toMeta: (row, _p, o) => buildEventMeta(row, o),
  }),
];
