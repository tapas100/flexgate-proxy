import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteDialog from '../DeleteDialog';

describe('DeleteDialog Component', () => {
  const mockOnClose = jest.fn();
  const mockOnConfirm = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with route path', () => {
    render(
      <DeleteDialog
        open={true}
        routePath="/api/users"
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByText(/delete route/i)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/users/)).toBeInTheDocument();
  });

  it('should call onConfirm when delete button is clicked', () => {
    render(
      <DeleteDialog
        open={true}
        routePath="/api/users"
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalled();
  });

  it('should call onClose when cancel button is clicked', () => {
    render(
      <DeleteDialog
        open={true}
        routePath="/api/users"
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not render when open is false', () => {
    const { container } = render(
      <DeleteDialog
        open={false}
        routePath="/api/users"
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
