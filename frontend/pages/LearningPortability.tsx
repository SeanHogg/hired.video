import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Upload, FileJson, FileSpreadsheet, ArrowRightLeft, KeyRound } from "lucide-react";
import {
  fetchLearningExport,
  listLrsCredentials,
  createLrsCredential,
  importLearningStatements,
  type LearningExportKind,
  type LrsCredentialView,
} from "@/lib/courses/courses-api";

/**
 * /learning/portability — the "company transitioning in / company leaving"
 * migration console (#2281). Export the tenant's courses/records in portable
 * shapes, or bulk-import an xAPI statement archive from another platform.
 * Follows the page-chrome checklist (AppShell + useSEO + useBreadcrumbs),
 * fully localized (portability.* keys), theme-token colors, responsive.
 */

type Status = { kind: "idle" | "busy" | "ok" | "err"; msg?: string };

export default function LearningPortability() {
  useSEO("/learning/portability");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("portability.breadcrumb"), url: "/learning/portability" }]);

  const [exporting, setExporting] = useState<LearningExportKind | null>(null);
  const [credentials, setCredentials] = useState<LrsCredentialView[]>([]);
  const [credentialId, setCredentialId] = useState<string>("");
  const [importStatus, setImportStatus] = useState<Status>({ kind: "idle" });
  const [exportStatus, setExportStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    listLrsCredentials()
      .then((r) => {
        const active = (r?.credentials ?? []).filter((c) => c.active);
        setCredentials(active);
        if (active[0]) setCredentialId(active[0].id);
      })
      .catch(() => setCredentials([]));
  }, []);

  const exportCards: Array<{ kind: LearningExportKind; icon: typeof FileJson; title: string; body: string }> = [
    { kind: "manifest", icon: FileJson, title: t("portability.export.manifestTitle"), body: t("portability.export.manifestBody") },
    { kind: "results", icon: FileSpreadsheet, title: t("portability.export.resultsTitle"), body: t("portability.export.resultsBody") },
    { kind: "statements", icon: FileJson, title: t("portability.export.statementsTitle"), body: t("portability.export.statementsBody") },
  ];

  const runExport = async (kind: LearningExportKind) => {
    setExporting(kind);
    setExportStatus({ kind: "busy" });
    try {
      const { blob, filename } = await fetchLearningExport(kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus({ kind: "ok", msg: t("portability.export.done", { file: filename }) });
    } catch {
      setExportStatus({ kind: "err", msg: t("portability.export.failed") });
    } finally {
      setExporting(null);
    }
  };

  const ensureCredential = async () => {
    setImportStatus({ kind: "busy" });
    try {
      const created = await createLrsCredential(t("portability.import.defaultCredLabel"));
      const view = created!.credential;
      setCredentials((prev) => [view, ...prev]);
      setCredentialId(view.id);
      setImportStatus({ kind: "ok", msg: t("portability.import.credCreated", { key: view.keyId }) });
    } catch {
      setImportStatus({ kind: "err", msg: t("portability.import.credFailed") });
    }
  };

  const onImportFile = async (file: File) => {
    if (!credentialId) {
      setImportStatus({ kind: "err", msg: t("portability.import.needCred") });
      return;
    }
    setImportStatus({ kind: "busy" });
    try {
      const parsed = JSON.parse(await file.text());
      // Accept a bare array, an export envelope { statements: [...] }, or a
      // double-wrapped export { statements: { statements: [...] } }.
      const statements = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.statements)
          ? parsed.statements
          : Array.isArray(parsed?.statements?.statements)
            ? parsed.statements.statements
            : null;
      if (!statements) {
        setImportStatus({ kind: "err", msg: t("portability.import.badFile") });
        return;
      }
      const res = await importLearningStatements(credentialId, statements);
      setImportStatus({ kind: "ok", msg: t("portability.import.done", { count: res?.imported ?? 0 }) });
    } catch {
      setImportStatus({ kind: "err", msg: t("portability.import.failed") });
    }
  };

  const statusClass = (s: Status) =>
    s.kind === "ok" ? "text-green-600" : s.kind === "err" ? "text-destructive" : "text-muted-foreground";

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <ArrowRightLeft className="h-4 w-4" /> {t("portability.eyebrow")}
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{t("portability.title")}</h1>
        <p className="text-muted-foreground max-w-2xl mb-8">{t("portability.subtitle")}</p>

        {/* Export */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-1"><Download className="h-5 w-5" /> {t("portability.export.heading")}</h2>
          <p className="text-muted-foreground text-sm mb-4">{t("portability.export.lead")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {exportCards.map((card) => (
              <Card key={card.kind}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><card.icon className="h-4 w-4 text-muted-foreground" /> {card.title}</CardTitle>
                  <CardDescription>{card.body}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" disabled={exporting !== null} onClick={() => runExport(card.kind)}>
                    <Download className="h-4 w-4 mr-2" />
                    {exporting === card.kind ? t("portability.export.preparing") : t("portability.export.download")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {exportStatus.msg && <p className={`text-sm mt-3 ${statusClass(exportStatus)}`}>{exportStatus.msg}</p>}
        </section>

        {/* Import */}
        <section>
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-1"><Upload className="h-5 w-5" /> {t("portability.import.heading")}</h2>
          <p className="text-muted-foreground text-sm mb-4">{t("portability.import.lead")}</p>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="lrs-cred" className="text-sm font-medium">{t("portability.import.credLabel")}</label>
                {credentials.length > 0 ? (
                  <select
                    id="lrs-cred"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={credentialId}
                    onChange={(e) => setCredentialId(e.target.value)}
                  >
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>{c.label} · {c.keyId}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">{t("portability.import.noCred")}</p>
                    <Button variant="outline" size="sm" onClick={ensureCredential} disabled={importStatus.kind === "busy"}>
                      <KeyRound className="h-4 w-4 mr-2" /> {t("portability.import.createCred")}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="stmt-file" className="text-sm font-medium">{t("portability.import.fileLabel")}</label>
                <input
                  id="stmt-file"
                  type="file"
                  accept="application/json,.json"
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
                  disabled={!credentialId || importStatus.kind === "busy"}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); }}
                />
                <p className="text-xs text-muted-foreground">{t("portability.import.fileHint")}</p>
              </div>

              {importStatus.msg && <p className={`text-sm ${statusClass(importStatus)}`}>{importStatus.msg}</p>}
            </CardContent>
          </Card>
        </section>
      </main>
    </AppShell>
  );
}
