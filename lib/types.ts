export type AppRole = "owner" | "staff" | "platform_admin";
export type BusinessStatus = "onboarding" | "live" | "needs_review" | "paused" | "canceled";
export type PhoneSetupMode = "twilio_number" | "call_forwarding" | "port_existing" | "sms_transition";
export type VoiceSetupStatus = "not_started" | "pending" | "active" | "blocked";
export type SmsSetupStatus = "not_started" | "pending" | "active" | "transition" | "blocked";
export type ExistingNumberKind = "unknown" | "business" | "personal" | "mixed";
export type PortingStatus = "not_started" | "collecting_info" | "submitted" | "completed" | "blocked";
export type JobStatus = "lead" | "pending" | "confirmed" | "in_progress" | "completed" | "canceled";
export type QuoteStatus = "draft" | "needs_owner_approval" | "approved" | "sent" | "accepted" | "declined" | "expired";
export type ContactClassification = "customer" | "personal" | "vendor" | "spam" | "unknown";
export type OwnerSummaryChannel = "sms" | "email";
export type MinuteLimitPolicy = "continue_overage" | "voicemail" | "forward_owner";

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  preferred_language: string;
  role: AppRole;
};

export type Business = {
  id: string;
  name: string;
  trade: string;
  status: BusinessStatus;
  phone: string | null;
  twilio_routing_phone: string | null;
  owner_transfer_phone: string | null;
  phone_setup_mode: PhoneSetupMode;
  voice_setup_status: VoiceSetupStatus;
  sms_setup_status: SmsSetupStatus;
  messaging_service_sid: string | null;
  minute_limit_policy: MinuteLimitPolicy;
  phone_setup_notes: string | null;
  existing_number_kind: ExistingNumberKind;
  porting_status: PortingStatus;
  phone_setup_owner_approved: boolean;
  base_address: string | null;
  base_lat: number | null;
  base_lng: number | null;
  base_geocoded_at?: string | null;
  base_geocode_accuracy?: number | null;
  base_geocode_provider?: string | null;
  available_services: string[];
  booking_time_zone: string;
  business_hours_text: string;
  owner_summary_language: string;
  owner_summary_channel: OwnerSummaryChannel;
  ai_voice_name: string;
};

export type ServiceRadiusRule = {
  id: string;
  business_id: string;
  radius_miles: number;
  allow_outside_radius: boolean;
  require_owner_approval_outside_radius: boolean;
  extra_travel_fee: number;
};

export type BusinessAvailabilityException = {
  id: string;
  business_id: string;
  title: string;
  starts_on: string;
  ends_on: string;
  message: string | null;
  created_at: string;
  updated_at: string;
};

export type ManualBillingAccount = {
  id: string;
  business_id: string;
  plan_name: string;
  monthly_price: number;
  included_minutes: number;
  overage_starts_at_minutes: number;
  overage_rate_per_minute: number;
  onboarding_fee: number;
  onboarding_paid: boolean;
  billing_status: string;
  next_payment_due_at: string | null;
  payment_method_note: string | null;
};

export type { AiCallUsage } from "@/lib/call-usage";

export type Customer = {
  id: string;
  business_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  preferred_language: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_at?: string | null;
  geocode_accuracy?: number | null;
  geocode_provider?: string | null;
  referral_source: string | null;
  recurring_service_type: string | null;
  recurring_interval_weeks: number | null;
  service_fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRecurringReminder = {
  id: string;
  business_id: string;
  customer_id: string;
  service_type: string | null;
  interval_weeks: number;
  due_at: string;
  last_service_at: string | null;
  status: "due" | "dismissed" | "scheduled" | "stale";
  generated_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, "full_name" | "phone" | "address"> | null;
};

export type Job = {
  id: string;
  business_id: string;
  customer_id: string | null;
  title: string;
  service_type: string | null;
  status: JobStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_at?: string | null;
  geocode_accuracy?: number | null;
  geocode_provider?: string | null;
  estimated_value: number | null;
  final_value: number | null;
  owner_notes: string | null;
  ai_notes: string | null;
  created_at?: string;
  customers?: Pick<Customer, "full_name" | "phone" | "preferred_language" | "address"> | null;
};

export type Quote = {
  id: string;
  business_id: string;
  customer_id: string | null;
  job_id: string | null;
  status: QuoteStatus;
  service_type: string | null;
  intake_answers: Record<string, unknown>;
  photo_urls: string[];
  ai_observations: string | null;
  suggested_low: number | null;
  suggested_high: number | null;
  owner_price: number | null;
  owner_approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  customers?: Pick<Customer, "full_name" | "phone" | "preferred_language" | "address"> | null;
};

export type Message = {
  id: string;
  business_id: string;
  customer_id: string | null;
  channel: string;
  direction: string;
  language: string | null;
  body: string;
  media_urls: string[];
  from_phone: string | null;
  to_phone: string | null;
  created_at: string;
  customers?: Pick<Customer, "full_name" | "phone"> | null;
};

export type CallSession = {
  id: string;
  business_id: string;
  customer_id: string | null;
  from_phone: string | null;
  to_phone: string | null;
  detected_language: string | null;
  contact_type: ContactClassification;
  screening_result: string | null;
  needs_owner_review: boolean;
  qualified_business_seconds: number;
  status: string;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  transcript: string | null;
  voicemail_recording_sid?: string | null;
  voicemail_recording_url?: string | null;
  voicemail_recording_duration_seconds?: number | null;
  job_id?: string | null;
  customers?: Pick<Customer, "full_name" | "phone"> | null;
  jobs?: Pick<Job, "address" | "scheduled_start" | "service_type" | "status"> | null;
};

export type AiSummary = {
  id: string;
  business_id: string;
  call_session_id: string | null;
  customer_id: string | null;
  summary_language: string;
  summary: string;
  display_summary?: string;
  display_translation_pending?: boolean;
  action_needed: string | null;
  display_action_needed?: string | null;
  confidence: number | null;
  created_at: string;
  customers?: Pick<Customer, "full_name" | "phone"> | null;
};
