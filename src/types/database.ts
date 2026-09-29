// Hand-maintained until we switch to `supabase gen types typescript`.
// Keep in sync with supabase/migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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

export type DoctorSearchSort = "relevance" | "soonest" | "fee_asc" | "fee_desc" | "experience" | "rating";

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
  /** Only set once the doctor has 3+ published reviews. */
  rating_avg: number | null;
  review_count: number;
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

export type ConsultationStatus = "waiting" | "live" | "ended";
export type RoomStatus = "not_open" | "open" | "closed" | "ended";

type ConsultationRow = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  status: ConsultationStatus;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  notes_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConsultationMessageRow = {
  id: string;
  appointment_id: string;
  sender_id: string;
  kind: "text" | "file";
  body: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: MedicalFileMime | null;
  size_bytes: number | null;
  created_at: string;
};

export const MEDICINE_FORMS = [
  "tablet", "capsule", "syrup", "suspension", "drops", "injection", "cream", "ointment", "gel", "lotion", "inhaler",
  "nasal_spray", "eye_drops", "ear_drops", "suppository", "sachet", "solution", "other",
] as const;
export type MedicineForm = (typeof MEDICINE_FORMS)[number];
export type PrescriptionStatus = "draft" | "signed" | "superseded";
export type MedicineTiming = "before_meal" | "after_meal" | "with_meal" | "empty_stomach" | "bedtime" | "any";

type MedicineRow = {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: MedicineForm;
  company: string | null;
  is_controlled: boolean;
  is_active: boolean;
  is_custom: boolean;
  created_by: string | null;
  created_at: string;
};

type PrescriptionRow = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  parent_id: string | null;
  version: number;
  status: PrescriptionStatus;
  verify_code: string | null;
  is_online: boolean;
  patient_name: string;
  patient_age: string | null;
  patient_sex: Sex | null;
  patient_weight: string | null;
  patient_phone: string | null;
  chief_complaint: string | null;
  findings: string | null;
  diagnosis: string | null;
  advice: string | null;
  follow_up_date: string | null;
  follow_up_note: string | null;
  doctor_name: string | null;
  doctor_degrees: string | null;
  doctor_license: string | null;
  doctor_specialty: string | null;
  doctor_chamber: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PrescriptionItemRow = {
  id: string;
  prescription_id: string;
  medicine_id: string | null;
  medicine_name: string;
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  dose: string | null;
  timing: MedicineTiming | null;
  duration: string | null;
  instructions: string | null;
  is_controlled: boolean;
  sort_order: number;
};

type PrescriptionTestRow = {
  id: string;
  prescription_id: string;
  name: string;
  note: string | null;
  sort_order: number;
};

type PrescriptionTemplateRow = {
  id: string;
  doctor_id: string;
  name: string;
  payload: Json;
  created_at: string;
};

type DoctorAdviceRow = {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string | null;
  title: string | null;
  body: string;
  created_at: string;
};

export type VerifyResult =
  | { status: "invalid" }
  | {
      status: "valid" | "superseded";
      signed_at: string;
      replaced_at: string | null;
      doctor_name: string | null;
      doctor_license: string | null;
      doctor_degrees: string | null;
      patient_initials: string | null;
      patient_age: string | null;
      items: { name: string; dose: string | null; duration: string | null }[];
    };

export type SmsStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationPreferencesRow = {
  user_id: string;
  sms_enabled: boolean;
  sms_phone: string | null;
  sms_phone_verified_at: string | null;
  updated_at: string;
};

type SmsVerificationRow = {
  user_id: string;
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  sends_in_window: number;
  window_started_at: string;
  last_sent_at: string;
};

type SmsOutboxRow = {
  id: string;
  user_id: string | null;
  notification_id: string | null;
  phone: string;
  body: string;
  status: SmsStatus;
  attempts: number;
  provider: string | null;
  provider_ref: string | null;
  error: string | null;
  not_before: string;
  expires_at: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export const REVIEW_TAGS = ["Explains clearly", "Good listener", "On time", "Friendly", "Thorough", "Helpful advice"] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];
export type ReviewStatus = "published" | "hidden";

