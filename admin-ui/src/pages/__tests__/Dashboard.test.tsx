import React from 'react';
import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';

describe('Dashboard', () => {
  it('should render dashboard title', () => {
    render(<Dashboard />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    render(<Dashboard />);
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    expect(screen.getByText('Avg Response Time')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
  });

  it('should render quick start section', () => {
    render(<Dashboard />);
    expect(screen.getByText('Quick Start')).toBeInTheDocument();
  });
});
