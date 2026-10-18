import { Calendar, FileText, Mail, Network, Phone, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { InteractionForm } from "@/components/people/people-helpers";

/** Interaction types offered in the picker (value sent to the API). */
const INTERACTION_TYPES: ReadonlyArray<{ value: string; icon: LucideIcon; labelKey: string }> = [
  { value: "Call", icon: Phone, labelKey: "labels.people.interactionCall" },
  { value: "Email", icon: Mail, labelKey: "fields.email.label" },
  { value: "Meeting", icon: Calendar, labelKey: "labels.people.interactionMeeting" },
  { value: "LinkedIn", icon: Network, labelKey: "fields.linkedIn.label" },
  { value: "Note", icon: FileText, labelKey: "labels.people.interactionNote" },
];

interface LogInteractionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: InteractionForm;
  onFormChange: (form: InteractionForm) => void;
  onSave: () => void;
}

/** Right slide-out sheet logging a call / email / meeting with a candidate. */
export default function LogInteractionSheet({
  open,
  onOpenChange,
  form: interactionForm,
  onFormChange: setInteractionForm,
  onSave,
}: LogInteractionSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("actions.logInteraction")}</SheetTitle>
          <SheetDescription>{t("messages.logInteractionDescription")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Interaction Type */}
          <div className="space-y-2">
            <Label htmlFor="interactionType">{t("labels.interactionType")}</Label>
            <Select
              value={interactionForm.interactionType}
              onValueChange={(value) =>
                setInteractionForm({ ...interactionForm, interactionType: value })
              }
            >
              <SelectTrigger id="interactionType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map(({ value, icon: Icon, labelKey }) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {t(labelKey)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">{t("fields.subject.label")}</Label>
            <Input
              id="subject"
              value={interactionForm.subject}
              onChange={(e) => setInteractionForm({ ...interactionForm, subject: e.target.value })}
              placeholder={t("fields.subjectField.placeholder")}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="interactionNotes">{t("fields.notes.label")}</Label>
            <Textarea
              id="interactionNotes"
              value={interactionForm.notes}
              onChange={(e) => setInteractionForm({ ...interactionForm, notes: e.target.value })}
              placeholder={t("fields.interactionNotes.placeholder")}
              rows={4}
            />
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label htmlFor="outcome">{t("labels.outcome")}</Label>
            <Input
              id="outcome"
              value={interactionForm.outcome}
              onChange={(e) => setInteractionForm({ ...interactionForm, outcome: e.target.value })}
              placeholder={t("fields.outcome.placeholder")}
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration">{t("labels.durationMinutes")}</Label>
            <Input
              id="duration"
              type="number"
              value={interactionForm.durationMinutes || ""}
              onChange={(e) =>
                setInteractionForm({
                  ...interactionForm,
                  durationMinutes: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder={t("fields.people.durationPlaceholder")}
            />
          </div>

          {/* Requires Follow-up */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="requiresFollowUp"
              checked={interactionForm.requiresFollowUp}
              onChange={(e) =>
                setInteractionForm({ ...interactionForm, requiresFollowUp: e.target.checked })
              }
              className="h-4 w-4"
            />
            <Label htmlFor="requiresFollowUp" className="cursor-pointer">
              {t("labels.requiresFollowUp")}
            </Label>
          </div>

          {/* Follow-up Date */}
          {interactionForm.requiresFollowUp && (
            <div className="space-y-2">
              <Label htmlFor="followUpDate">{t("labels.followUpDate")}</Label>
              <Input
                id="followUpDate"
                type="date"
                value={interactionForm.followUpDate}
                onChange={(e) =>
                  setInteractionForm({ ...interactionForm, followUpDate: e.target.value })
                }
              />
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={onSave}>{t("actions.logInteraction")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
