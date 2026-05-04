import {
  ArrowLeft,
  ArrowRight,
  UserPlus,
  UserCircle,
  FileText,
  Video,
  Search,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

const steps = [
  {
    number: 1,
    title: "Create Your Account",
    icon: UserPlus,
    content:
      "Head to the Sign Up page and create your free account using your email address or sign in with Google. After registering, check your inbox for a verification email and click the confirmation link to activate your account. During onboarding, you'll choose your role — Job Seeker, Recruiter, or Employer — which tailors the platform experience to your needs.",
  },
  {
    number: 2,
    title: "Complete Your Profile",
    icon: UserCircle,
    content:
      "Navigate to Settings > Profile to fill in your professional details. Add a high-quality profile photo, write a compelling headline and summary that highlight your strengths, then add your work experience, education history, and key skills. A complete profile helps recruiters find you and gives employers confidence when reviewing your applications.",
  },
  {
    number: 3,
    title: "Upload or Create a Resume",
    icon: FileText,
    content:
      "Go to the Resumes section from the sidebar and click 'Create Resume'. You can upload an existing PDF or DOCX file, or use the AI Resume Builder to generate a polished resume from scratch by answering a few guided prompts. The AI builder formats your experience into a professional layout and suggests improvements to make your resume stand out.",
  },
  {
    number: 4,
    title: "Create Your First Video Resume",
    icon: Video,
    content:
      "Open the Studio from the sidebar to create your video resume. You can record directly from your webcam, upload a pre-recorded video, or use AI text-to-speech to generate a professional voiceover from your script. Choose from a variety of templates to style your video, then preview and publish it. Video resumes help you showcase your personality and communication skills in ways a traditional resume cannot.",
  },
  {
    number: 5,
    title: "Start Your Job Search",
    icon: Search,
    content:
      "Browse open positions on the Jobs page, filtering by role, location, salary, and work type. Set up Job Alerts to receive notifications when new roles matching your criteria are posted. When you find a position you're interested in, apply directly with your video resume attached — employers can watch your introduction alongside your written application.",
  },
  {
    number: 6,
    title: "Connect with Others",
    icon: Users,
    content:
      "Use the People search to discover recruiters, hiring managers, and fellow professionals in your industry. Send connection requests or direct messages to introduce yourself and express interest in opportunities. Building your professional network on hired.video increases your visibility and opens doors to roles that may not be publicly listed.",
  },
];

export default function GettingStarted() {
  const location = useLocation();  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Help & Support", url: "/help" },
    { name: "Getting Started Guide", url: "/guides/getting-started" },
  ]);
  const { isAuthenticated } = useAuth();

  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Back link */}
            <Link
              to="/help"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Help & Support
            </Link>

            {/* Page header */}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Getting Started Guide
              </h1>
              <p className="text-muted-foreground mt-2">
                Everything you need to set up your hired.video account and land
                your next role. Follow these six steps to go from sign-up to
                your first application.
              </p>
            </div>

            {/* Step cards */}
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.number}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                        {step.number}
                      </span>
                      <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.content}
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            {/* Next guide link */}
            <div className="flex justify-end pt-4 pb-8">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/guides/video-best-practices">
                  Next: Video Resume Best Practices{" "}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
</AppShell>
  );
}
