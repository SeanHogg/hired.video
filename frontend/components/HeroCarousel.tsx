import {
  Sparkles,
  Eye,
  Clock,
  FileText,
  Plus,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Users,
  TrendingUp,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface HeroCarouselProps {
  totalViews: string;
  totalItems: number;
}

export default function HeroCarousel({
  totalViews,
  totalItems,
}: HeroCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const slides = [
    {
      id: 1,
      type: "main",
      title: (
        <>
          The Future of{" "}
          <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
            Talent Management
          </span>
        </>
      ),
      description:
        "Employment-focused social media, referral network, ATS, Recruitment CRM, crowdsourcing, and recruitment marketing features to attract, retain, and promote talent.",
      badge: "All-in-One AI HR Platform",
      stats: [
        { icon: Eye, label: `${totalViews} total views` },
        { icon: Sparkles, label: `${totalItems} items` },
        { icon: Clock, label: "Updated daily" },
      ],
      actions: [
        {
          label: "Get Started",
          variant: "default" as const,
          size: "lg" as const,
        },
        {
          label: "Watch Demo",
          variant: "outline" as const,
          size: "lg" as const,
        },
      ],
    },
    {
      id: 2,
      type: "upload",
      title: (
        <>
          Generate AI{" "}
          <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
            Resume Video
          </span>
        </>
      ),
      description: "",
      badge: "AI-Powered Resume Videos",
    },
    {
      id: 3,
      type: "features",
      title: (
        <>
          Complete{" "}
          <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
            HR Solution
          </span>
        </>
      ),
      description:
        "From talent acquisition to employee engagement, our comprehensive platform covers every aspect of human resources management.",
      badge: "End-to-End Platform",
      features: [
        { icon: Users, label: "Talent Network" },
        { icon: TrendingUp, label: "Analytics Dashboard" },
        { icon: Building2, label: "Company Profiles" },
        { icon: Briefcase, label: "Job Management" },
      ],
      actions: [
        {
          label: "Explore Features",
          variant: "default" as const,
          size: "lg" as const,
        },
        {
          label: "See Pricing",
          variant: "outline" as const,
          size: "lg" as const,
        },
      ],
    },
  ];

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  // Auto-advance slides
  useEffect(() => {
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (
      file &&
      (file.type === "application/pdf" || file.type.includes("word"))
    ) {
      console.log("Resume uploaded:", file.name);
      // Navigate to video wizard with the same logic as handleGenerateAIVideo
      handleGenerateAIVideo();
    }
  };

  // Navigation handlers for CTA buttons
  const handleGetStarted = () => {
    if (isAuthenticated) {
      // If user is logged in, take them to dashboard or profile
      navigate("/dashboard");
    } else {
      // If not logged in, take them to signup
      navigate("/signup");
    }
  };

  const handleWatchDemo = () => {
    // Navigate to about page or a demo video section
    navigate("/about");
  };

  const handleExploreFeatures = () => {
    // Navigate to pricing page which shows features
    navigate("/pricing");
  };

  const handleSeePricing = () => {
    // Navigate to pricing page
    navigate("/pricing");
  };

  const handleGenerateAIVideo = () => {
    if (isAuthenticated) {
      // Authed: drop straight into the Studio landing — same destination
      // the wizard used to redirect to, minus the phantom backend.
      navigate("/studio");
    } else {
      // Anon: signup first; post-signup nav lands on Studio anyway.
      navigate("/signup");
    }
  };

  // Helper function to get the appropriate handler for each action
  const getActionHandler = (label: string) => {
    switch (label) {
      case "Get Started":
        return handleGetStarted;
      case "Watch Demo":
        return handleWatchDemo;
      case "Explore Features":
        return handleExploreFeatures;
      case "See Pricing":
        return handleSeePricing;
      default:
        return () => console.log(`No handler defined for: ${label}`);
    }
  };

  const currentSlideData = slides[currentSlide];

  return (
    <section className="relative pt-16 sm:pt-12 pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 overflow-hidden">
      <div className="max-w-7xl mx-auto relative min-h-[300px] sm:min-h-[400px] flex items-center">
        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-foreground hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          onClick={nextSlide}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-foreground hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Slide Content */}
        <div className="text-center max-w-4xl mx-auto w-full px-4 sm:px-0">
          {currentSlideData.badge && (
            <Badge
              variant="secondary"
              className="mb-2 sm:mb-3 px-2 sm:px-3 py-1 text-xs font-medium bg-brand-purple-light text-brand-purple-dark"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {currentSlideData.badge}
            </Badge>
          )}

          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2 sm:mb-3 leading-tight px-2">
            {currentSlideData.title}
          </h1>

          {currentSlideData.description && (
            <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4 max-w-2xl mx-auto line-clamp-3 px-2">
              {currentSlideData.description}
            </p>
          )}

          {/* Slide-specific content */}
          <div className="min-h-[60px] sm:min-h-[80px] flex items-center justify-center mb-3 sm:mb-4">
            {currentSlideData.type === "main" && currentSlideData.stats && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                {currentSlideData.stats.map((stat, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <stat.icon className="w-3 h-3" />
                    <span className="text-center">{stat.label}</span>
                  </div>
                ))}
              </div>
            )}

            {currentSlideData.type === "upload" && (
              <div className="max-w-xs sm:max-w-sm mx-auto px-4">
                <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
                  <CardContent className="pt-3 sm:pt-4">
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-lg p-3 sm:p-4 text-center transition-colors",
                        dragActive
                          ? "border-primary bg-primary/10"
                          : "border-muted-foreground/30 hover:border-primary/50",
                      )}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs sm:text-sm font-medium mb-1">
                        Drop your resume here
                      </p>
                      <p className="text-xs text-muted-foreground mb-3">
                        PDF, DOC, or DOCX files
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs min-h-[44px]"
                        onClick={handleGenerateAIVideo}
                      >
                        <Plus className="h-3 w-3" />
                        Browse Files
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {currentSlideData.type === "features" &&
              currentSlideData.features && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 max-w-sm sm:max-w-xl mx-auto px-4">
                  {currentSlideData.features.map((feature, index) => (
                    <div
                      key={index}
                      className="flex flex-col items-center p-2 sm:p-3 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 min-h-[60px] justify-center"
                    >
                      <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 mb-1 text-brand-purple" />
                      <span className="text-xs font-medium text-center leading-tight">
                        {feature.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Action Buttons */}
          <div className="h-[80px] sm:min-h-[50px] flex items-center justify-center px-4">
            {currentSlideData.type === "upload" ? (
              <Button
                onClick={handleGenerateAIVideo}
                className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-sm px-6 py-2 h-[44px] w-full sm:w-auto max-w-xs"
              >
                Generate AI Video
              </Button>
            ) : (
              currentSlideData.actions && (
                <div className="flex flex-col gap-2 sm:gap-3 justify-center w-full sm:w-auto sm:flex-row">
                  {currentSlideData.actions.map((action, index) => (
                    <Button
                      key={index}
                      size="sm"
                      variant={action.variant}
                      className="text-sm px-4 sm:px-6 py-2 h-[44px] w-full"
                      onClick={getActionHandler(action.label)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Slide Indicators */}
        <div className="hidden sm:flex justify-center mt-4 sm:mt-6 gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={cn(
                "w-3 h-3 sm:w-2 sm:h-2 rounded-full transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center",
                index === currentSlide
                  ? "bg-brand-purple"
                  : "bg-white/30 hover:bg-white/50",
              )}
            >
              <span className="sr-only">Go to slide {index + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
