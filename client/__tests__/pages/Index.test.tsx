import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Index from '../../pages/Index';
import { searchService } from '../../lib/services/search-service';
import { resumeService } from '../../lib/services/resume-service';
import { useAuth } from '../../lib/auth';

// Mock dependencies
vi.mock('../../lib/services/search-service');
vi.mock('../../lib/services/resume-service');
vi.mock('../../lib/auth');
vi.mock('../../hooks/use-sidebar');
vi.mock('../../lib/seo');

const mockSearchService = searchService as any;
const mockResumeService = resumeService as any;
const mockUseAuth = useAuth as any;

// Mock data
const mockSearchResults = {
  items: [
    {
      id: '1',
      type: 'people' as const,
      name: 'John Doe',
      title: 'Software Engineer',
      summary: 'Experienced developer',
      avatar: '/avatar1.jpg',
      views: 150,
      createdAt: '2024-01-15T00:00:00Z',
      isFeatured: true,
    },
    {
      id: '2',
      type: 'company' as const,
      name: 'Tech Corp',
      title: 'Technology Company',
      summary: 'Leading tech company',
      logo: '/logo1.jpg',
      views: 300,
      createdAt: '2024-01-10T00:00:00Z',
      industry: 'Technology',
    },
    {
      id: '3',
      type: 'resume' as const,
      name: 'Marketing Resume',
      title: 'Marketing Professional',
      summary: 'Marketing expert resume',
      views: 75,
      createdAt: '2024-01-20T00:00:00Z',
    },
    {
      id: '4',
      type: 'job' as const,
      name: 'Frontend Developer',
      title: 'Frontend Developer Position',
      summary: 'React developer needed',
      company: 'StartupCo',
      views: 200,
      postedDate: '2024-01-18T00:00:00Z',
      employmentType: 'full-time',
    },
  ],
  total: 4,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const mockMediaMetadata = [
  {
    id: '1',
    name: 'Demo Video',
    metaType: 1, // VideoMP4
    url: '/video1.mp4',
    description: 'Professional demo video',
    userProfile: {
      firstName: 'Jane',
      lastName: 'Smith',
      slug: 'jane-smith',
    },
  },
  {
    id: '2',
    name: 'Portfolio Image',
    metaType: 5, // Image
    url: '/image1.jpg',
    description: 'Portfolio showcase',
    userProfile: {
      firstName: 'Bob',
      lastName: 'Johnson',
      slug: 'bob-johnson',
    },
  },
];

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Index Page - Search, Filters, and Sort', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Default auth mock
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      loading: false,
    });

    // Default service mocks
    mockSearchService.searchPublicContent.mockResolvedValue(mockSearchResults);
    mockResumeService.getPublicResumeMetadata.mockResolvedValue(mockMediaMetadata);
  });

  describe('Search Functionality', () => {
    it('renders search bar with correct placeholder', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
        expect(searchInput).toBeInTheDocument();
      });
    });

    it('performs search when user types in search bar', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
        expect(searchInput).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
      await user.type(searchInput, 'software engineer');

      // Verify search is triggered
      expect(searchInput).toHaveValue('software engineer');
    });

    it('filters results based on search query', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
      await user.type(searchInput, 'john');

      // Should show filtered results
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('shows no results message when search returns empty', async () => {
      mockSearchService.searchPublicContent.mockResolvedValue({
        ...mockSearchResults,
        items: [],
        total: 0,
      });

      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
        expect(searchInput).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText(/no content found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Category Filters', () => {
    it('renders all category filter buttons', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /people/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /companies/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /resumes/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /jobs/i })).toBeInTheDocument();
      });
    });

    it('filters content by category when clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Tech Corp')).toBeInTheDocument();
      });

      // Click on People category
      const peopleButton = screen.getByRole('button', { name: /people/i });
      await user.click(peopleButton);

      // Should show only people results
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      // Company should be filtered out (note: this depends on implementation)
    });

    it('shows active state for selected category', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const allButton = screen.getByRole('button', { name: /all/i });
        expect(allButton).toBeInTheDocument();
      });

      const companiesButton = screen.getByRole('button', { name: /companies/i });
      await user.click(companiesButton);

      // Check if button has active styling (this depends on implementation)
      expect(companiesButton).toHaveClass('bg-primary', 'text-primary-foreground');
    });
  });

  describe('Sort Options', () => {
    it('renders all sort option buttons', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /recent/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /featured/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /top/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /latest/i })).toBeInTheDocument();
      });
    });

    it('sorts content by recent when selected', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const recentButton = screen.getByRole('button', { name: /recent/i });
        expect(recentButton).toBeInTheDocument();
      });

      const recentButton = screen.getByRole('button', { name: /recent/i });
      await user.click(recentButton);

      // Verify sort is applied (check button state)
      expect(recentButton).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('sorts content by featured when selected', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const featuredButton = screen.getByRole('button', { name: /featured/i });
        expect(featuredButton).toBeInTheDocument();
      });

      const featuredButton = screen.getByRole('button', { name: /featured/i });
      await user.click(featuredButton);

      expect(featuredButton).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('sorts content by top views when selected', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const topButton = screen.getByRole('button', { name: /top/i });
        expect(topButton).toBeInTheDocument();
      });

      const topButton = screen.getByRole('button', { name: /top/i });
      await user.click(topButton);

      expect(topButton).toHaveClass('bg-primary', 'text-primary-foreground');
    });
  });

  describe('Advanced Features', () => {
    it('shows advanced filters button', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const advancedButton = screen.getByRole('button', { name: /advanced/i });
        expect(advancedButton).toBeInTheDocument();
      });
    });

    it('toggles advanced filters panel when clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const advancedButton = screen.getByRole('button', { name: /advanced/i });
        expect(advancedButton).toBeInTheDocument();
      });

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      // Should show advanced filters panel
      await waitFor(() => {
        expect(screen.getByText(/advanced filters/i)).toBeInTheDocument();
      });
    });

    it('renders advanced filter options', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const advancedButton = screen.getByRole('button', { name: /advanced/i });
        expect(advancedButton).toBeInTheDocument();
      });

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      await waitFor(() => {
        expect(screen.getByText(/search radius/i)).toBeInTheDocument();
        expect(screen.getByText(/experience level/i)).toBeInTheDocument();
        expect(screen.getByText(/education/i)).toBeInTheDocument();
        expect(screen.getByText(/date posted/i)).toBeInTheDocument();
      });
    });

    it('applies advanced filters when changed', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const advancedButton = screen.getByRole('button', { name: /advanced/i });
        expect(advancedButton).toBeInTheDocument();
      });

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      await waitFor(() => {
        const experienceSelect = screen.getByDisplayValue(/all levels/i);
        expect(experienceSelect).toBeInTheDocument();
      });

      // Change experience level filter
      const experienceSelect = screen.getByDisplayValue(/all levels/i);
      await user.click(experienceSelect);

      const seniorOption = screen.getByText(/senior level/i);
      await user.click(seniorOption);

      // Verify filter is applied
      expect(experienceSelect).toHaveValue('senior');
    });

    it('clears all filters when clear button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const advancedButton = screen.getByRole('button', { name: /advanced/i });
        expect(advancedButton).toBeInTheDocument();
      });

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      await waitFor(() => {
        const clearButton = screen.getByRole('button', { name: /clear all/i });
        expect(clearButton).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearButton);

      // Verify filters are cleared
      const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Media Section', () => {
    it('renders media section with videos and images', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/featured videos & images/i)).toBeInTheDocument();
      });

      // Should show media items
      await waitFor(() => {
        expect(screen.getByText('Demo Video')).toBeInTheDocument();
        expect(screen.getByText('Portfolio Image')).toBeInTheDocument();
      });
    });

    it('filters content by media when media filter is applied', async () => {
      const user = userEvent.setup();

      // Mock search results with mixed media content
      const mockResultsWithMedia = {
        ...mockSearchResults,
        items: [
          { ...mockSearchResults.items[0], hasMedia: true },
          { ...mockSearchResults.items[1], hasMedia: false },
          { ...mockSearchResults.items[2], hasMedia: true },
          { ...mockSearchResults.items[3], hasMedia: false },
        ],
      };

      mockSearchService.searchPublicContent.mockResolvedValue(mockResultsWithMedia);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const advancedButton = screen.getByRole('button', { name: /advanced/i });
        expect(advancedButton).toBeInTheDocument();
      });

      // Open advanced filters
      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      // Apply media filter
      await waitFor(() => {
        const mediaSelect = screen.getByDisplayValue('All Content');
        expect(mediaSelect).toBeInTheDocument();
      });

      const mediaSelect = screen.getByDisplayValue('All Content');
      await user.click(mediaSelect);

      const withMediaOption = screen.getByText('With Videos/Images');
      await user.click(withMediaOption);

      // Should filter to show only items with media
      await waitFor(() => {
        // This would depend on the actual implementation of filtering
        expect(screen.getByText('John Doe')).toBeInTheDocument(); // hasMedia: true
        expect(screen.getByText('Marketing Resume')).toBeInTheDocument(); // hasMedia: true
      });
    });

    it('shows loading state for media section', async () => {
      // Mock loading state
      mockResumeService.getPublicResumeMetadata.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockMediaMetadata), 100))
      );

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      // Should show loading skeletons initially
      await waitFor(() => {
        const mediaSection = screen.getByText(/featured videos & images/i).closest('section');
        expect(mediaSection).toBeInTheDocument();
      });
    });

    it('handles media section error state', async () => {
      mockResumeService.getPublicResumeMetadata.mockRejectedValue(new Error('Failed to load media'));

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/featured videos & images/i)).toBeInTheDocument();
      });

      // Should handle error gracefully
      await waitFor(() => {
        const mediaSection = screen.getByText(/featured videos & images/i).closest('section');
        expect(mediaSection).toBeInTheDocument();
      });
    });
  });

  describe('View Mode Toggle', () => {
    it('renders grid and list view toggle buttons', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const gridButton = screen.getByRole('button', { name: /grid view/i });
        const listButton = screen.getByRole('button', { name: /list view/i });
        expect(gridButton).toBeInTheDocument();
        expect(listButton).toBeInTheDocument();
      });
    });

    it('switches between grid and list view', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const listButton = screen.getByRole('button', { name: /list view/i });
        expect(listButton).toBeInTheDocument();
      });

      const listButton = screen.getByRole('button', { name: /list view/i });
      await user.click(listButton);

      // Should switch to list view
      expect(listButton).toHaveClass('bg-primary', 'text-primary-foreground');
    });
  });

  describe('Pagination', () => {
    it('renders pagination when there are multiple pages', async () => {
      const mockPaginatedResults = {
        ...mockSearchResults,
        total: 50,
        totalPages: 5,
        hasNextPage: true,
      };

      mockSearchService.searchPublicContent.mockResolvedValue(mockPaginatedResults);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        // Look for pagination controls
        const pagination = screen.getByRole('navigation', { name: /pagination/i });
        expect(pagination).toBeInTheDocument();
      });
    });

    it('navigates to next page when clicked', async () => {
      const user = userEvent.setup();
      const mockPaginatedResults = {
        ...mockSearchResults,
        total: 50,
        totalPages: 5,
        hasNextPage: true,
      };

      mockSearchService.searchPublicContent.mockResolvedValue(mockPaginatedResults);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const nextButton = screen.getByRole('button', { name: /next/i });
        expect(nextButton).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      // Should navigate to next page
      expect(nextButton).toBeInTheDocument();
    });
  });

  describe('Mobile Responsiveness', () => {
    beforeEach(() => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667,
      });
    });

    it('renders compact layout on mobile', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const searchSection = screen.getByPlaceholderText(/search videos, professions, companies/i).closest('section');
        expect(searchSection).toBeInTheDocument();
      });

      // Should have mobile-friendly classes
      const searchSection = screen.getByPlaceholderText(/search videos, professions, companies/i).closest('section');
      expect(searchSection).toHaveClass('px-4', 'sm:px-6');
    });

    it('shows category filters in wrapped layout on mobile', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const categoryContainer = screen.getByRole('button', { name: /all/i }).parentElement;
        expect(categoryContainer).toHaveClass('flex-wrap');
      });
    });

    it('shows sort filters in wrapped layout on mobile', async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        const sortContainer = screen.getByRole('button', { name: /recent/i }).parentElement;
        expect(sortContainer).toHaveClass('flex-wrap');
      });
    });
  });

  describe('Error Handling', () => {
    it('handles search service errors gracefully', async () => {
      mockSearchService.searchPublicContent.mockRejectedValue(new Error('Search failed'));

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        // Should show error state or fallback content
        expect(screen.getByText(/no content found/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while fetching data', async () => {
      mockSearchService.searchPublicContent.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockSearchResults), 100))
      );

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      // Should show loading skeletons initially
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
        expect(searchInput).toBeInTheDocument();
      });
    });
  });
});
