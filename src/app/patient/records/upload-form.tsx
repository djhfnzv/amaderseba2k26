"use client";

import { useActionState, useRef, useState } from "react";
import { requestUpload, saveMedicalFile } from "../actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { formatBytes, todayIso } from "@/lib/format";
import { checkDocumentFile } from "@/lib/files";
import { FILE_ACCEPT, FILE_CATEGORIES, MEDICAL_FILES_BUCKET } from "@/lib/patient/constants";
import { createClient } from "@/lib/supabase/client";
import type { FormState } from "@/lib/validation/form-state";

const checkFile = checkDocumentFile;

/** 1) ask the server for an upload ticket, 2) upload straight to storage, 3) save details. */
async function uploadAction(prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file") as File | null;
  const values = {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    reportDate: String(formData.get("reportDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const fileError = checkFile(file);
  if (fileError || !file) return { fieldErrors: { file: [fileError ?? ""] }, values };
  if (!values.title.trim()) return { fieldErrors: { title: ["Give the report a title"] }, values };

  const ticket = await requestUpload({ fileName: file.name, mimeType: file.type, size: file.size });
  if ("error" in ticket) return { error: ticket.error, values };

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(MEDICAL_FILES_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (uploadError) return { error: "The upload failed. Check your connection and try again.", values };

  // Send only the details — the file itself is already in storage.
  const details = new FormData();
  Object.entries(values).forEach(([k, v]) => details.set(k, v));
  details.set("storagePath", ticket.path);
  details.set("fileName", file.name);
  return saveMedicalFile(prev, details);
}

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadAction, undefined);
  const [picked, setPicked] = useState<File | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const e = state?.fieldErrors;
  const pickedError = picked ? checkFile(picked) : null;

  return (
    <form
      action={(fd) => {
        setPicked(null);
        return action(fd);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium text-slate-800">
          File
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept={FILE_ACCEPT}
          onChange={(ev) => {
            const f = ev.target.files?.[0] ?? null;
            setPicked(f);
            // Suggest a title from the file name if none was typed.
            if (f && titleRef.current && !titleRef.current.value) {
              titleRef.current.value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 200);
            }
          }}
          aria-describedby="file-help"
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
        />
        <p id="file-help" className={`text-xs ${pickedError || e?.file ? "text-red-600" : "text-slate-500"}`}>
          {pickedError ??
            e?.file?.[0] ??
            (picked ? `${picked.name} · ${formatBytes(picked.size)}` : "PDF, JPG or PNG, up to 10 MB.")}
        </p>
      </div>

      <Field
        ref={titleRef}
        label="Title"
        name="title"
        placeholder="e.g. Blood test — CBC"
        maxLength={200}
        defaultValue={state?.values?.title}
        errors={e?.title}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          name="category"
          options={FILE_CATEGORIES}
          placeholder="Choose type"
          defaultValue={state?.values?.category ?? "lab_report"}
          errors={e?.category}
        />
        <Field
          label="Report date"
          name="reportDate"
          type="date"
          min="1900-01-01"
          max={todayIso()}
          defaultValue={state?.values?.reportDate}
          errors={e?.reportDate}
        />
      </div>
      <TextareaField
        label="Notes (optional)"
        name="notes"
        maxLength={1000}
        defaultValue={state?.values?.notes}
        errors={e?.notes}
      />

      <Button type="submit" disabled={pending || !!pickedError} className="sm:self-end">
        {pending ? "Uploading…" : "Upload report"}
      </Button>
    </form>
  );
}
