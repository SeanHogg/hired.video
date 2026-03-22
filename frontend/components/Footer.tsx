import { Video, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Copyright from "./Copyright";
import LegalLinks from "./LegalLinks";
import { runtimeConfig } from "@/lib/runtime-config";

export default function Footer() {
  const [apiBuild, setApiBuild] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${runtimeConfig.apiUrl}/version`)
      .then((r) => r.json())
      .then((d: any) => setApiBuild(d?.build ?? null))
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <div className="relative">
                <Video className="h-8 w-8 text-primary" />
                <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                Hired.video
              </span>
            </Link>
            <p className="text-muted-foreground mb-4 max-w-md">
              All-in-one HR platform with employment-focused social media,
              referral network, ATS, Recruitment CRM, crowdsourcing, and
              recruitment marketing features to attract, retain, and promote
              talent.
            </p>
            <p className="text-sm text-muted-foreground">
              Empowering the future of talent acquisition and workforce
              management.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/features"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  to="/pricing"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  to="/resumes"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Video Resumes
                </Link>
              </li>
              <li>
                <Link
                  to="/jobs"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Job Board
                </Link>
              </li>
              <li>
                <Link
                  to="/companies"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  For Companies
                </Link>
              </li>
              <li>
                <Link
                  to="/affiliate-program"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Affiliate Program
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Support</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/help"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Help Center
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact Us
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  to="/careers"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Careers
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <Copyright />
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <LegalLinks />
            <span className="text-xs text-muted-foreground/60">
              UI {runtimeConfig.build}{apiBuild ? ` · API ${apiBuild}` : ""}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
