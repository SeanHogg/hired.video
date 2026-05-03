/**
 * RegisterGate — wraps the signup form and self-decides what to render
 * based on the visitor's geo eligibility.
 *
 *   • allowed     → render children (the actual register form)
 *   • waitlist    → render the RegionWaitlistForm
 *   • sanctioned  → render a hard-block notice (no waitlist, no email
 *                   capture — accepting their data is a sanctions issue)
 *
 * No canCreate prop drilling: the gate calls useGeoEligibility itself
 * and the children only ever render when entitled.
 */

import { useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGeoEligibility } from "@/hooks/use-geo-eligibility";
import { apiClient } from "@/lib/api-client";

const WaitlistResponseSchema = z.object({ recorded: z.boolean() });

function RegionWaitlistForm({ countryCode }: { countryCode: string | null }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiClient.post("/api/security/region-waitlist", { email, reason }, WaitlistResponseSchema);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You're on the list</CardTitle>
          <CardDescription>
            We'll email you the moment hired.video opens to {countryCode ?? "your region"}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Not yet available in your region</CardTitle>
        <CardDescription>
          hired.video signup is currently limited to North + South America. Drop your email
          and we'll let you know when we expand.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="waitlist-email">Email</Label>
            <Input
              id="waitlist-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="waitlist-reason">What would you use it for? (optional)</Label>
            <Textarea
              id="waitlist-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Notify me"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SanctionedNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account creation unavailable</CardTitle>
        <CardDescription>
          Due to international sanctions compliance, hired.video cannot create accounts for
          users in your country. We don't collect email or contact info from sanctioned
          jurisdictions.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function RegisterGate({ children }: { children: React.ReactNode }) {
  const { eligibility, countryCode, loading } = useGeoEligibility();

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Checking availability…</div>;
  }

  if (eligibility === "sanctioned") return <SanctionedNotice />;
  if (eligibility === "waitlist") return <RegionWaitlistForm countryCode={countryCode} />;
  return <>{children}</>;
}
