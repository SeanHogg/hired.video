import { Edit, ArrowLeft, Briefcase } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJobById } from "@/data/mockJobs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { user } = useAuth();
  
  const job = id ? getJobById(id) : null;

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
                <Link to={job ? `/jobs/${job.id}` : "/jobs"}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {job ? "Back to Job" : "Back to Jobs"}
                </Link>
              </Button>
            </div>

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">
                {job ? `Edit: ${job.data.title}` : "Edit Job Posting"}
              </h1>
              <p className="text-muted-foreground">
                Update your job posting details, requirements, and benefits
              </p>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Edit className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Job Editor Coming Soon</h3>
                <p className="text-muted-foreground mb-6">
                  We're building a comprehensive job editor with real-time preview, template management, and collaboration features.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button asChild>
                    <Link to={job ? `/jobs/${job.id}` : "/jobs"}>
                      {job ? "View Job" : "View Jobs"}
                    </Link>
                  </Button>
                  <Button variant="outline">
                    Request Early Access
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
