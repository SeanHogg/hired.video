import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles,
  Eye,
  Clock,
  FileText,
  Upload,
  Plus,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Users,
  TrendingUp,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroCarouselProps {
  totalViews: string;
  totalItems: number;
}

export default function HeroCarousel({ totalViews, totalItems }: HeroCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [dragActive, setDragActive] = useState(false);

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
      description: "Employment-focused social media, referral network, ATS, Recruitment CRM, crowdsourcing, and recruitment marketing features to attract, retain, and promote talent.",
      badge: "All-in-One AI HR Platform",
      stats: [
        { icon: Eye, label: `${totalViews} total views` },
        { icon: Sparkles, label: `${totalItems} items` },
        { icon: Clock, label: "Updated daily" },
      ],
      actions: [
        { label: "Get Started Free", variant: "default" as const, size: "lg" as const },
        { label: "Watch Demo", variant: "outline" as const, size: "lg" as const },
      ],
    },
    {
      id: 2,
      type: "upload",
      title: "Upload Your Resume",
      description: "Drop your resume here and let our AI create a stunning video presentation that stands out from the crowd.",
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
      description: "From talent acquisition to employee engagement, our comprehensive platform covers every aspect of human resources management.",
      badge: "End-to-End Platform",
      features: [
        { icon: Users, label: "Talent Network" },
        { icon: TrendingUp, label: "Analytics Dashboard" },
        { icon: Building2, label: "Company Profiles" },
        { icon: Briefcase, label: "Job Management" },
      ],
      actions: [
        { label: "Explore Features", variant: "default" as const, size: "lg" as const },
        { label: "See Pricing", variant: "outline" as const, size: "lg" as const },
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
    if (file && (file.type === "application/pdf" || file.type.includes("word"))) {
      console.log("Resume uploaded:", file.name);
      // Here you would handle the file upload
    }
  };

  const currentSlideData = slides[currentSlide];

  return (
    <section className="relative pt-20 pb-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-foreground hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-foreground hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Slide Content */}
        <div className="text-center max-w-4xl mx-auto">
          <Badge variant="secondary" className="mb-4 px-4 py-2 text-sm font-medium bg-brand-purple-light text-brand-purple-dark">
            <Sparkles className="w-4 h-4 mr-2" />
            {currentSlideData.badge}
          </Badge>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
            {currentSlideData.title}
          </h1>

          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            {currentSlideData.description}
          </p>

          {/* Slide-specific content */}
          {currentSlideData.type === "main" && currentSlideData.stats && (
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mb-6">
              {currentSlideData.stats.map((stat, index) => (
                <div key={index} className="flex items-center gap-1">
                  <stat.icon className="w-4 h-4" />
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          )}

          {currentSlideData.type === "upload" && (
            <div className="max-w-md mx-auto mb-6">
              <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                      dragActive
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/30 hover:border-primary/50"
                    )}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-base font-medium mb-2">
                      Drop your resume here
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      PDF, DOC, or DOCX files
                    </p>
                    <Button size="sm" variant="outline" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Browse Files
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentSlideData.type === "features" && currentSlideData.features && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 max-w-2xl mx-auto">
              {currentSlideData.features.map((feature, index) => (
                <div key={index} className="flex flex-col items-center p-4 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
                  <feature.icon className="w-6 h-6 mb-2 text-brand-purple" />
                  <span className="text-sm font-medium">{feature.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          {currentSlideData.type === "upload" ? (
            <Button className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8 py-3">
              Generate AI Video
            </Button>
          ) : currentSlideData.actions && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {currentSlideData.actions.map((action, index) => (
                <Button
                  key={index}
                  size={action.size}
                  variant={action.variant}
                  className="text-lg px-8 py-3"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Slide Indicators */}
        <div className="flex justify-center mt-8 gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={cn(
                "w-3 h-3 rounded-full transition-colors",
                index === currentSlide
                  ? "bg-brand-purple"
                  : "bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
