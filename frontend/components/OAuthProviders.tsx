import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { readAttribution } from "@/lib/attribution";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "/api";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#0077B5" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M11.4 11.4H0V0h11.4v11.4z" fill="#F25022" />
    <path d="M24 11.4H12.6V0H24v11.4z" fill="#7FBA00" />
    <path d="M11.4 24H0V12.6h11.4V24z" fill="#00A4EF" />
    <path d="M24 24H12.6V12.6H24V24z" fill="#FFB900" />
  </svg>
);

const providers = [
  { key: "google", icon: <GoogleIcon />, name: "Google" },
  { key: "linkedin", icon: <LinkedInIcon />, name: "LinkedIn" },
  { key: "github", icon: <GitHubIcon />, name: "GitHub" },
  { key: "microsoft", icon: <MicrosoftIcon />, name: "Microsoft" },
] as const;

interface OAuthProvidersProps {
  mode: "login" | "signup";
  redirect?: string;
  /** Persona to create the account as when this is a signup surface. Forwarded
   *  as `?role=` and validated server-side; only applied to NEW OAuth accounts
   *  (existing users keep their role). Lets the affiliate / creator landing
   *  pages offer "Continue with Google" that lands on the right role. */
  role?: string;
  /** When true, the new OAuth account also gets an affiliate profile minted —
   *  parity with the password register's `enableAffiliate`. */
  enableAffiliate?: boolean;
}

export default function OAuthProviders({ mode, redirect = "/dashboard", role, enableAffiliate }: OAuthProvidersProps) {
  const { t } = useTranslation();
  const verb = mode === "login" ? t("auth.oauth.continueWith") : t("auth.oauth.signupWith");

  return (
    <div className="grid grid-cols-2 gap-2">
      {providers.map((p) => (
        <Button
          key={p.key}
          type="button"
          variant="outline"
          aria-label={`${verb} ${p.name}`}
          className="w-full flex items-center gap-2 min-h-[44px] px-2 sm:px-4"
          onClick={() => {
            // Forward captured attribution so OAuth signups credit the
            // affiliate + persist campaign UTMs the same as password signups
            // (gap #1683). The API signs these into the OAuth state.
            const attr = readAttribution();
            const params = new URLSearchParams({ redirect });
            // Signup intent — only meaningful on signup surfaces; the API
            // ignores it for existing accounts and validates the role.
            if (mode === "signup" && role) params.set("role", role);
            if (mode === "signup" && enableAffiliate) params.set("affiliate", "1");
            if (attr.ref) params.set("ref", attr.ref);
            if (attr.utmSource) params.set("utm_source", attr.utmSource);
            if (attr.utmMedium) params.set("utm_medium", attr.utmMedium);
            if (attr.utmCampaign) params.set("utm_campaign", attr.utmCampaign);
            if (attr.utmTerm) params.set("utm_term", attr.utmTerm);
            if (attr.utmContent) params.set("utm_content", attr.utmContent);
            window.location.href = `${API_BASE}/api/auth/oauth/${p.key}?${params.toString()}`;
          }}
        >
          {p.icon}
          <span className="hidden sm:inline">{verb} </span>
          {p.name}
        </Button>
      ))}
    </div>
  );
}
