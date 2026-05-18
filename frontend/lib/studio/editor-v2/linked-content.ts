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
import type { ComponentType } from "react";
import { FileText } from "lucide-react";
import { resumeService } from "@/lib/services/resume-service";
import type { Basics, ResumeContent, Skill } from "@shared/resume";

/** Entity kinds that can be embedded as a card on the v2 canvas. Start
 *  with `resume`; future kinds (`job`, `profile`, `company`, `video`,
 *  `template`) bolt on by adding rows to `LINKED_CONTENT_REGISTRY` —
 *  no other file needs a switch update. */
export type LinkedContentKind = "resume";

/** Tile metadata for the palette section (one row per item the current
 *  user owns). Fetched from `LinkedContentMeta.listForUser` and rendered
 *  with the same `LeftPanelTile` the static widget catalog uses. */
export interface LinkedContentSummary {
  kind: LinkedContentKind;
  id: string;
  title: string;
  /** Secondary line (e.g. "Active · Master") — optional, rendered as a
   *  hint / tooltip when present. */
  subtitle?: string;
}

/** Rich preview data fetched on-demand when a linked-content widget
 *  mounts on the canvas. Shape is intentionally generic so the canvas
 *  body renderer is one component regardless of entity kind — per-kind
 *  semantics live in the registry's `fetchPreview` projection. */
export interface LinkedContentPreview {
  kind: LinkedContentKind;
  id: string;
  /** Headline (resume title / job title / person name). */
  title: string;
  /** Sub-headline (current role · company / location / posted date). */
  subtitle?: string;
  /** Body paragraph (resume summary / job description excerpt). */
  body?: string;
  /** Up to ~6 chip-style tags (skills / keywords / requirements). */
  chips?: string[];
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
  /** Fetch the preview projection for a single item by id. Returns
   *  `null` when the entity can't be resolved (deleted / unauthorized /
   *  not yet picked). */
  fetchPreview: (id: string) => Promise<LinkedContentPreview | null>;
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
    fetchPreview: async (id) => {
      try {
        const resume = await resumeService.getResumeById(id);
        if (!resume) return null;
        const content = (resume.content as ResumeContent | undefined) ?? undefined;
        const basics: Basics | undefined = content?.basics;
        const skills: Skill[] = content?.skills ?? [];
        return {
          kind: "resume",
          id: resume.id ?? id,
          title: resume.title || basics?.name || "Untitled resume",
          subtitle: basics?.label || undefined,
          body: basics?.summary || undefined,
          chips: skills
            .map((s) => s?.name ?? "")
            .filter((name): name is string => name.length > 0)
            .slice(0, 6),
        };
      } catch {
        return null;
      }
    },
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
