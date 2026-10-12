/**
 * <AffiliateSpecialtySectorsPanel /> — affiliate-dashboard card for picking
 * vertical specialties. Drives the per-sector specialist conversion bonus
 * (referrals whose landingSector matches one of the affiliate's
 * specialtySectors earn a higher commission once the bonus engine ships;
 * see Consolidated Gap Register #1166).
 *
 * Self-fetching, self-saving. The dashboard mounts it without prop-drilling
 * — same pattern as the LocationPicker auto-hydration in the article
 * editor.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SectorMultiPicker } from "@/components/sector/SectorPicker";
import { affiliateService } from "@/lib/services/affiliate-service";
import { type Sector, isValidSector } from "@shared/sectors";

export function AffiliateSpecialtySectorsPanel() {
  const { toast } = useToast();
  const [value, setValue] = useState<Sector[]>([]);
  const [initial, setInitial] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void affiliateService
      .getProfile()
      .then((profile) => {
        if (!alive) return;
        const sectors = ((profile.specialtySectors ?? []) as string[])
          .filter(isValidSector);
        setValue(sectors);
        setInitial(sectors);
      })
      .catch(() => {
        // No-op — profile missing means the user isn't an affiliate yet;
        // the panel still renders with an empty picker.
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const dirty =
    value.length !== initial.length ||
    value.some((s, i) => initial[i] !== s);

  const save = async () => {
    setSaving(true);
    try {
      await affiliateService.updateSpecialtySectors(value);
      setInitial(value);
      toast({ title: "Specialty sectors saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vertical Specialization</CardTitle>
        <CardDescription>
          Pick the AI-resilient sectors you create content for. Specialists
          earn higher commissions on conversions that land on their chosen
          sectors (e.g. a healthcare creator referring a nurse). Leave
          empty to stay a generalist.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <SectorMultiPicker
              value={value}
              onChange={setValue}
              mode="recruitable"
              max={5}
            />
            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save specialties"}
              </Button>
              {dirty && !saving && (
                <Button
                  variant="ghost"
                  onClick={() => setValue(initial)}
                >
                  Reset
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
