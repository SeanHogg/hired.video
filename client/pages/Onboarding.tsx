import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default function Onboarding() {
  const navigate = useNavigate();
  
  // Mock user data
  const [user] = useState({
    id: "user123",
    name: "Sarah Johnson",
    email: "sarah@example.com",
    persona: "recruiter" as const,
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [completedTasks, setCompletedTasks] = useState<string[]>([
    "profile", "preferences", "verification"
  ]);

  // Persona-specific onboarding tasks
  const getOnboardingSteps = () => {
    const baseSteps = [
      {
        id: "profile",
        title: "Complete Your Profile",
        description: "Add your basic information",
        icon: User,
        completed: completedTasks.includes("profile"),
        component: ProfileStep,
      },
      {
        id: "preferences",
        title: "Set Your Preferences",
        description: "Customize your experience",
        icon: Settings,
        completed: completedTasks.includes("preferences"),
        component: PreferencesStep,
      },
      {
        id: "verification",
        title: "Verify Your Email",
        description: "Confirm your email address",
        icon: Mail,
        completed: completedTasks.includes("verification"),
        component: VerificationStep,
      },
    ];

    switch (user.persona) {
      case "job_seeker":
        return [
          ...baseSteps,
          {
            id: "resume",
            title: "Upload Your Resume",
            description: "Share your professional background",
            icon: FileText,
            completed: completedTasks.includes("resume"),
            component: ResumeUploadStep,
          },
          {
            id: "video",
            title: "Create Video Resume",
            description: "Make yourself stand out",
            icon: Video,
            completed: completedTasks.includes("video"),
            component: VideoResumeStep,
          },
          {
            id: "skills",
            title: "Add Skills & Experience",
            description: "Highlight your expertise",
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
            title: "Company Profile",
            description: "Set up your company information",
            icon: Building2,
            completed: completedTasks.includes("company"),
            component: CompanyStep,
          },
          {
            id: "team",
            title: "Invite Team Members",
            description: "Collaborate with your team",
            icon: Users,
            completed: completedTasks.includes("team"),
            component: TeamStep,
          },
          {
            id: "jobs",
            title: "Post Your First Job",
            description: "Start finding candidates",
            icon: Briefcase,
            completed: completedTasks.includes("jobs"),
            component: JobPostStep,
          },
        ];
      case "business":
        return [
          ...baseSteps,
          {
            id: "company",
            title: "Company Information",
            description: "Complete your company details",
            icon: Building2,
            completed: completedTasks.includes("company"),
            component: CompanyStep,
          },
          {
            id: "team",
            title: "Add Team Members",
            description: "Invite your hiring team",
            icon: Users,
            completed: completedTasks.includes("team"),
            component: TeamStep,
          },
          {
            id: "integration",
            title: "Configure Integrations",
            description: "Connect your tools",
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
  const progressPercentage = Math.round((completedTasks.length / steps.length) * 100);
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Welcome to MyVideoResume!</h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Let's get your {user.persona.replace('_', ' ')} profile set up in just a few steps
            </p>
            <Badge variant="secondary" className="capitalize mt-2">
              {user.persona.replace('_', ' ')} Setup
            </Badge>
          </div>

          {/* Progress Overview */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Setup Progress
                  </CardTitle>
                  <CardDescription>
                    {completedTasks.length} of {steps.length} steps completed
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">{progressPercentage}%</div>
                  <div className="text-sm text-muted-foreground">Complete</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercentage} className="h-3 mb-6" />
              
              {/* Steps List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      index === currentStep
                        ? "border-primary bg-primary/5 shadow-sm"
                        : step.completed
                        ? "border-green-200 bg-green-50"
                        : "border-muted bg-muted/20"
                    }`}
                    onClick={() => setCurrentStep(index)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        step.completed
                          ? "bg-green-500 text-white"
                          : index === currentStep
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {step.completed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <step.icon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{step.title}</h4>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Current Step */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {React.createElement(steps[currentStep].icon, { className: "h-5 w-5" })}
                {steps[currentStep].title}
              </CardTitle>
              <CardDescription>{steps[currentStep].description}</CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentStepComponent 
                onComplete={() => handleCompleteTask(steps[currentStep].id)}
                isCompleted={steps[currentStep].completed}
                user={user}
              />
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleSkipToEnd}>
                Skip Setup
              </Button>
              <Button
                onClick={handleNext}
                className="gap-2"
                disabled={!steps[currentStep].completed}
              >
                {currentStep === steps.length - 1 ? "Complete Setup" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step Components
function ProfileStep({ onComplete, isCompleted, user }: any) {
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
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="title">Professional Title</Label>
          <Input
            id="title"
            placeholder="e.g. Senior Software Engineer"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="e.g. San Francisco, CA"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="bio">Professional Bio</Label>
        <Textarea
          id="bio"
          placeholder="Tell us about yourself..."
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
        />
      </div>
      {!isCompleted && (
        <Button onClick={handleSubmit} className="w-full">
          Save Profile Information
        </Button>
      )}
    </div>
  );
}

function PreferencesStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Set your notification and privacy preferences.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Save Preferences
        </Button>
      )}
    </div>
  );
}

function VerificationStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">We've sent a verification email. Please check your inbox.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Mark as Verified
        </Button>
      )}
    </div>
  );
}

function ResumeUploadStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">Upload Your Resume</p>
        <p className="text-muted-foreground mb-4">PDF, DOC, or DOCX files</p>
        <Button variant="outline">Choose File</Button>
      </div>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Resume Uploaded
        </Button>
      )}
    </div>
  );
}

function VideoResumeStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Create a video resume to stand out from other candidates.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Create Video Resume
        </Button>
      )}
    </div>
  );
}

function SkillsStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Add your skills and experience level.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Add Skills
        </Button>
      )}
    </div>
  );
}

function CompanyStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Set up your company profile and information.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Complete Company Setup
        </Button>
      )}
    </div>
  );
}

function TeamStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Invite team members to collaborate on hiring.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Invite Team Members
        </Button>
      )}
    </div>
  );
}

function JobPostStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Create your first job posting to start finding candidates.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Post First Job
        </Button>
      )}
    </div>
  );
}

function IntegrationsStep({ onComplete, isCompleted }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Connect your existing tools and platforms.</p>
      {!isCompleted && (
        <Button onClick={onComplete} className="w-full">
          Configure Integrations
        </Button>
      )}
    </div>
  );
}
