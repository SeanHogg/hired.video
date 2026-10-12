import { Newspaper } from "lucide-react";
import { articleService } from "@/lib/services/article-service";
import { publicArticleByIdPath } from "@shared/public-paths";
import type { LinkedContentMeta } from "./types";

export const ARTICLE_LINKED_CONTENT: LinkedContentMeta = {
  label: "Article",
  sectionLabel: "Your articles",
  icon: Newspaper,
  viewUrl: (id) => publicArticleByIdPath(id),
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
};
