/**
 * DEV ONLY — adds past, COMPLETED visits between a patient and a doctor so the
 * review flow (M12) can be tried without waiting for real consultations.
 *
 *   npm run seed:reviews                                  # Mr. Patient ↔ Dr. Demo
 *   npm run seed:reviews -- --patient=a@b.com --doctor=dr-demo2
 *   npm run seed:reviews -- --remove                      # delete the demo visits (and their reviews)
 *
 * Visits are tagged with the note "Demo visit — for testing reviews" so they
 * can be found and removed. Uses the Supabase secret key: trusted machine only.
 */
import { createClient } from "@supabase/supabase-js";

const TAG = "Demo visit — for testing reviews";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✖ Missing ${name} in .env.local`);
    process.exit(1);
  }
  return value;
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  console.error("✖ Refusing to seed demo data in production.");
  process.exit(1);
}

async function main() {
  if (process.argv.includes("--remove")) {
    const { data, error } = await db.from("appointments").delete().eq("patient_note", TAG).select("id");
    if (error) throw error;
    console.log(`✔ Removed ${data.length} demo visit(s) and their reviews.`);
    return;
  }

  const patientEmail = (arg("patient") ?? "patient1@gmail.com").toLowerCase();
  const doctorSlug = arg("doctor") ?? "dr-demo";

  const { data: patient } = await db.from("users").select("id, full_name").eq("email", patientEmail).eq("role", "patient").maybeSingle();
  if (!patient) throw new Error(`No patient with email ${patientEmail}`);
  const { data: doctor } = await db
    .from("doctor_profiles")
    .select("user_id, display_name, fee_online, fee_in_person")
    .eq("slug", doctorSlug)
    .maybeSingle();
  if (!doctor) throw new Error(`No doctor with slug ${doctorSlug}`);
  const { data: chamber } = await db.from("doctor_chambers").select("id").eq("doctor_id", doctor.user_id).limit(1).maybeSingle();

  // Three finished visits: yesterday (online), 3 days ago (chamber), 6 days ago (online).
  const DAY = 86_400_000;
  const base = new Date();
  base.setUTCMinutes(0, 0, 0);
  const visits = [
    { daysAgo: 1, hourUtc: 4, type: "online" as const },
    { daysAgo: 3, hourUtc: 11, type: chamber ? ("in_person" as const) : ("online" as const) },
    { daysAgo: 6, hourUtc: 5, type: "online" as const },
  ];

  let added = 0;
  for (const v of visits) {
    const start = new Date(base.getTime() - v.daysAgo * DAY);
    start.setUTCHours(v.hourUtc, 30, 0, 0);
    const end = new Date(start.getTime() + 20 * 60_000);
    const bookedAt = new Date(start.getTime() - 2 * DAY);

    const { data: appt, error } = await db
      .from("appointments")
      .insert({
        patient_id: patient.id,
        doctor_id: doctor.user_id,
        slot_start: start.toISOString(),
        slot_end: end.toISOString(),
        consultation_type: v.type,
        chamber_id: v.type === "in_person" ? chamber!.id : null,
        status: "completed",
        fee: v.type === "online" ? doctor.fee_online : doctor.fee_in_person,
        payment_method: v.type === "online" ? "online" : "at_chamber",
        payment_status: "waived", // no money moves for demo data
        patient_note: TAG,
        created_at: bookedAt.toISOString(),
      } as never)
      .select("id")
      .single();
    if (error) {
      console.warn(`• Skipped ${start.toISOString()}: ${error.message}`);
      continue;
    }

    // History as a real visit would have it (these events don't send notifications).
    await db.from("appointment_events").insert([
      { appointment_id: appt.id, action: "booked", actor_id: patient.id, created_at: bookedAt.toISOString() },
      { appointment_id: appt.id, action: "completed", actor_id: doctor.user_id, note: "Consultation completed", created_at: end.toISOString() },
    ] as never);
    if (v.type === "online") {
      await db.from("consultations").insert({
        appointment_id: appt.id,
        doctor_id: doctor.user_id,
        patient_id: patient.id,
        status: "ended",
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
      } as never);
    }
    added++;
    console.log(`✔ ${v.type === "online" ? "Video" : "Chamber"} visit on ${start.toISOString().slice(0, 16).replace("T", " ")} UTC — /patient/appointments/${appt.id}`);
  }
  console.log(`\n${added} completed visit(s): ${patient.full_name} ↔ ${doctor.display_name}. Log in as ${patientEmail} to review them.`);
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
