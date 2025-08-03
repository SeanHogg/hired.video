import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu, X, Video, Sparkles, ChevronDown, Home, TrendingUp, FileText, Briefcase, Building2, Users, Wrench, CheckSquare, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import ShoppingCart from "@/components/ShoppingCart";

interface NavigationProps {
  onMenuClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
}

export default function Navigation({ onMenuClick, onSidebarToggle, sidebarCollapsed }: NavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const { isAuthenticated, logout, user } = useAuth();
  const location = useLocation();
  const featuresRef = useRef<HTMLDivElement>(null);

  const navigationItems = [
    { name: "Video Resumes", href: "/resumes", icon: FileText, description: "Create AI-powered video resumes" },
    { name: "Smart Jobs", href: "/jobs", icon: Briefcase, description: "Find jobs with AI matching" },
    { name: "For Companies", href: "/companies", icon: Building2, description: "Hire top talent efficiently" },
    { name: "Professional Network", href: "/people", icon: Users, description: "Connect with professionals" },
    { name: "AI Tools", href: "/tools", icon: Wrench, description: "Career enhancement tools" },
    { name: "Task Management", href: "/tasks", icon: CheckSquare, description: "Organize your career journey" },
    { name: "Smart Outreach", href: "/outreach", icon: Send, description: "Intelligent networking" },
    { name: "Dashboard", href: "/dashboard", icon: TrendingUp, description: "Track your progress" },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (featuresRef.current && !featuresRef.current.contains(event.target as Node)) {
        setIsFeaturesOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Sidebar Toggle + Logo */}
          <div className="flex items-center space-x-3">
            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Desktop Sidebar Collapse Toggle */}
            <Button
              variant="ghost"
              onClick={onSidebarToggle}
              className="hidden lg:flex h-10 w-10 px-2 py-2 justify-center -ml-4"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="h-4 w-4" />
            </Button>

            <Link to="/" className="flex items-center space-x-2">
            <div className="relative">
              <Video className="h-8 w-8 text-primary" />
              <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
              MyVideoResu.ME
            </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
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
                    <ChevronDown className={`h-4 w-4 transition-transform ${isFeaturesOpen ? 'rotate-180' : ''}`} />
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
                                <h4 className="font-semibold text-sm text-foreground">{item.name}</h4>
                                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
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
                      : "text-foreground/70 hover:text-foreground"
                  )}
                >
                  Pricing
                </Link>
                <Link
                  to="/about"
                  className={cn(
                    "transition-colors font-medium",
                    location.pathname === "/about"
                      ? "text-primary"
                      : "text-foreground/70 hover:text-foreground"
                  )}
                >
                  About
                </Link>
              </>
            )}
          </div>

          {/* Desktop CTA Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <ShoppingCart />
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
                {/* Show upgrade button for free accounts */}
                {(!user?.subscription || user?.subscription === 'free') ? (
                  <Link to="/pricing">
                    <Button className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 font-medium">
                      Upgrade Account
                    </Button>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {user?.subscription || 'Pro'} Plan
                    </Badge>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border bg-background/95 backdrop-blur-md">
            <div className="flex flex-col space-y-4">
              {!isAuthenticated && (
                <>
                  {/* Mobile Features Menu */}
                  <div>
                    <button
                      onClick={() => setIsFeaturesOpen(!isFeaturesOpen)}
                      className="flex items-center justify-between w-full text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                    >
                      Features
                      <ChevronDown className={`h-4 w-4 transition-transform ${isFeaturesOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isFeaturesOpen && (
                      <div className="mt-2 ml-4 space-y-2">
                        {navigationItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.name}
                              to={item.href}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                              onClick={() => {
                                setIsMenuOpen(false);
                                setIsFeaturesOpen(false);
                              }}
                            >
                              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <div className="font-medium text-sm">{item.name}</div>
                                <div className="text-xs text-muted-foreground">{item.description}</div>
                              </div>
                            </Link>
                          );
                        })}
                        <Link
                          to="/pricing"
                          className="flex items-center gap-2 p-2 text-sm font-medium text-primary"
                          onClick={() => {
                            setIsMenuOpen(false);
                            setIsFeaturesOpen(false);
                          }}
                        >
                          View All Features & Pricing
                        </Link>
                      </div>
                    )}
                  </div>

                  <Link
                    to="/pricing"
                    className="text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Pricing
                  </Link>
                  <Link
                    to="/about"
                    className="text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    About
                  </Link>
                </>
              )}
              <div className="flex flex-col space-y-2 pt-4 border-t border-border">
                <div className="px-2 py-1">
                  <ShoppingCart />
                </div>
                {!isAuthenticated ? (
                  <>
                    <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start font-medium">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setIsMenuOpen(false)}>
                      <Button className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity font-medium">
                        Get Started
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="px-2 py-1">
                      <p className="text-sm font-medium">Welcome, {user?.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {user?.role?.replace('_', ' ')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        logout();
                        setIsMenuOpen(false);
                      }}
                      className="w-full justify-start font-medium"
                    >
                      Sign Out
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
