import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Events from './Events';
import api from '../api/client';

vi.mock('../api/client', () => {
  return {
    default: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      defaults: { baseURL: 'http://localhost:4000' },
    },
  };
});

describe.skip('Events page', () => {
  it('submits creation and handles backend validation errors', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { data: { message: 'Invalid date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm)' } } });
    render(<Events />);
    const titleInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Test Event' } });
    const createBtn = screen.getByText('Create');
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
  });
});
