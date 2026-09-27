"use client";

import { useRef, useState, useTransition } from "react";
import { removePhoto, requestPhotoUpload, savePhoto } from "@/app/doctor/actions";
import { Alert } from "@/components/ui/alert";
import { DoctorAvatar } from "./doctor-avatar";
import { DOCTOR_PHOTOS_BUCKET, MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/lib/doctor/constants";
import { createClient } from "@/lib/supabase/client";

export function PhotoUploader({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    if (!Object.hasOwn(PHOTO_TYPES, file.type)) return setError("Use a JPG, PNG or WebP image.");
    if (file.size > MAX_PHOTO_BYTES) return setError("Photos must be 2 MB or smaller.");

    startTransition(async () => {
      const ticket = await requestPhotoUpload({ mimeType: file.type, size: file.size });
      if ("error" in ticket) return setError(ticket.error);

      const { error: uploadError } = await createClient()
        .storage.from(DOCTOR_PHOTOS_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (uploadError) return setError("The upload failed. Please try again.");

      const res = await savePhoto(ticket.path);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <DoctorAvatar name={name} photoUrl={photoUrl} size={96} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {pending ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
          </button>
          {photoUrl && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => removePhoto())}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          A clear, professional headshot. JPG, PNG or WebP, up to 2 MB.
        </p>
        {error && <Alert>{error}</Alert>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a profile photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}
