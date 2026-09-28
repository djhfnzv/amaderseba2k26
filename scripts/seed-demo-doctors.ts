/**
 * DEV / DEMO ONLY — creates verified demo doctors across specialties, each with
 * a portfolio, a chamber and weekly hours, so search and booking have content.
 *
 *   npm run seed:doctors            # create (or refresh) the demo doctors
 *   npm run seed:doctors -- --remove
 *
 * Accounts use demo.<specialty>@medlife.test and DEMO_DOCTOR_PASSWORD
 * (default "DemoDoctor#2026"). Every bio says it's a demo profile.
 * Uses the Supabase secret key: trusted machine only.
 */
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✖ Missing ${name} in .env.local`);
    process.exit(1);
  }
  return value;
}

const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = process.env.DEMO_DOCTOR_PASSWORD?.trim() || "DemoDoctor#2026";
const DOMAIN = "medlife.test";
const DEMO_NOTE = "This is a demo profile for testing MedLife — not a real doctor.";

type Block = { days: number[]; start: string; end: string; type: "online" | "in_person" };
type Demo = {
  specialty: string;
  name: string;
  headline: string;
  bio: string;
  since: number;
  degrees: [string, number][];
  position: string;
  fees: { online: number | null; inPerson: number | null };
  chamber: { name: string; address: string; city: string; phone: string };
  languages: string[];
  hours: Block[];
};

// 0 = Sunday … 6 = Saturday (Bangladesh week: Sat–Thu).
const SAT_TO_THU = [6, 0, 1, 2, 3, 4];

const DOCTORS: Demo[] = [
  {
    specialty: "medicine", name: "Dr. Farhana Rahman", headline: "Consultant, Internal Medicine", since: 2010,
    bio: "Treats fever, diabetes, hypertension and long-term conditions in adults, with a focus on clear explanations and follow-up.",
    degrees: [["MBBS", 2008], ["FCPS (Medicine)", 2015]], position: "Consultant, Department of Medicine",
    fees: { online: 600, inPerson: 1000 }, languages: ["Bangla", "English"],
    chamber: { name: "Green Life Clinic", address: "House 12, Road 5, Dhanmondi", city: "Dhaka", phone: "02-9660001" },
    hours: [{ days: SAT_TO_THU, start: "17:00", end: "21:00", type: "in_person" }, { days: [6, 1, 3], start: "10:00", end: "12:00", type: "online" }],
  },
  {
    specialty: "cardiology", name: "Dr. Mahmudul Hasan", headline: "Interventional Cardiologist", since: 2006,
    bio: "Heart disease, chest pain, high blood pressure and heart-failure care. Reviews ECG and echo reports online.",
    degrees: [["MBBS", 2004], ["MD (Cardiology)", 2012]], position: "Associate Professor, Cardiology",
    fees: { online: 1000, inPerson: 1500 }, languages: ["Bangla", "English"],
    chamber: { name: "HeartCare Centre", address: "Plot 8, Sector 7, Uttara", city: "Dhaka", phone: "02-8950002" },
    hours: [{ days: [0, 2, 4], start: "18:00", end: "21:30", type: "in_person" }, { days: [6, 1], start: "20:00", end: "22:00", type: "online" }],
  },
  {
    specialty: "pediatrics", name: "Dr. Nusrat Jahan", headline: "Child Specialist", since: 2012,
    bio: "Newborn and child health, vaccination advice, growth and nutrition, fever and cough in children.",
    degrees: [["MBBS", 2010], ["DCH", 2014], ["FCPS (Paediatrics)", 2018]], position: "Consultant, Paediatrics",
    fees: { online: 500, inPerson: 800 }, languages: ["Bangla", "English"],
    chamber: { name: "Little Steps Child Clinic", address: "23 Mirpur Road, Kalabagan", city: "Dhaka", phone: "02-9110003" },
    hours: [{ days: SAT_TO_THU, start: "16:00", end: "20:00", type: "in_person" }, { days: [0, 2], start: "10:30", end: "12:30", type: "online" }],
  },
  {
    specialty: "gynecology", name: "Dr. Sharmin Akter", headline: "Obstetrician & Gynaecologist", since: 2009,
    bio: "Pregnancy care, menstrual problems, PCOS and women's health, with private and respectful consultations.",
    degrees: [["MBBS", 2007], ["FCPS (Obs & Gynae)", 2014]], position: "Consultant, Obstetrics & Gynaecology",
    fees: { online: 800, inPerson: 1200 }, languages: ["Bangla", "English"],
    chamber: { name: "Mother & Child Care", address: "45 GEC Circle", city: "Chattogram", phone: "031-650004" },
    hours: [{ days: [6, 0, 1, 2], start: "17:00", end: "20:30", type: "in_person" }, { days: [3], start: "10:00", end: "13:00", type: "online" }],
  },
  {
    specialty: "dermatology", name: "Dr. Tanvir Ahmed", headline: "Skin & VD Specialist", since: 2013,
    bio: "Acne, eczema, fungal infections, hair loss and allergic skin conditions. Photos can be shared during video visits.",
    degrees: [["MBBS", 2011], ["DDV", 2016]], position: "Consultant, Dermatology & Venereology",
    fees: { online: 500, inPerson: 700 }, languages: ["Bangla", "English"],
    chamber: { name: "SkinFirst Clinic", address: "Road 11, Banani", city: "Dhaka", phone: "02-9880005" },
    hours: [{ days: [6, 1, 3], start: "15:00", end: "19:00", type: "in_person" }, { days: [0, 2, 4], start: "19:00", end: "21:00", type: "online" }],
  },
  {
    specialty: "orthopedics", name: "Dr. Kamrul Islam", headline: "Orthopaedic & Trauma Surgeon", since: 2007,
    bio: "Back and joint pain, sports injuries, fractures and arthritis, from first assessment to rehabilitation.",
    degrees: [["MBBS", 2005], ["MS (Orthopaedics)", 2013]], position: "Associate Professor, Orthopaedics",
    fees: { online: 800, inPerson: 1200 }, languages: ["Bangla", "English"],
    chamber: { name: "BoneCare Hospital", address: "Zindabazar", city: "Sylhet", phone: "0821-710006" },
    hours: [{ days: SAT_TO_THU, start: "18:00", end: "21:00", type: "in_person" }],
  },
  {
    specialty: "psychiatry", name: "Dr. Ayesha Siddiqua", headline: "Consultant Psychiatrist", since: 2011,
    bio: "Anxiety, depression, sleep problems and stress. Confidential video consultations available.",
    degrees: [["MBBS", 2009], ["MD (Psychiatry)", 2016]], position: "Consultant, Psychiatry",
    fees: { online: 1000, inPerson: 1200 }, languages: ["Bangla", "English", "Hindi"],
    chamber: { name: "MindWell Centre", address: "House 3, Gulshan Avenue", city: "Dhaka", phone: "02-9890007" },
    hours: [{ days: [0, 2], start: "17:00", end: "20:00", type: "in_person" }, { days: [6, 1, 3, 4], start: "20:00", end: "22:30", type: "online" }],
  },
  {
    specialty: "ent", name: "Dr. Rafiqul Alam", headline: "ENT & Head-Neck Surgeon", since: 2008,
    bio: "Ear, nose and throat problems: sinusitis, tonsils, hearing loss and voice problems.",
    degrees: [["MBBS", 2006], ["DLO", 2011], ["FCPS (ENT)", 2015]], position: "Consultant, ENT",
    fees: { online: 600, inPerson: 900 }, languages: ["Bangla", "English"],
    chamber: { name: "ClearSound ENT Clinic", address: "Shaheb Bazar", city: "Rajshahi", phone: "0721-770008" },
    hours: [{ days: [6, 0, 1, 2, 3], start: "16:30", end: "20:00", type: "in_person" }, { days: [4], start: "11:00", end: "13:00", type: "online" }],
  },
  {
    specialty: "neurology", name: "Dr. Imran Hossain", headline: "Neurologist", since: 2009,
    bio: "Headache and migraine, epilepsy, stroke follow-up, numbness and nerve problems.",
    degrees: [["MBBS", 2007], ["MD (Neurology)", 2015]], position: "Assistant Professor, Neurology",
    fees: { online: 900, inPerson: 1300 }, languages: ["Bangla", "English"],
    chamber: { name: "NeuroCare Point", address: "KDA Avenue", city: "Khulna", phone: "041-720009" },
    hours: [{ days: [6, 1, 3], start: "17:30", end: "21:00", type: "in_person" }, { days: [0, 2], start: "19:00", end: "21:00", type: "online" }],
  },
  {
    specialty: "ophthalmology", name: "Dr. Sabrina Chowdhury", headline: "Eye Specialist & Surgeon", since: 2012,
    bio: "Eye checks, glasses prescriptions, cataract and glaucoma assessment, dry and red eyes.",
    degrees: [["MBBS", 2010], ["DO", 2014], ["FCPS (Ophthalmology)", 2019]], position: "Consultant, Ophthalmology",
    fees: { online: 500, inPerson: 800 }, languages: ["Bangla", "English"],
    chamber: { name: "BrightSight Eye Care", address: "Mohakhali DOHS", city: "Dhaka", phone: "02-9870010" },
    hours: [{ days: SAT_TO_THU, start: "10:00", end: "13:00", type: "in_person" }],
  },
  {
    specialty: "gastroenterology", name: "Dr. Mizanur Rahman", headline: "Gastroenterologist & Hepatologist", since: 2008,
    bio: "Acidity, IBS, liver disease, jaundice and digestive problems; reviews endoscopy reports.",
    degrees: [["MBBS", 2006], ["MD (Gastroenterology)", 2014]], position: "Consultant, Gastroenterology",
    fees: { online: 800, inPerson: 1200 }, languages: ["Bangla", "English"],
    chamber: { name: "DigestCare Clinic", address: "Nasirabad", city: "Chattogram", phone: "031-650011" },
    hours: [{ days: [0, 2, 4], start: "17:00", end: "21:00", type: "in_person" }, { days: [6, 1], start: "10:00", end: "12:00", type: "online" }],
  },
  {
    specialty: "endocrinology", name: "Dr. Rumana Haque", headline: "Diabetes & Hormone Specialist", since: 2010,
    bio: "Diabetes, thyroid disorders, obesity and hormone problems, with regular online follow-ups.",
    degrees: [["MBBS", 2008], ["MD (Endocrinology)", 2016]], position: "Consultant, Endocrinology",
    fees: { online: 700, inPerson: 1000 }, languages: ["Bangla", "English"],
    chamber: { name: "Hormone & Diabetes Centre", address: "Shantinagar", city: "Dhaka", phone: "02-9350012" },
    hours: [{ days: [6, 1, 3], start: "16:00", end: "19:00", type: "in_person" }, { days: SAT_TO_THU, start: "20:30", end: "22:00", type: "online" }],
  },
];

const slugify = (s: string) => s.toLowerCase().replace(/^dr\.?\s+/, "dr ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const emailFor = (d: Demo) => `demo.${d.specialty}@${DOMAIN}`;

async function findUserId(email: string): Promise<string | null> {
  const { data } = await db.from("users").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

async function remove() {
  const { data } = await db.from("users").select("id, email").like("email", `demo.%@${DOMAIN}`);
  for (const u of data ?? []) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    console.log(error ? `✖ ${u.email}: ${error.message}` : `✔ Removed ${u.email}`);
  }
  console.log(`\n${data?.length ?? 0} demo doctor(s) removed.`);
}

async function seedOne(d: Demo) {
  const email = emailFor(d);
  const { data: spec } = await db.from("specialties").select("id").eq("slug", d.specialty).maybeSingle();
  if (!spec) throw new Error(`Unknown specialty ${d.specialty}`);

  let id = await findUserId(email);
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: d.name, role: "doctor" },
    });
    if (error || !data.user) throw new Error(`${email}: ${error?.message}`);
    id = data.user.id;
  }

  const year = new Date().getFullYear();
  const { error: pErr } = await db.from("doctor_profiles").upsert({
    user_id: id,
    slug: slugify(d.name),
    display_name: d.name,
    headline: d.headline,
    bio: `${d.bio}\n\n${DEMO_NOTE}`,
    license_number: `DEMO-${1000 + DOCTORS.indexOf(d)}`,
    practice_since_year: d.since,
    languages: d.languages,
    offers_online: d.fees.online != null && d.hours.some((h) => h.type === "online"),
    offers_in_person: d.fees.inPerson != null && d.hours.some((h) => h.type === "in_person"),
    fee_online: d.fees.online,
    fee_in_person: d.fees.inPerson,
    is_verified: true,
  } as never);
  if (pErr) throw new Error(`${email} profile: ${pErr.message}`);

  // Portfolio sections: replace whatever a previous run created.
  for (const t of ["doctor_specialties", "doctor_education", "doctor_experience", "doctor_availability", "doctor_chambers"] as const) {
    await db.from(t).delete().eq("doctor_id", id);
  }
  await db.from("doctor_specialties").insert({ doctor_id: id, specialty_id: spec.id, is_primary: true } as never);
  await db.from("doctor_education").insert(
    d.degrees.map(([degree, y], i) => ({
      doctor_id: id,
      degree,
      institution: i === 0 ? "Demo Medical College" : "Demo Postgraduate Institute",
      year: y,
    })) as never,
  );
  await db.from("doctor_experience").insert({
    doctor_id: id, position: d.position, organization: "Demo General Hospital", start_year: Math.min(year, d.since + 6), end_year: null,
  } as never);
  const { data: chamber, error: cErr } = await db
    .from("doctor_chambers")
    .insert({ doctor_id: id, ...d.chamber, visiting_hours: "See the schedule for times" } as never)
    .select("id")
    .single();
  if (cErr || !chamber) throw new Error(`${email} chamber: ${cErr?.message}`);

  const blocks = d.hours.flatMap((h) =>
    h.days.map((weekday) => ({
      doctor_id: id,
      weekday,
      start_time: h.start,
      end_time: h.end,
      consultation_type: h.type,
      chamber_id: h.type === "in_person" ? chamber.id : null,
      consultation_minutes: 20,
    })),
  );
  const { error: aErr } = await db.from("doctor_availability").insert(blocks as never);
  if (aErr) throw new Error(`${email} hours: ${aErr.message}`);

  const now = new Date().toISOString();
  await db
    .from("verification_requests")
    .upsert({ doctor_id: id, status: "approved", submitted_at: now, reviewed_at: now } as never, { onConflict: "doctor_id" });

  console.log(`✔ ${d.name.padEnd(24)} ${d.specialty.padEnd(17)} /doctors/${slugify(d.name)}`);
}

async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    console.error("✖ Refusing to seed demo data in production.");
    process.exit(1);
  }
  if (process.argv.includes("--remove")) return remove();
  for (const d of DOCTORS) await seedOne(d);
  console.log(`\n${DOCTORS.length} demo doctors ready. Log in as demo.<specialty>@${DOMAIN} / ${PASSWORD}`);
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
