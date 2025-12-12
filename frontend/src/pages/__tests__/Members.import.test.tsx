import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Members from '../Members';
import * as apiClient from '../../api/client';
import { MemoryRouter } from 'react-router-dom';

describe('Members import panel', () => {
  beforeEach(() => {
    localStorage.setItem('fc_role', 'ADMIN');
    vi.spyOn(apiClient.default, 'get').mockImplementation(async (url: string) => {
      if (url === '/settings/member-import/columns') {
        return { data: [
          { key: 'firstName', label: 'First Name', required: true },
          { key: 'lastName', label: 'Last Name', required: true },
          { key: 'gender', label: 'Gender', required: true },
          { key: 'contact', label: 'Contact', required: false },
          { key: 'spiritualStatus', label: 'Status', required: false },
          { key: 'dateJoined', label: 'Joined', required: false },
        ] } as any;
      }
      if (url.startsWith('/members')) return { data: { items: [], total: 0 } } as any;
      return { data: {} } as any;
    });
  });

  it('shows selected file name and requirements', async () => {
    render(<MemoryRouter><Members /></MemoryRouter>);
    const input = await screen.findByLabelText(/bulk member upload file/i);
    const file = new File(['a,b\n1,2'], 'members.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    // Requirements appear based on config
    expect(await screen.findByText(/First Name/i)).toBeTruthy();
    expect(screen.getAllByText(/Joined/i).length).toBeGreaterThan(0);
  });

  it('prints using window.print', async () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<MemoryRouter><Members /></MemoryRouter>);
    const btns = screen.getAllByLabelText('Print');
    fireEvent.click(btns[0]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
