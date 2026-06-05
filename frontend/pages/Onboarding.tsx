import {
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  Target,
  User,
  Mail,
  Building2,
  FileText,
  Video,
  Settings,
  Users,
  Briefcase,
  Sparkles,
} from "lucide-react";
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Map normalized UserRole ("job_seeker", "recruiter", "employer") → persona key
function roleToPersona(role: string | undefined): "job_seeker" | "recruiter" | "employer" {
  switch (role) {
    case USER_ROLES.RECRUITER: return "recruiter";
    case USER_ROLES.EMPLOYER:  return "employer";
    default:                   return "job_seeker";
  }
}

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user: authUser } = useAuth();

  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.onboarding", "Onboarding"), url: "/onboarding" }]);

  const persona = roleToPersona(authUser?.role);
  const displayName = authUser?.name || authUser?.firstName || "";

  const [currentStep, setCurrentStep] = useState(0);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);

  // Persona-specific onboarding tasks
  const getOnboardingSteps = () => {
    const baseSteps = [
      {
        id: "profile",
        title: t("headings.onboarding.profileTitle"),
        description: t("messages.onboarding.profileDesc"),
        icon: User,
        completed: completedTasks.includes("profile"),
        component: ProfileStep,
      },
      {
        id: "preferences",
        title: t("headings.onboarding.preferencesTitle"),
        description: t("messages.onboarding.preferencesDesc"),
        icon: Settings,
        completed: completedTasks.includes("preferences"),
        component: PreferencesStep,
      },
      {
        id: "verification",
        title: t("headings.onboarding.verificationTitle"),
        description: t("messages.onboarding.verificationDesc"),
        icon: Mail,
        completed: completedTasks.includes("verification"),
        component: VerificationStep,
      },
    ];

    switch (persona) {
      case "job_seeker":
        return [
          ...baseSteps,
          {
            id: "resume",
            title: t("headings.onboarding.resumeTitle"),
            description: t("messages.onboarding.resumeDesc"),
            icon: FileText,
            completed: completedTasks.includes("resume"),
            component: ResumeUploadStep,
          },
          {
            id: "video",
            title: t("headings.onboarding.videoTitle"),
            description: t("messages.onboarding.videoDesc"),
            icon: Video,
            completed: completedTasks.includes("video"),
            component: VideoResumeStep,
          },
          {
            id: "skills",
            title: t("headings.onboarding.skillsTitle"),
            description: t("messages.onboarding.skillsDesc"),
            icon: Target,
            completed: completedTasks.includes("skills"),
            component: SkillsStep,
          },
        ];
      case "recruiter":
        return [
          ...baseSteps,
          {
            id: "company",
            title: t("headings.onboarding.recruiterCompanyTitle"),
            description: t("messages.onboarding.recruiterCompanyDesc"),
            icon: Building2,
            completed: completedTasks.includes("company"),
            component: CompanyStep,
          },
          {
            id: "team",
            title: t("headings.onboarding.recruiterTeamTitle"),
            description: t("messages.onboarding.recruiterTeamDesc"),
            icon: Users,
            completed: completedTasks.includes("team"),
            component: TeamStep,
          },
          {
            id: "jobs",
            title: t("headings.onboarding.jobsTitle"),
            description: t("messages.onboarding.jobsDesc"),
            icon: Briefcase,
            completed: completedTasks.includes("jobs"),
            component: JobPostStep,
          },
        ];
      case "employer":
        return [
          ...baseSteps,
          {
            id: "company",
            title: t("headings.onboarding.employerCompanyTitle"),
            description: t("messages.onboarding.employerCompanyDesc"),
            icon: Building2,
            completed: completedTasks.includes("company"),
            component: CompanyStep,
          },
          {
            id: "team",
            title: t("headings.onboarding.employerTeamTitle"),
            description: t("messages.onboarding.employerTeamDesc"),
            icon: Users,
            completed: completedTasks.includes("team"),
            component: TeamStep,
          },
          {
            id: "integration",
            title: t("headings.onboarding.integrationTitle"),
            description: t("messages.onboarding.integrationDesc"),
            icon: Settings,
            completed: completedTasks.includes("integration"),
            component: IntegrationsStep,
          },
        ];
      default:
        return baseSteps;
    }
  };

  const steps = getOnboardingSteps();
  const progressPercentage = Math.round(
    (completedTasks.length / steps.length) * 100,
  );
  const CurrentStepComponent = steps[currentStep]?.component || ProfileStep;

  const handleCompleteTask = (taskId: string) => {
    if (!completedTasks.includes(taskId)) {
      setCompletedTasks([...completedTasks, taskId]);
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Onboarding complete, redirect to dashboard
      navigate("/dashboard");
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkipToEnd = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 container mx-auto px-4 py-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{t("headings.onboarding.welcome")}</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            {t("messages.onboarding.subtitle", {
              persona: t(`labels.onboarding.persona.${persona}`),
            })}
          </p>
          <Badge variant="secondary" className="mt-2">
            {t("labels.onboarding.personaSetup", {
              persona: t(`labels.onboarding.persona.${persona}`),
            })}
          </Badge>
        </div>
      </div>

      {/* Main Content - Flexible */}
      <div className="flex-1 container mx-auto px-4 pb-6 flex flex-col min-h-0">
        <div className="flex flex-col h-full gap-6">
          {/* Progress Overview - Fixed */}
          <Card className="flex-shrink-0">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    {t("headings.onboarding.setupProgress")}
                  </CardTitle>
                  <CardDescription>
                    {t("messages.onboarding.stepsCompleted", {
                      completed: completedTasks.length,
                      total: steps.length,
                    })}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {progressPercentage}%
                  </div>
                  <div className="text-sm text-muted-foreground">{t("labels.completePercent")}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercentage} className="h-3" />
            </CardContent>
          </Card>

          {/* Steps and Form Layout - Flexible */}
          <div className="flex-1 flex flex-col gap-6 min-h-0">
            {/* Steps List - Scrollable */}
            <Card className="flex-shrink-0">
              <CardHeader>
                <CardTitle>{t("headings.onboarding.setupSteps")}</CardTitle>
                <CardDescription>{t("messages.onboarding.clickToNavigate")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 overflow-x-auto pb-4 max-h-32 overflow-y-auto">
                  {steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`flex-shrink-0 p-4 rounded-lg border cursor-pointer transition-all min-w-[200px] ${
                        index === currentStep
                          ? "border-primary bg-primary/5 shadow-sm"
                          : step.completed
                            ? "border-green-200 bg-green-50"
                            : "border-muted bg-muted/20"
                      }`}
                      onClick={() => setCurrentStep(index)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            step.completed
                              ? "bg-green-500 text-white"
                              : index === currentStep
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {step.completed ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <step.icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{step.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Current Step Form - Fixed, Non-scrollable */}
            <Card className="flex-1 flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="flex items-center gap-2">
                  {React.createElement(steps[currentStep].icon, {
                    className: "h-5 w-5",
                  })}
                  {steps[currentStep].title}
                </CardTitle>
                <CardDescription>
                  {steps[currentStep].description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <CurrentStepComponent
                  onComplete={() => handleCompleteTask(steps[currentStep].id)}
                  isCompleted={steps[currentStep].completed}
                  user={{ name: displayName }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Navigation - Fixed at bottom */}
      <div className="flex-shrink-0 container mx-auto px-4 py-4 border-t bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("actions.previous")}
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleSkipToEnd}>
              {t("actions.onboarding.skipSetup")}
            </Button>
            <Button
              onClick={handleNext}
              className="gap-2"
              disabled={!steps[currentStep].completed}
            >
              {currentStep === steps.length - 1
                ? t("actions.onboarding.completeSetup")
                : t("actions.continue")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step Components
function ProfileStep({ onComplete, isCompleted, user }: any) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: user.name || "",
    title: "",
    location: "",
    bio: "",
  });

  const handleSubmit = () => {
    onComplete();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">{t("fields.fullName.label")}</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="title">{t("fields.professionalTitle.label")}</Label>
          <Input
            id="title"
            placeholder={t("messages.onboarding.titlePlaceholder")}
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
          />
        </div>
      </div>
      <div>
        <Label htmlFor="location">{t("fields.location.label")}</Label>
        <Input
          id="location"
          placeholder={t("messages.onboarding.locationPlaceholder")}
          value={formData.location}
          onChange={(e) =>
            setFormData({ ...formData, location: e.target.value })
          }
        />
      </div>
      <div>
        <Label htmlFor="bio">{t("labels.onboarding.professionalBio")}</Label>
        <Textarea
          id="bio"
          placeholder={t("messages.onboarding.bioPlaceholder")}
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
        />
      </div>
      {!isCompleted && (
        <Button onClick={handleSubmit} className="w-full">
          {t("actions.onboarding.saveProfile")}
        </Button>
      )}
    </div>
  );
}

function PreferencesStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.preferencesBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.savePreferences")}
        </Button>
      )}
    </div>
  );
}

function VerificationStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.verificationBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.markVerified")}
        </Button>
      )}
    </div>
  );
}

function ResumeUploadStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">{t("headings.onboarding.uploadResume")}</p>
        <p className="text-muted-foreground mb-4">{t("messages.onboarding.resumeFileTypes")}</p>
        <Button variant="outline">{t("actions.chooseFile")}</Button>
      </div>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.resumeUploaded")}
        </Button>
      )}
    </div>
  );
}

function VideoResumeStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.videoBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.createVideoResume")}
        </Button>
      )}
    </div>
  );
}

function SkillsStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.skillsBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.addSkills")}
        </Button>
      )}
    </div>
  );
}

function CompanyStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.companyBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.completeCompanySetup")}
        </Button>
      )}
    </div>
  );
}

function TeamStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.teamBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.inviteTeamMembers")}
        </Button>
      )}
    </div>
  );
}

function JobPostStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.jobPostBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.postFirstJob")}
        </Button>
      )}
    </div>
  );
}

function IntegrationsStep({ onComplete, isCompleted }: any) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        {t("messages.onboarding.integrationsBody")}
      </p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          {t("actions.onboarding.configureIntegrations")}
        </Button>
      )}
    </div>
  );
}
