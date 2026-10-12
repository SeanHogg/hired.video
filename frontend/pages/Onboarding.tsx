import {
  CheckCircle2,
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
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ProfileStep,
  PreferencesStep,
  VerificationStep,
  ResumeUploadStep,
  VideoResumeStep,
  SkillsStep,
  CompanyStep,
  TeamStep,
  JobPostStep,
  IntegrationsStep,
} from "@/components/onboarding/OnboardingSteps";

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

  const current = steps[currentStep];
  const CurrentIcon = current.icon;
  const personaLabel = t(`labels.onboarding.persona.${persona}`);

  return (
    <AppShell bgClassName="bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-8 sm:px-6 md:pt-12">
        <header className="mb-8 flex flex-col items-start gap-4">
          <span className="rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
            {t("labels.onboarding.personaSetup", { persona: personaLabel })}
          </span>
          <h1 className="font-display text-[clamp(36px,5vw,60px)] font-bold leading-[0.98] tracking-[-0.035em]">
            {t("headings.onboarding.welcome")}
          </h1>
          <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">
            {t("messages.onboarding.subtitle", { persona: personaLabel })}
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {/* Progress overview */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-xl">{t("headings.onboarding.setupProgress")}</CardTitle>
                <CardDescription className="mt-1">
                  {t("messages.onboarding.stepsCompleted", {
                    completed: completedTasks.length,
                    total: steps.length,
                  })}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="font-mono text-3xl font-semibold text-primary">{progressPercentage}%</div>
                <div className="text-sm text-muted-foreground">{t("labels.completePercent")}</div>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercentage} className="h-2.5" />
            </CardContent>
          </Card>

          {/* Steps list */}
          <nav aria-label={t("headings.onboarding.setupSteps")}>
            <p className="mb-3 text-sm text-muted-foreground">{t("messages.onboarding.clickToNavigate")}</p>
            <ol className="flex gap-3 overflow-x-auto pb-2">
              {steps.map((step, index) => {
                const isCurrent = index === currentStep;
                const StepIcon = step.icon;
                return (
                  <li key={step.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(index)}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "flex w-[220px] items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isCurrent
                          ? "border-primary bg-accent"
                          : step.completed
                            ? "border-brand-green/30 bg-brand-green/10"
                            : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          step.completed
                            ? "bg-brand-green/15 text-brand-green-text"
                            : isCurrent
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {step.completed ? (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <StepIcon className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{step.title}</span>
                        <span className="line-clamp-2 block text-xs text-muted-foreground">{step.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Current step */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <CurrentIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                {current.title}
              </CardTitle>
              <CardDescription>{current.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentStepComponent
                onComplete={() => handleCompleteTask(current.id)}
                isCompleted={current.completed}
                user={{ name: displayName }}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Step navigation */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 0}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("actions.previous")}
          </Button>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={handleSkipToEnd}>
              {t("actions.onboarding.skipSetup")}
            </Button>
            <Button onClick={handleNext} disabled={!current.completed}>
              {currentStep === steps.length - 1
                ? t("actions.onboarding.completeSetup")
                : t("actions.continue")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
