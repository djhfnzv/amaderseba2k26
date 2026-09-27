// Hand-maintained until we switch to `supabase gen types typescript`.
// Keep in sync with supabase/migrations.

export type Role = "patient" | "doctor" | "admin";
export type AccountStatus = "active" | "suspended";
export type Sex = "male" | "female" | "other";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
export type MedicalFileCategory =
  | "lab_report"
  | "imaging"
  | "prescription"
  | "discharge_summary"
  | "other";
export type MedicalFileMime = "application/pdf" | "image/jpeg" | "image/png";

type UserRow = {
  id: string;
  role: Role;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: AccountStatus;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
};

type PatientProfileRow = {
  user_id: string;
  date_of_birth: string | null;
  sex: Sex | null;
  weight_kg: number | null;
  height_cm: number | null;
  blood_group: BloodGroup | null;
  allergies: string[];
  chronic_conditions: string[];
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string;
};

type MedicalFileRow = {
  id: string;
  patient_id: string;
  title: string;
  category: MedicalFileCategory;
  report_date: string | null;
  notes: string | null;
  storage_path: string;
  file_name: string;
  mime_type: MedicalFileMime;
  size_bytes: number;
  created_at: string;
};

type SpecialtyRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

type DoctorProfileRow = {
  user_id: string;
  slug: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  photo_path: string | null;
  license_number: string | null;
  practice_since_year: number | null;
  languages: string[];
  offers_online: boolean;
  offers_in_person: boolean;
  fee_online: number | null;
  fee_in_person: number | null;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type DoctorSpecialtyRow = { doctor_id: string; specialty_id: number; is_primary: boolean };

type DoctorEducationRow = {
  id: string;
  doctor_id: string;
  degree: string;
  institution: string;
  year: number | null;
  created_at: string;
};

type DoctorExperienceRow = {
  id: string;
  doctor_id: string;
  position: string;
  organization: string;
  start_year: number;
  end_year: number | null;
  created_at: string;
};

type DoctorChamberRow = {
  id: string;
  doctor_id: string;
  name: string;
  address: string;
  city: string;
  visiting_hours: string | null;
  phone: string | null;
  created_at: string;
};

type DoctorPublicationRow = {
  id: string;
  doctor_id: string;
  title: string;
  publisher: string | null;
  year: number | null;
  url: string | null;
  created_at: string;
};

type DoctorAwardRow = {
  id: string;
  doctor_id: string;
  title: string;
  issuer: string | null;
  year: number | null;
  created_at: string;
};

/** Standard shape for a child table: id/doctor_id/created_at are DB-filled. */
type ChildTable<R extends { id: string; doctor_id: string; created_at: string }> = {
  Row: R;
  Insert: Omit<R, "id" | "doctor_id" | "created_at"> & { doctor_id?: string };
  Update: Partial<Omit<R, "id" | "doctor_id" | "created_at">>;
  Relationships: [];
};

export type VerificationStatus = "draft" | "pending" | "approved" | "rejected";
export type VerificationDocType = "license" | "degree" | "national_id" | "other";
export type VerificationAction = "submitted" | "approved" | "rejected" | "revoked";

type VerificationRequestRow = {
  id: string;
  doctor_id: string;
  status: VerificationStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type VerificationDocumentRow = {
  id: string;
  request_id: string;
  doctor_id: string;
  doc_type: VerificationDocType;
  label: string | null;
  storage_path: string;
  file_name: string;
  mime_type: MedicalFileMime;
  size_bytes: number;
  created_at: string;
};

type VerificationEventRow = {
  id: string;
  request_id: string;
  action: VerificationAction;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      roles: {
        Row: { id: string; description: string };
        Insert: { id: string; description: string };
        Update: { id?: string; description?: string };
        Relationships: [];
      };
      users: {
        Row: UserRow;
        Insert: never;
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          role?: Role;
          status?: AccountStatus;
          suspended_reason?: string | null;
        };
        Relationships: [];
      };
      patient_profiles: {
        Row: PatientProfileRow;
        Insert: Omit<PatientProfileRow, "created_at" | "updated_at">;
        Update: Partial<Omit<PatientProfileRow, "user_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      medical_files: {
        Row: MedicalFileRow;
        Insert: Omit<MedicalFileRow, "id" | "patient_id" | "created_at"> & {
          patient_id?: string;
        };
        Update: never;
        Relationships: [];
      };
      specialties: {
        Row: SpecialtyRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      doctor_profiles: {
        Row: DoctorProfileRow;
        Insert: Pick<DoctorProfileRow, "user_id" | "slug" | "display_name"> &
          Partial<Omit<DoctorProfileRow, "user_id" | "slug" | "display_name">>;
        Update: Partial<Omit<DoctorProfileRow, "user_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      doctor_specialties: {
        Row: DoctorSpecialtyRow;
        Insert: DoctorSpecialtyRow;
        Update: Partial<DoctorSpecialtyRow>;
        Relationships: [];
      };
      doctor_education: ChildTable<DoctorEducationRow>;
      doctor_experience: ChildTable<DoctorExperienceRow>;
      doctor_chambers: ChildTable<DoctorChamberRow>;
      doctor_publications: ChildTable<DoctorPublicationRow>;
      doctor_awards: ChildTable<DoctorAwardRow>;
      verification_requests: {
        Row: VerificationRequestRow;
        Insert: { doctor_id: string; status?: "draft" };
        Update: never;
        Relationships: [];
      };
      verification_documents: {
        Row: VerificationDocumentRow;
        Insert: Omit<VerificationDocumentRow, "id" | "doctor_id" | "created_at"> & { doctor_id?: string };
        Update: never;
        Relationships: [];
      };
      verification_events: {
        Row: VerificationEventRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      doctor_is_public: { Args: { doctor: string }; Returns: boolean };
      verification_request_editable: { Args: { request: string }; Returns: boolean };
      submit_verification_request: { Args: Record<string, never>; Returns: undefined };
      review_verification_request: {
        Args: { p_request_id: string; p_decision: "approve" | "reject" | "revoke"; p_reason?: string | null };
        Returns: undefined;
      };
    };
    Enums: { account_status: AccountStatus };
    CompositeTypes: { [_ in never]: never };
  };
};

export type AppUser = UserRow;
export type PatientProfile = PatientProfileRow;
export type MedicalFile = MedicalFileRow;
export type Specialty = SpecialtyRow;
export type DoctorProfile = DoctorProfileRow;
export type DoctorEducation = DoctorEducationRow;
export type DoctorExperience = DoctorExperienceRow;
export type DoctorChamber = DoctorChamberRow;
export type DoctorPublication = DoctorPublicationRow;
export type DoctorAward = DoctorAwardRow;
export type VerificationRequest = VerificationRequestRow;
export type VerificationDocument = VerificationDocumentRow;
export type VerificationEvent = VerificationEventRow;
