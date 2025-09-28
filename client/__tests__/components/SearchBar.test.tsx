import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SearchBar, { type SearchFilters } from '../../components/SearchBar';

describe('SearchBar Component', () => {
  const defaultProps = {
    context: 'all' as const,
    onSearch: vi.fn(),
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('renders search input with correct placeholder', () => {
      render(<SearchBar {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('renders custom placeholder when provided', () => {
      render(
        <SearchBar 
          {...defaultProps} 
          placeholder="Custom search placeholder" 
        />
      );
      
      const searchInput = screen.getByPlaceholderText('Custom search placeholder');
      expect(searchInput).toBeInTheDocument();
    });

    it('calls onSearch when user types in search input', async () => {
      const user = userEvent.setup();
      const mockOnSearch = vi.fn();

      render(<SearchBar {...defaultProps} onSearch={mockOnSearch} />);

      const searchInput = screen.getByPlaceholderText(/search videos, professions, companies/i);
      await user.type(searchInput, 'test query');

      expect(mockOnSearch).toHaveBeenCalledWith('test query');
    });

    it('displays initial value in search input', () => {
      render(<SearchBar {...defaultProps} value="initial search" />);
      
      const searchInput = screen.getByDisplayValue('initial search');
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Context-Specific Behavior', () => {
    it('renders people context with correct placeholder', () => {
      render(<SearchBar {...defaultProps} context="people" />);
      
      const searchInput = screen.getByPlaceholderText(/search professionals by name, role, or skills/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('renders companies context with correct placeholder', () => {
      render(<SearchBar {...defaultProps} context="companies" />);
      
      const searchInput = screen.getByPlaceholderText(/search companies, industries, or locations/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('renders resumes context with correct placeholder', () => {
      render(<SearchBar {...defaultProps} context="resumes" />);
      
      const searchInput = screen.getByPlaceholderText(/search resumes by name, title, or skills/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('renders jobs context with correct placeholder', () => {
      render(<SearchBar {...defaultProps} context="jobs" />);
      
      const searchInput = screen.getByPlaceholderText(/search jobs, companies, or skills/i);
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Advanced Filters (All Context)', () => {
    it('shows advanced button for all context', () => {
      render(<SearchBar {...defaultProps} context="all" />);
      
      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      expect(advancedButton).toBeInTheDocument();
    });

    it('toggles advanced filters panel when clicked', async () => {
      const user = userEvent.setup();
      
      render(<SearchBar {...defaultProps} context="all" />);
      
      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);
      
      expect(screen.getByText(/advanced filters/i)).toBeInTheDocument();
    });

    it('renders all advanced filter options', async () => {
      const user = userEvent.setup();
      
      render(<SearchBar {...defaultProps} context="all" />);
      
      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);
      
      await waitFor(() => {
        expect(screen.getByText(/search radius/i)).toBeInTheDocument();
        expect(screen.getByText(/experience level/i)).toBeInTheDocument();
        expect(screen.getByText(/education/i)).toBeInTheDocument();
        expect(screen.getByText(/date posted/i)).toBeInTheDocument();
      });
    });

    it('applies search radius filter', async () => {
      const user = userEvent.setup();
      const mockOnFilterChange = vi.fn();

      render(
        <SearchBar
          {...defaultProps}
          context="all"
          onFilterChange={mockOnFilterChange}
        />
      );

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      const radiusSelect = screen.getByDisplayValue('25 miles');
      await user.click(radiusSelect);

      const option50Miles = screen.getByText('50 miles');
      await user.click(option50Miles);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ searchRadius: '50' })
      );
    });

    it('applies experience level filter', async () => {
      const user = userEvent.setup();
      const mockOnFilterChange = vi.fn();

      render(
        <SearchBar
          {...defaultProps}
          context="all"
          onFilterChange={mockOnFilterChange}
        />
      );

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      const experienceSelect = screen.getByDisplayValue('All Levels');
      await user.click(experienceSelect);

      const seniorOption = screen.getByText('Senior Level');
      await user.click(seniorOption);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ experienceLevel: 'senior' })
      );
    });

    it('applies education filter', async () => {
      const user = userEvent.setup();
      const mockOnFilterChange = vi.fn();

      render(
        <SearchBar
          {...defaultProps}
          context="all"
          onFilterChange={mockOnFilterChange}
        />
      );

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      const educationSelect = screen.getByDisplayValue('All Education');
      await user.click(educationSelect);

      const bachelorOption = screen.getByText("Bachelor's Degree");
      await user.click(bachelorOption);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ education: 'bachelor' })
      );
    });

    it('applies date posted filter', async () => {
      const user = userEvent.setup();
      const mockOnFilterChange = vi.fn();

      render(
        <SearchBar
          {...defaultProps}
          context="all"
          onFilterChange={mockOnFilterChange}
        />
      );

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      const dateSelect = screen.getByDisplayValue('Any Time');
      await user.click(dateSelect);

      const weekOption = screen.getByText('Last week');
      await user.click(weekOption);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ datePosted: 'week' })
      );
    });

    it('applies media filter', async () => {
      const user = userEvent.setup();
      const mockOnFilterChange = vi.fn();

      render(
        <SearchBar
          {...defaultProps}
          context="all"
          onFilterChange={mockOnFilterChange}
        />
      );

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      const mediaSelect = screen.getByDisplayValue('All Content');
      await user.click(mediaSelect);

      const withMediaOption = screen.getByText('With Videos/Images');
      await user.click(withMediaOption);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ hasMedia: true })
      );
    });

    it('renders media filter in advanced filters', async () => {
      const user = userEvent.setup();

      render(<SearchBar {...defaultProps} context="all" />);

      const advancedButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(advancedButton);

      await waitFor(() => {
        expect(screen.getByText(/media content/i)).toBeInTheDocument();
      });
    });
  });

  describe('Context-Specific Filters', () => {
    it('shows filters button for non-all contexts', () => {
      render(<SearchBar {...defaultProps} context="people" />);
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      expect(filtersButton).toBeInTheDocument();
    });

    it('toggles filters panel for people context', async () => {
      const user = userEvent.setup();
      
      render(<SearchBar {...defaultProps} context="people" />);
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filtersButton);
      
      expect(screen.getByText(/people filters/i)).toBeInTheDocument();
    });

    it('renders people-specific filters', async () => {
      const user = userEvent.setup();
      
      render(<SearchBar {...defaultProps} context="people" />);
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filtersButton);
      
      await waitFor(() => {
        expect(screen.getByText(/role/i)).toBeInTheDocument();
        expect(screen.getByText(/location/i)).toBeInTheDocument();
        expect(screen.getByText(/skills/i)).toBeInTheDocument();
        expect(screen.getByText(/availability/i)).toBeInTheDocument();
      });
    });

    it('renders company-specific filters', async () => {
      const user = userEvent.setup();
      
      render(<SearchBar {...defaultProps} context="companies" />);
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filtersButton);
      
      await waitFor(() => {
        expect(screen.getByText(/industry/i)).toBeInTheDocument();
        expect(screen.getByText(/company size/i)).toBeInTheDocument();
        expect(screen.getByText(/location/i)).toBeInTheDocument();
      });
    });

    it('renders job-specific filters', async () => {
      const user = userEvent.setup();
      
      render(<SearchBar {...defaultProps} context="jobs" />);
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filtersButton);
      
      await waitFor(() => {
        expect(screen.getByText(/employment type/i)).toBeInTheDocument();
        expect(screen.getByText(/remote/i)).toBeInTheDocument();
        expect(screen.getByText(/salary range/i)).toBeInTheDocument();
      });
    });
  });

  describe('Filter State Management', () => {
    it('displays active filter count', async () => {
      const user = userEvent.setup();
      const filters: SearchFilters = {
        role: 'job_seeker',
        location: 'New York',
        skills: 'React',
      };
      
      render(
        <SearchBar 
          {...defaultProps} 
          context="people" 
          filters={filters}
        />
      );
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      expect(filtersButton).toHaveTextContent('3');
    });

    it('clears all filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnClearFilters = vi.fn();

      render(
        <SearchBar
          {...defaultProps}
          context="people"
          onClearFilters={mockOnClearFilters}
        />
      );

      const filtersButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filtersButton);

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearButton);

      expect(mockOnClearFilters).toHaveBeenCalled();
    });

    it('preserves filter values when panel is reopened', async () => {
      const user = userEvent.setup();
      const filters: SearchFilters = {
        experienceLevel: 'senior',
        location: 'San Francisco',
      };
      
      render(
        <SearchBar 
          {...defaultProps} 
          context="people" 
          filters={filters}
        />
      );
      
      const filtersButton = screen.getByRole('button', { name: /filters/i });
      await user.click(filtersButton);
      
      expect(screen.getByDisplayValue('Senior Level')).toBeInTheDocument();
      expect(screen.getByDisplayValue('San Francisco')).toBeInTheDocument();
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
    });

    it('renders mobile-friendly layout', () => {
      render(<SearchBar {...defaultProps} />);
      
      const container = screen.getByPlaceholderText(/search videos, professions, companies/i).closest('div');
      expect(container).toHaveClass('flex-col', 'md:flex-row');
    });

    it('stacks search and filter buttons vertically on mobile', () => {
      render(<SearchBar {...defaultProps} context="people" />);
      
      const buttonContainer = screen.getByRole('button', { name: /filters/i }).parentElement;
      expect(buttonContainer).toHaveClass('flex', 'gap-2');
    });
  });
});
