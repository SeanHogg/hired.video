/**
 * LinkedIn connector.
 *
 * Differences from the default block renderer:
 *   - Headline is capped at 220 chars and surfaces a charLimit so the UI
 *     warns when the user's `basics.label` runs long.
 *   - About section is capped at 2,600 chars (LinkedIn limit).
 *   - Experience: one block per position whose `autofillSteps` walk
 *     LinkedIn's "Add position" modal one field at a time (Title → Company
 *     → Description). Each step is a separate, user-confirmed fill; the
 *     company typeahead is left for the user to pick from (#2138).
 *   - Skills surface as one block per skill (LinkedIn's "Add skill" picker
 *     is one-at-a-time). Each block types its skill into the open picker's
 *     typeahead; the user picks the match — paste-then-pick, no key
 *     simulation, so nothing trips LinkedIn's automation checks.
 *
 * Extraction direction: LinkedIn supports extension-driven scraping today
 * (PROFILE_SITE_PARSERS.linkedin in shared/profile-parsers.js).
 */

import type { ResumeContent, Work } from "../../../../../shared/resume.js";
import type { AutofillStep, ExportBlock, VendorConnector } from "./types.js";
import { renderDefaultBlocks } from "./default-blocks.js";

const LINKEDIN_HEADLINE_LIMIT = 220;
const LINKEDIN_ABOUT_LIMIT = 2_600;
const LINKEDIN_POSITION_DESCRIPTION_LIMIT = 2_000;

// LinkedIn DOM selectors for the edit modals. The user must open the
// modal (pencil icon / "Add position" / "Add skill") before clicking
// Auto-fill — this connector NEVER opens modals or saves automatically.
// LinkedIn's form ids embed the field name (`…-POSITION-…-title`,
// `…-requiredCompany`, `…-SKILL-…`); ARIA labels / placeholders are the
// fallback. Expect drift — the extension reports selector misses (#1453).
const LINKEDIN_AUTOFILL = {
  headline: 'input[aria-label*="Headline" i], input[id*="single-line-text" i]',
  about: 'textarea[aria-label*="About" i], textarea[aria-label*="Summary" i]',
  title: 'input[id*="POSITION" i][id$="-title" i], input[id*="profilePosition" i][id*="title" i]',
  company: 'input[id*="requiredCompany" i], input[id*="POSITION" i][id*="company" i]',
  description: 'textarea[id*="POSITION" i][id*="description" i], textarea[id*="profilePosition" i]',
  skill: 'input[id*="SKILL" i][id*="typeahead" i], input[aria-label*="Skill" i], input[placeholder*="Skill" i]',
} as const;

/** The position's description as LinkedIn takes it: summary, then bullets. */
function positionDescription(w: Work): string {
  const bullets = (w.highlights ?? [])
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => `• ${h.trim()}`)
    .join("\n");
  return [w.summary?.trim() ?? "", bullets].filter(Boolean).join("\n\n");
}

/** The "Add position" modal, one field per step; empty fields are skipped. */
export function linkedinPositionSteps(w: Work): AutofillStep[] {
  const steps: AutofillStep[] = [
    { field: "title", selector: LINKEDIN_AUTOFILL.title, value: (w.position ?? "").trim() },
    { field: "company", selector: LINKEDIN_AUTOFILL.company, value: (w.name ?? "").trim() },
    {
      field: "description",
      selector: LINKEDIN_AUTOFILL.description,
      value: positionDescription(w).slice(0, LINKEDIN_POSITION_DESCRIPTION_LIMIT),
    },
  ];
  return steps.filter((s) => s.value.length > 0);
}

export const linkedinConnector: VendorConnector = {
  id: "linkedin",
  label: "LinkedIn",
  iconKey: "linkedin",
  category: "professional",
  description:
    "Sync your master resume to your LinkedIn profile — keep headline, about, experience, and skills aligned.",
  editProfileUrl: "https://www.linkedin.com/in/me/edit/intro/",
  supportsExtensionExtract: true,
  // Headline, About, Experience (step by step) and Skills (one per skill)
  // write back via DOM autofill — user-initiated, edit modal already open.
  supportsExtensionWrite: true,

  renderExportBlocks(content: ResumeContent): ExportBlock[] {
    const base = renderDefaultBlocks(content);
    const work = content.work ?? [];
    let workIndex = 0;

    const adjusted: ExportBlock[] = [];
    for (const block of base) {
      if (block.section === "Headline") {
        adjusted.push({ ...block, charLimit: LINKEDIN_HEADLINE_LIMIT, autofillSelector: LINKEDIN_AUTOFILL.headline });
      } else if (block.section === "About") {
        adjusted.push({ ...block, charLimit: LINKEDIN_ABOUT_LIMIT, autofillSelector: LINKEDIN_AUTOFILL.about });
      } else if (block.section === "Experience") {
        // renderDefaultBlocks emits one Experience block per work entry, in order.
        const entry = work[workIndex++];
        const steps = entry ? linkedinPositionSteps(entry) : [];
        adjusted.push(steps.length > 0 ? { ...block, autofillSteps: steps } : block);
      } else if (block.section !== "Skills") {
        // The flat Skills block is replaced below by per-skill blocks.
        adjusted.push(block);
      }
    }

    for (const skill of content.skills ?? []) {
      const raw = typeof skill === "object" && skill ? (skill as { name?: unknown }).name : "";
      const name = typeof raw === "string" ? raw.trim() : "";
      if (!name) continue;
      adjusted.push({
        section: "Skills",
        subSection: name,
        text: name,
        format: "plain",
        autofillSelector: LINKEDIN_AUTOFILL.skill,
      });
    }

    return adjusted;
  },
};
