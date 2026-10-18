import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
import type { EditCandidateForm } from "@/components/people/people-helpers";

interface EditCandidateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EditCandidateForm;
  onFormChange: (form: EditCandidateForm) => void;
  tagInput: string;
  onTagInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onSave: () => void;
}

/** Right slide-out sheet editing a Talent Pool entry's details. */
export default function EditCandidateSheet({
  open,
  onOpenChange,
  form: editForm,
  onFormChange: setEditForm,
  tagInput,
  onTagInputChange: setTagInput,
  onAddTag: handleAddTag,
  onRemoveTag: handleRemoveTag,
  onSave,
}: EditCandidateSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("actions.editCandidateDetails")}</SheetTitle>
          <SheetDescription>{t("messages.editCandidateDescription")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Relationship Strength */}
          <div className="space-y-2">
            <Label htmlFor="relationshipStrength">{t("labels.relationshipStrength")}</Label>
            <Select
              value={editForm.relationshipStrength}
              onValueChange={(value) => setEditForm({ ...editForm, relationshipStrength: value })}
            >
              <SelectTrigger id="relationshipStrength">
                <SelectValue placeholder={t("fields.relationshipStrength.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="New">{t("labels.statusNew")}</SelectItem>
                <SelectItem value="Warm">{t("labels.people.strengthWarm")}</SelectItem>
                <SelectItem value="Hot">{t("labels.hot")}</SelectItem>
                <SelectItem value="Cold">{t("labels.people.strengthCold")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">{t("labels.status")}</Label>
            <Select
              value={editForm.status}
              onValueChange={(value) => setEditForm({ ...editForm, status: value })}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder={t("fields.statusSelect.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">{t("status.active")}</SelectItem>
                <SelectItem value="Passive">{t("labels.people.statusPassive")}</SelectItem>
                <SelectItem value="Placed">{t("labels.people.statusPlaced")}</SelectItem>
                <SelectItem value="Inactive">{t("status.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Pool Name */}
          <div className="space-y-2">
            <Label htmlFor="poolName">{t("labels.poolName")}</Label>
            <Input
              id="poolName"
              value={editForm.poolName}
              onChange={(e) => setEditForm({ ...editForm, poolName: e.target.value })}
              placeholder={t("fields.poolName.placeholder")}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>{t("labels.tagsLabel")}</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder={t("fields.tagInput.placeholder")}
              />
              <Button type="button" onClick={handleAddTag} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {editForm.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => handleRemoveTag(tag)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Current Company */}
          <div className="space-y-2">
            <Label htmlFor="currentCompany">{t("labels.currentCompany")}</Label>
            <Input
              id="currentCompany"
              value={editForm.currentCompany}
              onChange={(e) => setEditForm({ ...editForm, currentCompany: e.target.value })}
              placeholder={t("fields.companyNameField.placeholder")}
            />
          </div>

          {/* Current Title */}
          <div className="space-y-2">
            <Label htmlFor="currentTitle">{t("labels.currentTitle")}</Label>
            <Input
              id="currentTitle"
              value={editForm.currentTitle}
              onChange={(e) => setEditForm({ ...editForm, currentTitle: e.target.value })}
              placeholder={t("hiring.dialog.offer.jobTitle")}
            />
          </div>

          {/* Desired Salary */}
          <div className="space-y-2">
            <Label htmlFor="desiredSalary">{t("labels.desiredSalary")}</Label>
            <Input
              id="desiredSalary"
              type="number"
              value={editForm.desiredSalary || ""}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  desiredSalary: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder={t("fields.salaryAnnual.placeholder")}
            />
          </div>

          {/* Preferred Locations */}
          <div className="space-y-2">
            <Label htmlFor="preferredLocations">{t("fields.preferredLocations.label")}</Label>
            <Input
              id="preferredLocations"
              value={editForm.preferredLocations}
              onChange={(e) => setEditForm({ ...editForm, preferredLocations: e.target.value })}
              placeholder={t("fields.locationsList.placeholder")}
            />
          </div>

          {/* Contact Frequency */}
          <div className="space-y-2">
            <Label htmlFor="contactFrequency">{t("labels.contactFrequency")}</Label>
            <Select
              value={editForm.contactFrequency}
              onValueChange={(value) => setEditForm({ ...editForm, contactFrequency: value })}
            >
              <SelectTrigger id="contactFrequency">
                <SelectValue placeholder={t("fields.frequency.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Weekly">{t("labels.frequency.weekly")}</SelectItem>
                <SelectItem value="Biweekly">{t("labels.frequency.biweekly")}</SelectItem>
                <SelectItem value="Monthly">{t("labels.frequency.monthly")}</SelectItem>
                <SelectItem value="Quarterly">{t("labels.frequency.quarterly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Next Follow-up */}
          <div className="space-y-2">
            <Label htmlFor="nextFollowUpAt">{t("labels.nextFollowUpDate")}</Label>
            <Input
              id="nextFollowUpAt"
              type="date"
              value={editForm.nextFollowUpAt}
              onChange={(e) => setEditForm({ ...editForm, nextFollowUpAt: e.target.value })}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t("fields.notes.label")}</Label>
            <Textarea
              id="notes"
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder={t("fields.candidateNotes.placeholder")}
              rows={4}
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={onSave}>{t("actions.saveChanges")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
