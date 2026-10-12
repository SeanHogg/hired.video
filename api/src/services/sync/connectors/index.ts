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
import type { ExportBlock, VendorConnector } from "./types.js";
import { renderDefaultBlocks } from "./default-blocks.js";
import { linkedinConnector } from "./linkedin.js";
import { githubConnector } from "./github.js";

/** Per-vendor tuning applied uniformly by `defaultVendor()`. Keeping the
 *  tuning declarative + colocated with the connector entry means we add
 *  vendor-specific shaping (autofill selectors, char limits, etc.) without
 *  per-vendor connector files for every default vendor. DRY rule: the
 *  block-post-processing logic lives in `applyTuning` below, not inlined
 *  N times. Closes gaps #434 + #1421. */
interface VendorTuning {
  /** Section name → CSS selector inside the vendor's profile-edit page.
   *  When present, the matching block surfaces an Auto-fill button. */
  autofillSelectors?: Record<string, string>;
  /** Truncate the About/Summary block to this many characters with a
   *  trailing "…". Wellfound elevator-pitch (~240), ZipRecruiter blurb
   *  (~600), Monster highlights (~500). LinkedIn handles its own 2600
   *  cap via charLimit (the user gets a red counter, not truncation). */
  summaryMaxChars?: number;
  /** Vendor calls the About section something else (e.g. Indeed
   *  "Summary", Monster "Highlights"). Renames the rendered block. */
  summaryLabel?: string;
}

function applyTuning(blocks: ExportBlock[], tuning: VendorTuning | undefined): ExportBlock[] {
  if (!tuning) return blocks;
  return blocks.map<ExportBlock>((block) => {
    let out: ExportBlock = block;
    if (tuning.summaryLabel && out.section === "About") {
      out = { ...out, section: tuning.summaryLabel };
    }
    if (tuning.summaryMaxChars && (out.section === "About" || out.section === tuning.summaryLabel)) {
      const cap = tuning.summaryMaxChars;
      if (out.text.length > cap) {
        out = { ...out, text: out.text.slice(0, cap - 1).trimEnd() + "…", charLimit: cap };
      } else {
        out = { ...out, charLimit: cap };
      }
    }
    const sel = tuning.autofillSelectors?.[out.section];
    if (sel) out = { ...out, autofillSelector: sel };
    return out;
  });
}

function defaultVendor(
  partial: Omit<VendorConnector, "renderExportBlocks"> & { tuning?: VendorTuning },
): VendorConnector {
  const { tuning, ...connector } = partial;
  return {
    ...connector,
    renderExportBlocks: (content: ResumeContent) =>
      applyTuning(renderDefaultBlocks(content), tuning),
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
  supportsExtensionWrite: true,
  tuning: {
    summaryLabel: "Summary",
    autofillSelectors: {
      Headline: 'input[aria-label*="Headline" i], input[aria-label*="Title" i]',
      Summary: 'textarea[aria-label*="Summary" i], textarea[aria-label*="About" i]',
    },
  },
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
  supportsExtensionWrite: true,
  tuning: {
    autofillSelectors: {
      Headline: 'input[aria-label*="Headline" i], input[name*="headline" i]',
      About: 'textarea[aria-label*="About" i], textarea[aria-label*="Bio" i]',
    },
  },
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
  supportsExtensionWrite: true,
  tuning: {
    // ZipRecruiter profile blurb has a ~600-char soft cap; truncate and
    // show the limit badge so the user sees they're at the edge.
    summaryMaxChars: 600,
    autofillSelectors: {
      Headline: 'input[aria-label*="Title" i], input[name*="title" i]',
      About: 'textarea[aria-label*="About" i], textarea[aria-label*="Summary" i]',
    },
  },
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
  supportsExtensionExtract: true,
  supportsExtensionWrite: true,
  tuning: {
    // Wellfound's elevator-pitch field is intentionally short (~240 char).
    summaryMaxChars: 240,
    autofillSelectors: {
      Headline: 'input[aria-label*="role" i], input[name*="role" i]',
      About: 'textarea[aria-label*="bio" i], textarea[placeholder*="elevator" i]',
    },
  },
});

const diceConnector = defaultVendor({
  id: "dice",
  label: "Dice",
  iconKey: "code",
  category: "job-board",
  description:
    "Sync to Dice's tech-focused profile — ideal for roles where keyword density matters.",
  editProfileUrl: "https://www.dice.com/dashboard/profile",
  supportsExtensionExtract: true,
  supportsExtensionWrite: true,
  tuning: {
    autofillSelectors: {
      Headline: 'input[aria-label*="Title" i], input[name*="title" i]',
      About: 'textarea[aria-label*="Summary" i], textarea[name*="summary" i]',
    },
  },
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
  supportsExtensionWrite: true,
  tuning: {
    summaryLabel: "Highlights",
    // Monster's Highlights field favours tight bullets — ~500 char cap.
    summaryMaxChars: 500,
    autofillSelectors: {
      Headline: 'input[aria-label*="Headline" i], input[aria-label*="Title" i]',
      Highlights: 'textarea[aria-label*="Highlights" i], textarea[aria-label*="Summary" i]',
    },
  },
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
