/**
 * Vendor Sync E2E harness (#2167) — test-only, never built or routed.
 *
 * Mounts the real `/tools/vendor-sync` page inside ToolEmbed + Auth so
 * we skip AppShell. The Chrome extension cannot round-trip against
 * Playwright's 127.0.0.1:4317 (service-worker-base.js only broadcasts
 * to https://hired.video/* and http://localhost:3000/*), so this file:
 *
 *   1. Seeds a non-guest JWT + current_user in localStorage.
 *   2. Stubs window.fetch for /api/vendor-sync, /api/resumes, /api/bootstrap.
 *   3. Relays `hired.video:notify-extension` → `hired.video:extension-event`
 *      with type `vendor-sync:focused-html` (the same CustomEvent the
 *      auth-bridge would dispatch after the SW scraped a vendor tab).
 *
 * `window.__vendorSyncReady` turns true once the page has rendered.
 */
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/global.css";
import "@/lib/i18n/i18n";
import { AuthProvider } from "@/lib/auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { ToolEmbedProvider } from "@/lib/tools/tool-embed";
import { PersonaPreviewProvider } from "@/providers/PersonaPreviewProvider";
import linkedinHtml from "./fixtures/linkedin-profile.html?raw";

const RESUME_ID = "resume-master-1";
const USER_ID = "user-1";
const EXTRACTED_NAME = "Avery Chen";
const EXTRACTED_COMPANY = "Northwind Labs";
const HTML_MARKER = "linkedin-profile-avery-chen";

declare global {
  interface Window {
    __vendorSyncReady?: boolean;
    __vendorSyncLastImport?: {
      connectorId: string;
      html: string;
      sourceUrl: string;
      targetResumeId: string;
    } | null;
    /** Override the stubbed extension reply. Default: LinkedIn HTML. */
    __vendorSyncReply?: {
      html: string | null;
      connectorId: string | null;
      originUrl: string | null;
      error: string | null;
    };
  }
}

function fakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
      sub: USER_ID,
    }),
  );
  return `${header}.${payload}.sig`;
}

function seedAuth(): void {
  localStorage.setItem("auth_token", fakeJwt());
  localStorage.setItem(
    "current_user",
    JSON.stringify({
      id: USER_ID,
      email: "avery@example.com",
      firstName: "Avery",
      lastName: "Chen",
      role: "job_seeker",
    }),
  );
}

const MASTER_RESUME = {
  id: RESUME_ID,
  userId: USER_ID,
  title: "Avery Chen — Master",
  slug: "avery-chen",
  status: "published",
  privacy: "private",
  isMaster: true,
  isActive: true,
  parentId: null,
  diffPercent: null,
  templateId: null,
  metaResumeId: null,
  sentimentScore: null,
  scores: null,
  viewCount: 0,
  isOwner: true,
  isWatched: false,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  summary: "Product engineer",
  headline: "Product engineer",
  hasCoverLetter: false,
  ownership: "owned",
};

const LINKEDIN_CONNECTOR = {
  id: "linkedin",
  label: "LinkedIn",
  iconKey: "linkedin",
  category: "professional",
  description: "Sync your hired.video master with your LinkedIn profile.",
  editProfileUrl: "https://www.linkedin.com/in/me/",
  supportsExtensionExtract: true,
  supportsExtensionWrite: false,
  lastRun: null,
};

const SOURCE_CONTENT = {
  basics: {
    name: EXTRACTED_NAME,
    email: "avery.chen@northwind.example",
    label: "Staff Engineer",
  },
  work: [
    {
      name: EXTRACTED_COMPANY,
      position: "Staff Engineer",
      startDate: "2021-03",
      summary: "Shipped the hiring platform.",
    },
  ],
};

const TARGET_CONTENT = {
  basics: { name: "A Chen", email: "avery@example.com" },
  work: [],
};

