import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Signup from '../Signup';
import api from '../../api/client';

vi.mock('../../api/client', () => {
  return {
    default: {
      get: vi.fn().mockResolvedValue({ data: { id: 1, name: 'Test Church', slug: 'test-church' } }),
      post: vi.fn().mockResolvedValue({ data: { status: 'pending_approval' } }),
      defaults: { baseURL: 'http://localhost:4000' },
    },
  };
});

describe('Signup church name validation', () => {
  it('requires Church name before submit', async () => {
    render(<MemoryRouter><Signup /></MemoryRouter>);
    const inputs = document.querySelectorAll('input');
    fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: 'John Doe' } });
    fireEvent.change(inputs[2] as HTMLInputElement, { target: { value: 'john@example.com' } });
    fireEvent.change(inputs[3] as HTMLInputElement, { target: { value: 'pass123' } });
    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText(/please enter your church name/i)).toBeTruthy();
    });
  });

  it.skip('resolves Church and posts with tenant header', async () => {
    render(<MemoryRouter><Signup /></MemoryRouter>);
    const inputs = document.querySelectorAll('input');
    // Church name, Full Name, Email, Password
    fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: 'Test Church' } });
    fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: 'John Doe' } });
    fireEvent.change(inputs[2] as HTMLInputElement, { target: { value: 'john@example.com' } });
    fireEvent.change(inputs[3] as HTMLInputElement, { target: { value: 'pass123' } });
    const select = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'AMM' } });
    const submitBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/auth/tenant-resolve', { params: { q: 'Test Church' } });
      expect(api.post).toHaveBeenCalled();
    });
  });
});
