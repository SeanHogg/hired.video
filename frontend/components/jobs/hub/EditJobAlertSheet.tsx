import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { JobAlertEditorState } from "./hooks/useJobAlertEditor";

/** Right slide-out for editing a job alert (Alerts tab → Edit). */
export function EditJobAlertSheet({ editor }: { editor: JobAlertEditorState }) {
  const { t } = useTranslation();
  const {
    alertSheetOpen,
    setAlertSheetOpen,
    alertName,
    setAlertName,
    alertKeywords,
    setAlertKeywords,
    alertLocation,
    setAlertLocation,
    alertFrequency,
    setAlertFrequency,
    isSubmittingAlert,
    handleSubmitAlert,
  } = editor;

  return (
    <Sheet open={alertSheetOpen} onOpenChange={setAlertSheetOpen}>
      <SheetContent side="right" className="sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>{t("headings.editJobAlert")}</SheetTitle>
          <SheetDescription>
            {t("messages.jobs.editAlertDescription")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="alert-name">{t("fields.alertNameRequired.label")}</Label>
            <Input
              id="alert-name"
              placeholder={t("fields.alertName.placeholder")}
              value={alertName}
              onChange={(e) => setAlertName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">{t("fields.keywordsRequired.label")}</Label>
            <Input
              id="keywords"
              placeholder={t("fields.keywords.placeholder")}
              value={alertKeywords}
              onChange={(e) => setAlertKeywords(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("messages.separateKeywordsWithCommas")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">{t("fields.locationOptional.label")}</Label>
            <Input
              id="location"
              placeholder={t("fields.alertLocation.placeholder")}
              value={alertLocation}
              onChange={(e) => setAlertLocation(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">{t("fields.notificationFrequency.label")}</Label>
            <Select value={alertFrequency} onValueChange={setAlertFrequency}>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">{t("labels.frequency.immediate")}</SelectItem>
                <SelectItem value="daily">{t("labels.frequency.daily")}</SelectItem>
                <SelectItem value="weekly">{t("labels.frequency.weekly")}</SelectItem>
                <SelectItem value="monthly">{t("labels.frequency.monthly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => setAlertSheetOpen(false)}
            disabled={isSubmittingAlert}
          >
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSubmitAlert} disabled={isSubmittingAlert}>
            {isSubmittingAlert ? t("status.updating") : t("actions.updateAlert")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
