import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import GlobalAIUsageBanner from "@/components/GlobalAIUsageBanner";
import GlobalExplicitContentNotice from "@/components/GlobalExplicitContentNotice";
import { TokenPackSheetHost } from "@/components/billing/TokenPackSheetHost";
import { BadgeUnlockToaster } from "@/components/badges/BadgeUnlockToaster";
import { CelebrationOverlay } from "@/components/points/CelebrationOverlay";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { DialogHost } from "@/components/ui/DialogHost";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIProvider } from "@/lib/ai-context";
import { AuthProvider } from "@/lib/auth";
import { LocaleSync } from "@/lib/i18n/LocaleSync";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { PermissionDebuggerProvider } from "@/providers/PermissionDebuggerProvider";
import { PersonaPreviewProvider } from "@/providers/PersonaPreviewProvider";
import { PermissionDebuggerPanel } from "@/components/PermissionDebuggerPanel";
import { CartProvider } from "@/lib/cart-context";
import { ContactPanelProvider } from "@/components/ContactPanel";
import { CommHubProvider } from "@/providers/CommHubProvider";
import { HeaderFiltersProvider } from "@/lib/header-filters";
import { logger } from "@/lib/logger";
import { reportError } from "@/lib/error-tracking";
import { GlobalChrome } from "@/components/app/GlobalChrome";
import {
  GTMPageTracker,
  PrintModeBodyAttribute,
  ReferralCapture,
} from "@/components/app/AppEffects";

/**
 * The app's provider stack + globally-mounted chrome, in the exact nesting
 * order the app root has always used. `children` is the route table
 * (rendered inside the router + every context provider).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      level="critical"
      onError={(error, errorInfo) => {
        logger.error("Critical application error", {
          error: error.message,
          errorInfo,
        });

        // Report to error tracking
        reportError(error, {
          type: "react-error-boundary",
          errorInfo,
        });
      }}
    >
      <QueryClientProvider client={queryClient}>
        {/* attribute="class" → toggles <html class="dark">, matching global.css
            + the no-FOUC bootstrap in index.html. enableSystem honours the OS
            preference for "system"; disableTransitionOnChange avoids a colour
            smear on every element when switching. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
        <AuthProvider>
          <LocaleSync />
          <ThemeSync />
          <PersonaPreviewProvider>
          <PermissionDebuggerProvider>
            <CartProvider>
              <AIProvider>
                <TooltipProvider>
                  <BrowserRouter>
                    {/* Global chrome lives inside <BrowserRouter> so any
                        surface that conditionally renders a <Link> /
                        useNavigate (e.g. AIUsageLimitErrorBanner) has
                        router context — mounting above caused a crash on
                        the first AI_USAGE_LIMIT_REACHED event. */}
                    <Toaster />
                    <DialogHost />
                    <Sonner />
                    <GlobalErrorHandler />
                    <GlobalAIUsageBanner />
                    <GlobalExplicitContentNotice />
                    <TokenPackSheetHost />
                    <BadgeUnlockToaster />
                    <CelebrationOverlay />
                    <CookieConsentBanner />
                    <PWAUpdatePrompt />
                    <HeaderFiltersProvider>
                    <CommHubProvider>
                    <ContactPanelProvider>
                    <ReferralCapture />
                    <GTMPageTracker />

                    {children}

                    <PrintModeBodyAttribute />

                    <GlobalChrome />
                    <PWAInstallPrompt />
                    </ContactPanelProvider>
                    </CommHubProvider>
                    </HeaderFiltersProvider>
                  </BrowserRouter>
                </TooltipProvider>
              </AIProvider>
            </CartProvider>
            <PermissionDebuggerPanel />
          </PermissionDebuggerProvider>
          </PersonaPreviewProvider>
        </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
