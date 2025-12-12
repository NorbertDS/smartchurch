import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Settings from '../Settings';
import * as apiClient from '../../api/client';
import { MemoryRouter } from 'react-router-dom';

describe('Import Columns Manager', () => {
  beforeEach(() => {
    localStorage.setItem('fc_role', 'ADMIN');
    vi.spyOn(apiClient.default, 'get').mockImplementation(async (url: string) => {
      if (url === '/settings/member-import/columns') {
        return { data: [
          { key: 'firstName', label: 'First Name', required: true, type: 'string' },
          { key: 'lastName', label: 'Last Name', required: true, type: 'string' },
        ] } as any;
      }
      if (url.startsWith('/members')) {
        return { data: { items: [], total: 0 } } as any;
      }
      return { data: {} } as any;
    });
    vi.spyOn(apiClient.default, 'post').mockResolvedValue({ data: { status: 'ok' } } as any);
  });

  it('renders and saves columns', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    const tabBtn = await screen.findByRole('button', { name: /Import Columns/i });
    fireEvent.click(tabBtn);
    expect(await screen.findByText(/Member Import Columns/i)).toBeTruthy();
    const saveBtn = screen.getByRole('button', { name: /Save/i });
    fireEvent.click(saveBtn);
    expect(apiClient.default.post).toHaveBeenCalledWith('/settings/member-import/columns', expect.any(Array));
  });
});
