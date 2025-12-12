import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SidebarImageManager from '../SidebarImageManager';

function file(name: string, type: string) {
  const f = new File(['hello'], name, { type });
  return f;
}

describe('SidebarImageManager', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); });

  it('shows manage controls for privileged role', async () => {
    render(<SidebarImageManager role={'ADMIN'} />);
    const btn = screen.getByRole('button', { name: /manage sidebar image/i });
    expect(btn).toBeTruthy();
    await userEvent.click(btn);
    const uploadLabel = screen.getByText(/upload/i);
    expect(uploadLabel).toBeTruthy();
  });

  it('exposes file input with correct accept attribute', async () => {
    render(<SidebarImageManager role={'ADMIN'} />);
    await userEvent.click(screen.getByRole('button', { name: /manage sidebar image/i }));
    const altInput = screen.getByLabelText('Sidebar image alt text');
    expect(altInput).toBeTruthy();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput!.accept).toContain('.jpg');
    expect(fileInput!.accept).toContain('.png');
    expect(fileInput!.accept).toContain('.svg');
  });

  it('hides manage controls for member role', () => {
    render(<SidebarImageManager role={'MEMBER'} />);
    const btn = screen.queryByRole('button', { name: /manage sidebar image/i });
    expect(btn).toBeNull();
  });
});
