/**
 * Account data export — closes the GDPR Art. 20 / CPRA portability promise
 * made in PrivacyPolicy.tsx. Default is a downloadable JSON bundle covering
 * profile / resumes / applications / messages / billing / media;
 * `format=csv` keeps the spreadsheet-friendly path for the account + resume +
 * applications subset (the rich relational data doesn't flatten to CSV).
 */

import { loadUserDataExportRows } from "../../repositories/userDataExportRepository.js";

export interface ExportFile {
  body: string;
  contentType: string;
  filename: string;
}

function escapeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsvRows(header: string[], rows: Record<string, unknown>[]): string {
  return [header.join(","), ...rows.map((r) => header.map((h) => escapeCell(r[h])).join(","))].join("\n");
}

export async function buildAccountExport(userId: string, format: string | undefined): Promise<ExportFile> {
  const rows = await loadUserDataExportRows(userId);

  const data = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    account: rows.user,
    profile: rows.profile,
    preferences: {
      account: rows.accountPrefsRow,
      cookies: rows.cookiePrefsRow,
      privacy: rows.privacyPrefsRow,
    },
    resumes: rows.resumes,
    jobApplications: rows.applications,
    savedJobs: rows.savedJobs,
    messages: rows.messages,
    media: {
      videos: rows.videos,
      studioProjects: rows.studioProjects,
    },
    billing: {
      invoices: rows.invoices,
      paymentMethods: rows.paymentMethods,
    },
  };

  const date = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const sections: string[] = [];
    if (rows.user) {
      sections.push("# Account\n" + toCsvRows(["email", "name", "role", "createdAt", "lastLoginAt"], [rows.user as Record<string, unknown>]));
    }
    if (rows.resumes.length) {
      sections.push("\n# Resumes\n" + toCsvRows(["id", "title", "status", "createdAt"], rows.resumes as Record<string, unknown>[]));
    }
    if (rows.applications.length) {
      const apps = rows.applications as Record<string, unknown>[];
      sections.push("\n# Job Applications\n" + toCsvRows(Object.keys(apps[0]), apps));
    }
    return {
      body: sections.join("\n"),
      contentType: "text/csv; charset=utf-8",
      filename: `account-export-${date}.csv`,
    };
  }

  return {
    body: JSON.stringify(data, null, 2),
    contentType: "application/json; charset=utf-8",
    filename: `account-export-${date}.json`,
  };
}
