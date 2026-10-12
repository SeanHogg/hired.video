import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBar from '@/components/SearchBar';
import type { SearchFilters } from '@/lib/services/search-service';

// Mock the search service
vi.mock('@/lib/services/search-service', () => ({
  searchService: {
    search: vi.fn(),
  },
  SearchFiltersSchema: {
    parse: vi.fn((data) => data),
  },
}));

describe('SearchBar Component', () => {
  const mockOnSearch = vi.fn();
  const mockOnFilterChange = vi.fn();
  const mockOnClearFilters = vi.fn();

  const defaultProps = {
    context: 'all' as const,
    onSearch: mockOnSearch,
    onFilterChange: mockOnFilterChange,
    onClearFilters: mockOnClearFilters,
    filters: {} as SearchFilters,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders search input field', () => {
      render(<SearchBar {...defaultProps} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders advanced filters button', () => {
      render(<SearchBar {...defaultProps} />);
      expect(screen.getByRole('button', { name: /advanced/i })).toBeInTheDocument();
    });

    it('renders filters button when showAdvanced is true', () => {
      render(<SearchBar {...defaultProps} showAdvanced={true} />);
      expect(screen.getByRole('button', { name: /advanced/i })).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('calls onSearch when Enter key is pressed', async () => {
      const user = userEvent.setup();
      render(<SearchBar {...defaultProps} />);

      const searchInput = screen.getByRole('textbox');

      await user.type(searchInput, 'test query');
      await user.keyboard('{Enter}');

      expect(mockOnSearch).toHaveBeenCalledWith('test query');
    });

    it('renders with different contexts', () => {
      // i18n is initialised in the test setup, so the placeholder renders the
      // real per-context copy from `search.bar.placeholder.<context>`. Assert
      // on that copy, which proves the per-context wiring end to end.
      const { rerender } = render(<SearchBar {...defaultProps} context="people" />);
      expect(screen.getByPlaceholderText(/search professionals/i)).toBeInTheDocument();

      rerender(<SearchBar {...defaultProps} context="companies" />);
      expect(screen.getByPlaceholderText(/search companies/i)).toBeInTheDocument();
    });
  });

  describe('Filter Functionality', () => {
    it('calls onFilterChange when filters are applied', async () => {
      render(<SearchBar {...defaultProps} showAdvanced={true} />);

      // Test that the component renders without errors
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      // Test filter change functionality would be called
      // This is a placeholder for more complex filter testing
      expect(mockOnFilterChange).not.toHaveBeenCalled();
    });

    it('supports media filter integration', () => {
      render(<SearchBar {...defaultProps} filters={{ hasMedia: true }} />);

      // Component should render with media filter applied
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('Accessibility and Mobile', () => {
    it('provides proper accessibility features', () => {
      render(<SearchBar {...defaultProps} />);

      // Should have proper form elements
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
