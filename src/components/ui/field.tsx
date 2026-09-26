import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

export function Field({ label, name, errors, hint, id, className = "", ...props }: FieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const hasError = !!errors?.length;
  const describedBy = [hasError && errorId, hint && !hasError && hintId].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy || undefined}
        className={`h-11 rounded-lg border bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600 ${
          hasError ? "border-red-500" : "border-slate-300"
        } ${className}`}
        {...props}
      />
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-xs text-red-600">
          {errors[0]}
        </p>
      )}
    </div>
  );
}
