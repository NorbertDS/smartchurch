import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Attendance from '../Attendance';

describe('Attendance print', () => {
  it('prints attendance content only', async () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Attendance />);
    const btn = screen.getByRole('button', { name: /print/i });
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });
});
