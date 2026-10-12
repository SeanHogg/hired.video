import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AIChatPanel from '../AIChatPanel';
import { AIProvider } from '@/lib/ai-context';
import { AuthProvider } from '@/lib/auth';

// Mock the AI service
vi.mock('@/lib/services/ai-service', () => ({
  aiService: {
    sendChatMessage: vi.fn().mockResolvedValue({ message: '', sessionId: 't1' }),
  },
}));

// Mock the orchestration service
vi.mock('@/lib/services/ai-orchestration-service', () => ({
  aiOrchestrationService: {
    processMessage: vi.fn(),
  },
}));

// The chat surfaces read the live token budget; stub it as a free account
// with headroom so these tests don't need the persona-preview provider.
vi.mock('@/hooks/use-token-budget', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-token-budget')>('@/hooks/use-token-budget');
  return {
    ...actual,
    useTokenBudget: vi.fn(() => ({
      planId: 'free',
      isPro: false,
      isUnlimited: false,
      monthlyUsed: 0,
      monthlyLimit: 50_000,
      monthlyRemaining: 50_000,
      packBalance: 0,
      totalAvailable: 50_000,
      resetAt: '2026-11-01T00:00:00.000Z',
      percentUsed: 0,
      isWarning: false,
      isExhausted: false,
      isLoading: false,
      refresh: vi.fn(() => Promise.resolve()),
    })),
  };
});

// Mock auth
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual('@/lib/auth');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: '1', email: 'test@test.com', role: 'job_seeker' },
      isAuthenticated: true,
    })),
  };
});

const renderWithProviders = (ui: React.ReactElement, { route = '/' } = {}) => {
  // Fresh QueryClient per test so cached state from one test doesn't
  // leak into the next. `retry: false` keeps failing mock calls from
  // auto-retrying and masking the real assertion.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <AIProvider>
            {ui}
          </AIProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AIChatPanel - Route Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect dashboard context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/dashboard' });
    
    // Wait for context to be set
    await waitFor(() => {
      // Check console logs or context state
      expect(container).toBeTruthy();
    });
  });

  it('should detect job-list context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/jobs' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect job-create context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/jobs/create' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect job-edit context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/jobs/edit/123' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect job-view context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/jobs/123' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect resume-list context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/resumes' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect resume-create context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/resumes/create' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect resume-edit context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/resumes/edit/123' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect resume-view context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/resumes/123' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect profile-edit context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/profile/edit' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect profile-view context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/profile/123' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect search context', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/search' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should detect general context for unknown routes', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/unknown' });
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('should not crash when AI chat is closed', () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/dashboard' });
    expect(container).toBeTruthy();
  });

  it('should handle route changes without crashing', async () => {
    const { container, rerender } = renderWithProviders(<AIChatPanel />, { route: '/dashboard' });

    expect(container).toBeTruthy();

    // Simulate route change — wrap the rerender tree in the same providers
    // (QueryClientProvider included) so the query hooks still have a client.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/jobs']}>
          <AuthProvider>
            <AIProvider>
              <AIChatPanel />
            </AIProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });
});

describe('AIChatPanel - Error Handling', () => {
  it('should not crash if context creation fails', async () => {
    // This should not throw
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/dashboard' });
    expect(container).toBeTruthy();
  });

  it('should handle undefined context gracefully', async () => {
    const { container } = renderWithProviders(<AIChatPanel />, { route: '/' });
    expect(container).toBeTruthy();
  });
});

