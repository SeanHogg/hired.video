import { Building2, ArrowLeft, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function CompanyCreatePage() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto">
            {/* Back Button */}
            <div className="mb-6">
              <Button asChild variant="outline">
                <Link to="/companies">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Companies
                </Link>
              </Button>
            </div>

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">
                Create Company Profile
              </h1>
              <p className="text-muted-foreground">
                Set up your company profile to attract top talent and showcase
                your culture
              </p>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Company Builder Coming Soon
                </h3>
                <p className="text-muted-foreground mb-6">
                  We're building a comprehensive company profile builder with
                  guided setup, culture showcase, and team management features.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button variant="outline">Request Early Access</Button>
                  <Button asChild>
                    <Link to="/companies">View Existing Companies</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Features Preview */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Guided Setup</CardTitle>
                  <CardDescription>
                    Step-by-step onboarding to create a compelling company
                    profile
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Company information and branding</li>
                    <li>• Culture and values showcase</li>
                    <li>• Benefits and perks listing</li>
                    <li>• Team member management</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Instant Visibility</CardTitle>
                  <CardDescription>
                    Get discovered by job seekers as soon as you complete setup
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Automatic job board integration</li>
                    <li>• Talent pipeline building</li>
                    <li>• Analytics and insights</li>
                    <li>• Follower engagement tools</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
