import { Building2 } from "lucide-react";
import { companyService } from "@/lib/services/company-service";
import { publicCompanyPath } from "@shared/public-paths";
import type { LinkedContentMeta } from "./types";

export const COMPANY_LINKED_CONTENT: LinkedContentMeta = {
  label: "Company",
  sectionLabel: "Your companies",
  icon: Building2,
  viewUrl: (id) => publicCompanyPath(id),
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
};
