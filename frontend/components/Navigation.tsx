import {
  Menu,
  Video,
  Sparkles,
  ChevronDown,
  FileText,
  Briefcase,
  Building2,
  Users,
  Wrench,
  CheckSquare,
  Send,
  Clapperboard,
  Chrome,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import HeaderSearch from "@/components/HeaderSearch";
import ShoppingCart from "@/components/ShoppingCart";
import CommunicationHub from "@/components/CommunicationHub";
import { Badge } from "@/components/ui/badge";
import { EmulationHeaderControls, useEmulationStyle } from "@/components/EmulationBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { roleUtils } from "@/lib/role-utils";

interface NavigationProps {
  onMenuClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
}

export default function Navigation({
  onMenuClick,
  onSidebarToggle,
  sidebarCollapsed,
}: NavigationProps) {
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const emulationStyle = useEmulationStyle();
  const location = useLocation();
  const featuresRef = useRef<HTMLDivElement>(null);

  const navigationItems = [
    {
      name: "Video Studio",
      href: "/studio",
      icon: Clapperboard,
      description:
        "Create marketing videos with AI scripting, voiceover, captions, and teleprompter — promote a resume, profile, job, or company.",
    },
    {
      name: "AI Tools",
      href: "/tools",
      icon: Wrench,
      description:
        "Interview practice, AI career coach, resume scoring, resume tailoring, salary calculator, and more — all in one place.",
    },
    {
      name: "Video Resumes",
      href: "/resumes",
      icon: FileText,
      description:
        "Import, manage, and generate AI-powered video-ready resumes.",
    },
    {
      name: "Chrome Extensions",
      href: "/chrome-extension",
      icon: Chrome,
      description:
        "Two extensions — job seekers tailor resumes on any job board, recruiters source candidates from LinkedIn and Indeed.",
    },
    {
      name: "Smart Jobs",
      href: "/jobs",
      icon: Briefcase,
      description:
        "Find jobs with AI match scoring, tailored resumes, and application tracking.",
    },
    {
      name: "Sell Hub",
      href: "/search",
      icon: Store,
      description:
        "Earn on hired.video — license your voice, offer services, or take on creator video projects. 95% to you.",
    },
    {
      name: "Career Services",
      href: "/services",
      icon: ShoppingBag,
      description:
        "Offer career services — resume reviews, coaching, video editing — and get paid by clients.",
    },
    {
      name: "For Companies",
      href: "/companies",
      icon: Building2,
      description:
        "Hire top talent with video interviews, AI candidate matching, and a recruiter pipeline.",
    },
    {
      name: "Professional Network",
      href: "/people",
      icon: Users,
      description:
        "Connect with professionals, share career wins, and grow your network.",
    },
    {
      name: "Smart Outreach",
      href: "/outreach",
      icon: Send,
      description:
        "Automate and track outreach campaigns across email and LinkedIn.",
    },
    {
      name: "Task Management",
      href: "/tasks",
      icon: CheckSquare,
      description: "Plan your job search and keep every follow-up on track.",
    },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Only apply the outside-click close behavior for the desktop mega menu.
      // On mobile, this would immediately close the menu before the Link's click
      // event can fire, preventing navigation (especially on iOS Safari).
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
      if (!isDesktop) return;

      if (
        featuresRef.current &&
        !featuresRef.current.contains(event.target as Node)
      ) {
        setIsFeaturesOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const navCls = cn(
    "fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-200",
    emulationStyle === "amber"
      ? "bg-amber-50/95 border-amber-300"
      : emulationStyle === "blue"
      ? "bg-blue-50/95 border-blue-300"
      : "bg-background/80 backdrop-blur-md border-border",
  );

  return (
    <nav className={navCls}>
      <div id="nav-bar-wrapper" className="max-w-7xl mx-auto pr-4 sm:px-6 lg:px-8">
        <div id="nav-bar" className="flex justify-between items-center h-16 sm:pl-2.5">
          {/* Left side: Hamburger (mobile) / Sidebar Toggle (desktop) + Logo */}
          <div className="flex items-center space-x-3">
            {/* Mobile Hamburger Menu Toggle - Opens Sidebar */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Desktop Sidebar Collapse Toggle */}
            <Button
              variant="ghost"
              onClick={onSidebarToggle}
              className="hidden lg:flex h-10 w-10 px-2 py-2 justify-center -ml-4"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <div className="relative">
                <Video className="h-8 w-8 text-primary" />
                <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
              </div>
              <span className="hidden sm:inline text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                hired.video
              </span>
            </Link>
          </div>

          {/* Header search — hidden on the home page where the hero + sticky search are already prominent.
           * On all other pages the condensed search shows on every breakpoint, including mobile. */}
          {location.pathname !== "/" && (
            <div className="flex-1 max-w-md mx-2 sm:mx-4 min-w-0">
              <HeaderSearch />
            </div>
          )}

          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex items-center space-x-8">
            {!isAuthenticated && (
              <>
                {/* Features Mega Menu */}
                <div className="relative" ref={featuresRef}>
                  <button
                    onClick={() => setIsFeaturesOpen(!isFeaturesOpen)}
                    onMouseEnter={() => setIsFeaturesOpen(true)}
                    className="flex items-center gap-1 text-foreground/70 hover:text-foreground transition-colors font-medium"
                  >
                    Features
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isFeaturesOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isFeaturesOpen && (
                    <div
                      className="absolute top-full left-0 mt-2 w-[600px] bg-background border border-border rounded-lg shadow-lg p-6 z-50"
                      onMouseLeave={() => setIsFeaturesOpen(false)}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        {navigationItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.name}
                              to={item.href}
                              className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                              onClick={() => setIsFeaturesOpen(false)}
                            >
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm text-foreground">
                                  {item.name}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {item.description}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>

                      <div className="border-t border-border mt-4 pt-4">
                        <Link
                          to="/pricing"
                          className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                          onClick={() => setIsFeaturesOpen(false)}
                        >
                          View All Features & Pricing
                          <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  to="/pricing"
                  className={cn(
                    "transition-colors font-medium",
                    location.pathname === "/pricing"
                      ? "text-primary"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  Pricing
                </Link>
              </>
            )}
          </div>

          {/* Right side: SuperAdmin controls + Inbox + Shopping Cart + Desktop CTA Buttons */}
          <div className="flex items-center space-x-4">
            {/* SuperAdmin controls (idle or active) */}
            <EmulationHeaderControls />

            {/* Unified communication hub - bell with merged inbox */}
            <CommunicationHub />

            {/* Shopping Cart - Visible on both mobile and desktop */}
            <ShoppingCart />

            {/* Desktop CTA Buttons - Hidden on mobile */}
            <div className="hidden md:flex items-center space-x-4">
              {!isAuthenticated ? (
                <>
                  <Link to="/login">
                    <Button variant="ghost" className="font-medium">
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity font-medium">
                      Get Started
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  {/* Show upgrade button only for free-tier users */}
                  {(!user?.subscription || user?.subscription === "free") && !roleUtils.isAdmin(user?.role) && !roleUtils.isSuperAdmin(user?.role) && (
                    <Link to="/pricing">
                      <Button className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 font-medium">
                        Upgrade Account
                      </Button>
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
