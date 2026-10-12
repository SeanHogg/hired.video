import { Users, Briefcase, Building2, ArrowRight, Check, type LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { SIGNUP_PICKER_ROLES } from "@shared/user-roles";

interface PersonaOption {
  id: UserRole;
  /** i18n segment under `personaSelection.persona.<key>.*`. */
  key: "jobSeeker" | "recruiter" | "employer";
  icon: LucideIcon;
}

const FEATURE_COUNT = 5;

/** Every persona the page knows how to describe; which ones render follows
 *  the signup persona switch (SIGNUP_PICKER_ROLES / HIRING_PERSONAS_ENABLED). */
const ALL_PERSONAS: PersonaOption[] = [
  { id: USER_ROLES.JOB_SEEKER, key: "jobSeeker", icon: Users },
  { id: USER_ROLES.RECRUITER, key: "recruiter", icon: Briefcase },
  { id: USER_ROLES.EMPLOYER, key: "employer", icon: Building2 },
];

const personas = ALL_PERSONAS.filter((p) => SIGNUP_PICKER_ROLES.includes(p.id));

export default function PersonaSelection() {
  const { t } = useTranslation();
  const [selectedPersona, setSelectedPersona] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { updateUserRole, user } = useAuth();
  const navigate = useNavigate();

  useSEO("/persona-selection");
  useBreadcrumbs([{ name: t("personaSelection.breadcrumb"), url: "/persona-selection" }]);

  // Pre-select the user's current role when the auth context loads
  useEffect(() => {
    if (user?.role) {
      const match = personas.find((p) => p.id === user.role);
      if (match) setSelectedPersona(match.id);
    }
  }, [user?.role]);

  const handleContinue = async () => {
    if (!selectedPersona) return;

    setIsLoading(true);
    updateUserRole(selectedPersona);

    // Simulate a small delay for better UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    navigate("/onboarding");
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 md:py-16">
        <header className="mb-10 flex flex-col items-start gap-4">
          <span className="rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground">
            {t("personaSelection.step", { current: 1, total: 2 })}
          </span>
          <h1 className="font-display text-[clamp(36px,5vw,60px)] font-bold leading-[0.98] tracking-[-0.035em]">
            {user?.name
              ? t("personaSelection.titleNamed", { name: user.name })
              : t("personaSelection.title")}
          </h1>
          <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">{t("personaSelection.subtitle")}</p>
        </header>

        <div
          role="radiogroup"
          aria-label={t("personaSelection.title")}
          className="mb-10 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5"
        >
          {personas.map((persona) => {
            const Icon = persona.icon;
            const isSelected = selectedPersona === persona.id;
            const base = `personaSelection.persona.${persona.key}`;

            return (
              <button
                key={persona.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedPersona(persona.id)}
                className={cn(
                  "flex flex-col gap-4 rounded-[20px] border bg-card p-6 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="h-4 w-4" />}
                  </span>
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">{t(`${base}.title`)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`${base}.description`)}</p>
                </div>
                <ul className="space-y-2">
                  {Array.from({ length: FEATURE_COUNT }, (_, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                      <span>{t(`${base}.feature${i + 1}`)}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-start gap-3">
          <Button onClick={handleContinue} disabled={!selectedPersona || isLoading} size="lg">
            {isLoading ? (
              t("personaSelection.settingUp")
            ) : (
              <>
                {t("personaSelection.continue")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </>
            )}
          </Button>

          {!selectedPersona && <p className="text-sm text-muted-foreground">{t("personaSelection.selectPrompt")}</p>}
          <p className="text-sm text-muted-foreground">{t("personaSelection.changeLater")}</p>
        </div>
      </div>
    </AppShell>
  );
}
