import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Layout } from '../../App';
import { MemoryRouter } from 'react-router-dom';
import * as apiClient from '../../api/client';

describe('Sidebar navigation', () => {
  beforeEach(() => {
    localStorage.setItem('fc_token', 'test');
    localStorage.setItem('fc_role', 'ADMIN');
    vi.spyOn(apiClient.default, 'get').mockResolvedValue({ data: { name: 'FaithConnect' } } as any);
  });

  it('shows Cell Groups and Suggestion Box links', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>
    );
    expect(screen.getByText('Cell Groups')).toBeTruthy();
    expect(screen.getByText('Suggestion Box')).toBeTruthy();
  });
});
