import { FileText } from "lucide-react";
import { resumeService } from "@/lib/services/resume-service";
import { publicResumePath } from "@shared/public-paths";
import type { LinkedContentMeta } from "./types";

export const RESUME_LINKED_CONTENT: LinkedContentMeta = {
  label: "Resume",
  sectionLabel: "Your resumes",
  icon: FileText,
  viewUrl: (id) => publicResumePath(id),
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
