import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DateTimePicker from './DateTimePicker';

describe('DateTimePicker', () => {
  it('renders a value from ISO datetime string', () => {
    const d = new Date('2025-01-02T13:45:30Z');
    render(<DateTimePicker value={d.toISOString()} onChange={()=>{}} withTime />);
    const input = screen.getByPlaceholderText('YYYY-MM-DD HH:mm') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('renders a value from Date object (date-only)', () => {
    const d = new Date('2024-12-25T00:00:00Z');
    render(<DateTimePicker value={d} onChange={()=>{}} withTime={false} />);
    const input = screen.getByPlaceholderText('YYYY-MM-DD') as HTMLInputElement;
    expect(input).toBeTruthy();
  });
});
