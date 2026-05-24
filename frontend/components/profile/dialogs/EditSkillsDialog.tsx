import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/lib/auth";
import { INDUSTRIES } from "@/lib/constants/industries";

interface EditSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const CURATED_SET = new Set<string>(INDUSTRIES);

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EditSkillsDialog({ open, onOpenChange, onSaved }: EditSkillsDialogProps) {
  const { t } = useTranslation();
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [customIndustries, setCustomIndustries] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setKeywords(user.skills?.join(", ") ?? "");
    const existing = user.industries ?? [];
    setSelectedIndustries(existing.filter((i) => CURATED_SET.has(i)));
    setCustomIndustries(existing.filter((i) => !CURATED_SET.has(i)).join(", "));
  }, [open, user]);

  const mergedIndustries = useMemo(() => {
    const customs = parseCsv(customIndustries);
    const seen = new Set<string>();
    return [...selectedIndustries, ...customs].filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedIndustries, customIndustries]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({
        skills: parseCsv(keywords),
        industries: mergedIndustries,
      });
      refreshUser().catch(() => {});
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save discoverability tags:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("headings.editDiscoverability")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>{t("fields.industries.label")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("fields.industries.help")}
            </p>
            <ToggleGroup
              type="multiple"
              value={selectedIndustries}
              onValueChange={setSelectedIndustries}
              className="flex-wrap justify-start gap-2"
              variant="outline"
              size="sm"
            >
              {INDUSTRIES.map((industry) => (
                <ToggleGroupItem
                  key={industry}
                  value={industry}
                  aria-label={industry}
                  className="rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {industry}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="space-y-1 pt-2">
              <Label htmlFor="customIndustries" className="text-xs text-muted-foreground">
                {t("fields.industries.otherLabel")}
              </Label>
              <Input
                id="customIndustries"
                placeholder={t("fields.industries.otherPlaceholder")}
                value={customIndustries}
                onChange={(e) => setCustomIndustries(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editKeywords">{t("fields.seoKeywords.label")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("fields.seoKeywords.help")}
            </p>
            <Input
              id="editKeywords"
              placeholder={t("fields.seoKeywords.placeholder")}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
