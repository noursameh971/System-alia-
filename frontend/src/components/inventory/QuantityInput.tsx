import { forwardRef } from "react";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(function QuantityInput(
  { value, onChange, disabled },
  ref,
) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity</label>
      <input
        ref={ref}
        type="number"
        aria-label="Quantity"
        inputMode="numeric"
        min={1}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm text-slate-900 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </div>
  );
});
