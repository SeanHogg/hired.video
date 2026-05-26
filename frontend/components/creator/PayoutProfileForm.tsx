import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, FileText, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  creatorService,
  deriveTaxFormType,
  type CreatorProfile,
  type PayoutProfileDTO,
  type EntityType,
  type TaxIdType,
} from "@/lib/services/creator-service";
import PayoutOnboardingCard from "@/components/payouts/PayoutOnboardingCard";
import PayoutBalanceCard from "@/components/payouts/PayoutBalanceCard";

const TAX_FORM_LABEL: Record<string, string> = {
  w9: "W-9 (US person / resident)",
  w8ben: "W-8BEN (foreign individual)",
  w8bene: "W-8BEN-E (foreign business entity)",
};

const TAX_ID_LABEL: Record<TaxIdType, string> = {
  ssn: "SSN",
  ein: "EIN",
  itin: "ITIN",
  foreign_tin: "Foreign TIN",
};

/**
 * Self-contained payout profile editor — fetches its own data, owns its own
 * loading state, and persists via `creatorService.getPayoutProfile()` /
 * `updatePayoutProfile()`. Drop-in usable from Settings → Payouts and the
 * CreatorWorkspace payouts card without any prop drilling.
 *
 * Self-gates on creator status: only enrolled creators get paid, so the
 * form refuses to render its inputs for non-creators and instead points
 * them at the enrollment wizard. Both surfaces (Settings, Workspace) embed
 * this same component — they don't independently re-derive "should I show
 * the payout form?".
 */
