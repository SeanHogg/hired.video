import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, ShieldAlert, Trash2, Code2 } from "lucide-react";

interface EmbedKeyView {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  allowedOrigins: string[];
  isActive: boolean;
  createdAt: string;
}
interface EmbedViewWithSnippet {
  key: string;
  label: string;
  scope: string;
  description: string;
  snippet: string;
}
interface EmbedSettingsPayload {
  enabled: boolean;
  keys: EmbedKeyView[];
  views: EmbedViewWithSnippet[];
}

/**
 * Company → Embed settings. Self-contained: fetches its own state, decides its
 * own visibility, and never trusts a prop boolean. Owner-gated server-side.
 */
export default function EmbedSettings({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<EmbedSettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyOrigin, setNewKeyOrigin] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState("roster");

  const base = `/api/companies/${companyId}/embed`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<EmbedSettingsPayload>(base);
      setData(res.data);
      if (res.data.views[0]) setActiveView(res.data.views[0].key);
    } catch (e) {
      toast({ title: "Couldn't load embed settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [base, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await apiClient.patch(base, { enabled });
      setData((d) => (d ? { ...d, enabled } : d));
    } catch {
      toast({ title: "Couldn't update embedding", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const createKey = async () => {
    if (!newKeyLabel.trim()) return;
    setBusy(true);
    setCreatedKey(null);
    try {
      const res = await apiClient.post<{ key: string }>(`${base}/keys`, {
        label: newKeyLabel.trim(),
        allowedOrigins: newKeyOrigin.trim() ? [newKeyOrigin.trim()] : [],
      });
      setCreatedKey(res.data.key);
      setNewKeyLabel("");
      setNewKeyOrigin("");
      await load();
    } catch {
      toast({ title: "Couldn't create key", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!window.confirm("Revoke this embed key? Any site using it will stop rendering.")) return;
    try {
      await apiClient.delete(`${base}/keys/${id}`);
      await load();
    } catch {
      toast({ title: "Couldn't revoke key", variant: "destructive" });
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Couldn't copy ${label.toLowerCase()}`, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading embed settings…</p>;
  if (!data) return null;

  const snippet = data.views.find((v) => v.key === activeView)?.snippet ?? "";

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5" /> Embed hired.video</CardTitle>
          <CardDescription>
            Render your company's hired.video surfaces (roster, 1:1s) inside your own website or app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch checked={data.enabled} onCheckedChange={toggle} disabled={busy} />
            <span className="text-sm font-medium">{data.enabled ? "Embedding enabled" : "Embedding disabled"}</span>
          </div>
        </CardContent>
      </Card>

      {data.enabled && (
        <>
          {/* API keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Embed keys</CardTitle>
              <CardDescription>
                A key authorizes your site to render embeds. Create one per environment (e.g. production, staging).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Never hardcode your embed key in source code</AlertTitle>
                <AlertDescription>
                  Treat it like a secret. Store it in an environment variable and inject it at build/deploy
                  time (CI/CD secret, <code>.env</code> excluded from version control). The snippet below uses a
                  <code> {"${HIRED_EMBED_KEY}"} </code> placeholder for exactly this reason.
                </AlertDescription>
              </Alert>

              {createdKey && (
                <Alert>
                  <AlertTitle>Copy your new key now — it won't be shown again</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <code className="block break-all rounded bg-muted p-2 text-xs">{createdKey}</code>
                    <Button size="sm" variant="outline" onClick={() => copy(createdKey, "Embed key")}>
                      <Copy className="h-3 w-3 mr-1.5" /> Copy key
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                  <Label>Key label</Label>
                  <Input value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} placeholder="Production" />
                </div>
                <div>
                  <Label>Allowed origin (optional)</Label>
                  <Input value={newKeyOrigin} onChange={(e) => setNewKeyOrigin(e.target.value)} placeholder="https://acme.com" />
                </div>
                <Button onClick={createKey} disabled={busy || !newKeyLabel.trim()}>Create key</Button>
              </div>

              {data.keys.length > 0 && (
                <div className="space-y-2">
                  {data.keys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between rounded border p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.label}</span>
                        <code className="text-xs text-muted-foreground">{k.keyPrefix}…</code>
                        {!k.isActive && <Badge variant="secondary">Revoked</Badge>}
                      </div>
                      {k.isActive && (
                        <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Snippet + placement directions */}
          <Card>
            <CardHeader>
              <CardTitle>Copy the snippet</CardTitle>
              <CardDescription>Choose a surface, then paste the snippet into your page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {data.views.map((v) => (
                  <Button
                    key={v.key}
                    size="sm"
                    variant={v.key === activeView ? "default" : "outline"}
                    onClick={() => setActiveView(v.key)}
                  >
                    {v.label}
                  </Button>
                ))}
              </div>
              <div className="relative">
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs"><code>{snippet}</code></pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copy(snippet, "Embed code")}
                >
                  <Copy className="h-3 w-3 mr-1.5" /> Copy
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Where to place it</p>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Paste the snippet into the page where the surface should appear (the <code>&lt;div data-hired-embed&gt;</code> is the mount point).</li>
                  <li>Replace <code>{"${HIRED_EMBED_KEY}"}</code> with your key <strong>via an environment variable</strong> at build/deploy — never commit it.</li>
                  <li>Add your site's origin to the key's <strong>Allowed origin</strong> so the embed only renders on domains you control.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
