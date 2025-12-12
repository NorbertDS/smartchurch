import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Events from '../Events';

describe('Events print', () => {
  it('prints events content only', async () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Events />);
    const btn = screen.getByRole('button', { name: /print/i });
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });
});