const MERGE_ANALYSIS = {
  basics: {
    conflicts: [
      { field: "name", sourceValue: EXTRACTED_NAME, targetValue: "A Chen" },
      {
        field: "email",
        sourceValue: "avery.chen@northwind.example",
        targetValue: "avery@example.com",
      },
    ],
    autoMerge: false,
  },
  sectionMatches: [],
  newSections: [
    {
      sectionType: "work",
      sourceIndex: 0,
      item: SOURCE_CONTENT.work[0],
    },
  ],
  summary: {
    totalSections: 1,
    autoMerge: 0,
    manualReview: 1,
    skip: 0,
    newItems: 1,
  },
};

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonErr(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: { message } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function pathnameOf(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function installFetchMock(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : String(input);
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const path = pathnameOf(url);

    if (path.endsWith("/api/bootstrap") || path.includes("/api/bootstrap")) {
      return jsonOk({
        verification: {
          email: "avery@example.com",
          emailConfirmed: true,
        },
        tokenBudget: null,
        featureFlags: { flags: [], userFlags: {} },
        notifications: { unreadCount: 0 },
        inboxSummary: null,
        serverTime: new Date().toISOString(),
      });
    }

    if (path.includes("/api/vendor-sync/connectors") && method === "GET") {
      return jsonOk({ connectors: [LINKEDIN_CONNECTOR] });
    }

    if (path.includes("/api/resumes/withownership") && method === "GET") {
      return jsonOk([MASTER_RESUME]);
    }

    if (path.includes("/api/resumes/mastergroups") && method === "GET") {
      return jsonOk([]);
    }

    const importMatch = path.match(/\/api\/vendor-sync\/([^/]+)\/import$/);
    if (importMatch && method === "POST") {
      const connectorId = decodeURIComponent(importMatch[1]);
      let body: { html?: string; sourceUrl?: string; targetResumeId?: string } = {};
      try {
        const raw =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof Blob
              ? await init.body.text()
              : input instanceof Request
                ? await input.clone().text()
                : "";
        body = raw ? (JSON.parse(raw) as typeof body) : {};
      } catch {
        body = {};
      }
      window.__vendorSyncLastImport = {
        connectorId,
        html: body.html ?? "",
        sourceUrl: body.sourceUrl ?? "",
        targetResumeId: body.targetResumeId ?? "",
      };
      return jsonOk({
        syncRunId: "sync-run-e2e-1",
        sourceContent: SOURCE_CONTENT,
        targetContent: TARGET_CONTENT,
        analysis: MERGE_ANALYSIS,
      });
    }

    if (path.includes("/api/")) {
      return jsonErr(404, `unmocked ${method} ${path}`);
    }
    return original(input, init);
  };
}

function installExtensionStub(): void {
  window.__vendorSyncReply = {
    html: linkedinHtml,
    connectorId: "linkedin",
    originUrl: "https://www.linkedin.com/in/avery-chen",
    error: null,
  };
  window.addEventListener("hired.video:notify-extension", (e: Event) => {
    const detail = (e as CustomEvent<{ type?: string; payload?: { connectorId?: string } }>).detail;
    if (detail?.type !== "vendor-sync:request-focused-html") return;
    const reply = window.__vendorSyncReply ?? {
      html: linkedinHtml,
      connectorId: detail.payload?.connectorId ?? "linkedin",
      originUrl: "https://www.linkedin.com/in/avery-chen",
      error: null,
    };
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent("hired.video:extension-event", {
          detail: {
            type: "vendor-sync:focused-html",
            payload: {
              html: reply.html,
              connectorId: reply.connectorId ?? detail.payload?.connectorId ?? "linkedin",
              originUrl: reply.originUrl,
              error: reply.error,
            },
          },
        }),
      );
    });
  });
}

seedAuth();
installFetchMock();
installExtensionStub();

const params = new URLSearchParams(window.location.search);
const autoSync = params.get("autoSync");
const initialPath = autoSync
  ? `/tools/vendor-sync?autoSync=${encodeURIComponent(autoSync)}`
  : "/tools/vendor-sync";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const embed = {
  resumeId: RESUME_ID,
  projectId: null,
  ask: () => {},
  openReview: () => {},
  report: () => {},
};

void import("@/pages/tools/VendorSync").then(({ default: VendorSync }) => {
  const root = document.getElementById("root");
  if (!root) throw new Error("missing #root");
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PersonaPreviewProvider>
          <TooltipProvider>
            <ToolEmbedProvider value={embed}>
              <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                  <Route path="/tools/vendor-sync" element={<VendorSync />} />
                </Routes>
              </MemoryRouter>
              <Toaster />
            </ToolEmbedProvider>
          </TooltipProvider>
        </PersonaPreviewProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  requestAnimationFrame(() => {
    window.__vendorSyncReady = true;
  });
});

export { EXTRACTED_NAME, EXTRACTED_COMPANY, HTML_MARKER, RESUME_ID };
