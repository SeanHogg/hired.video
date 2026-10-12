/**
 * CreateDocumentDialog — the studio create flow's creation step (#2221).
 * Starting a résumé, job post or company page offers, before the editor
 * mounts:
 *   • a design template — the SAME gallery the editor's template picker shows
 *     (`DocumentTemplateGallery`), here selecting the design the new document
 *     starts from; "Start blank" keeps the plain input template;
 *   • for a résumé, master or variant — a new master kit, or a variant
 *     branched off one of the viewer's masters.
 * "Create" runs `useDocumentCreate`, which seeds the document (or opens the
 * kit) accordingly. A job post can instead be imported from a file
 * (`useJobImport` — the retired create form's uploads, #1915).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DocumentTemplateGallery from "@/components/studio/document/DocumentTemplateGallery";
import type { DocumentTemplateOption } from "@/lib/studio/editor-v2/document-templates";
import { useDocumentCreate, type CreatableDocumentKind } from "@/lib/studio/landing/use-document-create";
import { useMasterResumes } from "@/lib/studio/landing/use-master-resumes";
import { cn } from "@/lib/utils";
import { JOB_IMPORT_ACCEPT, downloadJobCsvTemplate } from "@/lib/jobs/job-import";
import { useJobImport } from "@/lib/jobs/use-job-import";

interface CreateDocumentDialogProps {
  /** The document being created; null = closed. */
  kind: CreatableDocumentKind | null;
  onOpenChange: (open: boolean) => void;
}

type StartMode = "master" | "variant";

export default function CreateDocumentDialog({ kind, onOpenChange }: CreateDocumentDialogProps) {
  const { t } = useTranslation();
  const open = kind !== null;
  const [design, setDesign] = useState<DocumentTemplateOption | null>(null);
  const [mode, setMode] = useState<StartMode>("master");
  const [parentId, setParentId] = useState("");
  const { masters } = useMasterResumes(open && kind === "resume");
  const { start, busy } = useDocumentCreate();
  const { importFiles, importing } = useJobImport();
  const fileRef = useRef<HTMLInputElement>(null);

  // Every open starts fresh.
  useEffect(() => {
    setDesign(null);
    setMode("master");
    setParentId("");
  }, [kind]);

  // Default the parent to the first master once they load.
  useEffect(() => {
    if (!parentId && masters[0]) setParentId(masters[0].id);
  }, [masters, parentId]);

  if (!kind) return null;

  const isResume = kind === "resume";
  const variant = isResume && mode === "variant";
  const parent = masters.find((m) => m.id === parentId);
  const canCreate = !busy && !importing && (!variant || !!parent);

  const submit = async () => {
    await start(
      kind,
      design,
      variant && parent ? { mode: "variant", parentId: parent.id, parentTitle: parent.title } : { mode: "master" },
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{t(`studio.create.title.${kind}`)}</DialogTitle>
          <DialogDescription>{t(`studio.create.description.${kind}`)}</DialogDescription>
        </DialogHeader>

        {isResume && (
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">{t("studio.create.resume.startAs")}</legend>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as StartMode)} className="grid gap-2 sm:grid-cols-2">
              <StartOption
                value="master"
                label={t("studio.create.resume.master")}
                hint={t("studio.create.resume.masterHint")}
                selected={mode === "master"}
              />
              <StartOption
                value="variant"
                label={t("studio.create.resume.variant")}
                hint={masters.length > 0 ? t("studio.create.resume.variantHint") : t("studio.create.resume.noMasters")}
                selected={mode === "variant"}
                disabled={masters.length === 0}
              />
            </RadioGroup>
            {variant && masters.length > 0 && (
              <div className="min-w-0 space-y-1 pt-1">
                <Label htmlFor="create-variant-parent">{t("studio.create.resume.parentLabel")}</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger id="create-variant-parent" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {masters.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title || t("studio.create.resume.untitled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </fieldset>
        )}

        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{t("studio.create.designHeading")}</h3>
              <p className="text-xs text-muted-foreground">{t("studio.create.designHint")}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={design ? "outline" : "secondary"}
              aria-pressed={!design}
              onClick={() => setDesign(null)}
            >
              {t("studio.create.noDesign")}
            </Button>
          </div>
          <DocumentTemplateGallery
            entityKind={kind}
            currentTemplateId={design?.id}
            onPick={setDesign}
            gridClassName="lg:grid-cols-3"
            labels={{
              use: t("studio.create.select"),
              active: t("studio.create.selected"),
              badge: t("studio.create.selected"),
            }}
          />
        </section>

        {kind === "job" && (
          // The retired create form's uploads (#1915): a PDF / DOCX
          // description or a CSV / XLSX file becomes a draft posting.
          <section className="min-w-0 space-y-2 rounded-lg border border-dashed border-border p-3">
            <h3 className="text-sm font-semibold text-foreground">{t("studio.jobImport.heading")}</h3>
            <p className="text-xs text-muted-foreground">{t("studio.jobImport.hint")}</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={JOB_IMPORT_ACCEPT}
              className="sr-only"
              aria-label={t("studio.jobImport.choose")}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void importFiles(files).then((ok) => ok && onOpenChange(false));
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {importing ? t("studio.jobImport.importing") : t("studio.jobImport.choose")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={downloadJobCsvTemplate}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("studio.jobImport.template")}
              </Button>
            </div>
          </section>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" disabled={!canCreate} onClick={() => void submit()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("studio.create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartOption({
  value,
  label,
  hint,
  selected,
  disabled,
}: {
  value: StartMode;
  label: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
}) {
  const id = `create-start-${value}`;
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal",
        selected ? "border-primary bg-primary/5" : "border-border",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </Label>
  );
}
