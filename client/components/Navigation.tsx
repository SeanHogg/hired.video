import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Video, Sparkles } from "lucide-react";
import { useState } from "react";

interface NavigationProps {
  onMenuClick?: () => void;
}

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="relative">
              <Video className="h-8 w-8 text-primary" />
              <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
              MyVideoResume
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/features"
              className="text-foreground/70 hover:text-foreground transition-colors font-medium"
            >
              Features
            </Link>
            <Link
              to="/pricing"
              className="text-foreground/70 hover:text-foreground transition-colors font-medium"
            >
              Pricing
            </Link>
            <Link
              to="/for-recruiters"
              className="text-foreground/70 hover:text-foreground transition-colors font-medium"
            >
              For Recruiters
            </Link>
            <Link
              to="/about"
              className="text-foreground/70 hover:text-foreground transition-colors font-medium"
            >
              About
            </Link>
          </div>

          {/* Desktop CTA Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <Link to="/login">
              <Button variant="ghost" className="font-medium">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity font-medium">
                Get Started Free
              </Button>
            </Link>
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
              <Link
                to="/features"
                className="text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                onClick={() => setIsMenuOpen(false)}
              >
                Features
              </Link>
              <Link
                to="/pricing"
                className="text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                onClick={() => setIsMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link
                to="/for-recruiters"
                className="text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                onClick={() => setIsMenuOpen(false)}
              >
                For Recruiters
              </Link>
              <Link
                to="/about"
                className="text-foreground/70 hover:text-foreground transition-colors font-medium px-2 py-1"
                onClick={() => setIsMenuOpen(false)}
              >
                About
              </Link>
              <div className="flex flex-col space-y-2 pt-4 border-t border-border">
                <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start font-medium">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity font-medium">
                    Get Started Free
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
