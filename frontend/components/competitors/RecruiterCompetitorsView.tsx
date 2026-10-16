// Recruiter / ATS-centric /vs-competitors body (vendor tables, per-competitor
// cards, recruiter FAQ). Rendered only while HIRING_PERSONAS_ENABLED is on;
// the job-seeker-only product renders JobSeekerCompetitorsView instead.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { formatProMonthlyPrice } from "@shared/pricing";
import MarketingFAQ from "@/components/MarketingFAQ";
import CompetitorComparison from "@/components/CompetitorComparison";
import {
  MarketingHero,
  MarketingFinalCta,
  HERO_CTA_PRIMARY,
  HERO_CTA_LINK,
  INK_CTA_LINK,
} from "@/components/marketing/MarketingHero";
import MonoChip from "@/components/templates/MonoChip";

/** Pro list price, formatted — never hardcode the number in copy. */
const PRO_PRICE = formatProMonthlyPrice();

const FAQS = [
  {
    question:
      `How can Hired.Video charge ${PRO_PRICE}/seat/mo when LOXO Basic is $169 and Greenhouse contracts run tens of thousands?`,
    answer:
      "We're a video-first all-in-one platform priced for the modern web — the same Pro plan covers candidates, recruiters, and employers. AI usage is metered (1M tokens included on Pro) so power users pay for what they consume in a token pack rather than every team paying enterprise pricing for capabilities they don't use.",
  },
  {
    question: "Is Hired.Video a real ATS, or just a video-resume tool?",
    answer:
      "Both. Hired.Video ships an Applicant Tracking System with a Kanban hiring pipeline, a sourcing CRM, async video interviews, an AI candidate-to-job match score, and one Chrome extension whose recruiter lens has Loxo-Boost-parity capture (profiles from any site, personal email + phone + LinkedIn/GitHub/X/website auto-enrichment, click-to-call / email / SMS, one-click submit to a job, inline tag editor, and auto-logged activity) — alongside the AI Studio and video resume features competitors don't have.",
  },
  {
    question:
      "Does Hired.Video actually ship staffing-agency back-office (timesheets, placement billing, contractor pay), or is that still Bullhorn-only?",
    answer:
      `Shipped end-to-end in the Workforce module. Punch in/out against tasks → weekly timesheet envelope with submit / approve / reject state machine → on approve, auto-derived invoice line items (against the placement's bill rate) + contractor payout-ledger accrual (against the pay rate), idempotent on re-approve. A compliance doc vault holds I-9 / W-9 / W-8BEN / COI / BG check / MSA / SOW / NDA / offer letters with native + DocuSign e-signature flows and expiry tracking. Outbound connectors push to QuickBooks Online, Xero, Gusto, and Helcim, with encrypted OAuth credentials per (company × provider). Per-placement P&L reporting (revenue · contractor pay · gross margin · approved-timesheet count) drills through to the placement detail. Multi-recruiter commission splits fan a single placement out to sourcer + manager, accruing on every approved timesheet into a Recruiter Commissions dashboard. The honest remaining gap vs Bullhorn is the depth of their VMS / MSP portal marketplace — that's on roadmap. Everything else listed above is in the standard ${PRO_PRICE}/seat plan, not behind an enterprise upcharge. Marketing surface at /for-agencies.`,
  },
  {
    question:
      "Synthesia ships AI presenter avatars and 140+ language dubbing. Does Hired.Video?",
    answer:
      "Yes — client-side, on WebGPU, with no per-render fee. AvatarWidget in the canvas-v2 registry ships stylized 2D presenter avatars whose mouth shapes (visemes) sync to TTS word boundaries via the existing tts-engines `onBoundary` callback. The dubbing pipeline transcribes the source video with Whisper, translates each caption cue through the platform LLM (OpenRouter), re-renders audio in the target language through the user's cloned voice (Kokoro / Piper / VibeVoice WebGPU stack), and muxes the new track into the timeline parallel to the original. 20+ target languages today. The honest gap vs Synthesia is photorealistic ML-rig avatar fidelity and the 140-language brand-voice library; our stylized 2D presenters serve the AI-video-resume + L&D-narration use case at $0 marginal cost.",
  },
  {
    question:
      "Articulate 360 markets strong screen-reader / accessibility tooling. Does Hired.Video's Studio audit accessibility?",
    answer:
      "Yes. The Studio Accessibility Panel runs WCAG 2.2 checks against the live CanvasState — flags missing alt text on image widgets, low-contrast text overlays (4.5:1 AA / 7:1 AAA), missing caption tracks on video clips, and non-sequential reading order. Issues link directly to the offending widget so the author can fix in-editor before publish. Closes the inline-audit gap without the $1,099/seat/yr Articulate ticket; remaining residual gap is template-library breadth, where Articulate's 20-year ecosystem is still wider.",
  },
  {
    question:
      "Can recruiters and candidates install Hired.Video on their phone like a native app?",
    answer:
      "Yes. Hired.Video is an installable Progressive Web App — visitors can Add to Home Screen on iOS and Android, run it as a standalone window, and reach the recruiter pipeline + candidate dashboard offline (offline shell cached by service worker). Closes the CapCut / Canva mobile-parity gap without paying for a separate native build. Capacitor-wrapped native apps are still on roadmap for the cases where PWA limits (background audio recording, deep-link sharing on some Android OEMs) matter.",
  },
  {
    question: "Do you support enterprise needs like SSO, SOC 2, and data residency?",
    answer:
      "Enterprise compliance (SOC 2, SSO, regional data residency) is on our 2026 roadmap. If those are blockers for your purchase today, contact us — we'll confirm timing and discuss options for design-partner pilots.",
  },
  {
    question: "Can candidates use Hired.Video for free?",
    answer:
      "Yes. The Free tier includes one published AI video resume, the Chrome extension, the resume builder, AI interview practice (limited), 50,000 AI tokens per month, and access to the public job board with structured-data indexing. No credit card required.",
  },
  {
    question:
      "What ships beyond the ATS — gamification, learning pathways, and a map surface really included?",
    answer:
      `Yes. Points, streaks, badges and Tremendous-powered gift-card cashout (or AI-credit / premium-month redemption) are live for all three roles. SCORM 1.2 + xAPI LRS + DAG learning paths with HMAC-signed verifiable certificates are shipped, including employer-side authoring. A built-in learning content library (AI fundamentals, Retrieval-Augmented Generation, prompt engineering, and the AI-era must-have skills) ships at /tools?tab=learning. A /map page renders jobs, events, and opted-in coffee pins via OpenStreetMap. All of this is part of the same ${PRO_PRICE}/seat/mo Pro plan — no module upcharge.`,
  },
  {
    question:
      "Do we still need a LinkedIn Learning subscription if we use Hired.Video?",
    answer:
      "No. Hired.Video ships a built-in learning content library — platform-seeded SCORM 1.2 courses on AI fundamentals, RAG, prompt engineering, and the AI-era must-have skills — bundled with every plan, including Free. LinkedIn Learning is a separate ~$379/seat/yr SKU on top of Recruiter; ours is included. Verifiable HMAC-signed certificates issue automatically on course pass, and progress fans out into the gamification + badge engine. Employers can also author their own internal training courses on the same SCORM runtime without leaving the platform.",
  },
  {
    question:
      "How do you compete with LinkedIn InMail without charging $1,080/seat/mo?",
    answer:
      "Three pieces close the InMail gap. (1) Direct messages on Hired.Video are free and uncapped — `/api/messages/conversations` lets any authenticated user open a conversation with any other user, with no credit cap and no \"must be connected first\" wall. (2) \"Ask for an intro\" is a one-click CTA on every profile: it reads `/api/graph/mutuals/:userId`, lets you pick a mutual, and DMs them your ask — the same workflow LinkedIn gates behind paid Recruiter. (3) \"Grab a coffee\" is a primitive LinkedIn doesn't ship at all — on accept it writes a calendar event plus a shared task that both users see in their Tasks tab until the meetup happens. The remaining LinkedIn advantage is the 1B-profile graph scale itself; the workflow on top of the graph is at parity.",
  },
  {
    question:
      "Doesn't LinkedIn lock you in by being the canonical profile? How does Hired.Video address that?",
    answer:
      "Profile Sync (`/tools/vendor-sync`) flips the lock-in. One master resume on Hired.Video renders into paste-ready blocks for 9 destinations — LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Wellfound, Dice, GitHub, and your personal site. The Chrome extension extracts edits made on 8 of those back into your master, and auto-fills Headline + Summary onto 7 vendor profile editors with a password-manager UX (you open the edit modal, click Auto-fill, review the value, save). LinkedIn keeps your profile data; Hired.Video keeps your career data. Free tier — no upcharge.",
  },
  {
    question: "How accurate is this comparison?",
    answer:
      "Pricing and feature claims are sourced from vendor-published pricing pages and recent third-party reporting (Pin, Capterra, G2, Vendr, Juicebox, augtal) as of April 2026. Vendors change pricing frequently and most enterprise plans are custom-quoted — verify the latest numbers directly with each vendor before purchase.",
  },
  {
    question:
      "Why include Synthesia, Articulate, Canva, and CapCut alongside the recruiting tools?",
    answer:
      `Because the AI Studio inside Hired.Video competes directly with all four of them. Synthesia / HeyGen do AI avatar videos but charge $30–$96/seat/mo with no creator rev-share. Articulate 360 is the L&D gold standard at $1,099/seat/yr but doesn't pay course creators when courses sell. Canva and CapCut are general-purpose editors that don't tie video output to a hiring / talent / course system. Hired.Video gives you the studio AND the marketplace AND the 95/5 creator split AND the SCORM/xAPI export AND the ATS underneath — for ${PRO_PRICE}/mo.`,
  },
  {
    question:
      "How does the creator marketplace 95/5 split actually work, and what's eligible?",
    answer:
      "When a creator publishes a voice clone, a studio template, or any monetisable asset on Hired.Video and another user buys it, the creator keeps 95% of the sale price; the platform fee is 5%; credit-card processing is charged to the buyer. The split is enforced server-side at checkout. Voice clones, studio templates, and a growing set of asset categories are eligible. No competitor in any of the three categories above pays creators a downstream cut at all.",
  },
  {
    question:
      "Does the AI Studio support media kinds beyond video?",
    answer:
      "Yes. The Studio splits on a `mediaKind` axis — video, podcast, voice, animation, comic, game, image, and CAD-3D — each with its own scene templates and render engine. The same project surface produces a 4K MP4, a PSD-roundtrip comic, an RSS-ready podcast, an interactive WebGL game, or a CBZ/PDF comic. Voice cloning runs 100% client-side via WebGPU (Web Speech, Kokoro, Piper, VibeVoice) — the server never invokes a model.",
  },
];