type ReviewRow = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  rating: number;
  tags: ReviewTag[];
  body: string | null;
  is_anonymous: boolean;
  author_label: string | null;
  status: ReviewStatus;
  hidden_reason: string | null;
  hidden_at: string | null;
  flagged: boolean;
  flag_reason: string | null;
  reply_body: string | null;
  replied_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewReportRow = {
  id: string;
  review_id: string;
  reporter_id: string;
  reason: string;
  resolved_at: string | null;
  created_at: string;
};

type ReviewModerationLogRow = {
  id: string;
  review_id: string;
  actor_id: string | null;
  action: "hidden" | "restored" | "dismissed" | "reported" | "flagged";
  reason: string | null;
  created_at: string;
};

type DoctorRatingStatsRow = {
  doctor_id: string;
  review_count: number;
  rating_avg: number | null;
  count_1: number;
  count_2: number;
  count_3: number;
  count_4: number;
  count_5: number;
  updated_at: string;
};

/** A review as shown publicly / to the doctor (never includes the patient id). */
export type PublicReview = {
  id: string;
  rating: number;
  tags: ReviewTag[];
  body: string | null;
  author: string | null;
  reply_body: string | null;
  replied_at: string | null;
  created_at: string;
  edited_at: string | null;
  consultation_type: ConsultationType;
};

export type DoctorReview = Omit<PublicReview, "consultation_type"> & {
  status: ReviewStatus;
  hidden_reason: string | null;
  visit_date: string;
  consultation_type: ConsultationType;
  reported: boolean;
};


export type AuditCategory = "medical" | "prescription" | "verification" | "security" | "admin";

type AuditLogRow = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_label: string | null;
  category: AuditCategory;
  action: string;
  target_type: string | null;
  target_id: string | null;
  patient_id: string | null;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  metadata: Json;
};

export type RecordAccessRow = {
  occurred_at: string;
  action: string;
  category: AuditCategory;
  actor_label: string;
  actor_role: string | null;
  total_count: number;
};

export type LabTestCategory = "blood" | "urine_stool" | "imaging" | "cardiac" | "other";

