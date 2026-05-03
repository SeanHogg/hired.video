/**
 * ChangeEmailForm — request a verified email change. Two emails are
 * sent (current + new); both must be confirmed before the swap lands.
 *
 * Self-gates: returns null when not authenticated.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { mfaService } from "@/lib/services/mfa-service";

export function ChangeEmailForm() {
  const { isAuthenticated } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await mfaService.requestEmailChange(newEmail);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request change");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change email</CardTitle>
        <CardDescription>
          We'll email both your current address and the new one. The change only completes
          after both are confirmed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="text-sm">
            ✉️ Check both your current inbox and <span className="font-medium">{newEmail}</span>.
            Click the link in each email to complete the change.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="new-email">New email address</Label>
              <Input
                id="new-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send confirmation emails"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
