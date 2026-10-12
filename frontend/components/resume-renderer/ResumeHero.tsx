/**
 * The résumé header: a print header (name, headline, contact line, summary)
 * or the hero band (avatar, contact buttons, optional video). Headline,
 * summary and name carry review annotations (annotations.tsx).
 */
import { useTranslation } from "react-i18next";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ThemeStyles } from "@/lib/resume-template-themes";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import SectionEditPencil from "./SectionEditPencil";
import { AnnotatedText, AnnotationCards } from "./annotations";
import { EditableText, useResumeInlineEditing } from "./inline-edit";

/** The print header's contact line — each part its own field while the
 *  page is in inline-edit mode. */
function ContactLine({ basics }: { basics?: { email?: string; phone?: string; url?: string } }) {
  const editing = useResumeInlineEditing();
  const keys = (["email", "phone", "url"] as const).filter((k) => editing || !!basics?.[k]);
  if (keys.length === 0) return null;
  return (
    <p className="text-sm text-muted-foreground mt-3">
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && " · "}
          <EditableText path={`basics.${k}`}>{basics?.[k]}</EditableText>
        </span>
      ))}
    </p>
  );
}

export default function ResumeHero({
  descriptor,
  resume,
  theme,
  embedded,
  videoSlot,
  isOwner = false,
  onEditSection,
}: {
  descriptor: ResumeTemplateDescriptor;
  resume: Resume;
  theme: ThemeStyles;
  embedded: boolean;
  videoSlot?: React.ReactNode;
  isOwner?: boolean;
  onEditSection?: (key: string) => void;
}) {
  const { t } = useTranslation();
  const editing = useResumeInlineEditing();
  // Top-of-resume header maps to the ResumeBuilder "basics" tab. Self-gated:
  // renders nothing when viewer doesn't own the resume.
  const editAction = (
    <SectionEditPencil
      isOwner={isOwner}
      onEditSection={onEditSection}
      sectionKey="basics"
    />
  );
  // Print mode: plain centered header with name + contact line.
  if (descriptor.documentMode === "print") {
    const basics = resume.content?.basics;
    return (
      <div className={`${theme.pageBg} pt-6`}>
        <div className={`relative max-w-[880px] mx-auto ${theme.paperBg} shadow-sm px-8 md:px-12 pt-10 pb-6 text-center`}>
          <div className="absolute top-3 right-3">{editAction}</div>
          <h1 className={`text-4xl font-bold ${theme.nameText} ${descriptor.theme.headingStyle === "caps" ? "uppercase tracking-widest" : ""}`}>
            <EditableText path="basics.name">{basics?.name || resume.title || t("labels.untitledResume")}</EditableText>
          </h1>
          <AnnotationCards path="basics" />
          {(basics?.label || editing) && (
            <p className={`text-lg mt-1 ${theme.accentText}`}>
              <AnnotatedText path="basics.label">{basics?.label}</AnnotatedText>
            </p>
          )}
          <ContactLine basics={basics} />
          {descriptor.hero.showSummary && (basics?.summary || editing) && (
            <p className="text-sm mt-4 max-w-2xl mx-auto">
              <AnnotatedText path="basics.summary">{basics?.summary}</AnnotatedText>
            </p>
          )}
        </div>
      </div>
    );
  }

  // Hero mode: gradient header with avatar, contact buttons, and optional video.
  const basics = resume.content?.basics;
  const heroClass = embedded ? "bg-card border-b" : `relative ${theme.heroGradient} ${theme.heroForeground}`;
  const btnClass = embedded ? "" : "bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30";

  const heroContent = (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {descriptor.hero.showAvatar && (
          <Avatar className={`w-20 h-20 ${embedded ? "" : "border-4 border-white/30"}`}>
            <AvatarImage src={basics?.image || ""} />
            <AvatarFallback className={`text-2xl ${embedded ? "" : "bg-white/20"}`}>
              {basics?.name?.split(" ").map((n) => n[0]).join("") || "??"}
            </AvatarFallback>
          </Avatar>
        )}
        <div>
          <h1 className="text-4xl font-bold"><EditableText path="basics.name">{basics?.name || resume.title || t("labels.untitledResume")}</EditableText></h1>
          <AnnotationCards path="basics" />
          <p className={`text-xl ${embedded ? "text-muted-foreground" : "opacity-90"}`}>
            <AnnotatedText path="basics.label">{basics?.label || ""}</AnnotatedText>
          </p>
        </div>
      </div>
      {descriptor.hero.showContactButtons && (
        <div className="flex flex-wrap gap-3">
          {basics?.email && (
            <Button variant="secondary" size="sm" className={btnClass} onClick={() => window.open(`mailto:${basics.email}`)}>
              <Mail className="w-4 h-4 mr-2" />{t("resume.hero.email")}
            </Button>
          )}
          {basics?.phone && (
            <Button variant="secondary" size="sm" className={btnClass} onClick={() => window.open(`tel:${basics.phone}`)}>
              <Phone className="w-4 h-4 mr-2" />{t("resume.hero.call")}
            </Button>
          )}
          {basics?.url && (
            <Button variant="secondary" size="sm" className={btnClass} onClick={() => window.open(basics.url, "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" />{t("resume.hero.portfolio")}
            </Button>
          )}
        </div>
      )}
      {descriptor.hero.showSummary && (basics?.summary || editing) && (
        <p className={`text-lg leading-relaxed ${embedded ? "" : "opacity-95"}`}>
          <AnnotatedText path="basics.summary">{basics?.summary}</AnnotatedText>
        </p>
      )}
    </div>
  );

  if (descriptor.hero.layout === "compact") {
    return (
      <div className={heroClass}>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-4">
          {descriptor.hero.showAvatar && (
            <Avatar className="w-16 h-16">
              <AvatarImage src={basics?.image || ""} />
              <AvatarFallback>{basics?.name?.split(" ").map((n) => n[0]).join("") || "??"}</AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold"><EditableText path="basics.name">{basics?.name || resume.title}</EditableText></h1>
            <p className="text-sm opacity-80">
              <AnnotatedText path="basics.label">{basics?.label || ""}</AnnotatedText>
            </p>
          </div>
          {basics?.email && <Badge variant="secondary">{basics.email}</Badge>}
          {editAction}
        </div>
      </div>
    );
  }

  return (
    <div className={heroClass}>
      {!embedded && <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-10" />}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">{editAction}</div>
        {/* videoSlot is a self-gating component (returns null when no
            video is associated to this resume) per the standing DRY rule,
            so the layout switches on whether the slot rendered anything
            — not on a separate `descriptor.hero.showVideo` flag. The
            user-facing contract: "if a public video is associated with
            this resume, show it in the header." */}
        {descriptor.hero.layout === "split" && videoSlot ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {heroContent}
            <div>{videoSlot}</div>
          </div>
        ) : (
          <div className="space-y-6">
            {heroContent}
            {videoSlot ? <div>{videoSlot}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
