import { useMemo } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

type Props = {
  value: string | Date | null;
  onChange: (iso: string) => void;
  label?: string;
  withTime?: boolean;
  ariaLabel?: string;
  className?: string;
};

export default function DateTimePicker({ value, onChange, label, withTime = true, ariaLabel, className }: Props) {
  const dateValue = useMemo(() => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  const handleChange = (d: Date | null) => {
    if (!d) return onChange('');
    if (withTime) {
      const iso = new Date(d.getTime() - d.getMilliseconds()).toISOString().slice(0, 16);
      return onChange(iso);
    } else {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return onChange(`${year}-${month}-${day}`);
    }
  };

  return (
    <div className={className || ''}>
      {label && <label className="text-sm">{label}</label>}
      <DatePicker
        selected={dateValue}
        onChange={handleChange}
        showTimeSelect={withTime}
        timeIntervals={15}
        dateFormat={withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'}
        placeholderText={withTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'}
        aria-label={ariaLabel || label || 'Select date'}
        className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
      />
    </div>
  );
}

