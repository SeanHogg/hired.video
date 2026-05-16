/**
 * Template content-slot bindings — declares, per template, which
 * placeholder strings in the seeded canvas (`template-seeds.ts`) should
 * be replaced with which fields from the user's content.
 *
 * Why a separate file: catalog.tsx is layout-side (icons + intake forms);
 * template-seeds.ts is structural (positions + colours); slot bindings
 * are a third concern (content mapping). Splitting keeps the dependency
 * graph honest — the slot file imports the user-content snapshot type,
 * which catalog.tsx must not pull into the React component tree.
 *
 * DRY: every "AI fills the template with the user's content" path —
 * the AI CHRO tool, future deep-links, future bulk-generate flows —
 * resolves bindings through this file. Tokens that don't have a
 * binding fall through to the seed's placeholder text, so the manual
 * "pick template → edit by hand" flow is unaffected.
 */

import type { ContentTemplate } from "@/components/studio/templates/catalog";
import type { UserContentSnapshot } from "./resolve-user-content";

export interface TemplateSlot {
  /** The exact placeholder substring that appears in the seeded canvas
   *  (e.g. "[Your Name]"). All occurrences across every text widget are
   *  replaced. Use the full placeholder verbatim — including brackets and
   *  surrounding punctuation — so substitution is unambiguous. */
  placeholder: string;
  /** Read the slot value from the resolved user-content snapshot.
   *  Returning `undefined` (or an empty string) leaves the placeholder
   *  text intact, so partial bindings degrade gracefully. */
  read: (uc: UserContentSnapshot) => string | undefined;
}

const yearsLabel = (uc: UserContentSnapshot): string | undefined => {
  const years = uc.profile?.yearsOfExperience;
  if (typeof years === "number" && years > 0) return String(years);
  return undefined;
};

const topWorkBullets = (uc: UserContentSnapshot, n: number): string | undefined => {
  const work = uc.resume?.work ?? [];
  const slice = work.slice(0, n).filter((w) => w.name || w.position);
  if (slice.length === 0) return undefined;
  return slice.map((w) => `• ${w.name || "—"} — ${w.position || "—"}`).join("\n");
};

const topSkillNames = (uc: UserContentSnapshot, n: number): string[] => {
  const skills = uc.resume?.skills ?? [];
  return skills.slice(0, n).map((s) => s.name).filter(Boolean);
};

/** Slot bindings keyed by ContentTemplate. Only templates that
 *  meaningfully consume user content appear here — the job_ad /
 *  company_promo / sizzle_reel templates need a Job / Company / Clip
 *  picker before the CHRO can bind them, and are tracked as deferred
 *  in the gap register. */
export const TEMPLATE_SLOTS: Partial<Record<ContentTemplate, TemplateSlot[]>> = {
  profile: [
    { placeholder: "Hi, I'm [Your Name]", read: (uc) => uc.profile?.name ? `Hi, I'm ${uc.profile.name}` : undefined },
    { placeholder: "[Role] · [Specialty]", read: (uc) => uc.profile?.headline },
    { placeholder: "[your-email]", read: (uc) => uc.profile?.email },
  ],

  resume: [
    { placeholder: "[Your Name]", read: (uc) => uc.profile?.name ?? uc.resume?.basics?.name },
    {
      placeholder: "[Current role] · [Years] years",
      read: (uc) => {
        const role = uc.resume?.basics?.label || uc.profile?.currentRole;
        const years = yearsLabel(uc);
        if (!role && !years) return undefined;
        const parts: string[] = [];
        if (role) parts.push(role);
        if (years) parts.push(`${years} years`);
        return parts.join(" · ");
      },
    },
    {
      placeholder: "• [Company] — [Role]\n• [Company] — [Role]\n• [Company] — [Role]",
      read: (uc) => topWorkBullets(uc, 3),
    },
  ],

  personal_brand: [
    { placeholder: "[Your hook]", read: (uc) => uc.profile?.headline ?? uc.resume?.basics?.summary },
    {
      placeholder: "[Paragraph one]\n[Paragraph two]",
      read: (uc) => uc.profile?.bio ?? uc.resume?.basics?.summary,
    },
    { placeholder: "[your link]", read: (uc) => uc.profile?.publicProfileUrl },
  ],

  skills_demo: [
    {
      placeholder: "[Skill name]",
      // Note: the seed has TWO "[Skill name]" widgets (one per scene).
      // String.split/join replaces both with the same value — that's a
      // single-slot limitation. Future work: per-occurrence indexing.
      read: (uc) => topSkillNames(uc, 1)[0],
    },
    {
      placeholder: "Where I used it: [project / company]",
      read: (uc) => {
        const work = uc.resume?.work?.[0];
        if (!work) return undefined;
        return `Where I used it: ${work.name || work.position}`;
      },
    },
  ],
};
