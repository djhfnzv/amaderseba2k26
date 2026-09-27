"use client";

import { useFormStatus } from "react-dom";
import { deleteVerificationDocument } from "@/app/doctor/verification/actions";

export function DeleteDocumentButton({ id, label }: { id: string; label: string }) {
  return (
    <form
      action={deleteVerificationDocument}
      onSubmit={(e) => {
        if (!confirm(`Remove this ${label.toLowerCase()} document?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Submit label={label} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Remove ${label}`}
      className="rounded-md px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
