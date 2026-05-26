/**
 * Vendor Sync — connector registry.
 *
 * Single source of truth for which vendors the tool page surfaces.
 * Adding a new vendor: drop a `VendorConnector` config here. Most
 * vendors only need an entry in this file — the default block renderer
 * + shared LLM extractor cover the work.
 *
 * `supportsExtensionExtract` controls whether the "Sync from extension"
 * CTA renders on the card. The actual DOM selectors live in the
 * extension's `shared/profile-parsers.js`; this flag must stay in
 * lockstep with the parsers there.
 */

import type { ResumeContent } from "../../../../../shared/resume.js";
import type { VendorConnector } from "./types.js";
import { renderDefaultBlocks } from "./default-blocks.js";
import { linkedinConnector } from "./linkedin.js";
import { githubConnector } from "./github.js";

function defaultVendor(
  partial: Omit<VendorConnector, "renderExportBlocks">,
): VendorConnector {
  return {
    ...partial,
    renderExportBlocks: (content: ResumeContent) => renderDefaultBlocks(content),
  };
}

const indeedConnector = defaultVendor({
  id: "indeed",
  label: "Indeed",
  iconKey: "briefcase",
  category: "job-board",
  description:
    "Indeed Resume mirrors most job-board fields — paste the rendered blocks straight in.",
  // profile.indeed.com is the modern editor. The extension's parser now
  // matches this host AND the legacy /resumes/* URL — fixes gap #1414.
  editProfileUrl: "https://profile.indeed.com/",
  supportsExtensionExtract: true,
  supportsExtensionWrite: false,
});

const glassdoorConnector = defaultVendor({
  id: "glassdoor",
  label: "Glassdoor",
  iconKey: "building",
  category: "job-board",
  description:
    "Sync your work history and skills to your Glassdoor profile.",
  editProfileUrl: "https://www.glassdoor.com/member/profile/index.htm",
  supportsExtensionExtract: true,
  supportsExtensionWrite: false,
});

const ziprecruiterConnector = defaultVendor({
  id: "ziprecruiter",
  label: "ZipRecruiter",
  iconKey: "zap",
  category: "job-board",
  description:
    "Push your master resume into your ZipRecruiter profile and resume builder.",
  editProfileUrl: "https://www.ziprecruiter.com/profile",
  supportsExtensionExtract: true,
  supportsExtensionWrite: false,
});

const wellfoundConnector = defaultVendor({
  id: "wellfound",
  label: "Wellfound",
  iconKey: "rocket",
  category: "startup",
  description:
    "Wellfound (formerly AngelList Talent) — keep your startup-jobs profile aligned with your master.",
  // /profile is Wellfound's stable redirect to the signed-in user's
  // profile editor. The previous `/jobs` link pointed at the candidate
  // jobs board, which has nothing to do with syncing. Fixes gap #1415.
  editProfileUrl: "https://wellfound.com/profile",
  supportsExtensionExtract: false,
  supportsExtensionWrite: false,
});

const diceConnector = defaultVendor({
  id: "dice",
  label: "Dice",
  iconKey: "code",
  category: "job-board",
  description:
    "Sync to Dice's tech-focused profile — ideal for roles where keyword density matters.",
  editProfileUrl: "https://www.dice.com/dashboard/profile",
  supportsExtensionExtract: false,
  supportsExtensionWrite: false,
});

const monsterConnector = defaultVendor({
  id: "monster",
  label: "Monster",
  iconKey: "ghost",
  category: "job-board",
  description:
    "Update your Monster profile from your hired.video master.",
  editProfileUrl: "https://www.monster.com/profile",
  supportsExtensionExtract: true,
  supportsExtensionWrite: false,
});

const personalSiteConnector = defaultVendor({
  id: "personal-site",
  label: "Personal Site / Portfolio",
  iconKey: "globe",
  category: "portfolio",
  description:
    "Generic export blocks for your own site, Notion page, or portfolio template.",
  editProfileUrl: "",
  supportsExtensionExtract: false,
  supportsExtensionWrite: false,
});

const VENDORS: VendorConnector[] = [
  linkedinConnector,
  indeedConnector,
  glassdoorConnector,
  ziprecruiterConnector,
  wellfoundConnector,
  diceConnector,
  monsterConnector,
  githubConnector,
  personalSiteConnector,
];

export function listConnectors(): VendorConnector[] {
  return VENDORS.slice();
}

export function getConnector(id: string): VendorConnector | null {
  return VENDORS.find((v) => v.id === id) ?? null;
}
