/**
 * Comprehensive test utilities
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { vi, expect } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/lib/auth';
import type { Company } from '@/types/company';
import type { Job } from '@/types/job';
import type { UserProfile } from '@/types/people';
import type { Resume } from '@/types/resume';
import { TEST_CONFIG } from '../test-setup';

// ============================================================================
// RENDER UTILITIES
// ============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  user?: any;
  queryClient?: QueryClient;
}

/**
 * Custom render function with all providers
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
): RenderResult {
  const {
    initialEntries = ['/'],
    user = null,
    queryClient = createTestQueryClient(),
    ...renderOptions
  } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider initialUser={user}>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Creates a test query client with disabled retries and caching
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0, // Renamed from cacheTime in newer versions
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

/**
 * Creates a mock user profile
 */
export function createMockUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'mock-user-id',
    slug: 'mock-user',
    data: {
      firstName: 'Mock',
      lastName: 'User',
      avatar: 'https://example.com/avatar.jpg',
      headline: 'Mock User Headline',
      summary: 'Mock user summary',
      location: {
        city: 'Mock City',
        state: 'Mock State',
        country: 'Mock Country',
        remote: true,
      },
      contact: {
        email: 'mock@example.com',
        phone: '+1234567890',
        website: 'https://mockuser.com',
        linkedin: 'https://linkedin.com/in/mockuser',
        github: 'https://github.com/mockuser',
        twitter: '@mockuser',
      },
      experience: [],
      education: [],
      skills: [],
      projects: [],
      languages: ['English'],
      interests: ['Technology'],
      achievements: [],
      certifications: [],
      openToWork: true,
      openToOpportunities: ['full-time'],
      preferredRoles: ['Developer'],
      salaryExpectation: {
        min: 50000,
        max: 100000,
        currency: 'USD',
      },
    },
    role: 'job_seeker',
    status: 'active',
    visibility: 'public',
    isVerified: false,
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastActiveAt: '2024-01-01T00:00:00Z',
    profileViews: 0,
    connectionCount: 0,
    followerCount: 0,
    ...overrides,
  };
}

/**
 * Creates a mock company
 */
export function createMockCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'mock-company-id',
    slug: 'mock-company',
    data: {
      name: 'Mock Company',
      description: 'A mock company for testing',
      website: 'https://mockcompany.com',
      logo: 'https://example.com/logo.jpg',
      industry: 'Technology',
      size: '51-200',
      founded: 2020,
      headquarters: {
        city: 'Mock City',
        state: 'Mock State',
        country: 'Mock Country',
        remote: false,
      },
      contact: {
        email: 'contact@mockcompany.com',
        phone: '+1234567890',
        website: 'https://mockcompany.com',
      },
      benefits: {
        healthInsurance: true,
        dentalInsurance: true,
        visionInsurance: false,
        retirement401k: true,
        retirementPlan: true,
        stockOptions: false,
        paidTimeOff: true,
        parentalLeave: true,
        flexibleSchedule: true,
        remoteWork: true,
        learningBudget: false,
        professionalDevelopment: true,
        gymMembership: false,
        freeFood: false,
        commuteBenefits: false,
      },
      culture: ['Innovation'],
      technologies: ['React', 'TypeScript'],
      techStack: ['React', 'TypeScript'],
      perks: ['Free snacks', 'Flexible hours'],
    },
    status: 'active',
    visibility: 'public',
    onboardingTasks: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    views: 0,
    followers: 0,
    jobCount: 0,
    activeJobCount: 0,
    userId: 'mock-user-id',
    teamMembers: [],
    ...overrides,
  };
}

/**
 * Creates a mock job
 */
export function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'mock-job-id',
    slug: 'mock-job',
    data: {
      title: 'Mock Job Title',
      summary: 'Mock job summary',
      description: 'A mock job description',
      requirements: [
        {
          skill: 'React',
          level: 'Intermediate',
          required: true,
        },
      ],
      responsibilities: ['Responsibility 1'],
      qualifications: ['Qualification 1', 'Qualification 2'],
      skills: ['React', 'TypeScript'],
      experienceLevel: 'mid',
      employmentType: 'full-time',
      location: {
        city: 'Mock City',
        state: 'Mock State',
        country: 'Mock Country',
        remote: true,
        hybrid: false,
      },
      salaryMin: 50000,
      salaryMax: 100000,
      currency: 'USD',
      benefits: [
        {
          type: 'Health Insurance',
          description: 'Comprehensive health coverage',
        },
      ],
      company: {
        name: 'Mock Company',
        logo: 'https://example.com/logo.jpg',
        website: 'https://mockcompany.com',
        size: '51-200',
        industry: 'Technology',
      },
      applicationDeadline: '2024-12-31T23:59:59Z',
    },
    status: 'active',
    privacy: 'public',
    visibility: 'public',
    companyId: 'mock-company-id',
    userId: 'mock-user-id',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    views: 0,
    applications: 0,
    ...overrides,
  };
}

/**
 * Creates a mock resume
 */
export function createMockResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'mock-resume-id',
    slug: 'mock-resume',
    name: 'Mock Resume',
    data: {
      Basics: {
        Name: 'Mock User',
        Label: 'Software Developer',
        Email: 'mock@example.com',
        Phone: '+1234567890',
        Url: 'https://mockuser.com',
        Summary: 'Mock resume summary',
        Location: {
          Address: '123 Mock St',
          City: 'Mock City',
          Region: 'Mock State',
          PostalCode: '12345',
          CountryCode: 'US',
        },
        Image: 'https://example.com/avatar.jpg',
      },
      Work: [],
      Volunteer: [],
      Education: [],
      Skills: [],
      Projects: [],
      Awards: [],
      Certificates: [],
      Publications: [],
      Languages: [],
      Interests: [],
      References: [],
      Meta: {
        version: '1.0.0',
      },
    },
    privacy: 'private',
    isMaster: false,
    isActive: false,
    parentId: undefined,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    views: 0,
    userId: 'mock-user-id',
    ...overrides,
  };
}

// ============================================================================
// MOCK FUNCTIONS
// ============================================================================

/**
 * Mock localStorage
 */
export function mockLocalStorage() {
  const store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length;
    },
  };
}

/**
 * Mock fetch with custom responses
 */
export function mockFetch(responses: Record<string, any> = {}) {
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method || 'GET';
    const key = `${method} ${url}`;

    const response = responses[key] || responses[url] || { data: null };

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    });
  });
}

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock timer utilities
 */
export function mockTimers() {
  vi.useFakeTimers();

  return {
    advanceTimersByTime: vi.advanceTimersByTime,
    runAllTimers: vi.runAllTimers,
    runOnlyPendingTimers: vi.runOnlyPendingTimers,
    restore: vi.useRealTimers,
  };
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Assert that an element has specific text content
 */
export function expectTextContent(element: HTMLElement, text: string) {
  expect(element.textContent).toContain(text);
}

/**
 * Assert that an element is visible
 */
export function expectVisible(element: HTMLElement) {
  expect(element.style.display).not.toBe('none');
}

/**
 * Assert that an element is not in the document
 */
export function expectNotInDocument(element: HTMLElement | null) {
  expect(element).toBeNull();
}

// Re-export everything from testing library
export * from '@testing-library/react';
export * from '@testing-library/user-event';
export { default as userEvent } from '@testing-library/user-event';
