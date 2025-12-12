import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';
import api from '../../api/client';

vi.mock('../../api/client', () => {
  return {
    default: {
      post: vi.fn().mockResolvedValue({ data: { token: 't', role: 'MEMBER', tenantId: 1 } }),
      defaults: { baseURL: 'http://localhost:4000' },
    },
  };
});

describe('Login role-based tenant field', () => {
  it('hides Church field for Member login', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.queryByText('Church')).toBeNull();
    const loginBtn = screen.getByRole('button', { name: /login/i });
    expect(loginBtn).toBeTruthy();
  });

  it('shows Church field for Admin login and includes tenantSlug', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const headings = screen.getAllByText('FaithConnect Login');
    const form = headings[headings.length - 1].closest('form') as HTMLFormElement;
    const mode = within(form).getByRole('combobox');
    fireEvent.change(mode, { target: { value: 'ADMIN' } });
    const churchInput = within(form).getByPlaceholderText('e.g. my-church') as HTMLInputElement;
    fireEvent.change(churchInput, { target: { value: 'my-church' } });
    const emailInput = within(form).getByLabelText('Email') as HTMLInputElement;
    const passInput = within(form).getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passInput, { target: { value: 'secret' } });
    const loginBtn = within(form).getByRole('button', { name: /login/i });
    fireEvent.click(loginBtn);
    expect(api.post).toHaveBeenCalled();
    const calls = (api.post as any).mock.calls as any[];
    const found = calls.find(c => c[0] === '/auth/login' && c[1] && c[1].tenantSlug === 'my-church');
    expect(!!found).toBe(true);
  });
});
