import React, { useState } from "react";
import { Package, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Module {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  requiredPlan: string | null;
  affectedRoles: string[];
}

const INITIAL_MODULES: Module[] = [
  { id: "video_resume",      name: "Video Resumes",        description: "Allow users to create and publish video resumes.",            category: "Core",      enabled: true,  requiredPlan: null,          affectedRoles: ["JobSeeker"] },
  { id: "ai_coach",          name: "AI Coach",             description: "AI-powered career coaching and interview practice.",          category: "AI",        enabled: true,  requiredPlan: "Pro",         affectedRoles: ["JobSeeker"] },
  { id: "resume_tailor",     name: "Resume Tailor",        description: "Tailor resumes to specific job descriptions using AI.",        category: "AI",        enabled: true,  requiredPlan: null,          affectedRoles: ["JobSeeker"] },
  { id: "interview_practice",name: "Interview Practice",   description: "Simulated interview sessions with AI feedback.",              category: "AI",        enabled: true,  requiredPlan: "Pro",         affectedRoles: ["JobSeeker"] },
  { id: "outreach",          name: "Outreach & CRM",       description: "Contact candidates and track recruitment pipeline.",          category: "Recruiting",enabled: true,  requiredPlan: "Pro",         affectedRoles: ["Recruiter", "Employer"] },
  { id: "ats",               name: "Applicant Tracking",   description: "Full ATS with stages, notes, and team collaboration.",        category: "Recruiting",enabled: true,  requiredPlan: "Pro",         affectedRoles: ["Employer", "Recruiter"] },
  { id: "affiliate",         name: "Affiliate Program",    description: "Referral and commission tracking for affiliates.",            category: "Revenue",   enabled: true,  requiredPlan: null,          affectedRoles: ["Affiliate"] },
  { id: "job_board",         name: "Public Job Board",     description: "Publicly listed jobs searchable without an account.",         category: "Core",      enabled: true,  requiredPlan: null,          affectedRoles: ["JobSeeker", "Recruiter", "Employer"] },
  { id: "social_feed",       name: "Social Feed",          description: "LinkedIn-style activity feed for platform members.",          category: "Social",    enabled: true,  requiredPlan: null,          affectedRoles: ["JobSeeker", "Recruiter", "Employer"] },
  { id: "chrome_extension",  name: "Chrome Extension",     description: "Browser extension for one-click apply and job capture.",      category: "Tools",     enabled: true,  requiredPlan: null,          affectedRoles: ["JobSeeker"] },
  { id: "referral_banner",   name: "Referral Banner",      description: "In-app referral prompt to grow user base.",                  category: "Growth",    enabled: true,  requiredPlan: null,          affectedRoles: ["JobSeeker", "Recruiter", "Employer"] },
  { id: "ads",               name: "Ad Slots",             description: "Display advertising within the platform.",                   category: "Revenue",   enabled: false, requiredPlan: null,          affectedRoles: ["JobSeeker"] },
];

const CATEGORY_ORDER = ["Core", "AI", "Recruiting", "Social", "Tools", "Revenue", "Growth"];

export default function ModuleManagement() {
  const [modules, setModules] = useState(INITIAL_MODULES);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
    setChanged((prev) => new Set(prev).add(id));
  };

  const grouped = CATEGORY_ORDER.reduce<Record<string, Module[]>>((acc, cat) => {
    acc[cat] = modules.filter((m) => m.category === cat);
    return acc;
  }, {});

  const enabledCount = modules.filter((m) => m.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Modules & Features</h1>
          <p className="text-muted-foreground text-sm">Enable or disable platform features globally.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{enabledCount}</span> / {modules.length} enabled
        </div>
      </div>

      {changed.size > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {changed.size} module{changed.size > 1 ? "s" : ""} changed. Changes are applied immediately and saved to the database.
          </AlertDescription>
        </Alert>
      )}

      {CATEGORY_ORDER.map((category) => {
        const items = grouped[category];
        if (!items?.length) return null;
        return (
          <div key={category}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((mod) => (
                <Card key={mod.id} className={mod.enabled ? "" : "opacity-60"}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{mod.name}</p>
                          {mod.requiredPlan && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {mod.requiredPlan}
                            </Badge>
                          )}
                          {changed.has(mod.id) && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500">changed</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Affects: {mod.affectedRoles.join(", ")}
                        </p>
                      </div>
                      <Switch
                        checked={mod.enabled}
                        onCheckedChange={() => toggle(mod.id)}
                        aria-label={`Toggle ${mod.name}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
