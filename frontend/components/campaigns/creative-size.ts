/**
 * Creative-size grouping for campaign lists (#1133).
 *
 * Campaigns stay a flat list by default. The grouped view buckets them
 * by the pixel size of their creatives (square / vertical / landscape)
 * and exposes a per-campaign category matrix so missing format families
 * (social-feed, display-ad, …) read as gaps.
 *
 * Dimension lookup never edits the format catalog — it only *reads*
 * `findFormatByDimensions` / `findFormatById` / `groupFormatsByCategory`.
 */

import {
  findFormatByDimensions,
  findFormatById,
  groupFormatsByCategory,
  FORMAT_CATEGORY_UI,
  type FormatCategory,
} from "@/lib/studio/video-formats";

export type PixelSize = { width: number; height: number };

/** User-facing buckets for the grouped-view toggle. */
export type CreativeSizeGroup = "square" | "vertical" | "landscape";

export type CampaignSizeBucket = CreativeSizeGroup | "mixed" | "unspecified";

export const SIZE_GROUP_ORDER: readonly CampaignSizeBucket[] = [
  "landscape",
  "vertical",
  "square",
  "mixed",
  "unspecified",
];

export const SIZE_GROUP_LABELS: Record<CampaignSizeBucket, string> = {
  landscape: "Landscape",
  vertical: "Vertical",
  square: "Square",
  mixed: "Mixed sizes",
  unspecified: "Unspecified",
};

export type MatrixCategory = FormatCategory | "custom";

export interface CategoryCount {
  category: MatrixCategory;
  label: string;
  count: number;
  /** True when this catalog family has zero matching assets. */
  gap: boolean;
}

function toPosInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

/** Square = 1:1; taller-than-wide = vertical; otherwise landscape. */
export function sizeGroupFromDimensions(width: number, height: number): CreativeSizeGroup {
  if (width === height) return "square";
  if (height > width) return "vertical";
  return "landscape";
}

export function campaignSizeGroup(assets: PixelSize[]): CampaignSizeBucket {
  const groups = new Set(assets.map((a) => sizeGroupFromDimensions(a.width, a.height)));
  if (groups.size === 0) return "unspecified";
  if (groups.size === 1) return [...groups][0]!;
  return "mixed";
}

export function groupCampaignsBySize<T extends { assets: PixelSize[] }>(
  campaigns: T[],
): Array<{ group: CampaignSizeBucket; items: T[] }> {
  const buckets = new Map<CampaignSizeBucket, T[]>();
  for (const campaign of campaigns) {
    const group = campaignSizeGroup(campaign.assets);
    const list = buckets.get(group) ?? [];
    list.push(campaign);
    buckets.set(group, list);
  }
  return SIZE_GROUP_ORDER.filter((group) => (buckets.get(group)?.length ?? 0) > 0).map((group) => ({
    group,
    items: buckets.get(group)!,
  }));
}

/** One cell per catalog category; custom (uncatalogued) sizes get their own column. */
export function categoryMatrix(assets: PixelSize[]): CategoryCount[] {
  const counts = new Map<FormatCategory, number>();
  let custom = 0;
  for (const asset of assets) {
    const format = findFormatByDimensions(asset.width, asset.height);
    if (format) {
      counts.set(format.category, (counts.get(format.category) ?? 0) + 1);
    } else {
      custom += 1;
    }
  }
  const rows: CategoryCount[] = groupFormatsByCategory().map(({ category }) => {
    const count = counts.get(category) ?? 0;
    return {
      category,
      label: FORMAT_CATEGORY_UI[category].label,
      count,
      gap: count === 0,
    };
  });
  if (custom > 0) {
    rows.push({ category: "custom", label: "Custom", count: custom, gap: false });
  }
  return rows;
}

export function dimensionsFromUnknown(source: unknown): PixelSize | null {
  if (!source || typeof source !== "object") return null;
  const o = source as Record<string, unknown>;
  const width = toPosInt(o.width) ?? toPosInt(o.w);
  const height = toPosInt(o.height) ?? toPosInt(o.h);
  if (width && height) return { width, height };
  return null;
}

/**
 * Read pixels off a studio project when timelineSpec / imageState carry
 * top-level width+height. Missing or non-object specs return null so
 * empty drafts land in Unspecified rather than the 1920×1080 default.
 */
export function dimensionsFromProject(project: {
  timelineSpec?: unknown;
  imageState?: unknown;
}): PixelSize | null {
  return dimensionsFromUnknown(project.timelineSpec) ?? dimensionsFromUnknown(project.imageState);
}

const DIMENSION_PAIR = /^(\d+)\s*[x×]\s*(\d+)$/i;

export function dimensionsFromCreative(creative: {
  format?: string | null;
  metadata?: Record<string, unknown> | null;
}): PixelSize | null {
  const fromMeta = dimensionsFromUnknown(creative.metadata ?? null);
  if (fromMeta) return fromMeta;
  const format = (creative.format ?? "").trim();
  if (!format) return null;
  const byId = findFormatById(format);
  if (byId) return { width: byId.width, height: byId.height };
  const match = format.match(DIMENSION_PAIR);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

export function collectCampaignAssets(opts: {
  metadata?: Record<string, unknown> | null;
  projectIds?: string[];
  projectsById?: {
    get(id: string): { timelineSpec?: unknown; imageState?: unknown } | undefined;
  };
  creatives?: Array<{
    format?: string | null;
    metadata?: Record<string, unknown> | null;
    studioProjectId?: string | null;
  }>;
}): PixelSize[] {
  const out: PixelSize[] = [];
  const push = (d: PixelSize | null) => {
    if (d) out.push(d);
  };
  push(dimensionsFromUnknown(opts.metadata ?? null));

  const projectsById = opts.projectsById ?? { get: () => undefined };
  const projectIds = [...(opts.projectIds ?? [])];
  const metaPids = opts.metadata?.projectIds;
  if (Array.isArray(metaPids)) {
    for (const pid of metaPids) {
      if (typeof pid === "string") projectIds.push(pid);
    }
  }
  for (const pid of projectIds) {
    const project = projectsById.get(pid);
    if (project) push(dimensionsFromProject(project));
  }

  for (const creative of opts.creatives ?? []) {
    const fromCreative = dimensionsFromCreative(creative);
    if (fromCreative) {
      out.push(fromCreative);
      continue;
    }
    if (creative.studioProjectId) {
      const project = projectsById.get(creative.studioProjectId);
      if (project) push(dimensionsFromProject(project));
    }
  }
  return out;
}
