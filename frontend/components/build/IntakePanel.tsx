/**
 * Empty-state intake for the kit workspace: upload a résumé (PDF, Word, TXT or a photo),
 * paste its text, or — when signed in — start from a résumé already on the
 * account (<ExistingResumePicker/>, which self-gates). The "describe yourself"
 * path is the composer at the bottom of the column (BuildComposer).
 */
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IntakeOption } from "@/components/build/IntakeOption";
import { ExistingResumePicker } from "@/components/build/ExistingResumePicker";
import { RESUME_FILE_ACCEPT, isAcceptedResumeFile } from "@/lib/build-entry";
import type { ResumeContent } from "@shared/resume";

interface IntakePanelProps {
  onFile: (file: File) => void;
  onText: (text: string) => void;
  /** Adopt a résumé the signed-in user already owns — no parse, no AI spend. */
  onExistingResume: (content: ResumeContent, title: string, resumeId: string) => void;
  disabled?: boolean;
}

export default function IntakePanel({ onFile, onText, onExistingResume, disabled }: IntakePanelProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const pasteId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [fileError, setFileError] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!isAcceptedResumeFile(file)) {
      setFileError(true);
      return;
    }
    setFileError(false);
    onFile(file);
  };

  return (
    <section aria-labelledby={`${inputId}-title`} className="flex flex-col gap-3.5">
      <h1
        id={`${inputId}-title`}
        className="font-display text-[26px] font-[750] leading-[1.1] tracking-[-0.02em] text-foreground"
      >
        {t("build.intake.title")}
      </h1>
      <p className="text-[15px] leading-[1.55] text-foreground/80">{t("build.intake.subtitle")}</p>

      <div
        className="grid gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={RESUME_FILE_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <IntakeOption
          emphasis
          icon={<Upload />}
          title={t("build.intake.upload")}
          hint={t("build.intake.uploadHint")}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        />
        {fileError && (
          <p role="alert" className="text-[13px] text-destructive">
            {t("build.intake.unsupportedFile")}
          </p>
        )}
        {!pasting && (
          <IntakeOption
            icon={<ClipboardPaste />}
            title={t("build.intake.paste")}
            hint={t("build.intake.pasteHint")}
            disabled={disabled}
            onClick={() => setPasting(true)}
          />
        )}
        {/* Signed-in only, and only when the account actually has résumés —
            the component decides that itself. */}
        <ExistingResumePicker onSelect={onExistingResume} disabled={disabled} />
      </div>

      {pasting && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pasted.trim()) onText(pasted);
          }}
        >
          <label htmlFor={pasteId} className="text-[13px] text-muted-foreground">
            {t("build.intake.pasteLabel")}
          </label>
          <Textarea
            id={pasteId}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            placeholder={t("build.intake.pastePlaceholder")}
            disabled={disabled}
            className="rounded-[10px] border-input text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={disabled || !pasted.trim()} className="min-h-11 rounded-[10px]">
              {t("build.intake.pasteSubmit")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPasting(false)} className="min-h-11">
              {t("build.intake.cancel")}
            </Button>
          </div>
        </form>
      )}

      <p className="text-sm text-muted-foreground">{t("build.intake.describeHint")}</p>
    </section>
  );
}
