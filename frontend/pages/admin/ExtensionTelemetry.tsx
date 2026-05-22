// SuperAdmin — Chrome extension telemetry & picker captures viewer.
//
// Three panes:
//   1. Top-host captures   — which sites produced the most manual picks?
//      (= where auto-detection is failing.) Click a host to filter the
//      captures list and seed a prompt for siteConfigs.ts.
//   2. Captures table      — per-capture rows with field selectors + text
//      + HTML snippets. "Copy prompt" emits a Claude-ready brief.
//   3. Sessions list       — full session timeline with errors, page
//      views, and navigation chain. Click a row → drawer with events.
//
// Wired to /api/admin/impersonate/extension/* (extensionTelemetryRoutes).
// Gated behind admin-permissions resource "extensionTelemetry".

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Puzzle, RefreshCw, Filter, AlertTriangle, Camera, Activity, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";

interface SessionRow {
  id: string;
  clientSessionId: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  extension: "jobseeker" | "recruiter";
  version: string | null;
  eventCount: number;
  errorCount: number;
  pickerCaptureCount: number;
  startedAt: string;
  updatedAt: string;
}

interface CaptureRow {
  id: string;
  sessionId: string;
  url: string | null;
  host: string | null;
  payload: any;
  createdAt: string;
  extension: "jobseeker" | "recruiter";
  userEmail: string | null;
}

interface HostAggregate {
  host: string | null;
  captures: number;
}

