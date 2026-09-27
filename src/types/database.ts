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
  timezone: string;
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

export type DoctorSearchSort = "relevance" | "soonest" | "fee_asc" | "fee_desc" | "experience";

export type DoctorSearchRow = {
  user_id: string;
  slug: string;
  display_name: string;
  headline: string | null;
  photo_path: string | null;
  practice_since_year: number | null;
  languages: string[];
  offers_online: boolean;
  offers_in_person: boolean;
  fee_online: number | null;
  fee_in_person: number | null;
  specialties: string[];
  degrees: string[];
  cities: string[];
  next_available: string | null;
  total_count: number;
};

export type ConsultationType = "online" | "in_person";

type DoctorAvailabilityRow = {
  id: string;
  doctor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  consultation_type: ConsultationType;
  chamber_id: string | null;
  consultation_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type DoctorLeaveRow = {
  id: string;
  doctor_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
};

export type AvailableSlot = {
  slot_start: string;
  slot_end: string;
  consultation_type: ConsultationType;
  chamber_id: string | null;
  consultation_minutes: number;
};

export type AppointmentStatus =
  | "pending_payment"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired"
  | "no_show";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "partially_refunded" | "waived";
export type PaymentMethod = "online" | "at_chamber";
export type AppointmentAction =
  | "booked"
  | "cancelled"
  | "rescheduled"
  | "started"
  | "completed"
  | "no_show"
  | "payment_received"
  | "expired"
  | "refunded";

type AppointmentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  slot_start: string;
  slot_end: string;
  consultation_type: ConsultationType;
  chamber_id: string | null;
  status: AppointmentStatus;
  fee: number | null;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_due_at: string | null;
  patient_note: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type SlotHoldRow = {
  id: string;
  doctor_id: string;
  patient_id: string;
  slot_start: string;
  slot_end: string;
  consultation_type: ConsultationType;
  chamber_id: string | null;
  expires_at: string;
  created_at: string;
};

type AppointmentEventRow = {
  id: string;
  appointment_id: string;
  action: AppointmentAction;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

type AdminActionRow = {
  id: string;
  admin_id: string | null;
  target_user_id: string;
  action: "suspended" | "reactivated";
  reason: string | null;
  details: { role?: Role; cancelled_appointments?: number };
  created_at: string;
};

export type PaymentProvider = "sslcommerz" | "mock";
export type PaymentRowStatus = "initiated" | "paid" | "failed" | "cancelled" | "expired";
export type RefundStatus = "pending" | "processing" | "succeeded" | "failed";

type PlatformSettingsRow = {
  id: number;
  commission_percent: number;
  refund_full_hours: number;
  refund_partial_percent: number;
  payment_window_minutes: number;
  currency: string;
  updated_by: string | null;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  provider: PaymentProvider;
  tran_id: string;
  amount: number;
  currency: string;
  status: PaymentRowStatus;
  val_id: string | null;
  bank_tran_id: string | null;
  card_type: string | null;
  commission_amount: number | null;
  doctor_amount: number | null;
  gateway_data: Record<string, unknown>;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type RefundRow = {
  id: string;
  payment_id: string;
  appointment_id: string;
  amount: number;
  reason: string | null;
  status: RefundStatus;
  provider_ref: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

type PayoutRow = {
  id: string;
  doctor_id: string;
  amount: number;
  method: "bank" | "bkash" | "nagad" | "cash" | "other";
  reference: string | null;
  note: string | null;
  paid_at: string;
  created_by: string | null;
  created_at: string;
};

type RefundTicket = { refund_id: string; amount: number; bank_tran_id: string | null; provider: PaymentProvider; tran_id: string };

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
      doctor_availability: {
        Row: DoctorAvailabilityRow;
        Insert: Omit<DoctorAvailabilityRow, "id" | "doctor_id" | "created_at" | "updated_at" | "is_active"> & {
          doctor_id?: string;
          is_active?: boolean;
        };
        Update: Partial<Omit<DoctorAvailabilityRow, "id" | "doctor_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      doctor_leaves: {
        Row: DoctorLeaveRow;
        Insert: Omit<DoctorLeaveRow, "id" | "doctor_id" | "created_at"> & { doctor_id?: string };
        Update: never;
        Relationships: [];
      };
      appointments: { Row: AppointmentRow; Insert: never; Update: never; Relationships: [] };
      slot_holds: { Row: SlotHoldRow; Insert: never; Update: never; Relationships: [] };
      appointment_events: { Row: AppointmentEventRow; Insert: never; Update: never; Relationships: [] };
      admin_actions: { Row: AdminActionRow; Insert: never; Update: never; Relationships: [] };
      platform_settings: {
        Row: PlatformSettingsRow;
        Insert: never;
        Update: Partial<Pick<PlatformSettingsRow, "commission_percent" | "refund_full_hours" | "refund_partial_percent" | "payment_window_minutes" | "updated_by">>;
        Relationships: [];
      };
      payments: { Row: PaymentRow; Insert: never; Update: never; Relationships: [] };
      refunds: { Row: RefundRow; Insert: never; Update: never; Relationships: [] };
      payouts: { Row: PayoutRow; Insert: never; Update: never; Relationships: [] };
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
      admin_set_user_status: {
        Args: { p_user: string; p_status: AccountStatus; p_reason?: string | null };
        Returns: number;
      };
      hold_slot: { Args: { p_doctor: string; p_slot_start: string; p_type: ConsultationType }; Returns: string };
      release_hold: { Args: { p_hold: string }; Returns: undefined };
      confirm_booking: { Args: { p_hold: string; p_note?: string | null; p_pay_at_chamber?: boolean }; Returns: string };
      expire_stale_payments: { Args: { p_doctor?: string | null }; Returns: number };
      begin_payment: {
        Args: { p_appointment: string; p_provider: PaymentProvider };
        Returns: { payment_id: string; tran_id: string; amount: number; currency: string; due_at: string | null }[];
      };
      complete_payment: {
        Args: {
          p_tran_id: string;
          p_val_id: string;
          p_bank_tran_id: string | null;
          p_amount: number;
          p_card_type: string | null;
          p_data?: Record<string, unknown>;
        };
        Returns: { appointment_id: string; needs_refund: boolean }[];
      };
      fail_payment: { Args: { p_tran_id: string; p_status: "failed" | "cancelled"; p_data?: Record<string, unknown> }; Returns: string | null };
      create_refund_for: { Args: { p_appointment: string }; Returns: RefundTicket[] };
      retry_refund: { Args: { p_refund: string }; Returns: RefundTicket[] };
      finish_refund: { Args: { p_refund: string; p_success: boolean; p_ref: string | null; p_error: string | null }; Returns: undefined };
      doctor_earnings: {
        Args: { p_doctor: string };
        Returns: { gross: number; commission: number; refunded: number; net: number; paid_out: number; balance: number }[];
      };
      admin_record_payout: {
        Args: { p_doctor: string; p_amount: number; p_method: PayoutRow["method"]; p_reference?: string | null; p_note?: string | null };
        Returns: string;
      };
      cancel_appointment: { Args: { p_id: string; p_reason?: string | null }; Returns: undefined };
      reschedule_appointment: { Args: { p_id: string; p_new_start: string }; Returns: undefined };
      update_appointment_status: {
        Args: { p_id: string; p_action: "start" | "complete" | "no_show" };
        Returns: undefined;
      };
      copy_availability_day: { Args: { p_from: number; p_to: number[] }; Returns: number };
      get_available_slots: {
        Args: { p_doctor: string; p_from?: string | null; p_days?: number; p_type?: ConsultationType | null };
        Returns: AvailableSlot[];
      };
      search_doctors: {
        Args: {
          p_query?: string | null;
          p_specialty?: string | null;
          p_type?: "online" | "in_person" | null;
          p_min_fee?: number | null;
          p_max_fee?: number | null;
          p_language?: string | null;
          p_city?: string | null;
          p_sort?: DoctorSearchSort;
          p_limit?: number;
          p_offset?: number;
          p_available_days?: number | null;
        };
        Returns: DoctorSearchRow[];
      };
      doctor_search_facets: {
        Args: Record<string, never>;
        Returns: {
          languages: string[];
          cities: string[];
          specialties: { slug: string; name: string; count: number }[];
        }[];
      };
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
export type DoctorAvailability = DoctorAvailabilityRow;
export type DoctorLeave = DoctorLeaveRow;
export type Appointment = AppointmentRow;
export type SlotHold = SlotHoldRow;
export type AppointmentEvent = AppointmentEventRow;
export type AdminAction = AdminActionRow;
export type PlatformSettings = PlatformSettingsRow;
export type Payment = PaymentRow;
export type Refund = RefundRow;
export type Payout = PayoutRow;
