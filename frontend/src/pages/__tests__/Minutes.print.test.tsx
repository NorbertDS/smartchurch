import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Minutes from '../Minutes';

describe('Minutes print', () => {
  it('prints minutes content only', async () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Minutes />);
    const btn = screen.getByRole('button', { name: /print/i });
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });
});
