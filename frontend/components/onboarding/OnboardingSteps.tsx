/**
 * Step bodies for /onboarding. Each step receives the same props; most are a
 * short explanation + one "mark done" action, so those are produced by one
 * factory instead of eight copies.
 */
import { useState, type ComponentType } from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface OnboardingStepProps {
  onComplete: () => void;
  isCompleted: boolean;
  user: { name: string };
}

export type OnboardingStepComponent = ComponentType<OnboardingStepProps>;

/** Primary "mark this step done" action, hidden once completed. */
function CompleteButton({ isCompleted, onComplete, labelKey }: { isCompleted: boolean; onComplete: () => void; labelKey: string }) {
  const { t } = useTranslation();
  if (isCompleted) return null;
  return (
    <Button size="lg" onClick={onComplete} className="w-full sm:w-auto">
      {t(labelKey)}
    </Button>
  );
}

/** Build a step that is one explanatory paragraph + the complete action. */
function textStep(bodyKey: string, actionKey: string): OnboardingStepComponent {
  function TextStep({ onComplete, isCompleted }: OnboardingStepProps) {
    const { t } = useTranslation();
    return (
      <div className="space-y-5">
        <p className="text-base leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
        <CompleteButton isCompleted={isCompleted} onComplete={onComplete} labelKey={actionKey} />
      </div>
    );
  }
  return TextStep;
}

export function ProfileStep({ onComplete, isCompleted, user }: OnboardingStepProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: user.name || "",
    title: "",
    location: "",
    bio: "",
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{t("fields.fullName.label")}</Label>
          <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">{t("fields.professionalTitle.label")}</Label>
          <Input
            id="title"
            placeholder={t("messages.onboarding.titlePlaceholder")}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">{t("fields.location.label")}</Label>
        <Input
          id="location"
          placeholder={t("messages.onboarding.locationPlaceholder")}
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">{t("labels.onboarding.professionalBio")}</Label>
        <Textarea
          id="bio"
          placeholder={t("messages.onboarding.bioPlaceholder")}
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
        />
      </div>
      <CompleteButton isCompleted={isCompleted} onComplete={onComplete} labelKey="actions.onboarding.saveProfile" />
    </div>
  );
}

export function ResumeUploadStep({ onComplete, isCompleted }: OnboardingStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/40 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
          <FileText className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="font-display text-lg font-bold">{t("headings.onboarding.uploadResume")}</p>
        <p className="text-sm text-muted-foreground">{t("messages.onboarding.resumeFileTypes")}</p>
        <Button variant="outline">{t("actions.chooseFile")}</Button>
      </div>
      <CompleteButton isCompleted={isCompleted} onComplete={onComplete} labelKey="actions.onboarding.resumeUploaded" />
    </div>
  );
}

export const PreferencesStep = textStep("messages.onboarding.preferencesBody", "actions.onboarding.savePreferences");
export const VerificationStep = textStep("messages.onboarding.verificationBody", "actions.onboarding.markVerified");
export const VideoResumeStep = textStep("messages.onboarding.videoBody", "actions.onboarding.createVideoResume");
export const SkillsStep = textStep("messages.onboarding.skillsBody", "actions.onboarding.addSkills");
export const CompanyStep = textStep("messages.onboarding.companyBody", "actions.onboarding.completeCompanySetup");
export const TeamStep = textStep("messages.onboarding.teamBody", "actions.onboarding.inviteTeamMembers");
export const JobPostStep = textStep("messages.onboarding.jobPostBody", "actions.onboarding.postFirstJob");
export const IntegrationsStep = textStep("messages.onboarding.integrationsBody", "actions.onboarding.configureIntegrations");
