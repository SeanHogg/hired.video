/**
 * Linked content registry — single source of truth for "what kinds of
 * user-created entities can be embedded as a draggable card on the v2
 * canvas?"
 *
 * Adding a new entity kind (job / profile / company / video / template)
 * is one entry in `LINKED_CONTENT_REGISTRY`. Every surface that touches
 * linked content — palette section, drag protocol, canvas preview body,
 * inspector, timeline serializer — reads from this map. There are no
 * parallel switch statements on entity kind anywhere else.
 *
 * Per the standing DRY rule: shared logic (icon, view URL, list fetch,
 * preview fetch, CTA label) lives in one place; the components that
 * render linked content decide their own visibility / empty states by
 * inspecting the same registry.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Briefcase, Building2, FileText, Newspaper, PlayCircle, User } from "lucide-react";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import { articleService } from "@/lib/services/article-service";
import { userService } from "@/lib/services/user-service";
import { companyService } from "@/lib/services/company-service";
import { studioService } from "@/lib/services/studio-service";

// Per-kind inline body components are lazy-loaded — each body pulls
// in a heavy renderer (DeclarativeResumeRenderer / DeclarativeJobRenderer
// / Markdown / Avatar etc.), which we don't want on every page that
// imports `linked-content.ts` (e.g. the drag protocol shared by every
// studio surface). Each kind ships its own `<EntityInlineBody/>`
// under `components/studio/v2/inline-bodies/`.
const ResumeInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/ResumeInlineBody"),
);
const JobInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/JobInlineBody"),
);
const ArticleInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/ArticleInlineBody"),
);
const ProfileInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/ProfileInlineBody"),
);
const CompanyInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/CompanyInlineBody"),
);
const VideoInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/VideoInlineBody"),
);

/** Entity kinds that can be embedded as a card on the v2 canvas.
 *  Adding a new kind = one entry in `LINKED_CONTENT_REGISTRY` + one
 *  component under `components/studio/v2/inline-bodies/` — no other
 *  file needs a switch update. */
export type LinkedContentKind =
  | "resume"
  | "job"
  | "article"
  | "profile"
  | "company"
  | "video";

/** Tile metadata for the palette section (one row per item the current
 *  user owns). Fetched from `LinkedContentMeta.listForUser` and rendered
 *  with the same `LeftPanelTile` the static widget catalog uses. The
 *  same shape is also returned from `fetchSummary(id)` and consumed by
 *  the canvas-v2:linked-content applier — the optional `body` /
 *  `badges` fields are read by the canvas drawer to paint richer
 *  content (bullet lines, skill / tag chips) when present. Palette
 *  tiles ignore them. */
export interface LinkedContentSummary {
  kind: LinkedContentKind;
  id: string;
  title: string;
  /** Secondary line (e.g. "Active · Master") — optional, rendered as a
   *  hint / tooltip when present. */
  subtitle?: string;
  /** Body lines drawn beneath the subtitle in the canvas applier.
   *  Each line wraps independently — kinds should pre-bullet (e.g.
   *  prefix with `"• "`) where appropriate. Palette tiles ignore. */
  body?: string[];
  /** Pill chips drawn at the bottom of the canvas card (skills /
   *  tags / categories). Palette tiles ignore. */
  badges?: string[];
}

interface LinkedContentMeta {
  /** Singular display label ("Resume", "Job"). */
  label: string;
  /** Palette section heading ("Your resumes", "Your jobs"). */
  sectionLabel: string;
  /** Lucide icon used in the palette tile + empty-state body. */
  icon: ComponentType<{ className?: string }>;
  /** Destination opened by the canvas widget's CTA. */
  viewUrl: (id: string) => string;
  /** CTA button label rendered on the preview card. */
  ctaLabel: string;
  /** List the current user's owned items for the palette section.
   *  Errors are swallowed by the caller — the section just renders the
   *  empty state. */
  listForUser: () => Promise<LinkedContentSummary[]>;
  /** Fetch a single entity's render-friendly summary by id. Used by
   *  the canvas-v2 render pipeline's preload pass so the synchronous
   *  applier can draw a card without bringing the entity's full DOM
   *  renderer into the export path. Errors resolve to `null` so a
   *  broken / private id renders an empty card instead of crashing. */
  fetchSummary: (id: string) => Promise<LinkedContentSummary | null>;
  /** Lazy-loaded canvas body — renders the entity inside the widget
   *  using its OWN renderer (e.g. `<DeclarativeResumeRenderer/>` for
   *  resumes) so the embedded card looks like a thumbnail of the
   *  entity's actual published page, not a hand-rolled summary. The
   *  component owns its own fetch + loading / error states; the
   *  outer `LinkedContentBody` just provides chrome (bg colour, CTA
   *  pill, drag-select target) so adding a new kind is one lazy
   *  import here + one component file under `inline-bodies/`. */
  InlineBody: LazyExoticComponent<ComponentType<{ id: string }>>;
}

