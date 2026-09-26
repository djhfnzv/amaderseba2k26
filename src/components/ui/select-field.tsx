import type { SelectHTMLAttributes } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  errors?: string[];
};

export function SelectField({
  label,
  name,
  options,
  placeholder = "Select…",
  errors,
  id,
  ...props
}: SelectFieldProps) {
  const inputId = id ?? name;
  const hasError = !!errors?.length;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={inputId}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        className={`h-11 rounded-lg border bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600 ${
          hasError ? "border-red-500" : "border-slate-300"
        }`}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hasError && (
        <p id={`${inputId}-error`} className="text-xs text-red-600">
          {errors[0]}
        </p>
      )}
    </div>
  );
}
