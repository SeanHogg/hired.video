"use client";

/**
 * ScriptRewriterDialog — gap #144 frontend.
 *
 * One-click rewrite of an existing storyboard via the LLM. The user picks
 * a mode (shorten / lengthen / tone / persona) and the dialog calls
 * `POST /projects/:id/script/rewrite`. On accept the new scene array is
 * spliced back into the script via `onApply`.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  rewriteScript,
  type ScriptRewriteMode,
  type ScriptRewriteTone,
  type ScriptRewritePersona,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
  storyboard: unknown;
  /** Called with the new scenes array when the user accepts the rewrite. */
  onApply: (scenes: Array<Record<string, unknown>>) => void;
}

export default function ScriptRewriterDialog({ projectId, storyboard, onApply }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ScriptRewriteMode>("shorten");
  const [targetSeconds, setTargetSeconds] = useState(20);
  const [tone, setTone] = useState<ScriptRewriteTone>("professional");
  const [persona, setPersona] = useState<ScriptRewritePersona>("job-seeker");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRewrite() {
    if (!projectId || !storyboard) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await rewriteScript({
        projectId,
        storyboard,
        mode,
        targetSeconds: mode === "shorten" || mode === "lengthen" ? targetSeconds : undefined,
        tone: mode === "tone" ? tone : undefined,
        persona: mode === "persona" ? persona : undefined,
        instructions: instructions || undefined,
      });
      setPreview(res.storyboard.scenes);
    } catch (e: any) {
      setError(e?.message ?? t("errors.rewriteFailed"));
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    if (!preview) return;
    onApply(preview);
    setOpen(false);
    setPreview(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId || !storyboard} title={t("studio.rewriter.aiRewriteTooltip")}>
          <Wand2 className="w-3.5 h-3.5 mr-1" /> {t("studio.rewriter.rewrite")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("studio.rewriter.title")}</DialogTitle>
          <DialogDescription>
            {t("studio.rewriter.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-xs">{t("studio.rewriter.mode")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as ScriptRewriteMode)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shorten">{t("studio.rewriter.modeShorten")}</SelectItem>
                <SelectItem value="lengthen">{t("studio.rewriter.modeLengthen")}</SelectItem>
                <SelectItem value="tone">{t("studio.rewriter.modeTone")}</SelectItem>
                <SelectItem value="persona">{t("studio.rewriter.modePersona")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(mode === "shorten" || mode === "lengthen") && (
            <div>
              <Label className="text-xs">{t("studio.rewriter.targetDuration")}</Label>
              <Input
                type="number"
                min={5}
                max={300}
                value={targetSeconds}
                onChange={(e) => setTargetSeconds(parseInt(e.target.value, 10) || 20)}
                className="h-8 text-xs"
              />
            </div>
          )}

          {mode === "tone" && (
            <div>
              <Label className="text-xs">{t("studio.rewriter.tone")}</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as ScriptRewriteTone)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">{t("studio.rewriter.toneProfessional")}</SelectItem>
                  <SelectItem value="conversational">{t("studio.rewriter.toneConversational")}</SelectItem>
                  <SelectItem value="enthusiastic">{t("studio.rewriter.toneEnthusiastic")}</SelectItem>
                  <SelectItem value="executive">{t("studio.rewriter.toneExecutive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "persona" && (
            <div>
              <Label className="text-xs">{t("studio.rewriter.persona")}</Label>
              <Select value={persona} onValueChange={(v) => setPersona(v as ScriptRewritePersona)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="job-seeker">{t("studio.rewriter.personaJobSeeker")}</SelectItem>
                  <SelectItem value="recruiter">{t("studio.rewriter.personaRecruiter")}</SelectItem>
                  <SelectItem value="company-promo">{t("studio.rewriter.personaCompanyPromo")}</SelectItem>
                  <SelectItem value="personal-brand">{t("studio.rewriter.personaPersonalBrand")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">{t("studio.rewriter.extraInstructions")}</Label>
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="h-8 text-xs"
              placeholder={t("studio.rewriter.extraPlaceholder")}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              {error}
            </div>
          )}

          {preview && (
            <div className="rounded-md border bg-muted/30 p-2 max-h-[180px] overflow-y-auto">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                {t("studio.rewriter.previewScenes", { count: preview.length })}
              </div>
              <ul className="text-[11px] space-y-1">
                {preview.map((s, i) => (
                  <li key={i} className="truncate">
                    <span className="font-mono text-muted-foreground mr-1">{i + 1}.</span>
                    {(s as any).title || (s as any).text || (s as any).type}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            {preview ? (
              <Button size="sm" onClick={handleAccept}>{t("studio.rewriter.applyRewrite")}</Button>
            ) : (
              <Button size="sm" onClick={handleRewrite} disabled={loading}>
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                {t("studio.rewriter.rewrite")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
