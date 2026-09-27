"use client";

import { useFormStatus } from "react-dom";

/** Small one-button form (delete/toggle) with optional confirm and pending state. */
export function InlineAction({
  action,
  fields,
  label,
  pendingLabel,
  confirmText,
  tone = "default",
  ariaLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirmText?: string;
  tone?: "default" | "danger";
  ariaLabel?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit label={label} pendingLabel={pendingLabel} tone={tone} ariaLabel={ariaLabel} />
    </form>
  );
}

function Submit({
  label,
  pendingLabel,
  tone,
  ariaLabel,
}: {
  label: string;
  pendingLabel?: string;
  tone: "default" | "danger";
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      className={`rounded-md px-2 py-1 text-sm font-medium disabled:opacity-50 ${
        tone === "danger" ? "text-red-700 hover:bg-red-50" : "text-teal-700 hover:bg-teal-50"
      }`}
    >
      {pending ? (pendingLabel ?? "…") : label}
    </button>
  );
}
