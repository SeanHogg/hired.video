/**
 * useJobImport — the studio job create step's "Import" (#1915): parse the
 * picked files into draft postings (job-import.ts), then open the first on
 * the canvas; several files report how many drafts were made.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { studioEditHref } from "@/lib/studio/studio-authoring";
import { recordPostJobIntent } from "@/lib/studio/job-post-access";
import { importJobFiles } from "./job-import";

export function useJobImport() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

  /** Returns true when at least one draft was created (the caller closes). */
  async function importFiles(files: readonly File[]): Promise<boolean> {
    if (files.length === 0 || importing) return false;
    setImporting(true);
    try {
      const { created, failed } = await importJobFiles(files);
      if (failed.length > 0) {
        toast({
          title: t("studio.jobImport.failed", { count: failed.length }),
          description: failed.join(", "),
          variant: "destructive",
        });
      }
      if (created.length === 0) return false;
      recordPostJobIntent("import", { count: created.length });
      if (created.length > 1) toast({ title: t("studio.jobImport.created", { count: created.length }) });
      navigate(studioEditHref("job", created[0]));
      return true;
    } finally {
      setImporting(false);
    }
  }

  return { importFiles, importing };
}
