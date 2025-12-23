import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Members from '../Members';
import * as apiClient from '../../api/client';
import { MemoryRouter } from 'react-router-dom';

describe('Members import panel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
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
      if (url === '/departments') return { data: [] } as any;
      if (url.startsWith('/cell-groups')) return { data: [{ id: 1, name: 'Alpha' }] } as any;
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

  it('sends admin filters and renders enriched member fields', async () => {
    localStorage.setItem('fc_role', 'ADMIN');
    (apiClient.default.get as any).mockImplementation(async (url: string, cfg?: any) => {
      if (url === '/settings/member-import/columns') return { data: [] } as any;
      if (url === '/departments') return { data: [{ id: 2, name: 'Choir' }] } as any;
      if (url.startsWith('/cell-groups')) return { data: [{ id: 1, name: 'Alpha' }] } as any;
      if (url === '/members') {
        return {
          data: {
            items: [{
              id: 1,
              firstName: 'John',
              lastName: 'Doe',
              gender: 'MALE',
              contact: '123',
              spiritualStatus: 'Member',
              dateJoined: '2025-01-01T00:00:00.000Z',
              cellGroupName: 'Alpha',
              departmentNames: ['Choir'],
            }],
            total: 1,
          }
        } as any;
      }
      if (url.startsWith('/members/pending')) return { data: { items: [], total: 0 } } as any;
      return { data: {} } as any;
    });

    render(<MemoryRouter><Members /></MemoryRouter>);

    const user = userEvent.setup();
    const groupSelects = await screen.findAllByLabelText('Cell group filter');
    const groupSelect = groupSelects[groupSelects.length - 1] as HTMLSelectElement;
    const deptSelects = await screen.findAllByLabelText('Department filter');
    const deptSelect = deptSelects[deptSelects.length - 1] as HTMLSelectElement;
    await within(groupSelect).findByRole('option', { name: 'Alpha' });
    await within(deptSelect).findByRole('option', { name: 'Choir' });
    await user.selectOptions(groupSelect, '1');
    await user.selectOptions(deptSelect, '2');

    const nameCell = await screen.findByText('John Doe');
    expect(nameCell).toBeTruthy();
    const rowText = nameCell.closest('tr')?.textContent || '';
    expect(rowText).toContain('Alpha');
    expect(rowText).toContain('Choir');

    await waitFor(() => {
      const calls = (apiClient.default.get as any).mock.calls;
      const sawFilteredCall = calls.some((c: any[]) =>
        c[0] === '/members' &&
        String(c[1]?.params?.cellGroupId) === '1' &&
        String(c[1]?.params?.departmentId) === '2'
      );
      expect(sawFilteredCall).toBe(true);
    });
  });
});
