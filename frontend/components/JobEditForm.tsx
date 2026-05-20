import React, { useState, useEffect } from "react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  EmploymentType,
  WorkSetting,
  DisplayPrivacy,
  JobStatus,
} from "@/lib/constants/enums";
import MediaPicker from "@/components/shared/MediaPicker";
import { ValidationError } from "@/lib/errors";

/** Best-effort client-side URL check — mirrors the API's `optionalUrl`
 *  Zod schema (treats "" as omitted). */
function isValidOptionalUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Pull `{ field: "message" }` out of the API's
 *  `VALIDATION_ERROR.details.issues.fieldErrors` shape so the form can
 *  render the error inline next to the offending input instead of
 *  showing only a generic "Failed to update" toast. */
function fieldErrorsFromValidationError(
  err: unknown,
): Record<string, string> | null {
  if (!(err instanceof ValidationError)) return null;
  const issues = (err.context as { issues?: { fieldErrors?: Record<string, string[]> } } | undefined)
    ?.issues;
  const fieldErrors = issues?.fieldErrors;
  if (!fieldErrors) return null;
  const flat: Record<string, string> = {};
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    if (Array.isArray(msgs) && msgs.length > 0) flat[field] = msgs[0];
  }
  return Object.keys(flat).length > 0 ? flat : null;
}

// Types
interface JobFormData {
  id?: string;
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  atsApplyUrl?: string;
  salary?: number;
  bonus?: number;
  equity?: number;
  employmentType: number[];
  workSetting: number;
  seniority?: number;
  industry: number[];
  hiringTarget?: number;
  goLiveDate?: string;
  expirationDate?: string;
  status?: number;
  privacy_ShowJob: number;
  heroImageUrl?: string;
}

interface JobEditFormProps {
  job?: JobFormData;
  onSave: (jobData: JobFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function JobEditForm({
  job,
  onSave,
  onCancel,
  loading = false,
}: JobEditFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<JobFormData>({
    title: "",
    description: "",
    requirements: [],
    responsibilities: [],
    atsApplyUrl: "",
    salary: undefined,
    bonus: undefined,
    equity: undefined,
    employmentType: [EmploymentType.FullTime],
    workSetting: WorkSetting.OnSite,
    seniority: undefined,
    industry: [],
    hiringTarget: undefined,
    goLiveDate: "",
    expirationDate: "",
    status: JobStatus.Draft,
    privacy_ShowJob: DisplayPrivacy.ToPublic,
    heroImageUrl: "",
  });

  const [newRequirement, setNewRequirement] = useState("");
  const [newResponsibility, setNewResponsibility] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with job data
  useEffect(() => {
    if (job) {
      setFormData({
        id: job.id,
        title: job.title || "",
        description: job.description || "",
        requirements: job.requirements || [],
        responsibilities: job.responsibilities || [],
        atsApplyUrl: job.atsApplyUrl || "",
        salary: job.salary,
        bonus: job.bonus,
        equity: job.equity,
        employmentType: job.employmentType || [EmploymentType.FullTime],
        workSetting: job.workSetting ?? WorkSetting.OnSite,
        seniority: job.seniority,
        industry: job.industry || [],
        hiringTarget: job.hiringTarget,
        goLiveDate: job.goLiveDate
          ? new Date(job.goLiveDate).toISOString().split("T")[0]
          : "",
        expirationDate: job.expirationDate
          ? new Date(job.expirationDate).toISOString().split("T")[0]
          : "",
        status: job.status ?? JobStatus.Draft,
        privacy_ShowJob: job.privacy_ShowJob ?? DisplayPrivacy.ToPublic,
        heroImageUrl: job.heroImageUrl ?? "",
      });
    }
  }, [job]);

  const handleInputChange = (
    field: keyof JobFormData,
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear the error for this field once the user edits it — it's
    // stale until the next submit tells us otherwise.
    setErrors((prev) => {
      if (!prev[field as string]) return prev;
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  };

  const updateHeroImageUrl = (next: string) => {
    setFormData((prev) => ({ ...prev, heroImageUrl: next }));
    setErrors((prev) => {
      if (!prev.heroImageUrl) return prev;
      const copy = { ...prev };
      delete copy.heroImageUrl;
      return copy;
    });
  };

  const addRequirement = () => {
    if (newRequirement.trim()) {
      setFormData((prev) => ({
        ...prev,
        requirements: [...prev.requirements, newRequirement.trim()],
      }));
      setNewRequirement("");
    }
  };

  const removeRequirement = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      requirements: prev.requirements.filter((_, i) => i !== index),
    }));
  };

  const addResponsibility = () => {
    if (newResponsibility.trim()) {
      setFormData((prev) => ({
        ...prev,
        responsibilities: [...prev.responsibilities, newResponsibility.trim()],
      }));
      setNewResponsibility("");
    }
  };

