import type { TextareaHTMLAttributes } from "react";

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  errors?: string[];
};

export function TextareaField({ label, name, errors, id, ...props }: TextareaFieldProps) {
  const inputId = id ?? name;
  const hasError = !!errors?.length;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea
        id={inputId}
        name={name}
        rows={3}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        className={`rounded-lg border bg-white px-3 py-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-teal-600 ${
          hasError ? "border-red-500" : "border-slate-300"
        }`}
        {...props}
      />
      {hasError && (
        <p id={`${inputId}-error`} className="text-xs text-red-600">
          {errors[0]}
        </p>
      )}
    </div>
  );
}
