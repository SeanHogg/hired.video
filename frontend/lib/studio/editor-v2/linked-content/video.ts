import { PlayCircle } from "lucide-react";
import { studioService } from "@/lib/services/studio-service";
import { publicVideoPath } from "@shared/public-paths";
import type { LinkedContentMeta } from "./types";

export const VIDEO_LINKED_CONTENT: LinkedContentMeta = {
  label: "Video",
  sectionLabel: "Your videos",
  icon: PlayCircle,
  viewUrl: (id) => publicVideoPath(id),
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
};
