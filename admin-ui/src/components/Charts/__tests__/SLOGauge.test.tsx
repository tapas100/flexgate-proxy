import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SLOGauge from '../SLOGauge';
import { SLOMetrics } from '../../../types';

describe('SLOGauge', () => {
  const mockSLO: SLOMetrics = {
    availability: {
      current: 99.95,
      target: 99.9,
      budget: 21600000, // 6 hours
    },
    latency: {
      p50: 45,
      p95: 120,
      p99: 250,
      targetP95: 200,
      targetP99: 500,
    },
    errorRate: {
      current: 0.05,
      target: 1.0,
    },
  };

  it('should render without crashing', () => {
    render(<SLOGauge slo={mockSLO} />);
    expect(screen.getByText(/slo compliance/i)).toBeInTheDocument();
  });

  it('should display SLO title', () => {
    render(<SLOGauge slo={mockSLO} />);
    expect(screen.getByText('SLO Compliance')).toBeInTheDocument();
  });

  it('should display availability metric', () => {
    render(<SLOGauge slo={mockSLO} />);
    expect(screen.getByText(/availability/i)).toBeInTheDocument();
  });

  it('should display latency metric', () => {
    render(<SLOGauge slo={mockSLO} />);
    expect(screen.getByText(/latency/i)).toBeInTheDocument();
  });

  it('should display error rate metric', () => {
    render(<SLOGauge slo={mockSLO} />);
    expect(screen.getByText(/error rate/i)).toBeInTheDocument();
  });

  it('should handle SLO violations', () => {
    const violatedSLO: SLOMetrics = {
      availability: {
        current: 99.5, // Below target
        target: 99.9,
        budget: 0,
      },
      latency: {
        p50: 45,
        p95: 250, // Above target
        p99: 600, // Above target
        targetP95: 200,
        targetP99: 500,
      },
      errorRate: {
        current: 2.0, // Above target
        target: 1.0,
      },
    };

    render(<SLOGauge slo={violatedSLO} />);
    expect(screen.getByText('SLO Compliance')).toBeInTheDocument();
  });
});
