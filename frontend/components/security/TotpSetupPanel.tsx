/**
 * TotpSetupPanel — three-state TOTP enrollment flow:
 *   "idle"      → initial: show "Enable TOTP" button
 *   "verify"    → secret + QR shown, awaiting first 6-digit code
 *   "enabled"   → success: show fresh backup codes (once)
 *
 * Self-gates: returns null when not authenticated.
 *
 * The component owns its own state machine — parent doesn't pass any
 * canEnable / hasMfa props.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { mfaService } from "@/lib/services/mfa-service";

type State =
  | { kind: "idle" }
  | { kind: "verify"; secret: string; otpauthUrl: string }
  | { kind: "enabled"; backupCodes: string[] };

export function TotpSetupPanel() {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) return null;

  const begin = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await mfaService.beginTotpSetup();
      setState({ kind: "verify", secret: r.secret, otpauthUrl: r.otpauthUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to begin");
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await mfaService.confirmTotpSetup(code);
      setState({ kind: "enabled", backupCodes: r.backupCodes });
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authenticator app (TOTP)</CardTitle>
        <CardDescription>
          Add a 6-digit code from Google Authenticator, 1Password, Authy, or any RFC 6238
          compatible app. Strongest second factor besides a passkey.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "idle" && (
          <Button onClick={begin} disabled={pending}>
            {pending ? "Setting up…" : "Enable authenticator app"}
          </Button>
        )}

        {state.kind === "verify" && (
          <div className="space-y-4">
            <p className="text-sm">
              Scan this URL with your authenticator app, or enter the secret manually:
            </p>
            <div className="font-mono text-xs break-all p-3 rounded bg-muted">
              {state.otpauthUrl}
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Secret</Label>
              <div className="font-mono text-sm mt-1">{state.secret}</div>
            </div>
            <div>
              <Label htmlFor="totp-code">Enter the 6-digit code your app shows</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-lg w-32"
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button onClick={confirm} disabled={pending || code.length !== 6}>
              {pending ? "Verifying…" : "Confirm and enable"}
            </Button>
          </div>
        )}

        {state.kind === "enabled" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              ✅ TOTP enabled. Save these backup codes — you won't see them again.
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm p-3 rounded bg-muted">
              {state.backupCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Each code works once. Use one if you ever lose your authenticator device.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
