// Copy for /chrome-extension: ONE extension, three lenses (job seeker,
// recruiter, sales & social) on one pair + verb engine. Data-driven so the
// page, lens cards and feature bands stay thin; every string is i18n.

import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Briefcase,
  Download,
  FileText,
  GitCompare,
  Hand,
  Link2,
  Mail,
  MessageSquareReply,
  MousePointerClick,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Target,
  UserCheck,
  UserPlus,
  Users,
  Video,
  Megaphone,
  ClipboardCheck,
} from "lucide-react";
import { TIER_NAME } from "@shared/tier-copy";
import type { ExtensionDetailItem } from "./ExtensionDetailBand";

const P = "chromeExtension.one";

type Icon = ExtensionDetailItem["icon"];

export type LensId = "job-seeker" | "recruiter" | "sales";

export interface ExtensionLens {
  id: LensId;
  icon: Icon;
  chip: string;
  title: string;
  body: string;
  band: { title: string; subtitle: string; items: ExtensionDetailItem[] };
}

const LENSES: { id: LensId; key: string; icon: Icon; items: { id: string; icon: Icon }[] }[] = [
  {
    id: "job-seeker",
    key: "jobSeeker",
    icon: Briefcase,
    items: [
      { id: "detect", icon: ScanSearch },
      { id: "tailor", icon: Target },
      { id: "cover", icon: FileText },
      { id: "autofill", icon: ClipboardCheck },
      { id: "video", icon: Video },
      { id: "download", icon: Download },
    ],
  },
  {
    id: "recruiter",
    key: "recruiter",
    icon: Users,
    items: [
      { id: "detect", icon: UserPlus },
      { id: "pair", icon: Link2 },
      { id: "outreach", icon: Mail },
      { id: "video", icon: Video },
      { id: "consent", icon: UserCheck },
    ],
  },
  {
    id: "sales",
    key: "sales",
    icon: Megaphone,
    items: [
      { id: "pitch", icon: Video },
      { id: "reply", icon: MessageSquareReply },
      { id: "message", icon: Hand },
    ],
  },
];

const EVERY_LENS: { id: string; icon: Icon }[] = [
  { id: "importOwn", icon: Download },
  { id: "compare", icon: GitCompare },
  { id: "picker", icon: MousePointerClick },
  { id: "analytics", icon: BarChart3 },
  { id: "sync", icon: RefreshCw },
  { id: "neverSends", icon: ShieldCheck },
];

export const VERBS = ["create", "strengthen", "target", "promote"] as const;

export function useChromeExtensionCopy() {
  const { t } = useTranslation();

  const lenses: ExtensionLens[] = LENSES.map((l) => ({
    id: l.id,
    icon: l.icon,
    chip: t(`${P}.lens.${l.key}.chip`),
    title: t(`${P}.lens.${l.key}.title`),
    body: t(`${P}.lens.${l.key}.body`),
    band: {
      title: t(`${P}.band.${l.key}.title`),
      subtitle: t(`${P}.band.${l.key}.subtitle`),
      items: l.items.map((i) => ({
        id: i.id,
        icon: i.icon,
        title: t(`${P}.band.${l.key}.${i.id}.title`),
        desc: t(`${P}.band.${l.key}.${i.id}.body`),
      })),
    },
  }));

  const everyLens: ExtensionDetailItem[] = EVERY_LENS.map((i) => ({
    id: i.id,
    icon: i.icon,
    title: t(`${P}.band.every.${i.id}.title`),
    desc: t(`${P}.band.every.${i.id}.body`),
  }));

  const verbs = VERBS.map((v, n) => ({
    id: v,
    step: n + 1,
    title: t(`${P}.verb.${v}.title`),
    body: t(`${P}.verb.${v}.body`),
  }));

  const faq = [
    { question: t(`${P}.faq.freeQ`), answer: t(`${P}.faq.freeA`, { tier: TIER_NAME.pro }) },
    { question: t(`${P}.faq.countQ`), answer: t(`${P}.faq.countA`) },
    { question: t(`${P}.faq.sendQ`), answer: t(`${P}.faq.sendA`) },
    { question: t(`${P}.faq.sitesQ`), answer: t(`${P}.faq.sitesA`) },
    { question: t(`${P}.faq.consentQ`), answer: t(`${P}.faq.consentA`) },
    { question: t(`${P}.faq.compareQ`), answer: t(`${P}.faq.compareA`) },
    { question: t(`${P}.faq.accountQ`), answer: t(`${P}.faq.accountA`) },
    { question: t(`${P}.faq.browserQ`), answer: t(`${P}.faq.browserA`) },
  ];

  return { lenses, everyLens, verbs, faq };
}
