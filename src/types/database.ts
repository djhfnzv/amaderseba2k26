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
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { account_status: AccountStatus };
    CompositeTypes: { [_ in never]: never };
  };
};

export type AppUser = UserRow;
export type PatientProfile = PatientProfileRow;
export type MedicalFile = MedicalFileRow;