  const removeResponsibility = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      responsibilities: prev.responsibilities.filter((_, i) => i !== index),
    }));
  };

  const validateClientSide = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!formData.title.trim()) next.title = t("errors.jobTitleRequired");
    if (!formData.description.trim()) next.description = t("errors.jobDescriptionRequired");
    if (!isValidOptionalUrl(formData.heroImageUrl)) {
      next.heroImageUrl = "Hero image must be a full URL (https://…) or empty.";
    }
    if (!isValidOptionalUrl(formData.atsApplyUrl)) {
      next.atsApplyUrl = "Application URL must be a full URL (https://…) or empty.";
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const clientErrors = validateClientSide();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      // Surface the first error in a toast too — useful when the offending
      // field is below the fold (e.g. heroImageUrl with the description
      // expanded). The inline message under the input is the canonical one.
      toast.error(Object.values(clientErrors)[0]);
      return;
    }

    setErrors({});

    try {
      await onSave(formData);
    } catch (error) {
      console.error("Error saving job:", error);
      const fieldErrors = fieldErrorsFromValidationError(error);
      if (fieldErrors) {
        setErrors(fieldErrors);
        toast.error(Object.values(fieldErrors)[0]);
      } else {
        toast.error(t("errors.saveJobFailed"));
      }
    }
  };

  const fieldErrorClass = "border-destructive focus-visible:ring-destructive";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.basicInformation")}</CardTitle>
          <CardDescription>
            {t("messages.jobBasicInfoDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">{t("fields.jobTitle.labelRequired")}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder={t("fields.jobTitle.placeholder")}
              required
              aria-invalid={Boolean(errors.title)}
              className={errors.title ? fieldErrorClass : undefined}
            />
            {errors.title ? (
              <p className="mt-1 text-sm text-destructive">{errors.title}</p>
            ) : null}
          </div>

          <div>
            <Label>Hero Image</Label>
            <div className="mt-2">
              {formData.heroImageUrl ? (
                <div className="flex items-start gap-3">
                  <img
                    src={formData.heroImageUrl}
                    alt="Job hero preview"
                    className={`h-24 w-40 object-cover rounded-md border ${errors.heroImageUrl ? "border-destructive" : ""}`}
                  />
                  <div className="flex flex-col gap-2">
                    <MediaPicker
                      accept="image"
                      title="Choose job hero image"
                      triggerLabel="Replace"
                      onPick={(asset) => updateHeroImageUrl(asset.url)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateHeroImageUrl("")}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <MediaPicker
                  accept="image"
                  title="Choose job hero image"
                  triggerLabel="Add hero image"
                  onPick={(asset) => updateHeroImageUrl(asset.url)}
                />
              )}
              {errors.heroImageUrl ? (
                <p className="mt-1 text-sm text-destructive">{errors.heroImageUrl}</p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="description">{t("fields.jobDescription.labelRequired")}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder={t("fields.jobDescription.placeholder")}
              rows={6}
              required
              aria-invalid={Boolean(errors.description)}
              className={errors.description ? fieldErrorClass : undefined}
            />
            {errors.description ? (
              <p className="mt-1 text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="atsApplyUrl">{t("fields.applicationUrl.label")}</Label>
            <Input
              id="atsApplyUrl"
              type="url"
              value={formData.atsApplyUrl}
              onChange={(e) => handleInputChange("atsApplyUrl", e.target.value)}
              placeholder={t("fields.applicationUrl.placeholder")}
              aria-invalid={Boolean(errors.atsApplyUrl)}
              className={errors.atsApplyUrl ? fieldErrorClass : undefined}
            />
            {errors.atsApplyUrl ? (
              <p className="mt-1 text-sm text-destructive">{errors.atsApplyUrl}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.requirements")}</CardTitle>
          <CardDescription>
            {t("messages.requirementsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newRequirement}
              onChange={(e) => setNewRequirement(e.target.value)}
              placeholder={t("fields.requirement.placeholder")}
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addRequirement())
              }
            />
            <Button type="button" onClick={addRequirement} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {formData.requirements.map((req, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {req}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeRequirement(index)}
                />
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Responsibilities */}
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.responsibilities")}</CardTitle>
          <CardDescription>
            {t("messages.responsibilitiesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newResponsibility}
              onChange={(e) => setNewResponsibility(e.target.value)}
              placeholder={t("fields.responsibility.placeholder")}
              onKeyPress={(e) =>
                e.key === "Enter" && (e.preventDefault(), addResponsibility())
              }
            />
            <Button type="button" onClick={addResponsibility} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {formData.responsibilities.map((resp, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {resp}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeResponsibility(index)}
                />
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Job Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.jobDetails")}</CardTitle>
          <CardDescription>
            {t("messages.jobDetailsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="workSetting">{t("fields.workSetting.label")}</Label>
              <Select
                value={formData.workSetting.toString()}
                onValueChange={(value) =>
                  handleInputChange("workSetting", parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t("labels.workSetting.onsite")}</SelectItem>
                  <SelectItem value="1">{t("labels.workSetting.remote")}</SelectItem>
                  <SelectItem value="2">{t("labels.workSetting.hybrid")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">{t("fields.status.label")}</Label>
              <Select
                value={formData.status?.toString() || "0"}
                onValueChange={(value) =>
                  handleInputChange("status", parseInt(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t("labels.jobStatus.draft")}</SelectItem>
                  <SelectItem value="1">{t("labels.jobStatus.open")}</SelectItem>
                  <SelectItem value="2">{t("labels.jobStatus.closed")}</SelectItem>
                  <SelectItem value="3">{t("labels.jobStatus.paused")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="salary">{t("fields.salary.label")}</Label>
              <Input
                id="salary"
                type="number"
                value={formData.salary || ""}
                onChange={(e) =>
                  handleInputChange(
                    "salary",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                placeholder={t("fields.salary.annualPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="bonus">{t("fields.bonus.label")}</Label>
              <Input
                id="bonus"
                type="number"
                value={formData.bonus || ""}
                onChange={(e) =>
                  handleInputChange(
                    "bonus",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                placeholder={t("fields.bonus.annualPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="equity">{t("fields.equity.label")}</Label>
              <Input
                id="equity"
                type="number"
                step="0.01"
                value={formData.equity || ""}
                onChange={(e) =>
                  handleInputChange(
                    "equity",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder={t("fields.equity.placeholder")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          {t("actions.saveJob")}
        </Button>
      </div>
    </form>
  );
}