export default function PayoutProfileForm() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<PayoutProfileDTO | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state — initialised from `profile` on first load and on
  // every save, so the user always sees the freshly-persisted shape.
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [legalName, setLegalName] = useState("");
  const [businessLegalName, setBusinessLegalName] = useState("");
  const [taxResidencyCountry, setTaxResidencyCountry] = useState("US");
  const [taxIdType, setTaxIdType] = useState<TaxIdType>("ssn");
  const [taxId, setTaxId] = useState("");

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("US");

  const hydrate = (p: PayoutProfileDTO) => {
    setProfile(p);
    setEntityType((p.entityType as EntityType) ?? "individual");
    setLegalName(p.legalName ?? "");
    setBusinessLegalName(p.businessLegalName ?? "");
    setTaxResidencyCountry(p.taxResidencyCountry ?? "US");
    setTaxIdType((p.taxIdType as TaxIdType) ?? "ssn");
    setTaxId(""); // never re-display the full ID after save
    setAddressLine1(p.addressLine1 ?? "");
    setAddressLine2(p.addressLine2 ?? "");
    setAddressCity(p.addressCity ?? "");
    setAddressRegion(p.addressRegion ?? "");
    setAddressPostalCode(p.addressPostalCode ?? "");
    setAddressCountry(p.addressCountry ?? "US");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([creatorService.getPayoutProfile(), creatorService.getMine()])
      .then(([p, c]) => {
        if (cancelled) return;
        hydrate(p);
        setCreator(c);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load payout profile"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const taxFormType = deriveTaxFormType(entityType, taxResidencyCountry);
  const taxIdOptions: TaxIdType[] = taxResidencyCountry === "US"
    ? (entityType === "business" ? ["ein", "ssn"] : ["ssn", "itin", "ein"])
    : ["foreign_tin"];

  // Snap the tax ID type to a valid option when the residency / entity flip
  // makes the current value nonsensical (e.g. SSN for a non-US entity).
  useEffect(() => {
    if (!taxIdOptions.includes(taxIdType)) setTaxIdType(taxIdOptions[0]);
  }, [taxResidencyCountry, entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewLast4 = taxId ? taxId.replace(/\D/g, "").slice(-4) : (profile?.taxIdLast4 ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const updated = await creatorService.updatePayoutProfile({
        entityType,
        legalName: legalName.trim(),
        businessLegalName: entityType === "business" ? businessLegalName.trim() : null,
        taxResidencyCountry,
        taxIdType,
        ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || null,
        addressCity: addressCity.trim(),
        addressRegion: addressRegion.trim(),
        addressPostalCode: addressPostalCode.trim(),
        addressCountry,
      });
      hydrate(updated);
      toast({ title: "Payout profile saved" });
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading payout profile…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </CardContent>
      </Card>
    );
  }

  // Only creators get paid. Non-creators see an empty state pointing them at
  // the enrollment wizard rather than a half-meaningful tax form.
  if (!creator || !creator.isActive) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-3">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-semibold">Payouts are part of the Creator Program</h3>
            <p className="text-sm text-muted-foreground">
              Tax info and payout accounts are only collected once you're enrolled — only creators receive payouts. Enroll first and your payout settings will live here and on your creator workspace.
            </p>
            <Button asChild size="sm">
              <Link to="/services?wizard=open">Enroll in the Creator Program</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Tax + address completeness only. Payout-rail readiness lives on the
  // separate PayoutOnboardingCard below (single source of truth: payouts_enabled).
  const taxComplete = !!(
    entityType &&
    legalName &&
    taxResidencyCountry &&
    taxIdType &&
    (previewLast4 || profile?.taxIdLast4) &&
    taxFormType &&
    addressLine1 &&
    addressCity &&
    addressPostalCode &&
    addressCountry
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Payouts</CardTitle>
          </div>
          <CardDescription>
            We need this information to pay you and to issue the right tax form (W-9 / W-8) at year-end. Your tax ID is stored encrypted; only the last 4 digits are ever displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Entity type */}
          <div className="space-y-2">
            <Label>You are receiving payouts as</Label>
            <RadioGroup
              value={entityType}
              onValueChange={(v) => setEntityType(v as EntityType)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label className={`rounded-lg border p-3 cursor-pointer ${entityType === "individual" ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="individual" id="entity-individual" />
                  <span className="font-medium">An individual</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Sole prop, freelancer, contractor — anything in your own legal name.</p>
              </label>
              <label className={`rounded-lg border p-3 cursor-pointer ${entityType === "business" ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="business" id="entity-business" />
                  <span className="font-medium">A business</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">LLC, corporation, partnership, or other registered entity.</p>
              </label>
            </RadioGroup>
          </div>

          {/* Names */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="legalName">
                {entityType === "business" ? "Authorized signer's legal name" : "Legal name"} *
              </Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder={entityType === "business" ? "Person signing the W-9" : "As it appears on your government ID"}
              />
            </div>
            {entityType === "business" && (
              <div>
                <Label htmlFor="businessLegalName">Business legal name *</Label>
                <Input
                  id="businessLegalName"
                  value={businessLegalName}
                  onChange={(e) => setBusinessLegalName(e.target.value)}
                  placeholder="Acme Holdings, LLC"
                />
              </div>
            )}
          </div>

          {/* Tax residency + ID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="taxCountry">Tax residency *</Label>
              <Input
                id="taxCountry"
                value={taxResidencyCountry}
                onChange={(e) => setTaxResidencyCountry(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="US"
                maxLength={2}
              />
              <p className="text-xs text-muted-foreground mt-1">2-letter ISO code</p>
            </div>
            <div>
              <Label htmlFor="taxIdType">Tax ID type *</Label>
              <Select value={taxIdType} onValueChange={(v) => setTaxIdType(v as TaxIdType)}>
                <SelectTrigger id="taxIdType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {taxIdOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{TAX_ID_LABEL[opt]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="taxId">
                Tax ID {profile?.taxIdLast4 ? <span className="text-muted-foreground">(••••{profile.taxIdLast4})</span> : "*"}
              </Label>
              <Input
                id="taxId"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder={profile?.taxIdLast4 ? "Leave blank to keep current" : "9 digits, no dashes"}
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground mt-1">Encrypted at rest. We never display the full value.</p>
            </div>
          </div>

          {/* Form preview */}
          <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-3">
            <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">You'll sign: {TAX_FORM_LABEL[taxFormType]}</div>
              <p className="text-muted-foreground text-xs mt-1">
                The signed form is captured during payout onboarding with our payment processor. We only persist the form type + a reference id — the original PDF lives with the processor.
              </p>
              {profile?.taxFormSubmittedAt && (
                <p className="text-xs mt-1">Last submitted: {new Date(profile.taxFormSubmittedAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-3">
            <Label className="text-base">Address (used on the tax form and for 1099 mailing)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="addr1">Address line 1 *</Label>
                <Input id="addr1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="addr2">Address line 2</Label>
                <Input id="addr2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="addrCity">City *</Label>
                <Input id="addrCity" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="addrRegion">State / Region *</Label>
                <Input id="addrRegion" value={addressRegion} onChange={(e) => setAddressRegion(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="addrPostal">Postal code *</Label>
                <Input id="addrPostal" value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="addrCountry">Country *</Label>
                <Input
                  id="addrCountry"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Save tax + address. Payout rail lives on the next card. */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {taxComplete
                ? "Tax + address complete. Pick a payout rail below."
                : "Fill in every required field to be ready for payouts."}
            </p>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save tax info
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payout-rail onboarding + balance — both self-gate on creator status
          and on whether the ledger has any entries yet. The PayoutProfileForm
          consumer doesn't need to know about either condition. */}
      <PayoutOnboardingCard />
      <PayoutBalanceCard />
    </div>
  );
}
