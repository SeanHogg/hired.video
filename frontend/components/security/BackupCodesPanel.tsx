/**
 * BackupCodesPanel — show remaining backup-code count and allow
 * regeneration. Plaintext is displayed once on regenerate.
 *
 * Self-gates: returns null when not authenticated.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { mfaService } from "@/lib/services/mfa-service";

export function BackupCodesPanel() {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    void mfaService.backupCodeCount().then(setCount).catch(() => setCount(null));
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const regenerate = async () => {
    setPending(true);
    try {
      const c = await mfaService.regenerateBackupCodes();
      setCodes(c);
      setCount(c.length);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup codes</CardTitle>
        <CardDescription>
          One-time rescue codes for when you don't have your authenticator. Regenerating
          invalidates the previous batch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          Remaining: <span className="font-mono font-medium">{count ?? "—"}</span>
        </div>
        {codes && (
          <>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm p-3 rounded bg-muted">
              {codes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Save these. They won't be shown again.
            </p>
          </>
        )}
        <Button variant="outline" onClick={regenerate} disabled={pending}>
          {pending ? "Generating…" : codes ? "Regenerate again" : "Regenerate codes"}
        </Button>
      </CardContent>
    </Card>
  );
}
