/**
 * StudioNewMenu — the studio's ONE "+ New" button. Four starts, then a way
 * to every format:
 *
 *   Get hired      → "Résumé, cover letter & video" (a new career kit, all
 *                    three at once), then one of them — Résumé · Cover
 *                    letter · Video résumé · Video for a job (each a new kit
 *                    leading with that slot, `?start=`) — and Promote
 *                    yourself (the personal-brand video)
 *   Start with AI  → a new kit with "describe yourself" focused: the AI
 *                    drafts from it (the chat's first turn)
 *   More formats   → the advanced editor: Video from scratch · Podcast or
 *                    voice · Image or social post · Animation, comic, game,
 *                    then "Browse every format" (the studio home's
 *                    templates); "Any format with AI" opens the AI
 *                    first-draft wizard for any format
 *
 * Two columns from `sm` (Studio board): Get hired | More formats.
 *
 * The career rules live in lib/studio/career-starts.ts; picking a template
 * goes through useCreateStudioDraft. "Résumé" opens the create step first
 * (#2221 — a design + master or variant, CreateDocumentDialog).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, ChevronDown, Clapperboard, FileText, Image as ImageIcon, Mail, Megaphone, Mic, Plus, Shapes, Sparkles, Video, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import { useAuth } from "@/lib/auth";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import type { KitStart } from "@/lib/workspace/kit-stages";
import StudioAiWizard from "./StudioAiWizard";
import CreateDocumentDialog from "@/components/studio/landing/CreateDocumentDialog";

const GROUP_LABEL = "px-2 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground";
const ROW = "cursor-pointer items-start gap-2 rounded-lg py-2";

/** "Get hired" — one of the three, each a new kit leading with its slot. */
const ONE_OF: readonly { start: KitStart; icon: typeof FileText }[] = [
  { start: "resume", icon: FileText },
  { start: "letter", icon: Mail },
  { start: "video", icon: Video },
  { start: "job", icon: Briefcase },
];

/** "More formats": a blank start in the advanced editor per family (catalog
 *  templates); null = browse the templates for that family. */
const MORE_FORMATS: readonly { id: string; templateId: "basic" | "podcast_episode" | "drawing_social_square" | null; icon: typeof FileText }[] = [
  { id: "video", templateId: "basic", icon: Clapperboard },
  { id: "audio", templateId: "podcast_episode", icon: Mic },
  { id: "image", templateId: "drawing_social_square", icon: ImageIcon },
  { id: "motion", templateId: null, icon: Shapes },
];

/** "Browse every format" lands on the studio home's templates section. */
const TEMPLATES_ID = "templates";

export default function StudioNewMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { create, creating } = useCreateStudioDraft();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeCreateOpen, setResumeCreateOpen] = useState(false);
  const startKit = (start?: KitStart) => navigate(start ? `${NEW_KIT_PATH}?start=${start}` : NEW_KIT_PATH);
  // A résumé starts with the create step (design + master / variant).
  const startOne = (start: KitStart) => (start === "resume" ? setResumeCreateOpen(true) : startKit(start));
  const browse = () => {
    const section = document.getElementById(TEMPLATES_ID);
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    else navigate(`/studio#${TEMPLATES_ID}`);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" disabled={creating} className={className}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? t("studio.newMenu.creating") : t("studio.newMenu.button")}
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="grid max-h-[75vh] w-[92vw] max-w-2xl gap-x-3 overflow-y-auto p-2 sm:grid-cols-2"
        >
          <div className="flex min-w-0 flex-col">
            <DropdownMenuLabel className={GROUP_LABEL}>{t("studio.newMenu.getHired")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => startKit()} className={`${ROW} bg-primary/5`}>
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{t("studio.newMenu.kit")}</span>
                <span className="text-xs text-muted-foreground">{t("studio.newMenu.kitHint")}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startKit("ai")} className={ROW}>
              <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{t("studio.newMenu.ai")}</span>
                <span className="text-xs text-muted-foreground">{t("studio.newMenu.aiHint")}</span>
              </span>
            </DropdownMenuItem>
            {ONE_OF.map(({ start, icon: Icon }) => (
              <DropdownMenuItem key={start} onClick={() => startOne(start)} className="cursor-pointer gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{t(`studio.newMenu.start.${start}`)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() => void create({ kind: "template", templateId: "personal_brand" })}
              className="cursor-pointer gap-2"
            >
              <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{t("studio.newMenu.promote")}</span>
            </DropdownMenuItem>
          </div>
          <div className="flex min-w-0 flex-col border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <DropdownMenuLabel className={GROUP_LABEL}>{t("studio.newMenu.moreFormats")}</DropdownMenuLabel>
            {MORE_FORMATS.map(({ id, templateId, icon: Icon }) => (
              <DropdownMenuItem
                key={id}
                onClick={() => (templateId ? void create({ kind: "template", templateId }) : browse())}
                className="cursor-pointer gap-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{t(`studio.newMenu.format.${id}`)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem onClick={browse} className="cursor-pointer justify-between font-semibold text-primary">
              {t("studio.newMenu.browse")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
            {/* The AI first-draft wizard for any format (it spends tokens, so
                it needs an account). */}
            {user && (
              <DropdownMenuItem onClick={() => setWizardOpen(true)} className="cursor-pointer text-xs text-muted-foreground">
                {t("studio.newMenu.anyFormatAi")}
              </DropdownMenuItem>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {user && <StudioAiWizard open={wizardOpen} onOpenChange={setWizardOpen} />}
      <CreateDocumentDialog kind={resumeCreateOpen ? "resume" : null} onOpenChange={setResumeCreateOpen} />
    </>
  );
}
