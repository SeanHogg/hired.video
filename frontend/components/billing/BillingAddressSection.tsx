/**
 * BillingAddressSection — self-contained read/save panel for the user's
 * billing address.  Mounts the shared <BillingAddressForm/>, owns the
 * data fetch + save lifecycle, and surfaces a single Save button so the
 * Settings → Billing tab has a consistent edit affordance.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { BillingAddressForm } from "./BillingAddressForm";
import { profileService } from "@/lib/services/profile-service";
import {
  BillingAddressSchema,
  EMPTY_BILLING_ADDRESS,
  type BillingAddress,
} from "@shared/billing-address";

export function BillingAddressSection() {
  const [address, setAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [errors, setErrors] = useState<Partial<Record<keyof BillingAddress, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    profileService
      .getBillingAddress()
      .then((saved) => {
        if (cancelled) return;
        if (saved) setAddress(saved);
      })
      .catch(() => {
        // Empty form is the right fallback.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    const parsed = BillingAddressSchema.safeParse(address);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof BillingAddress, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BillingAddress | undefined;
        if (key) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error("Please complete the billing address.");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await profileService.saveBillingAddress(parsed.data);
      setAddress(saved);
      toast.success("Billing address saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save billing address.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Billing Address
        </CardTitle>
        <CardDescription>
          Used for invoices and as the default address on Checkout. Auto-fills next time you buy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BillingAddressForm
          value={address}
          onChange={setAddress}
          errors={errors}
          disabled={loading || saving}
        />
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Saving…" : "Save address"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
