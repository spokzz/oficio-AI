export type AppRole = "owner" | "staff" | "platform_admin";
export type BusinessStatus = "onboarding" | "live" | "needs_review" | "paused" | "canceled";
export type PhoneSetupMode = "twilio_number" | "call_forwarding" | "port_existing" | "sms_transition";
export type VoiceSetupStatus = "not_started" | "pending" | "active" | "blocked";
export type SmsSetupStatus = "not_started" | "pending" | "active" | "transition" | "blocked";
export type JobStatus = "lead" | "pending" | "confirmed" | "in_progress" | "completed" | "canceled";
export type QuoteStatus = "draft" | "needs_owner_approval" | "approved" | "sent" | "accepted" | "declined" | "expired";
export type ContactClassification = "customer" | "personal" | "vendor" | "spam" | "unknown";

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
  phone_setup_notes: string | null;
  base_address: string | null;
  owner_summary_language: string;
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

export type ManualBillingAccount = {
  id: string;
  business_id: string;
  plan_name: string;
  monthly_price: number;
  onboarding_fee: number;
  onboarding_paid: boolean;
  billing_status: string;
  next_payment_due_at: string | null;
  payment_method_note: string | null;
};

export type Customer = {
  id: string;
  business_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  preferred_language: string;
  address: string | null;
  referral_source: string | null;
  recurring_service_type: string | null;
  recurring_interval_weeks: number | null;
  service_fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  estimated_value: number | null;
  final_value: number | null;
  owner_notes: string | null;
  ai_notes: string | null;
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
  customers?: Pick<Customer, "full_name" | "phone"> | null;
};

export type AiSummary = {
  id: string;
  business_id: string;
  summary_language: string;
  summary: string;
  action_needed: string | null;
  confidence: number | null;
  created_at: string;
};