type LabTestRow = {
  id: number;
  name: string;
  category: LabTestCategory;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type ComplaintCategory =
  | "appointment" | "payment" | "doctor_conduct" | "patient_conduct" | "prescription"
  | "video_call" | "privacy" | "technical" | "other";
export type ComplaintStatus = "open" | "in_review" | "resolved" | "rejected";
export type ComplaintPriority = "low" | "normal" | "high" | "urgent";

type ComplaintRow = {
  id: string;
  code: string;
  complainant_id: string;
  complainant_role: "patient" | "doctor";
  against_user_id: string | null;
  appointment_id: string | null;
  category: ComplaintCategory;
  subject: string;
  description: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  refund_id: string | null;
  refund_amount: number | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

type ComplaintMessageRow = {
  id: string;
  complaint_id: string;
  author_id: string | null;
  author_role: "patient" | "doctor" | "admin" | "system";
  kind: "message" | "status" | "refund";
  body: string;
  is_internal: boolean;
  created_at: string;
};

export type AnalyticsDay = {
  day: string;
  bookings: number;
  completed: number;
  cancelled: number;
  revenue: number;
  commission: number;
  refunds: number;
};

export type Analytics = {
  from: string;
  to: string;
  series: AnalyticsDay[];
  bookings: number;
  visits: {
    total: number; completed: number; cancelled: number; no_show: number; upcoming: number;
    by_patient: number; by_doctor: number; by_admin: number; online: number; in_person: number;
    active_doctors: number; active_patients: number;
  };
  money: { gross: number; commission: number; refunds: number; payments: number };
  people: { new_patients: number; new_doctors: number };
  complaints: { filed: number; closed: number };
  verified_doctors: number;
  top_specialties: { name: string; visits: number; completed: number; revenue: number }[];
  top_doctors: {
    id: string; name: string; slug: string; specialty: string | null; visits: number; completed: number;
    doctor_cancellations: number; revenue: number; rating_avg: number | null; reviews: number;
  }[];
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
          /** Server (service role) only — users cannot change it themselves. */
          phone?: string | null;
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
        Insert: Pick<SpecialtyRow, "slug" | "name"> & Partial<Pick<SpecialtyRow, "description" | "is_active">>;
        Update: Partial<Pick<SpecialtyRow, "name" | "description" | "is_active">>;
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
      consultations: { Row: ConsultationRow; Insert: never; Update: never; Relationships: [] };
      consultation_messages: {
        Row: ConsultationMessageRow;
        Insert: Omit<ConsultationMessageRow, "id" | "sender_id" | "created_at"> & { sender_id?: string };
        Update: never;
        Relationships: [];
      };
      medicines: {
        Row: MedicineRow;
        Insert: Pick<MedicineRow, "generic_name" | "form"> & Partial<Omit<MedicineRow, "id" | "created_at">>;
        Update: Partial<Omit<MedicineRow, "id" | "created_at" | "created_by">>;
        Relationships: [];
      };
      prescriptions: {
        Row: PrescriptionRow;
        Insert: Partial<Omit<PrescriptionRow, "id" | "created_at" | "updated_at" | "status" | "verify_code" | "signed_at">>;
        Update: Partial<
          Pick<
            PrescriptionRow,
            | "patient_id" | "appointment_id" | "patient_name" | "patient_age" | "patient_sex" | "patient_weight" | "patient_phone"
            | "chief_complaint" | "findings" | "diagnosis" | "advice" | "follow_up_date" | "follow_up_note"
          >
        >;
        Relationships: [];
      };
      prescription_items: {
        Row: PrescriptionItemRow;
        Insert: Omit<PrescriptionItemRow, "id">;
        Update: Partial<Omit<PrescriptionItemRow, "id" | "prescription_id">>;
        Relationships: [];
      };
      prescription_tests: {
        Row: PrescriptionTestRow;
        Insert: Omit<PrescriptionTestRow, "id">;
        Update: Partial<Omit<PrescriptionTestRow, "id" | "prescription_id">>;
        Relationships: [];
      };
      prescription_templates: {
        Row: PrescriptionTemplateRow;
        Insert: Pick<PrescriptionTemplateRow, "name" | "payload">;
        Update: Partial<Pick<PrescriptionTemplateRow, "name" | "payload">>;
        Relationships: [];
      };
      doctor_advice: {
        Row: DoctorAdviceRow;
        Insert: Pick<DoctorAdviceRow, "patient_id" | "body"> & Partial<Pick<DoctorAdviceRow, "appointment_id" | "title">>;
        Update: never;
        Relationships: [];
      };
      notifications: { Row: NotificationRow; Insert: never; Update: never; Relationships: [] };
      notification_preferences: {
        Row: NotificationPreferencesRow;
        Insert: Pick<NotificationPreferencesRow, "user_id"> & Partial<Omit<NotificationPreferencesRow, "user_id">>;
        Update: Partial<Omit<NotificationPreferencesRow, "user_id">>;
        Relationships: [];
      };
      sms_verifications: {
        Row: SmsVerificationRow;
        Insert: Pick<SmsVerificationRow, "user_id" | "phone" | "code_hash" | "expires_at"> & Partial<SmsVerificationRow>;
        Update: Partial<Omit<SmsVerificationRow, "user_id">>;
        Relationships: [];
      };
      sms_outbox: {
        Row: SmsOutboxRow;
        Insert: never;
        Update: Partial<Pick<SmsOutboxRow, "status" | "provider" | "provider_ref" | "error" | "not_before" | "sent_at" | "attempts">>;
        Relationships: [];
      };
      reviews: { Row: ReviewRow; Insert: never; Update: never; Relationships: [] };
      review_reports: { Row: ReviewReportRow; Insert: never; Update: never; Relationships: [] };
      review_moderation_log: { Row: ReviewModerationLogRow; Insert: never; Update: never; Relationships: [] };
      doctor_rating_stats: { Row: DoctorRatingStatsRow; Insert: never; Update: never; Relationships: [] };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Omit<AuditLogRow, "id" | "occurred_at">;
        Update: never;
        Relationships: [];
      };
      lab_tests: {
        Row: LabTestRow;
        Insert: Pick<LabTestRow, "name"> & Partial<Pick<LabTestRow, "category" | "is_active" | "sort_order">>;
        Update: Partial<Pick<LabTestRow, "name" | "category" | "is_active" | "sort_order">>;
        Relationships: [];
      };
      complaints: { Row: ComplaintRow; Insert: never; Update: never; Relationships: [] };
      complaint_messages: { Row: ComplaintMessageRow; Insert: never; Update: never; Relationships: [] };
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
      open_consultation: {
        Args: { p_appointment: string };
        Returns: { consultation_id: string; role: "doctor" | "patient"; room_status: RoomStatus; opens_at: string; closes_at: string }[];
      };
      end_consultation: { Args: { p_appointment: string }; Returns: undefined };
      save_consultation_notes: { Args: { p_appointment: string; p_notes: string }; Returns: string };
      sign_prescription: { Args: { p_id: string }; Returns: string };
      amend_prescription: { Args: { p_id: string }; Returns: string };
      verify_prescription: { Args: { p_code: string }; Returns: VerifyResult };
      mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: number };
      claim_sms: { Args: { p_limit?: number }; Returns: SmsOutboxRow[] };
      queue_appointment_reminders: { Args: Record<string, never>; Returns: number };
      run_notification_jobs: { Args: Record<string, never>; Returns: undefined };
      save_review: {
        Args: { p_appointment: string; p_rating: number; p_tags?: string[]; p_body?: string | null; p_anonymous?: boolean };
        Returns: string;
      };
      delete_review: { Args: { p_review: string }; Returns: undefined };
      my_doctor_reviews: {
        Args: { p_filter?: "all" | "unreplied"; p_limit?: number; p_offset?: number };
        Returns: DoctorReview[];
      };
      reply_to_review: { Args: { p_review: string; p_body: string | null }; Returns: undefined };
      report_review: { Args: { p_review: string; p_reason: string }; Returns: undefined };
      moderate_review: { Args: { p_review: string; p_action: "hide" | "restore" | "dismiss"; p_reason?: string | null }; Returns: undefined };
      doctor_public_reviews: {
        Args: { p_doctor: string; p_sort?: "newest" | "highest" | "lowest"; p_limit?: number; p_offset?: number };
        Returns: (PublicReview & { total_count: number })[];
      };
      queue_review_requests: { Args: Record<string, never>; Returns: number };
      my_record_access: { Args: { p_limit?: number; p_offset?: number }; Returns: RecordAccessRow[] };
      file_complaint: {
        Args: { p_category: string; p_subject: string; p_description: string; p_appointment?: string | null };
        Returns: string;
      };
      reply_complaint: { Args: { p_complaint: string; p_body: string; p_internal?: boolean }; Returns: string };
      admin_update_complaint: {
        Args: { p_complaint: string; p_status: string; p_priority?: string | null; p_resolution?: string | null };
        Returns: undefined;
      };
      create_complaint_refund: {
        Args: { p_complaint: string; p_amount: number; p_admin: string };
        Returns: RefundTicket[];
      };
      admin_analytics: { Args: { p_from: string; p_to: string }; Returns: Analytics };
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
          p_min_rating?: number | null;
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
export type Consultation = ConsultationRow;
export type ConsultationMessage = ConsultationMessageRow;
export type Medicine = MedicineRow;
export type Prescription = PrescriptionRow;
export type PrescriptionItem = PrescriptionItemRow;
export type PrescriptionTest = PrescriptionTestRow;
export type PrescriptionTemplate = PrescriptionTemplateRow;
export type DoctorAdvice = DoctorAdviceRow;
export type AppNotification = NotificationRow;
export type NotificationPreferences = NotificationPreferencesRow;
export type SmsOutbox = SmsOutboxRow;
export type Review = ReviewRow;
export type ReviewReport = ReviewReportRow;
export type ReviewModerationLog = ReviewModerationLogRow;
export type DoctorRatingStats = DoctorRatingStatsRow;
export type AuditLog = AuditLogRow;
export type LabTest = LabTestRow;
export type Complaint = ComplaintRow;
export type ComplaintMessage = ComplaintMessageRow;
