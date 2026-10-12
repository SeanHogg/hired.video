/**
 * BillingAddressForm — controlled address fields shared by Checkout
 * (`pages/Checkout.tsx`) and Settings → Billing
 * (`components/billing/BillingManagement.tsx`).
 *
 * The form is purely presentational — it takes a value, fires onChange
 * with the next value, and surfaces validation errors at the field level.
 * Persistence is the caller's job (Checkout saves on submit; Settings has
 * its own Save button).  This keeps the component reusable in any
 * surface that needs the same address shape.
 *
 * Validation: shape is enforced by `BillingAddressSchema` from
 * `@shared/billing-address`. Field-level errors are passed in via the
 * `errors` prop so the form can be submitted from either page's button.
 */

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BillingAddress } from "@shared/billing-address";
import { getSubdivisions, normalizeSubdivision } from "@/lib/billing/subdivisions";
import { useAddressLabels } from "@/hooks/use-address-labels";

interface BillingAddressFormProps {
  value: BillingAddress;
  onChange: (next: BillingAddress) => void;
  /** Field-level validation errors keyed by BillingAddress key. */
  errors?: Partial<Record<keyof BillingAddress, string>>;
  /** Disable all fields (e.g. while saving). */
  disabled?: boolean;
}

const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
];

export function BillingAddressForm({
  value,
  onChange,
  errors,
  disabled = false,
}: BillingAddressFormProps) {
  function update<K extends keyof BillingAddress>(field: K, next: BillingAddress[K]) {
    onChange({ ...value, [field]: next });
  }

  // Country-aware labels (State vs Province vs Estado; ZIP vs Postal vs CP)
  // come from one shared hook so we never inline country branches in JSX.
  const labels = useAddressLabels(value.country);

  // Country-aware state picker. For US/CA the payment provider (Helcim)
  // requires an ISO 3166-2 subdivision code — see `lib/billing/subdivisions.ts`.
  // For every other country the field stays free-form so we don't have to
  // ship a global subdivision table the user has to scroll.
  const subdivisions = getSubdivisions(value.country);
  const stateSelectValue = subdivisions ? normalizeSubdivision(value.country, value.state) : "";
  const stateOptionExists =
    !!stateSelectValue && (subdivisions?.some((s) => s.code === stateSelectValue) ?? false);

  // Self-heal legacy saved values: if a US/CA address comes in with a
  // full name ("California") that resolves to a known code ("CA"),
  // canonicalise to the code so submit sends what Helcim accepts. Skip
  // when there's no change so we don't loop with the parent.
  useEffect(() => {
    if (!subdivisions) return;
    if (stateOptionExists && stateSelectValue !== value.state) {
      onChange({ ...value, state: stateSelectValue });
    }
  }, [subdivisions, stateOptionExists, stateSelectValue, value, onChange]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ba-fullName">Full Name *</Label>
        <Input
          id="ba-fullName"
          value={value.fullName}
          onChange={(e) => update("fullName", e.target.value)}
          disabled={disabled}
          required
          aria-invalid={Boolean(errors?.fullName)}
        />
        {errors?.fullName && <p className="text-sm text-destructive mt-1">{errors.fullName}</p>}
      </div>

      <div>
        <Label htmlFor="ba-company">Company</Label>
        <Input
          id="ba-company"
          value={value.company ?? ""}
          onChange={(e) => update("company", e.target.value || null)}
          disabled={disabled}
        />
      </div>

      <div>
        <Label htmlFor="ba-line1">Address *</Label>
        <Input
          id="ba-line1"
          value={value.line1}
          onChange={(e) => update("line1", e.target.value)}
          placeholder="Street address"
          disabled={disabled}
          required
          aria-invalid={Boolean(errors?.line1)}
        />
        {errors?.line1 && <p className="text-sm text-destructive mt-1">{errors.line1}</p>}
      </div>

      <div>
        <Label htmlFor="ba-line2">Apt / Suite / Unit</Label>
        <Input
          id="ba-line2"
          value={value.line2 ?? ""}
          onChange={(e) => update("line2", e.target.value || null)}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ba-city">City *</Label>
          <Input
            id="ba-city"
            value={value.city}
            onChange={(e) => update("city", e.target.value)}
            disabled={disabled}
            required
            aria-invalid={Boolean(errors?.city)}
          />
          {errors?.city && <p className="text-sm text-destructive mt-1">{errors.city}</p>}
        </div>
        <div>
          <Label htmlFor="ba-state">{`${labels.subdivision} *`}</Label>
          {subdivisions ? (
            <Select
              value={stateOptionExists ? stateSelectValue : ""}
              onValueChange={(next) => update("state", next)}
              disabled={disabled}
            >
              <SelectTrigger id="ba-state" aria-invalid={Boolean(errors?.state)}>
                <SelectValue placeholder={`Select ${labels.subdivision.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {subdivisions.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="ba-state"
              value={value.state}
              onChange={(e) => update("state", e.target.value)}
              disabled={disabled}
              required
              aria-invalid={Boolean(errors?.state)}
            />
          )}
          {errors?.state && <p className="text-sm text-destructive mt-1">{errors.state}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ba-postalCode">{`${labels.postalCode} *`}</Label>
          <Input
            id="ba-postalCode"
            value={value.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
            disabled={disabled}
            required
            placeholder={labels.postalCodePlaceholder}
            aria-invalid={Boolean(errors?.postalCode)}
          />
          {errors?.postalCode && <p className="text-sm text-destructive mt-1">{errors.postalCode}</p>}
        </div>
        <div>
          <Label htmlFor="ba-country">Country *</Label>
          <Select
            value={value.country}
            onValueChange={(next) => {
              const nextCountry = next.toUpperCase();
              // If the new country has a subdivision list but the current
              // state value isn't a code in that list, blank it so the user
              // re-picks. Otherwise a saved "CA" (California) would leak
              // into a Canada selection and quietly mean "Alberta" instead.
              const nextSubs = getSubdivisions(nextCountry);
              const stateIsValidForNext = nextSubs
                ? nextSubs.some((s) => s.code === value.state)
                : true;
              onChange({
                ...value,
                country: nextCountry,
                state: stateIsValidForNext ? value.state : "",
              });
            }}
            disabled={disabled}
          >
            <SelectTrigger id="ba-country">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_OPTIONS.map((opt) => (
                <SelectItem key={opt.code} value={opt.code}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* CASL compliance — Canadian residents must explicitly opt in to
          commercial email. The default for new accounts is already
          marketingEmailsEnabled=false on account_preferences, so the only
          surface that matters is making the choice discoverable. The
          cascade (force marketing-off when a non-CA user adds a CA
          billing address) is tracked as a follow-up under #1150. */}
      {value.country === "CA" && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Canada · CASL:</strong> We won't send promotional emails without your explicit consent. Manage email preferences in <a href="/settings?tab=notifications" className="underline hover:text-foreground">Settings → Notifications</a>.
        </div>
      )}

      <div>
        <Label htmlFor="ba-phone">Phone</Label>
        <Input
          id="ba-phone"
          type="tel"
          value={value.phone ?? ""}
          onChange={(e) => update("phone", e.target.value || null)}
          disabled={disabled}
          placeholder="+1 (555) 123-4567"
        />
      </div>
    </div>
  );
}
