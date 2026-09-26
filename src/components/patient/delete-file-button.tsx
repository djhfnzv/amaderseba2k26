"use client";

import { useFormStatus } from "react-dom";
import { deleteMedicalFile } from "@/app/patient/actions";

export function DeleteFileButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteMedicalFile}
      onSubmit={(e) => {
        if (!confirm(`Delete "${title}"? This can't be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton title={title} />
    </form>
  );
}

function SubmitButton({ title }: { title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Delete ${title}`}
      className="rounded-md px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
