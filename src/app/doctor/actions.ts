"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import {
  DOCTOR_PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  SECTIONS,
  type SectionKey,
} from "@/lib/doctor/constants";
import { createClient } from "@/lib/supabase/server";
import { basicInfoSchema, photoUploadSchema, sectionSchemas } from "@/lib/validation/doctor";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation/form-state";

/** Refresh the doctor's own area and their public page (old + new slug). */
function revalidatePortfolio(...slugs: (string | null | undefined)[]) {
  revalidatePath("/doctor", "layout");
  for (const slug of new Set(slugs)) if (slug) revalidatePath(`/doctors/${slug}`);
}

async function currentSlug(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("doctor_profiles")
    .select("slug")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.slug ?? null;
}

// -----------------------------------------------------------------------------
// Basic info, specialties, languages, fees
// -----------------------------------------------------------------------------
export async function saveBasicInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor");
  const raw = formToObject(formData);
  const parsed = basicInfoSchema.safeParse({
    ...raw,
    languages: formData.getAll("languages").map(String),
    specialtyIds: formData.getAll("specialtyIds").map(String),
    offersOnline: raw.offersOnline === "on",
    offersInPerson: raw.offersInPerson === "on",
  });
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
      values: raw,
    };
  }
  const v = parsed.data;
  const oldSlug = await currentSlug(user.id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_profiles")
    .update({
      display_name: v.displayName,
      headline: v.headline,
      slug: v.slug,
      bio: v.bio,
      license_number: v.licenseNumber,
      practice_since_year: v.practiceSinceYear,
      languages: v.languages,
      offers_online: v.offersOnline,
      offers_in_person: v.offersInPerson,
      fee_online: v.feeOnline,
      fee_in_person: v.feeInPerson,
    })
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { slug: ["This address is already taken. Try another."] },
        values: raw,
      };
    }
    console.error("[saveBasicInfo]", error);
    return { error: "Could not save your details. Please try again.", values: raw };
  }

  // Replace the specialty set.
  const ids = [...new Set(v.specialtyIds)];
  const { error: delError } = await supabase
    .from("doctor_specialties")
    .delete()
    .eq("doctor_id", user.id)
    .not("specialty_id", "in", `(${ids.join(",")})`);
  const { error: insError } = await supabase.from("doctor_specialties").upsert(
    ids.map((id, i) => ({ doctor_id: user.id, specialty_id: id, is_primary: i === 0 })),
    { onConflict: "doctor_id,specialty_id" },
  );
  if (delError || insError) {
    console.error("[saveBasicInfo specialties]", delError ?? insError);
    return { error: "Saved, but your specialties could not be updated. Please try again.", values: raw };
  }

  revalidatePortfolio(oldSlug, v.slug);
  return { message: "Your details have been saved." };
}

// -----------------------------------------------------------------------------
// Repeatable sections: education, experience, chambers, publications, awards
// -----------------------------------------------------------------------------
function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && Object.hasOwn(SECTIONS, value);
}

export async function saveSectionItem(
  section: SectionKey,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("doctor");
  if (!isSectionKey(section)) return { error: "Unknown section." };
  const config = SECTIONS[section];

  const raw = formToObject(formData);
  const parsed = sectionSchemas[section].safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  }

  const supabase = await createClient();
  // Tables share the same shape; the section config picks the table name.
  const table = supabase.from(config.table as "doctor_awards");
  const values = parsed.data as never;
  const id = raw.id;

  let error;
  if (id) {
    ({ error } = await table.update(values).eq("id", id).eq("doctor_id", user.id));
  } else {
    const { count } = await supabase
      .from(config.table as "doctor_awards")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", user.id);
    if ((count ?? 0) >= config.max) {
      return { error: `You can add at most ${config.max} ${config.title.toLowerCase()}.`, values: raw };
    }
    ({ error } = await table.insert(values));
  }

  if (error) {
    console.error(`[saveSectionItem ${section}]`, error);
    return { error: "Could not save. Please try again.", values: raw };
  }

  revalidatePortfolio(await currentSlug(user.id));
  return { message: id ? "Updated." : "Added." };
}

export async function deleteSectionItem(section: SectionKey, formData: FormData): Promise<void> {
  const user = await requireRole("doctor");
  if (!isSectionKey(section)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from(SECTIONS[section].table as "doctor_awards")
    .delete()
    .eq("id", id)
    .eq("doctor_id", user.id);
  if (error) console.error(`[deleteSectionItem ${section}]`, error);

  revalidatePortfolio(await currentSlug(user.id));
}

// -----------------------------------------------------------------------------
// Photo: requestPhotoUpload() -> browser uploads -> savePhoto()
// -----------------------------------------------------------------------------
export async function requestPhotoUpload(input: {
  mimeType: string;
  size: number;
}): Promise<{ path: string; token: string } | { error: string }> {
  const user = await requireRole("doctor");
  const parsed = photoUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid image." };

  const path = `${user.id}/${randomUUID()}.${PHOTO_TYPES[parsed.data.mimeType]}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(DOCTOR_PHOTOS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[requestPhotoUpload]", error);
    return { error: "Could not start the upload. Please try again." };
  }
  return { path: data.path, token: data.token };
}

export async function savePhoto(path: string): Promise<{ error?: string }> {
  const user = await requireRole("doctor");
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) return { error: "Invalid upload." };

  const supabase = await createClient();
  const bucket = supabase.storage.from(DOCTOR_PHOTOS_BUCKET);

  // Trust what storage actually holds, not what the browser claimed.
  const { data: info } = await bucket.info(path);
  const type = info?.contentType ?? "";
  if (!info || !(type in PHOTO_TYPES) || !info.size || info.size > MAX_PHOTO_BYTES) {
    await bucket.remove([path]);
    return { error: "Use a JPG, PNG or WebP image up to 2 MB." };
  }

  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("photo_path, slug")
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("doctor_profiles")
    .update({ photo_path: path })
    .eq("user_id", user.id);
  if (error) {
    console.error("[savePhoto]", error);
    await bucket.remove([path]);
    return { error: "Could not save your photo. Please try again." };
  }

  if (profile?.photo_path && profile.photo_path !== path) {
    await bucket.remove([profile.photo_path]);
  }
  revalidatePortfolio(profile?.slug);
  return {};
}

export async function removePhoto(): Promise<void> {
  const user = await requireRole("doctor");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("photo_path, slug")
    .eq("user_id", user.id)
    .single();
  if (!profile?.photo_path) return;

  await supabase.from("doctor_profiles").update({ photo_path: null }).eq("user_id", user.id);
  await supabase.storage.from(DOCTOR_PHOTOS_BUCKET).remove([profile.photo_path]);
  revalidatePortfolio(profile.slug);
}
