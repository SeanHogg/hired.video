// CsvImportCandidatesDialog — paste or upload a CSV of candidates to bulk-import
// into the agency's candidate_resumes pool. Header row is required; supported
// columns: name (required), email, phone, location, linkedin_url, label, skills.
//
// Closes audit gap #1 (CSV import for talent pool was missing).

import { useMemo, useState } from "react";
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

// Map the raw CSV rows (string[][] from the shared parser) into typed
// candidate rows using the header aliases above. Keeps CSV mechanics in
// lib/utils/csv and the candidate-shape mapping local to this component.
function mapCsvRows(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const allRows = parseCsv(text);
  if (allRows.length < 2) {
    return { rows: [], errors: ["CSV needs a header row plus at least one data row."] };
  }
  const headerMap = allRows[0]
    .map((h) => h.trim().toLowerCase())
    .map((h) => HEADER_ALIASES[h] ?? null);
  if (!headerMap.includes("name")) {
    errors.push("CSV must include a 'name' column.");
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
      errors.push(`Row ${li + 1}: missing name (skipped).`);
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
  const { toast } = useToast();
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);

  const { rows, errors } = useMemo(() => {
    if (!csvText.trim()) return { rows: [] as ParsedRow[], errors: [] as string[] };
    return mapCsvRows(csvText);
  }, [csvText]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsvText);
  };

  const handleImport = async () => {
    if (!companyId) {
      toast({ title: "Pick a company first", variant: "destructive" });
      return;
    }
    if (rows.length === 0) {
      toast({ title: "Nothing to import", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiClient.post<{ created: CandidateResumeRow[]; count: number }>(
        "/api/recruit/candidates/bulk-csv",
        { companyId, rows },
      );
      toast({
        title: `Imported ${response.data.count} candidate${response.data.count === 1 ? "" : "s"}`,
      });
      onImported(response.data.created);
      setCsvText("");
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Import failed",
        description: (e as Error)?.message ?? "Try again.",
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
            Bulk import candidates from CSV
          </DialogTitle>
          <DialogDescription>
            Required column: <code>name</code>. Optional: <code>email</code>,{" "}
            <code>phone</code>, <code>location</code>, <code>linkedin_url</code>,{" "}
            <code>label</code> (current title), <code>skills</code> (comma- or semicolon-separated).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="csv-file">Upload .csv</Label>
            <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="csv-text">…or paste CSV text</Label>
            <Textarea
              id="csv-text"
              rows={10}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={
                "name,email,phone,location,linkedin_url,label,skills\nJane Doe,jane@example.com,+15551234,Brooklyn NY,https://linkedin.com/in/janedoe,Senior PM,product;leadership;saas"
              }
              className="font-mono text-xs"
            />
          </div>

          {(rows.length > 0 || errors.length > 0) && (
            <div className="border rounded p-2 bg-muted/30 text-xs space-y-1">
              <div>
                Parsed: <strong>{rows.length}</strong> row{rows.length === 1 ? "" : "s"}
              </div>
              {errors.length > 0 && (
                <ul className="text-red-700 list-disc pl-4">
                  {errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {errors.length > 5 && <li>… and {errors.length - 5} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={busy || rows.length === 0 || !companyId}>
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-1" />
                Import {rows.length} row{rows.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
