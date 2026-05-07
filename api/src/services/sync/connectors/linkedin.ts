/**
 * LinkedIn connector.
 *
 * Differences from the default block renderer:
 *   - Headline is capped at 220 chars and surfaces a charLimit so the UI
 *     warns when the user's `basics.label` runs long.
 *   - About section is capped at 2,600 chars (LinkedIn limit).
 *   - Skills surface as one block per skill (LinkedIn's "Add skill" picker
 *     is one-at-a-time) rather than a comma-separated dump — the user
 *     copies skill names into the typeahead.
 *
 * Extraction direction: LinkedIn supports extension-driven scraping today
 * (PROFILE_SITE_PARSERS.linkedin in shared/profile-parsers.js). Write-back
 * via DOM autofill is deferred — see gap register.
 */

import type { ResumeContent } from "../../../../../shared/resume.js";
import type { ExportBlock, VendorConnector } from "./types.js";
import { renderDefaultBlocks } from "./default-blocks.js";

const LINKEDIN_HEADLINE_LIMIT = 220;
const LINKEDIN_ABOUT_LIMIT = 2_600;

export const linkedinConnector: VendorConnector = {
  id: "linkedin",
  label: "LinkedIn",
  iconKey: "linkedin",
  category: "professional",
  description:
    "Sync your master resume to your LinkedIn profile — keep headline, about, experience, and skills aligned.",
  editProfileUrl: "https://www.linkedin.com/in/me/edit/intro/",
  supportsExtensionExtract: true,
  supportsExtensionWrite: false,

  renderExportBlocks(content: ResumeContent): ExportBlock[] {
    const base = renderDefaultBlocks(content);

    const adjusted = base.map<ExportBlock>((block) => {
      if (block.section === "Headline") {
        return { ...block, charLimit: LINKEDIN_HEADLINE_LIMIT };
      }
      if (block.section === "About") {
        return { ...block, charLimit: LINKEDIN_ABOUT_LIMIT };
      }
      // Drop the default flat Skills block — replaced below by per-skill
      // blocks so the user can paste each into LinkedIn's typeahead.
      if (block.section === "Skills") return null as unknown as ExportBlock;
      return block;
    }).filter((b): b is ExportBlock => b !== null);

    for (const skill of content.skills ?? []) {
      const name = (typeof skill === "object" && skill ? (skill as any).name : "")?.trim();
      if (!name) continue;
      adjusted.push({
        section: "Skills",
        subSection: name,
        text: name,
        format: "plain",
      });
    }

    return adjusted;
  },
};
