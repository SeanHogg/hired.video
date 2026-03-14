import { Construction, ArrowLeft, MessageCircle } from "lucide-react";
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

interface PlaceholderPageProps {
  title: string;
  description: string;
  suggestedPrompt?: string;
}

export default function PlaceholderPage({
  title,
  description,
  suggestedPrompt,
}: PlaceholderPageProps) {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

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

        <div className="pt-16">
          <div className="pt-8 pb-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <Card className="border-dashed border-2 border-muted-foreground/30">
                <CardHeader className="text-center py-12">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                    <Construction className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-3xl mb-4">{title}</CardTitle>
                  <CardDescription className="text-lg max-w-2xl mx-auto">
                    {description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center pb-12">
                  {suggestedPrompt && (
                    <div className="bg-muted/50 rounded-lg p-6 mb-6 max-w-2xl mx-auto">
                      <p className="text-sm text-muted-foreground mb-2">
                        Suggested prompt:
                      </p>
                      <p className="text-sm font-mono bg-background rounded p-3 border">
                        {suggestedPrompt}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <Link to="/">
                      <Button variant="outline" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                      </Button>
                    </Link>
                    <Button className="gap-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                      <MessageCircle className="h-4 w-4" />
                      Continue Building
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground mt-6">
                    This page is ready to be built! Continue prompting to add
                    the content you need.
                  </p>
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
