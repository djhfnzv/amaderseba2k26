"use client";

import { useActionState, useState } from "react";
import { requestVerificationUpload, saveVerificationDocument } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { DOCUMENT_ACCEPT, checkDocumentFile } from "@/lib/files";
import { formatBytes } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { DOC_TYPES, VERIFICATION_BUCKET } from "@/lib/verification/constants";
import type { FormState } from "@/lib/validation/form-state";

/** 1) get an upload ticket, 2) upload straight to storage, 3) record the document. */
async function uploadAction(prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file") as File | null;
  const docType = String(formData.get("docType") ?? "");
  const label = String(formData.get("label") ?? "");
  const values = { docType, label };

  if (!docType) return { fieldErrors: { docType: ["Choose a document type"] }, values };
  const fileError = checkDocumentFile(file);
  if (fileError || !file) return { fieldErrors: { file: [fileError ?? ""] }, values };

  const ticket = await requestVerificationUpload({ mimeType: file.type, size: file.size });
  if ("error" in ticket) return { error: ticket.error, values };

  const { error } = await createClient()
    .storage.from(VERIFICATION_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) return { error: "The upload failed. Check your connection and try again.", values };

  const details = new FormData();
  details.set("docType", docType);
  details.set("label", label);
  details.set("storagePath", ticket.path);
  details.set("fileName", file.name);
  return saveVerificationDocument(prev, details);
}

export function DocumentUploader() {
  const [state, action, pending] = useActionState(uploadAction, undefined);
  const [picked, setPicked] = useState<File | null>(null);
  const [docType, setDocType] = useState(state?.values?.docType ?? "");
  const pickedError = picked ? checkDocumentFile(picked) : null;
  const hint = DOC_TYPES.find((d) => d.value === docType)?.hint;

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <SelectField
            label="Document type"
            name="docType"
            options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))}
            placeholder="Choose…"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            errors={state?.fieldErrors?.docType}
          />
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        <Field
          label="Description (optional)"
          name="label"
          placeholder="e.g. FCPS certificate"
          maxLength={120}
          defaultValue={state?.values?.label}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="verification-file" className="text-sm font-medium text-slate-800">
          File
        </label>
        <input
          id="verification-file"
          name="file"
          type="file"
          accept={DOCUMENT_ACCEPT}
          onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          aria-describedby="verification-file-help"
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
        />
        <p
          id="verification-file-help"
          className={`text-xs ${pickedError || state?.fieldErrors?.file ? "text-red-600" : "text-slate-500"}`}
        >
          {pickedError ??
            state?.fieldErrors?.file?.[0] ??
            (picked ? `${picked.name} · ${formatBytes(picked.size)}` : "Clear scan or photo. PDF, JPG or PNG, up to 10 MB.")}
        </p>
      </div>

      <Button type="submit" disabled={pending || !!pickedError} className="sm:self-end">
        {pending ? "Uploading…" : "Upload document"}
      </Button>
    </form>
  );
}
