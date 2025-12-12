import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeaderBrandingTitle from '../HeaderBrandingTitle';

describe('HeaderBrandingTitle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders default title from settings', async () => {
    render(<HeaderBrandingTitle />);
    expect(await screen.findByText(/FaithConnect/i)).toBeTruthy();
  });

  it('is non-editable in current implementation', async () => {
    render(<HeaderBrandingTitle />);
    expect(screen.queryByRole('button', { name: /edit branding title/i })).toBeNull();
  });
});