export default function RecruiterCompetitorsView() {
  const { t } = useTranslation();
  const price = formatProMonthlyPrice();

  return (
    <>
      <MarketingHero
        eyebrow={t("competitorsPage.eyebrow")}
        title={t("competitorsPage.title")}
        subtitle={t("competitorsPage.subtitle")}
        actions={
          <>
            <Link to="/signup" className={HERO_CTA_PRIMARY}>
              {t("comparison.startFree")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/pricing" className={HERO_CTA_LINK}>
              {t("competitorsPage.seePricing")}
            </Link>
          </>
        }
        footer={
          <div className="flex flex-wrap gap-2">
            <MonoChip>{t("competitorsPage.chip.price", { price })}</MonoChip>
            <MonoChip tone="free">{t("competitorsPage.chip.free")}</MonoChip>
            <MonoChip>{t("competitorsPage.chip.allInOne")}</MonoChip>
          </div>
        }
      />

      {/* All comparison content — tables, per-competitor cards, value props.
          Single source of truth shared with /pricing so the two pages can't
          drift on vendor pricing, feature parity, or differentiator copy. */}
      <CompetitorComparison />

      {/* MarketingFAQ ships the schema.org FAQPage JSON-LD. */}
      <MarketingFAQ
        variant="plain"
        className="mx-auto max-w-[820px] px-6 py-20"
        schemaId="competitors"
        subheading={t("competitorsPage.faqSubheading")}
        items={FAQS}
      />

      <MarketingFinalCta
        title={t("competitorsPage.cta.title")}
        subtitle={t("competitorsPage.cta.subtitle", { price })}
        actions={
          <>
            <Link to="/signup" className={HERO_CTA_PRIMARY}>
              {t("comparison.startFree")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/pricing" className={INK_CTA_LINK}>
              {t("competitorsPage.cta.fullPricing")}
            </Link>
          </>
        }
      />
    </>
  );
}
