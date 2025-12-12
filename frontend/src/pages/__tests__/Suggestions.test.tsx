import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Suggestions from '../Suggestions';
import * as apiClient from '../../api/client';

describe('Suggestions page', () => {
  beforeEach(() => {
    // Mock settings/info and suggestions list to avoid network calls during render
    vi.spyOn(apiClient.default, 'get').mockImplementation(async (url: string) => {
      if (url === '/suggestions') {
        return { data: { items: [], canModerate: false } } as any;
      }
      return { data: {} } as any;
    });
  });

  it('renders suggestion submission form fields', () => {
    render(<Suggestions />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Category (optional)')).toBeTruthy();
    expect(screen.getByText('Detailed Suggestion')).toBeTruthy();
    expect(screen.getByText('Attachment (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit suggestion/i })).toBeTruthy();
  });
});
