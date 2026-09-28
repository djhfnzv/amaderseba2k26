"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { availabilitySchema, leaveSchema } from "@/lib/validation/schedule";
import { fieldErrorsOf, formToObject, type FormState } from "@/lib/validation/form-state";

async function revalidateSchedule(userId: string) {
  revalidatePath("/doctor", "layout");
  const supabase = await createClient();
  const { data } = await supabase.from("doctor_profiles").select("slug").eq("user_id", userId).maybeSingle();
  if (data?.slug) revalidatePath(`/doctors/${data.slug}`);
}

// -----------------------------------------------------------------------------
// Time zone
// -----------------------------------------------------------------------------
export async function saveTimezone(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor");
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || timezone.length > 64) return { error: "Choose a time zone." };

  const supabase = await createClient();
  const { error } = await supabase.from("doctor_profiles").update({ timezone }).eq("user_id", user.id);
  if (error) {
    return { error: error.code === "22023" ? "That time zone isn't recognised." : "Could not save. Please try again." };
  }
  await revalidateSchedule(user.id);
  await flash("Time zone saved");
  return { message: "Time zone saved." };
}

// -----------------------------------------------------------------------------
// Weekly availability blocks
// -----------------------------------------------------------------------------
export async function addAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor");
  const raw = formToObject(formData);
  const parsed = availabilitySchema.safeParse({
    ...raw,
    weekdays: formData.getAll("weekdays").map(String),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const rows = [...new Set(v.weekdays)].map((weekday) => ({
    weekday,
    start_time: v.startTime,
    end_time: v.endTime,
    consultation_type: v.consultationType,
    chamber_id: v.chamberId,
    consultation_minutes: v.consultationMinutes,
  }));

  // One statement: if any day overlaps, nothing is saved.
  const { error } = await supabase.from("doctor_availability").insert(rows);
  if (error) {
    if (error.code === "23P01") {
      return { error: "This time overlaps a block you already have on one of those days.", values: raw };
    }
    if (error.code === "22023") return { error: error.message, values: raw };
    console.error("[addAvailability]", error);
    return { error: "Could not save. Please try again.", values: raw };
  }

  await revalidateSchedule(user.id);
  await flash(rows.length > 1 ? `Hours added to ${rows.length} days` : "Hours added");
  return { message: rows.length > 1 ? `Added to ${rows.length} days.` : "Added." };
}

export async function toggleAvailability(formData: FormData): Promise<void> {
  const user = await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_availability")
    .update({ is_active: active })
    .eq("id", id)
    .eq("doctor_id", user.id);
  if (error && error.code !== "23P01") console.error("[toggleAvailability]", error);
  if (!error) await flash(active ? "Hours resumed" : "Hours paused");
  await revalidateSchedule(user.id);
}

export async function deleteAvailability(formData: FormData): Promise<void> {
  const user = await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("doctor_availability").delete().eq("id", id).eq("doctor_id", user.id);
  if (error) console.error("[deleteAvailability]", error);
  else await flash("Hours deleted");
  await revalidateSchedule(user.id);
}

// -----------------------------------------------------------------------------
// Leave / blocked dates
// -----------------------------------------------------------------------------
export async function addLeave(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor");
  const raw = formToObject(formData);
  const parsed = leaveSchema.safeParse({ ...raw, partDay: raw.partDay === "on" });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("doctor_leaves").insert({
    start_date: v.startDate,
    end_date: v.endDate,
    start_time: v.partDay ? v.startTime : null,
    end_time: v.partDay ? v.endTime : null,
    reason: v.reason,
  });
  if (error) {
    console.error("[addLeave]", error);
    return { error: "Could not save. Please try again.", values: raw };
  }

  await revalidateSchedule(user.id);
  await flash("Leave added");
  return { message: "Leave added. Those slots are no longer bookable." };
}

export async function deleteLeave(formData: FormData): Promise<void> {
  const user = await requireRole("doctor");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("doctor_leaves").delete().eq("id", id).eq("doctor_id", user.id);
  if (error) console.error("[deleteLeave]", error);
  else await flash("Leave removed");
  await revalidateSchedule(user.id);
}

// -----------------------------------------------------------------------------
// Edit one block in place
// -----------------------------------------------------------------------------
export async function updateAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor");
  const raw = formToObject(formData);
  const id = raw.id ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid block." };

  // Same rules as adding; the block keeps its weekday.
  const parsed = availabilitySchema.safeParse({ ...raw, weekdays: [raw.weekday] });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values: raw };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_availability")
    .update({
      start_time: v.startTime,
      end_time: v.endTime,
      consultation_type: v.consultationType,
      chamber_id: v.chamberId,
      consultation_minutes: v.consultationMinutes,
    })
    .eq("id", id)
    .eq("doctor_id", user.id);
  if (error) {
    if (error.code === "23P01") return { error: "This time overlaps another block on the same day.", values: raw };
    if (error.code === "22023") return { error: error.message, values: raw };
    console.error("[updateAvailability]", error);
    return { error: "Could not save. Please try again.", values: raw };
  }

  await revalidateSchedule(user.id);
  await flash("Hours saved");
  return { message: "Saved." };
}

// -----------------------------------------------------------------------------
// Copy one day's hours to other days (replaces what those days had)
// -----------------------------------------------------------------------------
export async function copyDay(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("doctor");
  const from = Number(formData.get("from"));
  const to = formData.getAll("to").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6 && d !== from);
  if (!Number.isInteger(from) || from < 0 || from > 6) return { error: "Invalid day." };
  if (to.length === 0) return { error: "Choose at least one day to copy to." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("copy_availability_day", { p_from: from, p_to: to });
  if (error) {
    const expected = ["22023", "23P01", "42501"].includes(error.code ?? "");
    if (!expected) console.error("[copyDay]", error);
    return { error: expected ? error.message : "Could not copy. Please try again." };
  }

  await revalidateSchedule(user.id);
  await flash(`Hours copied to ${to.length} day${to.length === 1 ? "" : "s"}`);
  return { message: `Copied to ${to.length} day${to.length === 1 ? "" : "s"}.` };
}
