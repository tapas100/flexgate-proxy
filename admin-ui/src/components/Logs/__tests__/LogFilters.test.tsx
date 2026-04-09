// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LogFilters from '../LogFilters';
import type { LogFilter } from '../../types';

const mockFilter: LogFilter = {
  levels: [],
  sources: [],
  timeRange: '1h',
  searchQuery: '',
  isRegex: false,
};

describe('LogFilters', () => {
  const mockOnFilterChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all filter controls', () => {
    render(<LogFilters filter={mockFilter} onFilterChange={mockOnFilterChange} />);

    // Should have level filter
    expect(screen.getByText(/Levels/i)).toBeInTheDocument();

    // Should have source filter
    expect(screen.getByText(/Sources/i)).toBeInTheDocument();

    // Should have time range buttons
    expect(screen.getByText('5m')).toBeInTheDocument();
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('1H')).toBeInTheDocument();
    expect(screen.getByText('6H')).toBeInTheDocument();
    expect(screen.getByText('24H')).toBeInTheDocument();

    // Should have search input
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('should call onFilterChange when level is selected', () => {
    render(<LogFilters filter={mockFilter} onFilterChange={mockOnFilterChange} />);

    // Click on level select
    const levelSelect = screen.getByLabelText(/Levels/i);
    fireEvent.mouseDown(levelSelect);

    // Select ERROR
    const errorOption = screen.getByText('ERROR');
    fireEvent.click(errorOption);

    expect(mockOnFilterChange).toHaveBeenCalled();
  });

  it('should call onFilterChange when source is selected', () => {
    render(<LogFilters filter={mockFilter} onFilterChange={mockOnFilterChange} />);

    // Click on source select
    const sourceSelect = screen.getByLabelText(/Sources/i);
    fireEvent.mouseDown(sourceSelect);

    // Select proxy
    const proxyOption = screen.getByText('proxy');
    fireEvent.click(proxyOption);

    expect(mockOnFilterChange).toHaveBeenCalled();
  });

  it('should call onFilterChange when time range is clicked', () => {
    render(<LogFilters filter={mockFilter} onFilterChange={mockOnFilterChange} />);

    const timeRangeButton = screen.getByText('24H');
    fireEvent.click(timeRangeButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange: '24h',
      })
    );
  });

  it('should call onFilterChange when search query is entered', () => {
    render(<LogFilters filter={mockFilter} onFilterChange={mockOnFilterChange} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'error' } });

    expect(mockOnFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: 'error',
      })
    );
  });

  it('should toggle regex mode', () => {
    render(<LogFilters filter={mockFilter} onFilterChange={mockOnFilterChange} />);

    const regexCheckbox = screen.getByLabelText(/regex/i);
    fireEvent.click(regexCheckbox);

    expect(mockOnFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isRegex: true,
      })
    );
  });

  it('should display selected filters as chips', () => {
    const filterWithSelections: LogFilter = {
      levels: ['ERROR', 'WARN'],
      sources: ['proxy'],
      timeRange: '1h',
      searchQuery: '',
      isRegex: false,
    };

    render(<LogFilters filter={filterWithSelections} onFilterChange={mockOnFilterChange} />);

    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('WARN')).toBeInTheDocument();
    expect(screen.getByText('proxy')).toBeInTheDocument();
  });

  it('should highlight active time range', () => {
    const filterWith24h: LogFilter = {
      ...mockFilter,
      timeRange: '24h',
    };

    render(<LogFilters filter={filterWith24h} onFilterChange={mockOnFilterChange} />);

    const activeButton = screen.getByText('24H');
    expect(activeButton.closest('button')).toHaveClass('Mui-selected');
  });
});
