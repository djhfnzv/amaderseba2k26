import { env } from "@/lib/env";

export const MAX_SPECIALTIES = 5;
export const MAX_LANGUAGES = 10;

export const COMMON_LANGUAGES = ["Bangla", "English", "Hindi", "Urdu", "Arabic"];

export const DOCTOR_PHOTOS_BUCKET = "doctor-photos";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB — matches bucket limit
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function doctorPhotoUrl(path: string | null): string | null {
  return path
    ? `${env.supabaseUrl}/storage/v1/object/public/${DOCTOR_PHOTOS_BUCKET}/${path}`
    : null;
}

export function formatFee(amount: number | null): string {
  return amount == null ? "—" : `৳${Number(amount).toLocaleString("en-US")}`;
}

export function yearsOfExperience(since: number | null): number | null {
  if (!since) return null;
  return Math.max(0, new Date().getFullYear() - since);
}

// -----------------------------------------------------------------------------
// Repeatable portfolio sections (education, experience, ...).
// Field names match the DB columns so no mapping is needed.
// -----------------------------------------------------------------------------
export type SectionKey = "education" | "experience" | "chambers" | "publications" | "awards";

export type SectionField = {
  name: string;
  label: string;
  type: "text" | "year" | "url" | "tel";
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Takes half the row on wide screens. */
  half?: boolean;
};

export type SectionConfig = {
  key: SectionKey;
  table:
    | "doctor_education"
    | "doctor_experience"
    | "doctor_chambers"
    | "doctor_publications"
    | "doctor_awards";
  title: string;
  singular: string;
  description: string;
  fields: SectionField[];
  max: number;
};

export const SECTIONS: Record<SectionKey, SectionConfig> = {
  education: {
    key: "education",
    table: "doctor_education",
    title: "Education",
    singular: "degree",
    description: "Degrees and qualifications, e.g. MBBS, FCPS.",
    max: 15,
    fields: [
      { name: "degree", label: "Degree", type: "text", required: true, placeholder: "MBBS", maxLength: 120, half: true },
      { name: "year", label: "Year", type: "year", placeholder: "2012", half: true },
      { name: "institution", label: "Institution", type: "text", required: true, placeholder: "Dhaka Medical College", maxLength: 200 },
    ],
  },
  experience: {
    key: "experience",
    table: "doctor_experience",
    title: "Experience",
    singular: "position",
    description: "Hospitals and positions you have worked in.",
    max: 20,
    fields: [
      { name: "position", label: "Position", type: "text", required: true, placeholder: "Consultant", maxLength: 120 },
      { name: "organization", label: "Hospital / organization", type: "text", required: true, placeholder: "Square Hospital", maxLength: 200 },
      { name: "start_year", label: "From (year)", type: "year", required: true, placeholder: "2015", half: true },
      { name: "end_year", label: "To (year)", type: "year", placeholder: "Leave blank if current", half: true },
    ],
  },
  chambers: {
    key: "chambers",
    table: "doctor_chambers",
    title: "Chambers",
    singular: "chamber",
    description: "Where patients can visit you in person.",
    max: 10,
    fields: [
      { name: "name", label: "Chamber name", type: "text", required: true, placeholder: "Popular Diagnostic Centre", maxLength: 150 },
      { name: "address", label: "Address", type: "text", required: true, placeholder: "House 16, Road 2, Dhanmondi", maxLength: 300 },
      { name: "city", label: "City", type: "text", required: true, placeholder: "Dhaka", maxLength: 80, half: true },
      { name: "phone", label: "Phone for serial", type: "tel", placeholder: "+8801712345678", maxLength: 30, half: true },
      { name: "visiting_hours", label: "Visiting hours", type: "text", placeholder: "Sat–Thu, 5 PM – 9 PM", maxLength: 150 },
    ],
  },
  publications: {
    key: "publications",
    table: "doctor_publications",
    title: "Publications",
    singular: "publication",
    description: "Research papers, articles or books.",
    max: 30,
    fields: [
      { name: "title", label: "Title", type: "text", required: true, maxLength: 300 },
      { name: "publisher", label: "Journal / publisher", type: "text", maxLength: 200, half: true },
      { name: "year", label: "Year", type: "year", half: true },
      { name: "url", label: "Link", type: "url", placeholder: "https://…", maxLength: 500 },
    ],
  },
  awards: {
    key: "awards",
    table: "doctor_awards",
    title: "Awards",
    singular: "award",
    description: "Honours and recognitions.",
    max: 20,
    fields: [
      { name: "title", label: "Award", type: "text", required: true, maxLength: 200 },
      { name: "issuer", label: "Given by", type: "text", maxLength: 200, half: true },
      { name: "year", label: "Year", type: "year", half: true },
    ],
  },
};

export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

type Item = Record<string, string | number | null | undefined>;

const join = (...parts: (string | number | null | undefined)[]) =>
  parts.filter((p) => p != null && p !== "").join(" · ");

/** One-line summary of a section item for lists. */
export function summarizeItem(key: SectionKey, i: Item): { primary: string; secondary: string } {
  switch (key) {
    case "education":
      return { primary: String(i.degree), secondary: join(i.institution, i.year) };
    case "experience":
      return {
        primary: String(i.position),
        secondary: join(i.organization, `${i.start_year} – ${i.end_year ?? "Present"}`),
      };
    case "chambers":
      return { primary: String(i.name), secondary: join(`${i.address}, ${i.city}`, i.visiting_hours, i.phone) };
    case "publications":
      return { primary: String(i.title), secondary: join(i.publisher, i.year) };
    case "awards":
      return { primary: String(i.title), secondary: join(i.issuer, i.year) };
  }
}
