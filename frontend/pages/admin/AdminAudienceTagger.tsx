/**
 * /admin/audiences — SuperAdmin batch-tag UI for the manual audience
 * backfill (#1629). Editors paste a list of entity UUIDs, pick a
 * content kind, select audience keys, and apply.
 *
 * Minimal MVP — no search-and-select-rows yet. The next iteration will
 * embed a content browser that lets editors pick rows by title; this
 * version is the "I have the IDs already" path for the initial backfill
 * pass that seeds the resource maps.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSEO } from "@/lib/seo";
import { apiClient } from "@/lib/api-client";
import {
  AudiencePicker,
  canonicaliseAudienceKeys,
} from "@/components/landing/AudiencePicker";
import type { AudienceKey } from "@shared/audiences";

const KIND_OPTIONS = [
  { value: "article", label: "Articles" },
  { value: "resume", label: "Resume templates" },
  { value: "template", label: "Studio templates" },
  { value: "learning_path", label: "Learning paths" },
  { value: "video", label: "Video resumes" },
  { value: "job", label: "Jobs" },
  { value: "event", label: "Events" },
] as const;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export default function AdminAudienceTagger(): JSX.Element {
  const location = useLocation();
  useSEO(location.pathname, {
    title: "Audience Tagger — Admin · hired.video",
    description: "Batch-tag content with audience keys.",
  });

  const [entityKind, setEntityKind] = useState<typeof KIND_OPTIONS[number]["value"]>("article");
  const [idsRaw, setIdsRaw] = useState("");
  const [audienceKeys, setAudienceKeys] = useState<AudienceKey[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const extractedIds = idsRaw.match(UUID_RE) ?? [];

  const onApply = async () => {
    if (extractedIds.length === 0 || audienceKeys.length === 0) return;
    setStatus("submitting");
    setResultMessage(null);
    try {
      const res = await apiClient.post<{ entityKind: string; results: Array<{ entityId: string; totalTags: number }> }>(
        "/api/admin/content-audiences/batch",
        {
          entityKind,
          entityIds: extractedIds,
          audienceKeys: canonicaliseAudienceKeys(audienceKeys),
        },
      );
      const count = res.data?.results.length ?? 0;
      setStatus("success");
      setResultMessage(`Tagged ${count} ${entityKind} ${count === 1 ? "entity" : "entities"} with ${audienceKeys.length} audience ${audienceKeys.length === 1 ? "key" : "keys"}.`);
    } catch (err) {
      setStatus("error");
      setResultMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-12 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Audience tagger</h1>
        <p className="text-muted-foreground mb-8">
          Bulk-apply audience tags to existing content. Pick a kind, paste UUIDs (one per line or anywhere — we extract them automatically), pick the audience keys you want to add, and apply. Existing tags are preserved.
        </p>

        <Card className="mb-6">
          <CardContent className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2">Content kind</label>
              <select
                value={entityKind}
                onChange={(e) => setEntityKind(e.target.value as typeof entityKind)}
                className="w-full rounded-md border bg-background px-3 py-2"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Entity IDs
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({extractedIds.length} valid UUID{extractedIds.length === 1 ? "" : "s"} detected)
                </span>
              </label>
              <textarea
                value={idsRaw}
                onChange={(e) => setIdsRaw(e.target.value)}
                rows={6}
                placeholder="Paste UUIDs — any whitespace, comma, or surrounding text is OK. We extract just the UUID-shaped tokens."
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Audience tags to add</label>
              <AudiencePicker
                value={audienceKeys}
                onChange={setAudienceKeys}
                description="Select one or more audiences. Tags from both taxonomies (situation + profession) can be combined."
              />
            </div>

            {resultMessage ? (
              <Alert variant={status === "error" ? "destructive" : "default"}>
                <AlertDescription>{resultMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button
                onClick={onApply}
                disabled={status === "submitting" || extractedIds.length === 0 || audienceKeys.length === 0}
              >
                {status === "submitting"
                  ? "Applying…"
                  : `Apply ${audienceKeys.length} tag${audienceKeys.length === 1 ? "" : "s"} to ${extractedIds.length} entit${extractedIds.length === 1 ? "y" : "ies"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
