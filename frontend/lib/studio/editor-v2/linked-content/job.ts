import { Briefcase } from "lucide-react";
import { jobService } from "@/lib/services/job-service";
import { publicJobPath } from "@shared/public-paths";
import type { LinkedContentMeta } from "./types";

export const JOB_LINKED_CONTENT: LinkedContentMeta = {
  label: "Job",
  sectionLabel: "Your jobs",
  icon: Briefcase,
  viewUrl: (id) => publicJobPath(id),
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
};
