// CsvImportCandidatesDialog — paste or upload a CSV of candidates to bulk-import
// into the agency's candidate_resumes pool. Header row is required; supported
// columns: name (required), email, phone, location, linkedin_url, label, skills.
//
// Closes audit gap #1 (CSV import for talent pool was missing).

import { useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { parseCsv } from "@/lib/utils/csv";
import type { CandidateResumeRow } from "@/lib/services/recruit-service";

interface CsvImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onImported: (rows: CandidateResumeRow[]) => void;
}

interface ParsedRow {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  label?: string;
  skills?: string[];
}

const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  name: "name",
  "full name": "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  location: "location",
  city: "location",
  linkedin: "linkedinUrl",
  "linkedin url": "linkedinUrl",
  linkedin_url: "linkedinUrl",
  label: "label",
  title: "label",
  "current title": "label",
  skills: "skills",
};

interface CsvMapping {
  rows: ParsedRow[];
  errors: string[];
}

// Map the raw CSV rows (string[][] from the shared parser) into typed
// candidate rows using the header aliases above. Keeps CSV mechanics in
// lib/utils/csv and the candidate-shape mapping local to this component.
function mapCsvRows(
  text: string,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): CsvMapping {
  const errors: string[] = [];
  const allRows = parseCsv(text);
  if (allRows.length < 2) {
    return { rows: [], errors: [translate("errors.csvHeaderRequired")] };
  }
  const headerMap = allRows[0]
    .map((h) => h.trim().toLowerCase())
    .map((h) => HEADER_ALIASES[h] ?? null);
  if (!headerMap.includes("name")) {
    errors.push(translate("errors.csvNameColumnRequired"));
    return { rows: [], errors };
  }

  const rows: ParsedRow[] = [];
  for (let li = 1; li < allRows.length; li++) {
    const cells = allRows[li];
    const row: ParsedRow = { name: "" };
    for (let ci = 0; ci < cells.length; ci++) {
      const key = headerMap[ci];
      const val = cells[ci]?.trim();
      if (!key || !val) continue;
      if (key === "skills") {
        row.skills = val.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      } else {
        (row as any)[key] = val;
      }
    }
    if (!row.name) {
      errors.push(translate("errors.csvRowMissingName", { row: li + 1 }));
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

export default function CsvImportCandidatesDialog({
  open,
  onOpenChange,
  companyId,
  onImported,
}: CsvImportProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);

  const { rows, errors } = useMemo<CsvMapping>(() => {
    if (!csvText.trim()) return { rows: [], errors: [] };
    return mapCsvRows(csvText, t);
  }, [csvText, t]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsvText);
  };

  const handleImport = async () => {
    if (!companyId) {
      toast({ title: t("errors.pickCompanyFirst"), variant: "destructive" });
      return;
    }
    if (rows.length === 0) {
      toast({ title: t("errors.nothingToImport"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiClient.post<{ created: CandidateResumeRow[]; count: number }>(
        "/api/recruit/candidates/bulk-csv",
        { companyId, rows },
      );
      toast({
        title: t("messages.csvImportSuccess", { count: response.data.count }),
      });
      onImported(response.data.created);
      setCsvText("");
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("errors.importFailed"),
        description: (e as Error)?.message ?? t("errors.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            {t("headings.bulkImportCandidates")}
          </DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="labels.csvDescription"
              components={{ code: <code /> }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="csv-file">{t("fields.csvFile.label")}</Label>
            <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="csv-text">{t("fields.csvText.label")}</Label>
            <Textarea
              id="csv-text"
              rows={10}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={t("fields.csvText.placeholder")}
              className="font-mono text-xs"
            />
          </div>

          {(rows.length > 0 || errors.length > 0) && (
            <div className="border rounded p-2 bg-muted/30 text-xs space-y-1">
              <div>
                {t("labels.parsedRows", { count: rows.length })}
              </div>
              {errors.length > 0 && (
                <ul className="text-red-700 list-disc pl-4">
                  {errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {errors.length > 5 && (
                    <li>{t("labels.errorsAndMore", { count: errors.length - 5 })}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleImport} disabled={busy || rows.length === 0 || !companyId}>
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("status.importing")}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-1" />
                {t("actions.importCount", { count: rows.length })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
