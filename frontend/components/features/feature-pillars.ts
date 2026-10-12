// /features pillar data — one pillar = one marketing band on the page.
import {
  FileText,
  Clapperboard,
  GraduationCap,
  Users,
  ClipboardCheck,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { NEW_KIT_PATH } from "@/lib/build-entry";

// One pillar = one marketing section; the page groups them by `track`.
// Each card carries a tight blurb, a few proof bullets, and (when the
// surface is live) a deep link, so the page reads as "here's what shipped,
// go use it" rather than a brochure.
export interface FeatureCard {
  titleKey: string;
  descKey: string;
  bulletKeys: string[];
  /** Deep link into the live surface. Omitted for cards whose surface
   *  hasn't launched yet — the card then renders without a link. */
  to?: string;
  ctaKey?: string;
}

/** `core` = the job-seeker product we lead with; `expansion` = recruiting,
 *  HR and learning, listed below it as where the platform is growing. */
export type FeatureTrack = "core" | "expansion";

export interface FeaturePillar {
  icon: LucideIcon;
  eyebrowKey: string;
  headingKey: string;
  subKey: string;
  cards: FeatureCard[];
  track: FeatureTrack;
  /** Optional status chip beside the eyebrow (e.g. "Coming soon"). */
  statusKey?: string;
}

export const PILLARS: FeaturePillar[] = [
  // ─── Resume → video → post (job-seeker product) ─────────────────────────
  {
    icon: FileText,
    eyebrowKey: "features.resume.eyebrow",
    headingKey: "features.resume.heading",
    subKey: "features.resume.sub",
    track: "core",
    cards: [
      {
        titleKey: "features.resume.build.title",
        descKey: "features.resume.build.desc",
        bulletKeys: [
          "features.resume.build.bullet1",
          "features.resume.build.bullet2",
          "features.resume.build.bullet3",
        ],
        to: NEW_KIT_PATH,
        ctaKey: "landing.cta.buildMyResume",
      },
      {
        titleKey: "features.resume.video.title",
        descKey: "features.resume.video.desc",
        bulletKeys: [
          "features.resume.video.bullet1",
          "landing.steps.promote.vertical",
          "features.resume.video.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.video.cta",
      },
      {
        titleKey: "features.resume.post.title",
        descKey: "features.resume.post.desc",
        bulletKeys: [
          "pricing.js.free.channels",
          "features.resume.post.bullet2",
          "features.resume.post.bullet3",
        ],
        to: "/pricing",
        ctaKey: "actions.viewPricing",
      },
    ],
  },
  // ─── Creator Studio (multi-kind) ────────────────────────────────────────
  {
    icon: Clapperboard,
    track: "core",
    eyebrowKey: "features.studio.eyebrow",
    headingKey: "features.studio.heading",
    subKey: "features.studio.sub",
    cards: [
      {
        titleKey: "features.studio.video.title",
        descKey: "features.studio.video.desc",
        bulletKeys: [
          "features.studio.video.bullet1",
          "features.studio.video.bullet2",
          "features.studio.video.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.video.cta",
      },
      {
        titleKey: "features.studio.audio.title",
        descKey: "features.studio.audio.desc",
        bulletKeys: [
          "features.studio.audio.bullet1",
          "features.studio.audio.bullet2",
          "features.studio.audio.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.audio.cta",
      },
      {
        titleKey: "features.studio.interactive.title",
        descKey: "features.studio.interactive.desc",
        bulletKeys: [
          "features.studio.interactive.bullet1",
          "features.studio.interactive.bullet2",
          "features.studio.interactive.bullet3",
        ],
        to: "/studio",
        ctaKey: "features.studio.interactive.cta",
      },
      {
        titleKey: "features.studio.monetize.title",
        descKey: "features.studio.monetize.desc",
        bulletKeys: [
          "features.studio.monetize.bullet1",
          "features.studio.monetize.bullet2",
          "features.studio.monetize.bullet3",
        ],
        to: "/services/gigs",
        ctaKey: "features.studio.monetize.cta",
      },
    ],
  },
  // ─── Learning ───────────────────────────────────────────────────────────
  {
    icon: GraduationCap,
    track: "expansion",
    statusKey: "features.expansion.status.earlyAccess",
    eyebrowKey: "features.learning.eyebrow",
    headingKey: "features.learning.heading",
    subKey: "features.learning.sub",
    cards: [
      {
        titleKey: "features.learning.library.title",
        descKey: "features.learning.library.desc",
        bulletKeys: [
          "features.learning.library.bullet1",
          "features.learning.library.bullet2",
          "features.learning.library.bullet3",
        ],
        to: "/tools?tab=learning",
        ctaKey: "features.learning.library.cta",
      },
      {
        titleKey: "features.learning.paths.title",
        descKey: "features.learning.paths.desc",
        bulletKeys: [
          "features.learning.paths.bullet1",
          "features.learning.paths.bullet2",
          "features.learning.paths.bullet3",
        ],
        to: "/tools?tab=learning",
        ctaKey: "features.learning.paths.cta",
      },
      {
        titleKey: "features.learning.classrooms.title",
        descKey: "features.learning.classrooms.desc",
        bulletKeys: [
          "features.learning.classrooms.bullet1",
          "features.learning.classrooms.bullet2",
          "features.learning.classrooms.bullet3",
        ],
        to: "/tools?tab=classrooms",
        ctaKey: "features.learning.classrooms.cta",
      },
    ],
  },
  // ─── People Operations (CHRO) ───────────────────────────────────────────
  {
    icon: Users,
    track: "expansion",
    statusKey: "features.expansion.status.comingSoon",
    eyebrowKey: "features.peopleOps.eyebrow",
    headingKey: "features.peopleOps.heading",
    subKey: "features.peopleOps.sub",
    cards: [
      {
        titleKey: "features.peopleOps.roster.title",
        descKey: "features.peopleOps.roster.desc",
        bulletKeys: [
          "features.peopleOps.roster.bullet1",
          "features.peopleOps.roster.bullet2",
          "features.peopleOps.roster.bullet3",
        ],
      },
      {
        titleKey: "features.peopleOps.oneOnOnes.title",
        descKey: "features.peopleOps.oneOnOnes.desc",
        bulletKeys: [
          "features.peopleOps.oneOnOnes.bullet1",
          "features.peopleOps.oneOnOnes.bullet2",
          "features.peopleOps.oneOnOnes.bullet3",
        ],
      },
      {
        titleKey: "features.peopleOps.health.title",
        descKey: "features.peopleOps.health.desc",
        bulletKeys: [
          "features.peopleOps.health.bullet1",
          "features.peopleOps.health.bullet2",
          "features.peopleOps.health.bullet3",
        ],
      },
    ],
  },
  // ─── Recruiting Operations ──────────────────────────────────────────────
  {
    icon: ClipboardCheck,
    track: "expansion",
    statusKey: "features.expansion.status.comingSoon",
    eyebrowKey: "features.recruiting.eyebrow",
    headingKey: "features.recruiting.heading",
    subKey: "features.recruiting.sub",
    cards: [
      {
        titleKey: "features.recruiting.evaluation.title",
        descKey: "features.recruiting.evaluation.desc",
        bulletKeys: [
          "features.recruiting.evaluation.bullet1",
          "features.recruiting.evaluation.bullet2",
          "features.recruiting.evaluation.bullet3",
        ],
      },
      {
        titleKey: "features.recruiting.screening.title",
        descKey: "features.recruiting.screening.desc",
        bulletKeys: [
          "features.recruiting.screening.bullet1",
          "features.recruiting.screening.bullet2",
          "features.recruiting.screening.bullet3",
        ],
      },
      {
        titleKey: "features.recruiting.sourcing.title",
        descKey: "features.recruiting.sourcing.desc",
        bulletKeys: [
          "features.recruiting.sourcing.bullet1",
          "features.recruiting.sourcing.bullet2",
          "features.recruiting.sourcing.bullet3",
        ],
      },
    ],
  },
  // ─── Connections & decisions ────────────────────────────────────────────
  {
    icon: CalendarDays,
    track: "core",
    eyebrowKey: "features.connect.eyebrow",
    headingKey: "features.connect.heading",
    subKey: "features.connect.sub",
    cards: [
      {
        titleKey: "features.connect.events.title",
        descKey: "features.connect.events.desc",
        bulletKeys: [
          "features.connect.events.bullet1",
          "features.connect.events.bullet2",
          "features.connect.events.bullet3",
        ],
        to: "/bookings",
        ctaKey: "features.connect.events.cta",
      },
      {
        titleKey: "features.connect.research.title",
        descKey: "features.connect.research.desc",
        bulletKeys: [
          "features.connect.research.bullet1",
          "features.connect.research.bullet2",
          "features.connect.research.bullet3",
        ],
        to: "/tools/comp-analyzer",
        ctaKey: "features.connect.research.cta",
      },
      {
        titleKey: "features.connect.references.title",
        descKey: "features.connect.references.desc",
        bulletKeys: [
          "features.connect.references.bullet1",
          "features.connect.references.bullet2",
          "features.connect.references.bullet3",
        ],
        to: "/references",
        ctaKey: "features.connect.references.cta",
      },
    ],
  },
];