interface EventRow {
  id: string;
  sessionId: string;
  kind: string;
  url: string | null;
  host: string | null;
  payload: any;
  createdAt: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function useSessions(filters: { extension?: string; hasErrors?: boolean; hasCaptures?: boolean }) {
  const params = new URLSearchParams();
  if (filters.extension) params.set("extension", filters.extension);
  if (filters.hasErrors) params.set("hasErrors", "true");
  if (filters.hasCaptures) params.set("hasCaptures", "true");
  return useQuery({
    queryKey: ["admin", "extension", "sessions", filters],
    queryFn: async () => {
      const res = await apiClient.get<{ sessions: SessionRow[]; total: number }>(
        `/api/admin/impersonate/extension/sessions?${params.toString()}`,
      );
      return res.data;
    },
  });
}

function useCaptures(host?: string) {
  const params = new URLSearchParams();
  if (host) params.set("host", host);
  return useQuery({
    queryKey: ["admin", "extension", "captures", host ?? ""],
    queryFn: async () => {
      const res = await apiClient.get<{
        captures: CaptureRow[];
        byHost: HostAggregate[];
        total: number;
      }>(`/api/admin/impersonate/extension/captures?${params.toString()}`);
      return res.data;
    },
  });
}

function useSessionDetail(id: string | null) {
  return useQuery({
    queryKey: ["admin", "extension", "sessions", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<{ session: SessionRow; events: EventRow[] }>(
        `/api/admin/impersonate/extension/sessions/${id}`,
      );
      return res.data;
    },
  });
}

/**
 * Build a Claude-ready prompt from a picker capture so an admin can
 * paste it straight into a model to generate updated entries for
 * `hired.video/shared/scraping/siteConfigs.ts`. This is the actual
 * payoff of the picker — manual captures distil into selectors that
 * fix auto-detection for everyone on the same host.
 */
function captureToPrompt(cap: CaptureRow): string {
  const fields = cap.payload?.fields ?? {};
  const lines: string[] = [];
  lines.push(`# Site selector update for ${cap.host ?? "unknown host"}`);
  lines.push("");
  lines.push(`URL: ${cap.url ?? "(unknown)"}`);
  lines.push(`Captured: ${fmtDate(cap.createdAt)}`);
  lines.push("");
  lines.push(`A user identified these elements manually because automatic detection failed:`);
  lines.push("");
  for (const [key, val] of Object.entries(fields)) {
    const f = val as { value?: string; selector?: string; snippet?: string };
    lines.push(`## ${key}`);
    lines.push(`- Value: ${f?.value ?? "(empty)"}`);
    lines.push(`- Selector the user picked: \`${f?.selector ?? "(none)"}\``);
    if (f?.snippet) {
      lines.push("- HTML snippet:");
      lines.push("```html");
      lines.push(String(f.snippet).slice(0, 2000));
      lines.push("```");
    }
    lines.push("");
  }
  lines.push("---");
  lines.push(
    `Goal: propose additions/changes to hired.video/shared/scraping/siteConfigs.ts so detectJobInPage handles this host automatically.`,
  );
  return lines.join("\n");
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback for older browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function ExtensionTelemetry() {
  const [hostFilter, setHostFilter] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [extensionFilter, setExtensionFilter] = useState<"jobseeker" | "recruiter" | undefined>();
  const captures = useCaptures(hostFilter);
  const sessions = useSessions({ extension: extensionFilter, hasErrors: false, hasCaptures: false });
  const sessionDetail = useSessionDetail(sessionId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Puzzle className="h-6 w-6" /> Chrome Extension Telemetry
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            captures.refetch();
            sessions.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Every manual picker capture lands here. Use the Copy-prompt button on a row to seed a Claude prompt
        for updating <code>hired.video/shared/scraping/siteConfigs.ts</code>. Sessions roll up errors + page
        views + navigations to give the full picture of what a user did before they hit "Identify manually".
      </p>

      {/* Top hosts — quickest path to "where is detection failing most?" */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" /> Top hosts by picker capture count
          </CardTitle>
        </CardHeader>
        <CardContent>
          {captures.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(captures.data?.byHost ?? []).map((h) => (
                <Button
                  key={h.host ?? "_unknown"}
                  variant={hostFilter === h.host ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHostFilter(hostFilter === h.host ? undefined : h.host ?? undefined)}
                >
                  {h.host || "(unknown)"} <Badge variant="secondary" className="ml-2">{h.captures}</Badge>
                </Button>
              ))}
              {hostFilter && (
                <Button variant="ghost" size="sm" onClick={() => setHostFilter(undefined)}>
                  Clear filter
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Captures */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" /> Picker captures
            {hostFilter && <Badge variant="outline">host: {hostFilter}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {captures.isLoading && (
                <TableRow>
                  <TableCell colSpan={6}><Loader2 className="h-4 w-4 animate-spin" /></TableCell>
                </TableRow>
              )}
              {captures.data?.captures?.map((cap) => {
                const fields = cap.payload?.fields ?? {};
                const fieldKeys = Object.keys(fields);
                return (
                  <TableRow key={cap.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(cap.createdAt)}</TableCell>
                    <TableCell className="text-xs">{cap.host ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={cap.url ?? ""}>{cap.url ?? "—"}</TableCell>
                    <TableCell className="text-xs">{cap.userEmail ?? <span className="text-muted-foreground">anon</span>}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {fieldKeys.map((k) => (
                          <Badge key={k} variant={fields[k]?.source === "manual" ? "default" : "secondary"} className="text-[10px]">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(captureToPrompt(cap))}
                        title="Copy a Claude-ready prompt to update siteConfigs.ts"
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy prompt
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!captures.isLoading && (captures.data?.captures?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                    No picker captures yet — they'll show up here as users hit "Identify manually" in the side panel.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Sessions
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant={extensionFilter === "jobseeker" ? "default" : "outline"}
                onClick={() => setExtensionFilter(extensionFilter === "jobseeker" ? undefined : "jobseeker")}
              >Jobseeker</Button>
              <Button
                size="sm"
                variant={extensionFilter === "recruiter" ? "default" : "outline"}
                onClick={() => setExtensionFilter(extensionFilter === "recruiter" ? undefined : "recruiter")}
              >Recruiter</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Last seen</TableHead>
                <TableHead>Extension</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Captures</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.isLoading && (
                <TableRow>
                  <TableCell colSpan={7}><Loader2 className="h-4 w-4 animate-spin" /></TableCell>
                </TableRow>
              )}
              {sessions.data?.sessions?.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSessionId(s.id === sessionId ? null : s.id)}
                >
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(s.updatedAt)}</TableCell>
                  <TableCell className="text-xs">{s.extension}</TableCell>
                  <TableCell className="text-xs">{s.userEmail ?? <span className="text-muted-foreground">anon</span>}</TableCell>
                  <TableCell className="text-xs">{s.eventCount}</TableCell>
                  <TableCell className="text-xs">
                    {s.errorCount > 0 ? <Badge variant="destructive">{s.errorCount}</Badge> : "0"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.pickerCaptureCount > 0 ? <Badge>{s.pickerCaptureCount}</Badge> : "0"}
                  </TableCell>
                  <TableCell className="text-xs">{s.version ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Session drawer */}
      {sessionId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> Session timeline
              <Button size="sm" variant="ghost" onClick={() => setSessionId(null)} className="ml-auto">
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessionDetail.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionDetail.data?.events?.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(ev.createdAt)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={ev.kind === "error" ? "destructive" : ev.kind === "picker_capture" ? "default" : "secondary"} className="text-[10px]">
                          {ev.kind === "error" && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {ev.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{ev.host ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={ev.url ?? ""}>{ev.url ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono max-w-md truncate" title={JSON.stringify(ev.payload)}>
                        {ev.payload ? JSON.stringify(ev.payload).slice(0, 200) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
