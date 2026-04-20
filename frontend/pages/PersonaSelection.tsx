import { Users, Briefcase, Building2, ArrowRight, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UserRole } from "@/lib/auth";
import { useAuth, USER_ROLES } from "@/lib/auth";

const personas = [
  {
    id: USER_ROLES.JOB_SEEKER,
    title: "Job Seeker",
    description: "Looking for your next career opportunity",
    icon: Users,
    features: [
      "Create video resumes",
      "Track application progress",
      "Get matched with jobs",
      "Resume analytics",
      "Interview preparation",
    ],
    color: "bg-green-50 border-green-200 hover:border-green-300",
    iconColor: "text-green-600",
  },
  {
    id: USER_ROLES.RECRUITER,
    title: "recruiter",
    description: "Finding the perfect candidates for your roles",
    icon: Briefcase,
    features: [
      "Browse candidate profiles",
      "Advanced search filters",
      "Candidate pipeline management",
      "Interview scheduling",
      "Placement tracking",
    ],
    color: "bg-blue-50 border-blue-200 hover:border-blue-300",
    iconColor: "text-blue-600",
  },
  {
    id: USER_ROLES.EMPLOYER,
    title: "employer",
    description: "Managing your company's hiring operations",
    icon: Building2,
    features: [
      "Team hiring analytics",
      "Multi-recruiter management",
      "Department-wise insights",
      "Hiring cost optimization",
      "Enterprise integrations",
    ],
    color: "bg-purple-50 border-purple-200 hover:border-purple-300",
    iconColor: "text-purple-600",
  },
];

export default function PersonaSelection() {
  const [selectedPersona, setSelectedPersona] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { updateUserRole, user } = useAuth();
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 min-h-screen p-6">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold mb-4">
                Welcome to hired.video{user?.name ? `, ${user.name}` : ""}!
              </h1>
              <p className="text-xl text-muted-foreground mb-6">
                Tell us about yourself so we can personalize your experience
              </p>
              <Badge variant="secondary" className="text-sm">
                Step 1 of 2
              </Badge>
            </div>

            {/* Persona Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {personas.map((persona) => {
                const Icon = persona.icon;
                const isSelected = selectedPersona === persona.id;

                return (
                  <Card
                    key={persona.id}
                    className={`cursor-pointer transition-all duration-200 ${persona.color} ${
                      isSelected
                        ? "ring-2 ring-primary shadow-lg scale-105"
                        : "hover:shadow-md"
                    }`}
                    onClick={() => setSelectedPersona(persona.id)}
                  >
                    <CardHeader className="text-center pb-4">
                      <div className="flex justify-center mb-4">
                        <div
                          className={`p-4 rounded-full bg-white shadow-sm ${isSelected ? "ring-2 ring-primary" : ""}`}
                        >
                          <Icon className={`h-8 w-8 ${persona.iconColor}`} />
                        </div>
                      </div>
                      <CardTitle className="text-xl">{persona.title}</CardTitle>
                      <CardDescription className="text-sm">
                        {persona.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {persona.features.map((feature, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-sm"
                          >
                            <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      {isSelected && (
                        <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                          <p className="text-sm font-medium text-primary">
                            Perfect choice! We'll customize your experience for{" "}
                            {persona.title.toLowerCase()}s.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Continue Button */}
            <div className="text-center">
              <Button
                onClick={handleContinue}
                disabled={!selectedPersona || isLoading}
                size="lg"
                className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 px-8"
              >
                {isLoading ? (
                  "Setting up your account..."
                ) : (
                  <>
                    Continue to Onboarding
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>

              {!selectedPersona && (
                <p className="text-sm text-muted-foreground mt-2">
                  Please select a persona to continue
                </p>
              )}
            </div>

            {/* Help Text */}
            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                Don't worry, you can change this later in your account settings
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
