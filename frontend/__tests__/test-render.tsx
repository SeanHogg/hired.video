/**
 * Shared test render helper for page/component tests.
 *
 * AppShell-based pages mount chrome that depends on app-root providers —
 * <MarketingPageVideo> (useQuery → QueryClient) and ToolPageHeader
 * (useEffectiveRole → usePersonaPreview). In production these live at the
 * App.tsx root; in isolated page tests they're absent, so every page test
 * was re-deriving the same provider stack (and the ones that forgot one
 * threw "No QueryClient set" / "usePersonaPreview must be used within
 * PersonaPreviewProvider").
 *
 * Wrap the unit under test here instead. The providers are the REAL ones
 * (not mocks) so the chrome renders the same code path it does in the app.
 * Per-test concerns (auth, services, step children) stay mocked in the
 * individual test files.
 */

import { type ReactElement } from "react";
import { vi } from "vitest";
import { render, type RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersonaPreviewProvider } from "@/providers/PersonaPreviewProvider";

/** Fresh client per render so query caches never bleed across tests, and
 *  retries are off so error-path assertions resolve on the first reject. */
function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <PersonaPreviewProvider>
        <BrowserRouter>{ui}</BrowserRouter>
      </PersonaPreviewProvider>
    </QueryClientProvider>,
    options,
  );
}

/**
 * Complete `useAuth()` return shape for page tests. AppShell mounts
 * <EmailVerificationBanner>, which destructures getVerificationStatus +
 * resendEmailVerification and probes the gate on mount — a partial stub
 * (just user/isAuthenticated) crashes the banner's effect once the page
 * renders fully. Feed this to `(useAuth as Mock).mockReturnValue(...)`.
 */
export function mockAuthValue(
  isAuthenticated: boolean,
  overrides?: Record<string, unknown>,
) {
  return {
    user: isAuthenticated ? { id: "u1", email: "x@y" } : null,
    isAuthenticated,
    isLoading: false,
    isEmailVerified: isAuthenticated,
    getVerificationStatus: vi.fn().mockResolvedValue({ emailConfirmed: true }),
    resendEmailVerification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
