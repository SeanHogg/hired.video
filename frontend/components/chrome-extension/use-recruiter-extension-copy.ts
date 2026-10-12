// Recruiter / company Chrome-extension copy for /chrome-extension. Rendered
// only while HIRING_PERSONAS_ENABLED is on (shared/user-roles.ts).

import { useTranslation } from "react-i18next";
import {
  Bookmark,
  Building2,
  LayoutGrid,
  ListChecks,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  Target,
  UserPlus,
  Wand2,
} from "lucide-react";
import { TIER_NAME } from "@shared/tier-copy";
import type { ExtensionDetailItem } from "./ExtensionDetailBand";

export const RECRUITER_STORE_URL =
  "https://chromewebstore.google.com/detail/hiredvideo-recruiter/edijibmdaiaaegdbbpbjdhojeaahkbkn";

const DETAILS: { id: string; icon: ExtensionDetailItem["icon"]; key: string }[] = [
  { id: "capture", icon: UserPlus, key: "recCapture" },
  { id: "bulk", icon: ListChecks, key: "recBulk" },
  { id: "call", icon: Phone, key: "recCall" },
  { id: "emailSms", icon: Mail, key: "recEmailSms" },
  { id: "picker", icon: Target, key: "recPicker" },
  { id: "sequences", icon: Send, key: "recSequences" },
  { id: "trackedJobs", icon: Bookmark, key: "recTrackedJobs" },
  { id: "wand", icon: Wand2, key: "recWand" },
  { id: "company", icon: Building2, key: "recCompany" },
  { id: "talentPool", icon: Search, key: "recTalentPool" },
  { id: "kanban", icon: LayoutGrid, key: "recKanban" },
  { id: "scoring", icon: MessageSquare, key: "recScoring" },
];

const FEATURE_KEYS = [
  "messages.chromeExtension.recFeatProfile",
  "messages.chromeExtension.recFeatBulk",
  "messages.chromeExtension.recFeatOutreach",
  "messages.chromeExtension.recFeatPicker",
  "messages.chromeExtension.recFeatTags",
  "messages.chromeExtension.recFeatWand",
];

export function useRecruiterExtensionCopy() {
  const { t } = useTranslation();
  const details: ExtensionDetailItem[] = DETAILS.map((d) => ({
    id: d.id,
    icon: d.icon,
    title: t(`headings.chromeExtension.${d.key}`, { tier: TIER_NAME.pro }),
    desc: t(`messages.chromeExtension.${d.key}`),
  }));
  return { features: FEATURE_KEYS.map((k) => t(k)), details };
}
