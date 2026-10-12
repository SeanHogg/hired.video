import { User } from "lucide-react";
import { userService } from "@/lib/services/user-service";
import { publicProfilePath } from "@shared/public-paths";
import type { LinkedContentMeta } from "./types";

export const PROFILE_LINKED_CONTENT: LinkedContentMeta = {
  label: "Profile",
  sectionLabel: "Your profile",
  icon: User,
  viewUrl: (id) => publicProfilePath(id),
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
};