export const LINKED_CONTENT_REGISTRY: Record<LinkedContentKind, LinkedContentMeta> = {
  resume: {
    label: "Resume",
    sectionLabel: "Your resumes",
    icon: FileText,
    viewUrl: (id) => `/resumes/${id}`,
    ctaLabel: "View resume",
    listForUser: async () => {
      const items = await resumeService.getUserResumes();
      return items
        .filter((r): r is typeof r & { id: string } => Boolean(r.id))
        .map((r) => ({
          kind: "resume" as const,
          id: r.id,
          title: r.title || "Untitled resume",
          subtitle: subtitleForResume(r),
        }));
    },
    fetchSummary: async (id) => {
      try {
        const r = await resumeService
          .getResumeForEmbed(id)
          .catch(() => resumeService.getResumeById(id));
        if (!r?.id) return null;
        const c = r.content;
        const basics = c?.basics;
        const fullName = basics?.name?.trim();
        const headline = basics?.label?.trim() || basics?.summary?.split("\n")[0]?.slice(0, 120);
        const top = (c?.work ?? []).slice(0, 2);
        return {
          kind: "resume",
          id: r.id,
          title: fullName || r.title || "Untitled resume",
          subtitle: headline || subtitleForResume(r),
          body: top
            .map((e) => {
              const parts = [e.position, e.name].filter(Boolean);
              return parts.length ? `• ${parts.join(" · ")}` : "";
            })
            .filter(Boolean),
          badges: (c?.skills ?? [])
            .map((s) => s.name)
            .filter((s): s is string => Boolean(s))
            .slice(0, 6),
        };
      } catch {
        return null;
      }
    },
    InlineBody: ResumeInlineBody,
  },
  job: {
    label: "Job",
    sectionLabel: "Your jobs",
    icon: Briefcase,
    viewUrl: (id) => `/jobs/${id}`,
    ctaLabel: "View job",
    listForUser: async () => {
      // `getMyPostedJobs` is the owner-scoped list — `getUserJobs`
      // mixes owned + saved + applied, which would surface jobs the
      // user can't legitimately embed as "their" content.
      const items = await jobService.getMyPostedJobs();
      return items
        .filter((j): j is typeof j & { id: string } => Boolean(j.id))
        .map((j) => ({
          kind: "job" as const,
          id: j.id,
          title: j.title || "Untitled job",
          subtitle: [j.company, j.location].filter(Boolean).join(" · ") || undefined,
        }));
    },
    fetchSummary: async (id) => {
      try {
        const j = await jobService.getJobById(id);
        if (!j?.id) return null;
        // Job records vary in shape across the API surface — read
        // tolerantly. Description / requirements may live under
        // `description`, `summary`, `data.description`; pull whichever
        // exists, split to lines, cap.
        const raw = j as Record<string, unknown>;
        const data = (raw.data ?? raw) as Record<string, unknown>;
        const description = typeof data.description === "string"
          ? data.description
          : typeof data.summary === "string"
            ? data.summary
            : "";
        const bullets = description
          .split(/\n+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .slice(0, 3)
          .map((s) => `• ${s.slice(0, 90)}`);
        const tags = Array.isArray((data as { tags?: unknown }).tags)
          ? ((data as { tags: unknown[] }).tags
              .filter((t): t is string => typeof t === "string")
              .slice(0, 5))
          : [];
        return {
          kind: "job",
          id: j.id,
          title: j.title || "Untitled job",
          subtitle: [j.company, j.location].filter(Boolean).join(" · ") || undefined,
          body: bullets,
          badges: tags,
        };
      } catch {
        return null;
      }
    },
    InlineBody: JobInlineBody,
  },
  article: {
    label: "Article",
    sectionLabel: "Your articles",
    icon: Newspaper,
    viewUrl: (id) => `/articles/${id}`,
    ctaLabel: "Read article",
    listForUser: async () => {
      const items = await articleService.listMine();
      return items.map((a) => ({
        kind: "article" as const,
        id: a.id,
        title: a.title || "Untitled article",
        subtitle:
          a.status === "published"
            ? `Published${a.readMinutes ? ` · ${a.readMinutes} min` : ""}`
            : a.status.charAt(0).toUpperCase() + a.status.slice(1),
      }));
    },
    fetchSummary: async (id) => {
      try {
        const a = await articleService.getMine(id);
        if (!a?.id) return null;
        const raw = a as unknown as {
          summary?: string; excerpt?: string; body?: string; tags?: unknown;
        };
        const excerpt = raw.summary ?? raw.excerpt ?? "";
        const body = excerpt
          ? [excerpt.slice(0, 220)]
          : typeof raw.body === "string"
            ? [raw.body.replace(/[#*_>`-]/g, "").trim().slice(0, 220)]
            : [];
        const tags = Array.isArray(raw.tags)
          ? raw.tags
              .filter((t): t is string => typeof t === "string")
              .slice(0, 5)
          : [];
        return {
          kind: "article",
          id: a.id,
          title: a.title || "Untitled article",
          subtitle:
            a.status === "published"
              ? `Published${a.readMinutes ? ` · ${a.readMinutes} min` : ""}`
              : a.status.charAt(0).toUpperCase() + a.status.slice(1),
          body,
          badges: tags,
        };
      } catch {
        return null;
      }
    },
    InlineBody: ArticleInlineBody,
  },
  profile: {
    label: "Profile",
    sectionLabel: "Your profile",
    icon: User,
    viewUrl: (id) => `/people/${id}`,
    ctaLabel: "View profile",
    // Singular — the palette section surfaces exactly one tile
    // ("Your Profile") for the current user. Returns an empty list
    // when the user isn't authenticated so the empty-state copy in
    // `LinkedContentPaletteSection` fires.
    listForUser: async () => {
      try {
        const me = await userService.getCurrentUser();
        if (!me?.id) return [];
        const fullName =
          [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
          "Your profile";
        return [
          {
            kind: "profile" as const,
            id: me.id,
            title: fullName,
            subtitle: me.data?.headline ?? undefined,
          },
        ];
      } catch {
        return [];
      }
    },
    fetchSummary: async (id) => {
      try {
        const u = await userService.getUserById(id);
        if (!u?.id) return null;
        const fullName =
          [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
          "Profile";
        const d = u.data ?? {};
        const company = (d as { company?: string; companyName?: string }).company
          ?? (d as { company?: string; companyName?: string }).companyName;
        const role = (d as { role?: string; title?: string }).role
          ?? (d as { role?: string; title?: string }).title;
        const body = [
          role && company ? `• ${role} at ${company}` : role ? `• ${role}` : company ? `• ${company}` : "",
          (d as { about?: string }).about
            ? `${(d as { about: string }).about.slice(0, 160)}`
            : "",
        ].filter(Boolean);
        const skills = Array.isArray((d as { skills?: unknown }).skills)
          ? ((d as { skills: unknown[] }).skills
              .filter((s): s is string => typeof s === "string")
              .slice(0, 6))
          : [];
        return {
          kind: "profile",
          id: u.id,
          title: fullName,
          subtitle: u.data?.headline ?? undefined,
          body,
          badges: skills,
        };
      } catch {
        return null;
      }
    },
    InlineBody: ProfileInlineBody,
  },
  company: {
    label: "Company",
    sectionLabel: "Your companies",
    icon: Building2,
    viewUrl: (id) => `/companies/${id}`,
    ctaLabel: "View company",
    listForUser: async () => {
      const items = await companyService.getMyCompanies();
      return items
        .filter((c): c is typeof c & { id: string } => Boolean(c.id))
        .map((c) => ({
          kind: "company" as const,
          id: c.id,
          title: c.name || "Unnamed company",
          subtitle:
            c.activeJobCount && c.activeJobCount > 0
              ? `${c.activeJobCount} open role${c.activeJobCount === 1 ? "" : "s"}`
              : undefined,
        }));
    },
    fetchSummary: async (id) => {
      try {
        const c = await companyService.getCompanyProfileById(id);
        if (!c?.id) return null;
        const data = c.data ?? {};
        const description = (data as { description?: string }).description ?? "";
        const body = description ? [description.slice(0, 220)] : [];
        const tech = Array.isArray((data as { techStack?: unknown }).techStack)
          ? ((data as { techStack: unknown[] }).techStack
              .filter((t): t is string => typeof t === "string")
              .slice(0, 6))
          : [];
        const size = (data as { size?: string }).size;
        const badges = [
          ...(size ? [size] : []),
          ...tech,
        ].slice(0, 6);
        return {
          kind: "company",
          id: c.id,
          title: (data as { name?: string }).name || "Unnamed company",
          subtitle: (data as { industry?: string }).industry ?? undefined,
          body,
          badges,
        };
      } catch {
        return null;
      }
    },
    InlineBody: CompanyInlineBody,
  },
  video: {
    label: "Video",
    sectionLabel: "Your videos",
    icon: PlayCircle,
    viewUrl: (id) => `/studio/${id}`,
    ctaLabel: "Watch video",
    listForUser: async () => {
      // No subject filter — list every project the user owns, mirrors
      // the `/studio` landing's "Your Projects" surface.
      const res = await studioService.getProjects();
      const items = res.data ?? [];
      return items
        .filter((p): p is typeof p & { id: string } => Boolean(p.id))
        .map((p) => ({
          kind: "video" as const,
          id: p.id,
          title: p.title || "Untitled video",
          subtitle:
            p.isPublic && p.videoUrl
              ? "Published"
              : String(p.status).replace(/_/g, " "),
        }));
    },
    fetchSummary: async (id) => {
      try {
        const res = await studioService.getProject(id);
        const p = res.data;
        if (!p?.id) return null;
        const raw = p as Record<string, unknown> & { description?: string; kind?: string };
        const description = typeof raw.description === "string" ? raw.description : "";
        const body = description ? [description.slice(0, 200)] : [];
        const badges = [
          p.isPublic && p.videoUrl ? "Public" : null,
          typeof raw.kind === "string" ? raw.kind : null,
        ].filter((s): s is string => Boolean(s));
        return {
          kind: "video",
          id: p.id,
          title: p.title || "Untitled video",
          subtitle:
            p.isPublic && p.videoUrl
              ? "Published"
              : String(p.status).replace(/_/g, " "),
          body,
          badges,
        };
      } catch {
        return null;
      }
    },
    InlineBody: VideoInlineBody,
  },
};

function subtitleForResume(r: {
  isActive?: boolean | null;
  isMaster?: boolean | null;
}): string | undefined {
  const parts: string[] = [];
  if (r.isActive) parts.push("Active");
  if (r.isMaster) parts.push("Master");
  return parts.length ? parts.join(" · ") : undefined;
}

const REF_SEPARATOR = ":";

/** Pack `(kind, id)` into a single dataTransfer payload string. Mirrors
 *  the music-source `kind:trackId` shape so the protocol layer stays a
 *  flat `data: string` channel — no second sidecar MIME per entity field. */
export function encodeLinkedContentRef(kind: LinkedContentKind, id: string): string {
  return `${kind}${REF_SEPARATOR}${id}`;
}

export function parseLinkedContentRef(
  ref: string,
): { kind: LinkedContentKind; id: string } | null {
  const idx = ref.indexOf(REF_SEPARATOR);
  if (idx <= 0) return null;
  const kind = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (!id) return null;
  if (!isLinkedContentKind(kind)) return null;
  return { kind, id };
}

export function isLinkedContentKind(value: string): value is LinkedContentKind {
  return Object.prototype.hasOwnProperty.call(LINKED_CONTENT_REGISTRY, value);
}

export function getLinkedContentMeta(kind: LinkedContentKind): LinkedContentMeta {
  return LINKED_CONTENT_REGISTRY[kind];
}

/** Every kind registered in `LINKED_CONTENT_REGISTRY` — drives the
 *  palette's section ordering and the inspector's "switch kind" picker. */
export const LINKED_CONTENT_KINDS = Object.keys(
  LINKED_CONTENT_REGISTRY,
) as LinkedContentKind[];

// ───────────────────────────────────────────────────────────────────────────
// Theme integration — single source of truth for "what colours does a
// linked-content card adopt from the active canvas theme / palette?"
// Read by `makeLinkedContentWidget` (initial stamp on insert) AND by
// `applyThemeToState` (re-stamp when the user switches themes) so the
// two paths can't drift.
// ───────────────────────────────────────────────────────────────────────────

import { VISUAL_THEMES } from "../visual-themes";

/** Colour set rendered by `LinkedContentBody`. Mirrors the CTA widget's
 *  per-widget colour pattern — `bgColor` is the card body; `textColor`
 *  and `mutedColor` carry headline / secondary text; `accentColor` paints
 *  the CTA pill + icon chip; `accentTextColor` is the CTA pill label.
 *  Every field is required on this resolved shape (the optional fields
 *  on `LinkedContentWidgetParams` are filled by `resolveLinkedContentColors`
 *  at stamp time, so the body component never has to default). */
export interface LinkedContentColors {
  bgColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  accentTextColor: string;
}

/** Conservative fallback when no theme + no palette is active. White card
 *  on the slate / indigo palette is the same look V1 ships for stock
 *  cards everywhere else in the app, so a no-theme canvas feels native. */
export const DEFAULT_LINKED_CONTENT_COLORS: LinkedContentColors = {
  bgColor: "#ffffff",
  textColor: "#0f172a",
  mutedColor: "#64748b",
  accentColor: "#4f46e5",
  accentTextColor: "#ffffff",
};

/** Read [primary, accent, surface] for the canvas state — palette
 *  overrides theme triple slot-by-slot, mirroring `applyThemeToState`'s
 *  precedence rule (#582). Returns null when neither is set so callers
 *  can fall through to the conservative default. */
function readPaletteTriple(
  state: Pick<
    import("./canvas-state").CanvasState,
    "colorPalette" | "themeId"
  >,
): { primary: string; accent: string; surface: string } | null {
  const theme = state.themeId
    ? VISUAL_THEMES.find((t) => t.id === state.themeId)
    : null;
  const palette = state.colorPalette;
  const primary = palette?.[0] ?? theme?.colors[0];
  const accent = palette?.[1] ?? theme?.colors[1];
  const surface = palette?.[2] ?? theme?.colors[2];
  if (!primary || !accent || !surface) return null;
  return { primary, accent, surface };
}

/** WCAG-style relative luminance gate. Hex must be `#rrggbb` —
 *  shorthand / rgba / named colours bail to "light" so callers fall
 *  through to dark text (safer default). */
function isDark(hex: string): boolean {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L < 0.5;
}

/** Pick `#0f172a` or `#ffffff` for readable text over `bg`. Shared with
 *  the accent-pill so the CTA stays legible even when the theme's
 *  accent is dark (e.g. emerald palettes). */
function pickContrast(bg: string): string {
  return isDark(bg) ? "#ffffff" : "#0f172a";
}

/** Resolve the colour set a freshly-inserted linked-content card should
 *  adopt, given the active canvas theme / palette. Card bg = surface
 *  (the "body-text + chrome colour" per the VisualTheme contract — it's
 *  the panel-ish shade in every shipped theme). Text colours derive via
 *  contrast against bg so a dark-cinematic theme (e.g. "Story-Led") gets
 *  light text and a bright theme gets dark text without per-theme tuning. */
export function resolveLinkedContentColors(
  state: Pick<
    import("./canvas-state").CanvasState,
    "colorPalette" | "themeId"
  >,
): LinkedContentColors {
  const triple = readPaletteTriple(state);
  if (!triple) return DEFAULT_LINKED_CONTENT_COLORS;
  const bgColor = triple.surface;
  const textColor = pickContrast(bgColor);
  const mutedColor = isDark(bgColor) ? "#cbd5e1" : "#64748b";
  const accentColor = triple.accent;
  const accentTextColor = pickContrast(accentColor);
  return { bgColor, textColor, mutedColor, accentColor, accentTextColor };
}

/** Apply current-state colours to a `LinkedContentWidgetParams`. Used
 *  both at insert time (to seed the card) and by `applyThemeToState` (to
 *  re-stamp every linked-content widget when the theme changes).
 *  Splitting this from `resolveLinkedContentColors` lets callers reuse
 *  the same resolved triple across many widgets in one walk. */
export function stampLinkedContentColors(
  data: import("./canvas-state").LinkedContentWidgetParams,
  colors: LinkedContentColors,
): import("./canvas-state").LinkedContentWidgetParams {
  return { ...data, ...colors };
}
