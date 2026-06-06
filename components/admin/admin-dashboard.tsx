"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addAdminAvailabilityException,
  deleteAdminAccount,
  deleteAdminAvailabilityException,
  onboardOwner,
  updateAdminAccount,
  updateAdminOwnerName,
  updateBusinessPhoneSetup
} from "@/app/actions/admin";
import { CalendarIcon, DollarIcon, MessageIcon, UsersIcon } from "@/components/ui/icons";
import { EyeIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { AddressLookupInput } from "@/components/ui/address-lookup-input";
import { StatusPill } from "@/components/ui/status-pill";
import { aiCallPlanOptions, normalizeAiCallPlan } from "@/lib/call-usage";
import { formatCurrency } from "@/lib/format";
import { serviceOptions, type ServiceOption } from "@/lib/services";
import type { AdminAccount, AdminPortalData } from "@/lib/admin-data";
import type { MinuteLimitPolicy, PhoneSetupMode, SmsSetupStatus, VoiceSetupStatus } from "@/lib/types";

export type AdminTab = "overview" | "onboarding" | "accounts" | "phone" | "usage" | "billing" | "playbook";

const CSRF_FIELD_NAME = "csrfToken";
const phoneSetupLabels: Record<PhoneSetupMode, string> = {
  call_forwarding: "Keep number + forward calls",
  port_existing: "Port existing number",
  sms_transition: "SMS transition mode",
  twilio_number: "Use Twilio number"
};

const voiceStatusLabels: Record<VoiceSetupStatus, string> = {
  active: "Voice active",
  blocked: "Voice blocked",
  not_started: "Voice not started",
  pending: "Voice pending"
};

const smsStatusLabels: Record<SmsSetupStatus, string> = {
  active: "SMS active",
  blocked: "SMS blocked",
  not_started: "SMS not started",
  pending: "SMS pending",
  transition: "SMS transition"
};

const businessStatusOptions = ["onboarding", "live", "needs_review", "paused", "canceled"] as const;
const tradeOptions = ["landscaping", "roofing", "plumbing", "cleaning", "hvac", "other"] as const;
const billingStatusOptions = ["trial", "active", "past_due", "paused", "canceled"] as const;
const minuteLimitPolicyOptions: Array<{ description: string; label: string; value: MinuteLimitPolicy }> = [
  {
    description: "Ana keeps answering and extra minutes are billed at this account's overage rate.",
    label: "Continue calls and bill overage",
    value: "continue_overage"
  },
  {
    description: "Callers leave their name, number, and reason for calling for owner follow-up.",
    label: "Stop AI calls and take basic voicemail",
    value: "voicemail"
  },
  {
    description: "New calls go directly to the configured owner transfer cell.",
    label: "Forward calls to owner",
    value: "forward_owner"
  }
];

const timeZoneOptions = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu"
];
const businessDayOptions = [
  { label: "Monday", shortLabel: "Mon", value: "monday" },
  { label: "Tuesday", shortLabel: "Tue", value: "tuesday" },
  { label: "Wednesday", shortLabel: "Wed", value: "wednesday" },
  { label: "Thursday", shortLabel: "Thu", value: "thursday" },
  { label: "Friday", shortLabel: "Fri", value: "friday" },
  { label: "Saturday", shortLabel: "Sat", value: "saturday" },
  { label: "Sunday", shortLabel: "Sun", value: "sunday" }
] as const;
const businessTimeOptions = ["6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"] as const;

type BusinessDay = (typeof businessDayOptions)[number]["value"];
type OnboardingChecklistValues = {
  aiAgentName: string;
  businessAddress: string;
  businessHoursText: string;
  businessName: string;
  businessPhone: string;
  existingNumberKind: string;
  messagingServiceSid: string;
  ownerApproved: boolean;
  ownerEmail: string;
  ownerTransferPhone: string;
  radiusMiles: string;
  twilioRoutingPhone: string;
};

type OnboardingFormValues = OnboardingChecklistValues & {
  bookingTimeZone: string;
  includedMinutes: string;
  monthlyPrice: string;
  minuteLimitPolicy: MinuteLimitPolicy;
  onboardingFee: string;
  overageStartsAtMinutes: string;
  ownerName: string;
  ownerPassword: string;
  ownerSummaryChannel: string;
  ownerSummaryLanguage: string;
  phoneSetupNotes: string;
  planName: string;
  trade: string;
  overageRatePerMinute: string;
};

const defaultBusinessHoursText = "Monday through Friday, 8:00 AM to 5:00 PM";
const defaultPhoneSetupNotes =
  "Capture porting readiness, forwarding instructions, customer-facing intro message, and any owner concerns. Do not store carrier account PINs here.";
const defaultOnboardingValues: OnboardingFormValues = {
  aiAgentName: "Ana",
  bookingTimeZone: "America/Chicago",
  businessAddress: "",
  businessHoursText: defaultBusinessHoursText,
  businessName: "",
  businessPhone: "",
  existingNumberKind: "unknown",
  includedMinutes: String(normalizeAiCallPlan("Premium").allowanceMinutes),
  messagingServiceSid: "",
  monthlyPrice: String(normalizeAiCallPlan("Premium").monthlyPrice),
  minuteLimitPolicy: "continue_overage",
  onboardingFee: "199",
  overageStartsAtMinutes: String(normalizeAiCallPlan("Premium").overageStartsAtMinutes),
  ownerApproved: false,
  ownerEmail: "",
  ownerName: "",
  ownerPassword: "",
  ownerSummaryChannel: "sms",
  ownerSummaryLanguage: "en",
  ownerTransferPhone: "",
  phoneSetupNotes: defaultPhoneSetupNotes,
  planName: "Premium",
  radiusMiles: "30",
  trade: "landscaping",
  twilioRoutingPhone: "",
  overageRatePerMinute: String(normalizeAiCallPlan("Premium").overageRatePerMinute)
};

const setupScenarios: Array<{
  mode: PhoneSetupMode;
  title: string;
  bestFor: string;
  adminSteps: string[];
  ownerMessage: string;
}> = [
  {
    mode: "port_existing",
    title: "Port existing business number",
    bestFor: "Best UX when the number is truly a business number.",
    adminSteps: [
      "Confirm the number is not the owner's private personal line.",
      "Collect Twilio porting documents outside this app.",
      "After port completes, set public number and Twilio routing number to the same number."
    ],
    ownerMessage: "Customers keep using the number they already know. The AI receptionist answers calls and texts from that same number."
  },
  {
    mode: "sms_transition",
    title: "Keep personal/mixed number + SMS transition",
    bestFor: "Best when the owner uses one cell for personal and business.",
    adminSteps: [
      "Do not port the personal cell.",
      "Forward calls from the old number to the AI receptionist's Twilio number.",
      "Owner forwards old-number customer texts to the AI receptionist using FWD +1CUSTOMER and the message."
    ],
    ownerMessage: "The AI receptionist helps move customer conversations to the business texting number without taking over private messages."
  },
  {
    mode: "twilio_number",
    title: "Use new AI/Twilio number",
    bestFor: "Best for new businesses or owners ready to use a new official number.",
    adminSteps: [
      "Add the Twilio number to the Messaging Service sender pool.",
      "Use the Twilio number on website, Google profile, cards, and ads.",
      "Set voice and SMS to active after a live call/text test."
    ],
    ownerMessage: "Customers call and text the AI receptionist directly on the new business number."
  },
  {
    mode: "call_forwarding",
    title: "Calls only: keep number + forward calls",
    bestFor: "Useful when SMS migration is delayed but call answering can start.",
    adminSteps: [
      "Set up carrier call forwarding from the existing number to the AI receptionist's Twilio number.",
      "Keep SMS marked pending or transition until the owner chooses a texting path.",
      "Test a customer-style call and a personal-transfer call."
    ],
    ownerMessage: "The AI receptionist answers forwarded calls. Text messages stay on the existing phone until SMS transition or porting is chosen."
  }
];

function scenarioFor(mode: PhoneSetupMode) {
  return setupScenarios.find((scenario) => scenario.mode === mode) ?? setupScenarios[2];
}

function serviceLabel(service: string) {
  if (service === "yard_cleanup") return "Yard cleanup";
  if (service === "tree_cutting") return "Tree services";
  if (service === "mowing") return "Lawn mowing";
  return service.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function accountServices(account: AdminAccount): ServiceOption[] {
  const selected = Array.isArray(account.available_services)
    ? account.available_services.filter((service): service is ServiceOption => serviceOptions.includes(service as ServiceOption))
    : [];

  return selected.length ? selected : [...serviceOptions];
}

function supportsServiceCatalog(trade?: string | null) {
  // TODO: Add service catalogs for roofing, plumbing, cleaning, HVAC, and other trades.
  return trade === "landscaping";
}

function formatDateOnly(value: string | null | undefined, fallback = "Not set") {
  if (!value) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatClosureRange(startsOn: string, endsOn: string) {
  if (startsOn === endsOn) return formatDateOnly(startsOn);
  return `${formatDateOnly(startsOn)} - ${formatDateOnly(endsOn)}`;
}

function formatMinutes(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 && value % 1 !== 0 ? 1 : 0,
    minimumFractionDigits: 0
  }).format(value);
}

function overageLabel(account: AdminAccount) {
  const usage = account.aiCallUsage;

  if (usage.overageRatePerMinute === null) {
    return usage.overageMinutes > 0 ? `${formatMinutes(usage.overageMinutes)} min over allowance` : "No overage billing";
  }

  return `${formatMinutes(usage.billableOverageMinutes)} min · ${formatCurrency(usage.overageAmount)} at ${formatCurrency(usage.overageRatePerMinute)}/min`;
}

function minuteLimitPolicyLabel(policy?: MinuteLimitPolicy | null) {
  return minuteLimitPolicyOptions.find((option) => option.value === (policy ?? "continue_overage"))?.label ?? "Continue calls and bill overage";
}

function BillingPlanFields({
  includedMinutes,
  monthlyPrice,
  overageStartsAtMinutes,
  overageRatePerMinute,
  planName
}: {
  includedMinutes?: number | null;
  monthlyPrice?: number | null;
  overageStartsAtMinutes?: number | null;
  overageRatePerMinute?: number | null;
  planName?: string | null;
}) {
  const initialPlan = normalizeAiCallPlan(planName);
  const [selectedPlanName, setSelectedPlanName] = useState(initialPlan.label);
  const [selectedMonthlyPrice, setSelectedMonthlyPrice] = useState(String(monthlyPrice ?? initialPlan.monthlyPrice));
  const [selectedIncludedMinutes, setSelectedIncludedMinutes] = useState(String(includedMinutes ?? initialPlan.allowanceMinutes));
  const [selectedOverageThreshold, setSelectedOverageThreshold] = useState(
    String(overageStartsAtMinutes ?? initialPlan.overageStartsAtMinutes)
  );
  const [selectedOverageRate, setSelectedOverageRate] = useState(String(overageRatePerMinute ?? initialPlan.overageRatePerMinute));

  const selectPlan = (nextPlanName: string) => {
    const plan = normalizeAiCallPlan(nextPlanName);
    setSelectedPlanName(plan.label);
    setSelectedMonthlyPrice(String(plan.monthlyPrice));
    setSelectedIncludedMinutes(String(plan.allowanceMinutes));
    setSelectedOverageThreshold(String(plan.overageStartsAtMinutes));
    setSelectedOverageRate(String(plan.overageRatePerMinute));
  };

  return (
    <>
      <label className="field">
        <span>AI call plan</span>
        <select name="planName" onChange={(event) => selectPlan(event.target.value)} value={selectedPlanName}>
          {aiCallPlanOptions.map((plan) => (
            <option key={plan.key} value={plan.label}>
              {plan.label} · {formatCurrency(plan.monthlyPrice)}/mo · {formatMinutes(plan.allowanceMinutes)} min
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Monthly price</span>
        <div className="currency-input">
          <span aria-hidden="true">$</span>
          <input min="0" name="monthlyPrice" onChange={(event) => setSelectedMonthlyPrice(event.target.value)} step="0.01" type="number" value={selectedMonthlyPrice} />
        </div>
      </label>
      <label className="field">
        <span>Included minutes</span>
        <input min="0" name="includedMinutes" onChange={(event) => setSelectedIncludedMinutes(event.target.value)} step="1" type="number" value={selectedIncludedMinutes} />
      </label>
      <label className="field">
        <span>Overage starts at total minutes</span>
        <input
          min={selectedIncludedMinutes || "0"}
          name="overageStartsAtMinutes"
          onChange={(event) => setSelectedOverageThreshold(event.target.value)}
          step="1"
          type="number"
          value={selectedOverageThreshold}
        />
      </label>
      <label className="field">
        <span>Overage price per minute</span>
        <div className="currency-input">
          <span aria-hidden="true">$</span>
          <input min="0" name="overageRatePerMinute" onChange={(event) => setSelectedOverageRate(event.target.value)} step="0.01" type="number" value={selectedOverageRate} />
        </div>
      </label>
    </>
  );
}

function MinuteLimitPolicyFields({
  defaultValue = "continue_overage",
  onChange,
  value
}: {
  defaultValue?: MinuteLimitPolicy;
  onChange?: (value: MinuteLimitPolicy) => void;
  value?: MinuteLimitPolicy;
}) {
  return (
    <fieldset className="field full">
      <legend>When monthly minutes are used</legend>
      <div className="list">
        {minuteLimitPolicyOptions.map((option) => (
          <label className="row-card checkbox-field" key={option.value}>
            <input
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              name="minuteLimitPolicy"
              onChange={() => onChange?.(option.value)}
              type="radio"
              value={option.value}
            />
            <span>
              <strong>{option.label}</strong>
              <small className="meta">{option.description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function parseBusinessHours(value?: string | null): { days: BusinessDay[]; endTime: string; startTime: string } {
  const text = String(value ?? "");
  const lowerText = text.toLowerCase();
  const days = businessDayOptions
    .filter((day) => lowerText.includes(day.label.toLowerCase()) || lowerText.includes(day.shortLabel.toLowerCase()))
    .map((day) => day.value);
  const matchedTimes = text.match(/\d{1,2}:00\s*[AP]M/gi) ?? [];
  const startTime = businessTimeOptions.find((time) => time.toLowerCase() === matchedTimes[0]?.toLowerCase()) ?? "8:00 AM";
  const endTime = businessTimeOptions.find((time) => time.toLowerCase() === matchedTimes[1]?.toLowerCase()) ?? "5:00 PM";

  return {
    days: days.length ? days : ["monday", "tuesday", "wednesday", "thursday", "friday"],
    endTime,
    startTime
  };
}

function businessDaysText(days: BusinessDay[]) {
  const selectedIndexes = days
    .map((day) => businessDayOptions.findIndex((option) => option.value === day))
    .filter((index) => index >= 0)
    .sort((first, second) => first - second);

  if (selectedIndexes.length === 5 && selectedIndexes.every((index, position) => index === position)) {
    return "Monday through Friday";
  }

  if (selectedIndexes.length === 7) {
    return "Monday through Sunday";
  }

  return selectedIndexes.map((index) => businessDayOptions[index].label).join(", ");
}

function businessHoursText(days: BusinessDay[], startTime: string, endTime: string) {
  return `${businessDaysText(days)}, ${startTime} to ${endTime}`;
}

function minutesFromTimeLabel(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3].toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === "AM" && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validPhone(value: string) {
  return value.replace(/\D/g, "").length >= 10;
}

function validMessagingServiceSid(value: string) {
  return !value.trim() || /^MG[a-f0-9]{32}$/i.test(value.trim());
}

function launchChecklistItems(values: OnboardingChecklistValues, selectedMode: PhoneSetupMode, twilioCredentialsReady: boolean) {
  const radius = Number(values.radiusMiles);
  const hours = parseBusinessHours(values.businessHoursText);
  const startMinutes = minutesFromTimeLabel(hours.startTime);
  const endMinutes = minutesFromTimeLabel(hours.endTime);
  const businessProfileReady =
    Boolean(values.businessName.trim()) && validEmail(values.ownerEmail) && Boolean(values.businessAddress.trim());
  const serviceRadiusReady = Boolean(values.businessAddress.trim()) && Number.isFinite(radius) && radius > 0;
  const businessHoursReady = hours.days.length > 0 && startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
  const aiAgentReady = Boolean(values.aiAgentName.trim());
  const phoneSetupReady =
    selectedMode === "twilio_number"
      ? validPhone(values.twilioRoutingPhone)
      : selectedMode === "call_forwarding"
        ? validPhone(values.businessPhone) && validPhone(values.twilioRoutingPhone)
        : selectedMode === "port_existing"
          ? values.existingNumberKind === "business" && validPhone(values.businessPhone)
          : validPhone(values.businessPhone) && validPhone(values.twilioRoutingPhone);
  const smsReady =
    selectedMode === "call_forwarding"
      ? true
      : validMessagingServiceSid(values.messagingServiceSid) && (selectedMode === "sms_transition" || Boolean(values.messagingServiceSid.trim()));
  const approvalReady = values.ownerApproved;

  return [
    {
      detail: businessProfileReady ? "Business, owner email, and address are present." : "Add business name, valid owner email, and service address.",
      label: "Business profile",
      ready: businessProfileReady
    },
    {
      detail: serviceRadiusReady ? `${radius} mile radius will be created.` : "Choose a valid radius and business address.",
      label: "Service radius",
      ready: serviceRadiusReady
    },
    {
      detail: businessHoursReady ? values.businessHoursText : "Choose service days and a valid start/end time.",
      label: "Business hours",
      ready: businessHoursReady
    },
    {
      detail: aiAgentReady ? `Agent will introduce as ${values.aiAgentName.trim()}.` : "Enter the AI receptionist name.",
      label: "AI agent",
      ready: aiAgentReady
    },
    {
      detail: phoneSetupReady ? scenarioFor(selectedMode).title : "Add the phone numbers required for this setup path.",
      label: "Phone setup",
      ready: phoneSetupReady
    },
    {
      detail: twilioCredentialsReady
        ? "Platform Twilio Account SID and Auth Token are configured."
        : "Configure the platform Twilio Account SID and Auth Token in the deployment environment.",
      label: "Twilio credentials",
      ready: twilioCredentialsReady
    },
    {
      detail: smsReady ? "SMS path is valid for this setup." : "Add a valid Messaging Service SID or choose SMS transition.",
      label: "SMS compliance",
      ready: smsReady
    },
    {
      detail: approvalReady ? "Owner has approved the phone path." : "Check owner approval before launch.",
      label: "Owner approval",
      ready: approvalReady
    }
  ];
}

function CsrfField({ token }: { token: string }) {
  return <input name={CSRF_FIELD_NAME} type="hidden" value={token} />;
}

export function AdminDashboard({ data, activeTab, csrfToken }: { data: AdminPortalData; activeTab: AdminTab; csrfToken: string }) {
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      {activeTab === "overview" ? <Overview data={data} /> : null}
      {activeTab === "onboarding" ? (
        <Onboarding
          csrfToken={csrfToken}
          onQueuedCall={() => showToast("Test call queued for demo.")}
          twilioCredentials={data.twilioCredentials}
        />
      ) : null}
      {activeTab === "accounts" ? <Accounts csrfToken={csrfToken} data={data} onAction={() => showToast("Account opened for review.")} /> : null}
      {activeTab === "phone" ? <PhoneSetup csrfToken={csrfToken} data={data} /> : null}
      {activeTab === "usage" ? <Usage data={data} /> : null}
      {activeTab === "billing" ? <Billing data={data} onAction={() => showToast("Billing note saved for demo.")} /> : null}
      {activeTab === "playbook" ? <Playbook onAction={() => showToast("AI playbook saved for demo.")} /> : null}
      {toast ? <div className="toast show">{toast}</div> : null}
    </>
  );
}

function Overview({ data }: { data: AdminPortalData }) {
  return (
    <div className="grid">
      <div className="grid stats-grid">
        <Stat featured label="MRR" value={formatCurrency(data.totals.monthlyRevenue)} foot="Monthly revenue" icon={<DollarIcon />} />
        <Stat label="Businesses" value={data.totals.businesses} foot="Total accounts" icon={<UsersIcon />} />
        <Stat label="Live" value={data.totals.live} foot="Taking calls" icon={<MessageIcon />} />
        <Stat label="Onboarding" value={data.totals.onboarding} foot="Setup fees tracked per account" icon={<CalendarIcon />} />
      </div>
      <section className="card">
        <h2>Account Health</h2>
        <AccountTable data={data} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  foot,
  icon,
  featured = false
}: {
  label: string;
  value: string | number;
  foot: string;
  icon: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <article className={`card metric-card ${featured ? "featured" : ""}`}>
      <div className="icon-stat">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
        {icon}
      </div>
      <div className="stat-foot">{foot}</div>
    </article>
  );
}

function AccountTable({ data }: { data: AdminPortalData }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Owner</th>
            <th>Trade</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Next payment</th>
          </tr>
        </thead>
        <tbody>
          {data.accounts.map((account) => {
            const billing = account.manual_billing_accounts?.[0];
            const owner = account.owners[0];
            return (
              <tr key={account.id}>
                <td>
                  <strong>{account.name}</strong>
                  <div className="meta">{account.base_address ?? "No address"}</div>
                </td>
                <td>
                  <strong>{owner?.full_name ?? "No owner linked"}</strong>
                  <div className="meta">{owner?.phone ?? owner?.email ?? "No contact"}</div>
                </td>
                <td>{account.trade}</td>
                <td>
                  <StatusPill status={account.status} />
                </td>
                <td>
                  <div>{normalizeAiCallPlan(billing?.plan_name).label}</div>
                  <div className="meta">
                    {formatMinutes(account.aiCallUsage.usedMinutes)} / {formatMinutes(account.aiCallUsage.allowanceMinutes)} min
                  </div>
                  <div className="meta">
                    Overage after {formatMinutes(account.aiCallUsage.overageStartsAtMinutes)} · {formatMinutes(account.aiCallUsage.overageMinutes)} billable
                  </div>
                </td>
                <td>{formatDateOnly(billing?.next_payment_due_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function accountLaunchChecks(account: AdminAccount) {
  const billing = account.manual_billing_accounts?.[0];
  const ownerLinked = account.owners.length > 0;
  const hasAddress = Boolean(account.base_address && account.base_lat !== null && account.base_lng !== null);
  const voiceReady = account.voice_setup_status === "active";
  const smsReady = account.sms_setup_status === "active" || account.sms_setup_status === "transition";
  const billingReady = Boolean(billing && !["past_due", "canceled"].includes(billing.billing_status));
  const phoneReady =
    account.phone_setup_mode === "twilio_number"
      ? Boolean(account.twilio_routing_phone)
      : account.phone_setup_mode === "port_existing"
        ? account.existing_number_kind === "business" && Boolean(account.phone)
        : Boolean(account.phone && account.twilio_routing_phone);

  return [
    { label: "Owner", ready: ownerLinked },
    { label: "Address", ready: hasAddress },
    { label: "Phone", ready: phoneReady },
    { label: "Voice", ready: voiceReady },
    { label: "SMS", ready: smsReady },
    { label: "Billing", ready: billingReady }
  ];
}

function accountReadiness(account: AdminAccount) {
  const checks = accountLaunchChecks(account);
  const ready = checks.filter((check) => check.ready).length;

  return {
    checks,
    label: `${ready}/${checks.length} ready`,
    ready,
    total: checks.length
  };
}

function SaveSetupButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? "Saving..." : "Save setup"}
    </button>
  );
}

function InlineNameSaveButton() {
  const { pending } = useFormStatus();

  return (
    <button className="inline-edit-save" disabled={pending} type="submit">
      {pending ? "Saving" : "Save"}
    </button>
  );
}

function OwnerNameEditor({ csrfToken, owner }: { csrfToken: string; owner: AdminAccount["owners"][number] }) {
  const [state, formAction] = useActionState(updateAdminOwnerName, {});

  return (
    <form action={formAction} className="inline-edit-form">
      <CsrfField token={csrfToken} />
      <input name="ownerId" type="hidden" value={owner.id} />
      <input className="inline-edit-input" defaultValue={owner.full_name ?? ""} maxLength={120} name="ownerName" placeholder="Owner name" required />
      <InlineNameSaveButton />
      {state.error ? <span className="inline-edit-error">{state.error}</span> : null}
      {state.success ? <span className="inline-edit-success">{state.success}</span> : null}
    </form>
  );
}

function useCloseDetailsOnOutside() {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeIfOutside = (event: MouseEvent | TouchEvent) => {
      const details = detailsRef.current;
      if (!details?.open || !event.target || details.contains(event.target as Node)) return;
      details.open = false;
    };

    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("touchstart", closeIfOutside);

    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("touchstart", closeIfOutside);
    };
  }, []);

  return detailsRef;
}

function BusinessHoursDropdowns({
  initialText,
  onTextChange
}: {
  initialText?: string | null;
  onTextChange?: (value: string) => void;
}) {
  const parsedHours = parseBusinessHours(initialText);
  const detailsRef = useCloseDetailsOnOutside();
  const [selectedDays, setSelectedDays] = useState<BusinessDay[]>(parsedHours.days);
  const [startTime, setStartTime] = useState(parsedHours.startTime);
  const [endTime, setEndTime] = useState(parsedHours.endTime);
  const selectedDayText = selectedDays.map((day) => businessDayOptions.find((option) => option.value === day)?.shortLabel).filter(Boolean).join(", ");
  const textValue = businessHoursText(selectedDays, startTime, endTime);

  useEffect(() => {
    onTextChange?.(textValue);
  }, [onTextChange, textValue]);

  const toggleDay = (day: BusinessDay) => {
    setSelectedDays((current) => {
      if (current.includes(day)) {
        return current.length === 1 ? current : current.filter((selected) => selected !== day);
      }

      const next = [...current, day];
      return businessDayOptions.map((option) => option.value).filter((option) => next.includes(option));
    });
  };

  return (
    <div className="business-hours-dropdowns">
      <input name="businessHoursText" type="hidden" value={textValue} />
      <div className="field">
        <span>Business days</span>
        <div className="service-dropdown compact">
          <details ref={detailsRef}>
            <summary title={businessDaysText(selectedDays)}>
              <span>{selectedDayText}</span>
            </summary>
            <div className="service-dropdown-menu">
              {businessDayOptions.map((day) => {
                const checked = selectedDays.includes(day.value);

                return (
                  <label className="service-dropdown-option" key={day.value}>
                    <input checked={checked} onChange={() => toggleDay(day.value)} type="checkbox" />
                    <span>{day.label}</span>
                  </label>
                );
              })}
            </div>
          </details>
        </div>
      </div>
      <label className="field">
        <span>Start time</span>
        <select onChange={(event) => setStartTime(event.target.value)} value={startTime}>
          {businessTimeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>End time</span>
        <select onChange={(event) => setEndTime(event.target.value)} value={endTime}>
          {businessTimeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Onboarding({
  csrfToken,
  onQueuedCall,
  twilioCredentials
}: {
  csrfToken: string;
  onQueuedCall: () => void;
  twilioCredentials: AdminPortalData["twilioCredentials"];
}) {
  const [state, formAction] = useActionState(onboardOwner, {});
  const [selectedMode, setSelectedMode] = useState<PhoneSetupMode>("twilio_number");
  const [formValues, setFormValues] = useState<OnboardingFormValues>(defaultOnboardingValues);
  const selectedScenario = scenarioFor(selectedMode);
  const checklistItems = launchChecklistItems(formValues, selectedMode, twilioCredentials.ready);
  const updateFormValue = <Key extends keyof OnboardingFormValues>(key: Key, value: OnboardingFormValues[Key]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
  };
  const handleBusinessHoursTextChange = useCallback((value: string) => {
    setFormValues((current) => (current.businessHoursText === value ? current : { ...current, businessHoursText: value }));
  }, []);
  const handleModeSelect = (mode: PhoneSetupMode) => {
    setSelectedMode(mode);
    setFormValues((current) => ({
      ...current,
      existingNumberKind: mode === "port_existing" ? "business" : current.existingNumberKind
    }));
  };
  const handlePlanSelect = (planName: string) => {
    const plan = normalizeAiCallPlan(planName);
    setFormValues((current) => ({
      ...current,
      includedMinutes: String(plan.allowanceMinutes),
      monthlyPrice: String(plan.monthlyPrice),
      overageStartsAtMinutes: String(plan.overageStartsAtMinutes),
      overageRatePerMinute: String(plan.overageRatePerMinute),
      planName: plan.label
    }));
  };

  return (
    <div className="grid">
      <section className="card">
        <h2>New Owner Setup</h2>
        <form action={formAction}>
          <CsrfField token={csrfToken} />
          <div className="form-grid">
            <p className="meta full">
              Leave password blank to link an existing Supabase Auth user. Add a temporary password to create a new Auth user.
            </p>
            <label className="field">
              <span>Business name</span>
              <input name="businessName" onChange={(event) => updateFormValue("businessName", event.target.value)} placeholder="Green Valley Landscaping" required value={formValues.businessName} />
            </label>
            <label className="field">
              <span>Owner name</span>
              <input name="ownerName" onChange={(event) => updateFormValue("ownerName", event.target.value)} placeholder="Lowa Winter" value={formValues.ownerName} />
            </label>
            <label className="field">
              <span>Owner email</span>
              <input name="ownerEmail" onChange={(event) => updateFormValue("ownerEmail", event.target.value)} placeholder="owner@example.com" required type="email" value={formValues.ownerEmail} />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input name="ownerPassword" onChange={(event) => updateFormValue("ownerPassword", event.target.value)} placeholder="At least 8 characters" type="password" value={formValues.ownerPassword} />
            </label>
            <label className="field">
              <span>Trade</span>
              <select name="trade" onChange={(event) => updateFormValue("trade", event.target.value)} value={formValues.trade}>
                <option value="landscaping">Landscaping</option>
                <option value="roofing">Roofing</option>
                <option value="plumbing">Plumbing</option>
                <option value="cleaning">Cleaning</option>
              </select>
            </label>
            <AddressLookupInput className="full" label="Business address" name="businessAddress" onValueChange={(value) => updateFormValue("businessAddress", value)} placeholder="123 Main St, Austin, TX" value={formValues.businessAddress} />
            <label className="field">
              <span>Service radius</span>
              <select name="radiusMiles" onChange={(event) => updateFormValue("radiusMiles", event.target.value)} value={formValues.radiusMiles}>
                <option value="15">15 miles</option>
                <option value="30">30 miles</option>
                <option value="45">45 miles</option>
              </select>
            </label>
            <label className="field">
              <span>AI agent name</span>
              <input maxLength={40} name="aiAgentName" onChange={(event) => updateFormValue("aiAgentName", event.target.value)} placeholder="Ana" required value={formValues.aiAgentName} />
            </label>
            <label className="field">
              <span>Owner summary language</span>
              <select name="ownerSummaryLanguage" onChange={(event) => updateFormValue("ownerSummaryLanguage", event.target.value)} value={formValues.ownerSummaryLanguage}>
                <option value="en">English</option>
	                <option value="es">Español</option>
              </select>
            </label>
            <label className="field">
              <span>Owner summary method</span>
              <select name="ownerSummaryChannel" onChange={(event) => updateFormValue("ownerSummaryChannel", event.target.value)} value={formValues.ownerSummaryChannel}>
                <option value="sms">SMS text</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label className="field">
              <span>Booking time zone</span>
              <select name="bookingTimeZone" onChange={(event) => updateFormValue("bookingTimeZone", event.target.value)} value={formValues.bookingTimeZone}>
                {timeZoneOptions.map((timeZone) => (
                  <option key={timeZone} value={timeZone}>
                    {timeZone}
                  </option>
                ))}
              </select>
            </label>
            <div className="field full compact-field">
              <BusinessHoursDropdowns
                initialText={defaultBusinessHoursText}
                onTextChange={handleBusinessHoursTextChange}
              />
            </div>
            <label className="field">
              <span>AI call plan</span>
              <select name="planName" onChange={(event) => handlePlanSelect(event.target.value)} value={formValues.planName}>
                {aiCallPlanOptions.map((plan) => (
                  <option key={plan.key} value={plan.label}>
                    {plan.label} · {formatCurrency(plan.monthlyPrice)}/mo · {formatMinutes(plan.allowanceMinutes)} min
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Monthly price</span>
              <div className="currency-input">
                <span aria-hidden="true">$</span>
                <input min="0" name="monthlyPrice" onChange={(event) => updateFormValue("monthlyPrice", event.target.value)} step="0.01" type="number" value={formValues.monthlyPrice} />
              </div>
            </label>
            <label className="field">
              <span>Included minutes</span>
              <input min="0" name="includedMinutes" onChange={(event) => updateFormValue("includedMinutes", event.target.value)} step="1" type="number" value={formValues.includedMinutes} />
            </label>
            <label className="field">
              <span>Overage starts at total minutes</span>
              <input
                min={formValues.includedMinutes || "0"}
                name="overageStartsAtMinutes"
                onChange={(event) => updateFormValue("overageStartsAtMinutes", event.target.value)}
                step="1"
                type="number"
                value={formValues.overageStartsAtMinutes}
              />
            </label>
            <label className="field">
              <span>Overage price per minute</span>
              <div className="currency-input">
                <span aria-hidden="true">$</span>
                <input min="0" name="overageRatePerMinute" onChange={(event) => updateFormValue("overageRatePerMinute", event.target.value)} step="0.01" type="number" value={formValues.overageRatePerMinute} />
              </div>
            </label>
            <label className="field">
              <span>Setup fee</span>
              <div className="currency-input">
                <span aria-hidden="true">$</span>
                <input min="0" name="onboardingFee" onChange={(event) => updateFormValue("onboardingFee", event.target.value)} step="0.01" type="number" value={formValues.onboardingFee} />
              </div>
            </label>
            <div className="field">
              <span>First monthly payment due</span>
              <div className="admin-service-placeholder">Automatically set to one calendar month after account creation.</div>
            </div>
            <MinuteLimitPolicyFields
              onChange={(value) => updateFormValue("minuteLimitPolicy", value)}
              value={formValues.minuteLimitPolicy}
            />
          </div>
          <div className="setup-guidance">
            <article className="row-card">
              <div className="section-card-header">
                <div>
                  <strong>Twilio platform credentials</strong>
                  <div className="meta">
                    Shared by all customer accounts. Keep the Auth Token in server environment variables, not in customer records.
                  </div>
                </div>
                <StatusPill
                  label={twilioCredentials.ready ? "Configured" : "Needs configuration"}
                  status={twilioCredentials.ready ? "confirmed" : "needs_review"}
                />
              </div>
              <div className="meta">
                Account SID: {twilioCredentials.accountSidConfigured ? "configured" : "missing"} · Auth Token:{" "}
                {twilioCredentials.authTokenConfigured ? "configured" : "missing"}
              </div>
            </article>
          </div>
          <PhoneScenarioPicker selectedMode={selectedMode} onSelect={handleModeSelect} />
          <div className="setup-guidance">
            <article className="row-card">
              <strong>{selectedScenario.title}</strong>
              <div className="meta">{selectedScenario.ownerMessage}</div>
              <ol className="setup-steps">
                {selectedScenario.adminSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          </div>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Existing number type</span>
              <select value={formValues.existingNumberKind} name="existingNumberKind" onChange={(event) => updateFormValue("existingNumberKind", event.target.value)}>
                <option value="unknown">Not confirmed</option>
                <option value="business">Dedicated business number</option>
                <option value="personal">Owner personal cell</option>
                <option value="mixed">Mixed business/personal number</option>
              </select>
            </label>
            <label className="field">
              <span>Business public number</span>
              <input name="businessPhone" onChange={(event) => updateFormValue("businessPhone", event.target.value)} placeholder="+13125551234" type="tel" value={formValues.businessPhone} />
            </label>
            <label className="field">
              <span>Twilio routing number</span>
              <input name="twilioRoutingPhone" onChange={(event) => updateFormValue("twilioRoutingPhone", event.target.value)} placeholder="Client Twilio number, e.g. +13125559876" type="tel" value={formValues.twilioRoutingPhone} />
            </label>
            <label className="field">
              <span>Owner private cell for transfers</span>
              <input name="ownerTransferPhone" onChange={(event) => updateFormValue("ownerTransferPhone", event.target.value)} placeholder="Owner real phone, e.g. +13125554321" type="tel" value={formValues.ownerTransferPhone} />
            </label>
            <label className="field">
              <span>Messaging Service SID</span>
              <input name="messagingServiceSid" onChange={(event) => updateFormValue("messagingServiceSid", event.target.value)} placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={formValues.messagingServiceSid} />
            </label>
            <label className="field full checkbox-field">
              <input checked={formValues.ownerApproved} name="phoneSetupOwnerApproved" onChange={(event) => updateFormValue("ownerApproved", event.target.checked)} type="checkbox" />
              <span>Owner approved this phone setup path and understands what number customers will see.</span>
            </label>
            <label className="field full">
              <span>Phone setup notes</span>
              <textarea
                name="phoneSetupNotes"
                onChange={(event) => updateFormValue("phoneSetupNotes", event.target.value)}
                value={formValues.phoneSetupNotes}
              />
            </label>
          </div>
          {state.error ? <p className="form-error" style={{ marginTop: 16 }}>{state.error}</p> : null}
          {state.success ? <p className="form-success" style={{ marginTop: 16 }}>{state.success}</p> : null}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <SaveSetupButton />
            <button className="button gold" onClick={onQueuedCall} type="button">
              Queue test call
            </button>
          </div>
        </form>
      </section>
      <section className="card">
        <h2>Launch Checklist</h2>
        <div className="list">
          {checklistItems.map((item) => (
            <article className="row-card split" key={item.label}>
              <div>
                <strong>{item.label}</strong>
                <div className="meta">{item.detail}</div>
              </div>
              <StatusPill status={item.ready ? "confirmed" : "needs_review"} label={item.ready ? "Ready" : "Needs input"} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Accounts({ csrfToken, data, onAction }: { csrfToken: string; data: AdminPortalData; onAction: () => void }) {
  const router = useRouter();
  const [viewAccount, setViewAccount] = useState<AdminAccount | null>(null);
  const [editAccount, setEditAccount] = useState<AdminAccount | null>(null);
  const [, startDeleteTransition] = useTransition();
  const liveAccounts = data.accounts.filter((account) => account.status === "live").length;
  const needsSetup = data.accounts.filter((account) => accountReadiness(account).ready < accountReadiness(account).total).length;
  const monthlyRevenue = data.accounts.reduce((sum, account) => sum + Number(account.manual_billing_accounts?.[0]?.monthly_price ?? 0), 0);
  const handleDelete = useCallback(
    (account: AdminAccount) => {
      if (!window.confirm(`Delete ${account.name}? This removes the business account and related business data.`)) return;

      startDeleteTransition(async () => {
        const result = await deleteAdminAccount(account.id, csrfToken);
        if (result.error) {
          window.alert(result.error);
          return;
        }

        router.refresh();
      });
    },
    [csrfToken, router]
  );

  return (
    <div className="admin-accounts-page">
      <section className="card admin-accounts-intro">
        <div>
          <h2>Accounts</h2>
          <p className="meta">Admin is the internal operations console for onboarding businesses, verifying phone/SMS readiness, monitoring launch health, and keeping billing/account details accurate.</p>
        </div>
        <div className="admin-account-summary">
          <div>
            <span>Total</span>
            <strong>{data.accounts.length}</strong>
          </div>
          <div>
            <span>Live</span>
            <strong>{liveAccounts}</strong>
          </div>
          <div>
            <span>Needs setup</span>
            <strong>{needsSetup}</strong>
          </div>
          <div>
            <span>Monthly revenue</span>
            <strong>{formatCurrency(monthlyRevenue)}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-card-header">
          <div>
            <h2>Account Directory</h2>
            <p className="meta">Select an account to view details, edit setup, or remove it.</p>
          </div>
        </div>
        <div className="customer-table-wrap">
          <table className="customer-table owner-directory-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Owner</th>
                <th>Trade</th>
                <th>Status</th>
                <th>Billing</th>
                <th>AI minutes</th>
                <th>Readiness</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => {
                const billing = account.manual_billing_accounts?.[0];
                const readiness = accountReadiness(account);
                const owner = account.owners[0];

                return (
                  <tr key={account.id}>
                    <td>
                      <strong className="customer-name">{account.name}</strong>
                      <div className="meta">{account.base_address ?? "No address"}</div>
                    </td>
                    <td>
                      <strong>{owner?.full_name ?? "No owner"}</strong>
                      <div className="meta">{owner?.email ?? owner?.phone ?? "No contact"}</div>
                    </td>
                    <td>{account.trade}</td>
                    <td>
                      <StatusPill status={account.status} />
                    </td>
                    <td>
                      <div>{billing?.billing_status ?? "not set"}</div>
                      <div className="meta">{formatCurrency(billing?.monthly_price ?? 0)}</div>
                    </td>
                    <td>
                      <div>
                        {formatMinutes(account.aiCallUsage.usedMinutes)} / {formatMinutes(account.aiCallUsage.allowanceMinutes)}
                      </div>
                      <div className="meta">{formatMinutes(account.aiCallUsage.remainingMinutes)} remaining</div>
                    </td>
                    <td>{readiness.label}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-action-button" onClick={() => setViewAccount(account)} title="View account" type="button">
                          <EyeIcon />
                        </button>
                        <button className="icon-action-button edit" onClick={() => setEditAccount(account)} title="Edit account" type="button">
                          <PencilIcon />
                        </button>
                        <button className="icon-action-button danger" onClick={() => handleDelete(account)} title="Delete account" type="button">
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {viewAccount ? (
        <AccountDetailsModal
          account={viewAccount}
          onClose={() => setViewAccount(null)}
          onEdit={() => {
            setEditAccount(viewAccount);
            setViewAccount(null);
          }}
        />
      ) : null}
      {editAccount ? (
        <EditAccountModal
          account={editAccount}
          csrfToken={csrfToken}
          onClose={() => setEditAccount(null)}
          onSuccess={() => {
            setEditAccount(null);
            router.refresh();
            onAction();
          }}
        />
      ) : null}
    </div>
  );
}

function AccountDetailsModal({
  account,
  onClose,
  onEdit
}: {
  account: AdminAccount;
  onClose: () => void;
  onEdit: () => void;
}) {
  const billing = account.manual_billing_accounts?.[0];
  const radiusRule = account.service_radius_rules?.[0];
  const owner = account.owners[0];
  const readiness = accountReadiness(account);
  const closures = account.business_availability_exceptions ?? [];
  const details = [
    { label: "Company", value: account.name },
    { label: "Owner", value: owner?.full_name ?? "No owner linked" },
    { label: "Owner contact", value: owner?.phone ?? owner?.email ?? "No contact" },
    { label: "Trade", value: account.trade },
    { label: "Status", value: account.status.replaceAll("_", " ") },
    { label: "AI agent", value: account.ai_voice_name ?? "Ana" },
    {
      label: "Services",
      value: supportsServiceCatalog(account.trade) ? accountServices(account).map(serviceLabel).join(", ") : "Service catalog placeholder for this trade.",
      full: true
    },
    { label: "Service base", value: account.base_address ?? "No address", full: true },
    { label: "Service radius", value: radiusRule ? `${radiusRule.radius_miles} miles` : "Not configured" },
    { label: "Outside radius", value: radiusRule?.allow_outside_radius ? "Allow with owner approval" : "Decline automatically" },
    { label: "Business hours", value: account.business_hours_text },
    { label: "Phone path", value: phoneSetupLabels[account.phone_setup_mode ?? "twilio_number"] },
    { label: "Voice", value: voiceStatusLabels[account.voice_setup_status ?? "not_started"] },
    { label: "SMS", value: smsStatusLabels[account.sms_setup_status ?? "not_started"] },
    { label: "Public number", value: account.phone ?? "Not set" },
    { label: "Routing number", value: account.twilio_routing_phone ?? "Not set" },
    { label: "Owner transfer", value: account.owner_transfer_phone ?? "Not set" },
    {
      label: "Billing",
      value: `${account.aiCallUsage.planName} · ${formatCurrency(billing?.monthly_price ?? 0)}/mo · ${formatMinutes(account.aiCallUsage.allowanceMinutes)} min included · overage after ${formatMinutes(account.aiCallUsage.overageStartsAtMinutes)} total min · ${formatCurrency(account.aiCallUsage.overageRatePerMinute ?? 0)}/min`
    },
    { label: "At minute limit", value: minuteLimitPolicyLabel(account.minute_limit_policy), full: true },
    {
      label: "AI minutes",
      value: `${formatMinutes(account.aiCallUsage.usedMinutes)} used / ${formatMinutes(account.aiCallUsage.allowanceMinutes)} included`
    },
    { label: "Remaining minutes", value: `${formatMinutes(account.aiCallUsage.remainingMinutes)} this month` },
    { label: "Overage", value: `Starts after ${formatMinutes(account.aiCallUsage.overageStartsAtMinutes)} total min · ${overageLabel(account)}` },
    { label: "Readiness", value: readiness.label },
    { label: "Closed dates", value: closures.length ? closures.map((closure) => formatClosureRange(closure.starts_on, closure.ends_on)).join(", ") : "None", full: true }
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section aria-labelledby="account-details-title" aria-modal="true" className="modal-panel admin-account-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="section-card-header">
          <div>
            <h2 id="account-details-title">{account.name}</h2>
            <p className="meta">Account details and launch state</p>
          </div>
          <div className="toolbar flush">
            <button className="button ghost" onClick={onEdit} type="button">
              Edit
            </button>
            <button className="button ghost" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>
        <dl className="detail-grid">
          {details.map((item) => (
            <div className={item.full ? "full" : ""} key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function EditAccountModal({
  account,
  csrfToken,
  onClose,
  onSuccess
}: {
  account: AdminAccount;
  csrfToken: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateAdminAccount, {});
  const [closureState, closureAction] = useActionState(addAdminAvailabilityException, {});
  const [, startClosureDeleteTransition] = useTransition();
  const [selectedMode, setSelectedMode] = useState<PhoneSetupMode>(account.phone_setup_mode ?? "twilio_number");
  const billing = account.manual_billing_accounts?.[0];
  const radiusRule = account.service_radius_rules?.[0];
  const owner = account.owners[0];
  const selectedServices = accountServices(account);
  const closures = account.business_availability_exceptions ?? [];
  const hasServiceCatalog = supportsServiceCatalog(account.trade);

  useEffect(() => {
    if (state.success) onSuccess();
  }, [onSuccess, state.success]);

  useEffect(() => {
    if (closureState.success) router.refresh();
  }, [closureState.success, router]);

  const handleDeleteClosure = useCallback(
    (exceptionId: string) => {
      if (!window.confirm("Remove these closed dates?")) return;

      startClosureDeleteTransition(async () => {
        const result = await deleteAdminAvailabilityException(exceptionId, csrfToken);
        if (result.error) {
          window.alert(result.error);
          return;
        }

        router.refresh();
      });
    },
    [csrfToken, router]
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section aria-labelledby="edit-account-title" aria-modal="true" className="modal-panel admin-account-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="section-card-header">
          <div>
            <h2 id="edit-account-title">Edit account</h2>
            <p className="meta">{account.name}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <form action={formAction} className="form-grid">
          <CsrfField token={csrfToken} />
          <input name="businessId" type="hidden" value={account.id} />
          <input name="ownerId" type="hidden" value={owner?.id ?? ""} />
          <label className="field">
            <span>Business name</span>
            <input defaultValue={account.name} maxLength={120} name="businessName" required />
          </label>
          <label className="field">
            <span>Business status</span>
            <select defaultValue={account.status} name="businessStatus">
              {businessStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Owner name</span>
            <input defaultValue={owner?.full_name ?? ""} maxLength={120} name="ownerName" />
          </label>
          <label className="field">
            <span>Owner phone</span>
            <input defaultValue={owner?.phone ?? ""} name="ownerPhone" type="tel" />
          </label>
          <label className="field">
            <span>Trade</span>
            <select defaultValue={account.trade} name="trade">
              {tradeOptions.map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>AI agent name</span>
            <input defaultValue={account.ai_voice_name ?? "Ana"} maxLength={40} name="aiAgentName" required />
          </label>
          <div className="field full">
            <span>Services offered</span>
            {hasServiceCatalog ? (
              <div className="admin-services-grid">
                {serviceOptions.map((service) => (
                  <label className="checkbox-field admin-service-option" key={service}>
                    <input defaultChecked={selectedServices.includes(service)} name="availableServices" type="checkbox" value={service} />
                    <span>{serviceLabel(service)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="admin-service-placeholder">
                Service catalog setup is only available for landscaping right now.
              </div>
            )}
          </div>
          <AddressLookupInput className="full" defaultValue={account.base_address} label="Business address" name="businessAddress" />
          <label className="field">
            <span>Service radius</span>
            <input defaultValue={radiusRule?.radius_miles ?? 30} min="1" max="250" name="radiusMiles" required type="number" />
          </label>
          <label className="field">
            <span>Outside radius</span>
            <select defaultValue={radiusRule?.allow_outside_radius ? "true" : "false"} name="allowOutsideRadius">
              <option value="false">Decline automatically</option>
              <option value="true">Allow with owner approval</option>
            </select>
          </label>
          <label className="field">
            <span>Booking time zone</span>
            <select defaultValue={account.booking_time_zone ?? "America/Chicago"} name="bookingTimeZone">
              {timeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </label>
          <div className="field full compact-field">
            <BusinessHoursDropdowns initialText={account.business_hours_text} />
          </div>
          <div className="field full">
            <PhoneScenarioPicker selectedMode={selectedMode} onSelect={setSelectedMode} />
          </div>
          <label className="field">
            <span>Existing number type</span>
            <select defaultValue={account.existing_number_kind ?? "unknown"} name="existingNumberKind">
              <option value="unknown">Not confirmed</option>
              <option value="business">Dedicated business number</option>
              <option value="personal">Owner personal cell</option>
              <option value="mixed">Mixed business/personal number</option>
            </select>
          </label>
          <label className="field">
            <span>Porting status</span>
            <select defaultValue={account.porting_status ?? "not_started"} name="portingStatus">
              <option value="not_started">Not started</option>
              <option value="collecting_info">Collecting port info</option>
              <option value="submitted">Submitted to Twilio</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            <span>Business public number</span>
            <input defaultValue={account.phone ?? ""} name="businessPhone" type="tel" />
          </label>
          <label className="field">
            <span>Twilio routing number</span>
            <input defaultValue={account.twilio_routing_phone ?? ""} name="twilioRoutingPhone" placeholder="Client Twilio number, e.g. +13125559876" type="tel" />
          </label>
          <label className="field">
            <span>Owner transfer cell</span>
            <input defaultValue={account.owner_transfer_phone ?? ""} name="ownerTransferPhone" placeholder="Owner real phone, e.g. +13125554321" type="tel" />
          </label>
          <label className="field">
            <span>Messaging Service SID</span>
            <input defaultValue={account.messaging_service_sid ?? ""} name="messagingServiceSid" />
          </label>
          <label className="field">
            <span>Voice status</span>
            <select defaultValue={account.voice_setup_status ?? "not_started"} name="voiceSetupStatus">
              <option value="not_started">Not started</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            <span>SMS status</span>
            <select defaultValue={account.sms_setup_status ?? "not_started"} name="smsSetupStatus">
              <option value="not_started">Not started</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="transition">Transition</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            <span>Owner summary language</span>
            <select defaultValue={account.owner_summary_language ?? "en"} name="ownerSummaryLanguage">
              <option value="en">English</option>
	              <option value="es">Español</option>
            </select>
          </label>
          <label className="field">
            <span>Owner summary method</span>
            <select defaultValue={account.owner_summary_channel ?? "sms"} name="ownerSummaryChannel">
              <option value="sms">SMS text</option>
              <option value="email">Email</option>
            </select>
          </label>
          <BillingPlanFields
            includedMinutes={billing?.included_minutes}
            monthlyPrice={billing?.monthly_price}
            overageStartsAtMinutes={billing?.overage_starts_at_minutes}
            overageRatePerMinute={billing?.overage_rate_per_minute}
            planName={billing?.plan_name}
          />
          <MinuteLimitPolicyFields defaultValue={account.minute_limit_policy ?? "continue_overage"} />
          <label className="field">
            <span>Onboarding fee</span>
            <div className="currency-input">
              <span aria-hidden="true">$</span>
              <input defaultValue={billing?.onboarding_fee ?? 199} min="0" name="onboardingFee" step="0.01" type="number" />
            </div>
          </label>
          <label className="field">
            <span>Billing status</span>
            <select defaultValue={billing?.billing_status ?? "trial"} name="billingStatus">
              {billingStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Next payment due</span>
            <input defaultValue={billing?.next_payment_due_at ?? ""} name="nextPaymentDueAt" type="date" />
          </label>
          <label className="field checkbox-field">
            <input defaultChecked={billing?.onboarding_paid ?? false} name="onboardingPaid" type="checkbox" />
            <span>Onboarding fee paid</span>
          </label>
          <label className="field full checkbox-field">
            <input defaultChecked={account.phone_setup_owner_approved} name="phoneSetupOwnerApproved" type="checkbox" />
            <span>Owner approved this phone setup path and understands what number customers will see.</span>
          </label>
          <label className="field full">
            <span>Payment method note</span>
            <input defaultValue={billing?.payment_method_note ?? ""} name="paymentMethodNote" />
          </label>
          <label className="field full">
            <span>Phone setup notes</span>
            <textarea defaultValue={account.phone_setup_notes ?? ""} name="phoneSetupNotes" />
          </label>
          {state.error ? <p className="form-message error">{state.error}</p> : null}
          <div className="form-actions">
            <button className="button ghost" onClick={onClose} type="button">
              Cancel
            </button>
            <SaveSetupButton />
          </div>
        </form>
        <div className="admin-modal-section">
          <div>
            <h3>Closed dates</h3>
            <p className="meta">These dates block Ana from offering appointments, matching the owner settings.</p>
          </div>
          <form action={closureAction} className="form-grid admin-closure-form">
            <CsrfField token={csrfToken} />
            <input name="businessId" type="hidden" value={account.id} />
            <label className="field">
              <span>Reason</span>
              <input defaultValue="Vacation" maxLength={80} name="title" required />
            </label>
            <label className="field">
              <span>First closed day</span>
              <input name="startsOn" required type="date" />
            </label>
            <label className="field">
              <span>Last closed day</span>
              <input name="endsOn" required type="date" />
            </label>
            <label className="field full">
              <span>Customer message</span>
              <input maxLength={180} name="message" placeholder="We are unavailable that day and can schedule another date." />
            </label>
            {closureState.error ? <p className="form-message error">{closureState.error}</p> : null}
            {closureState.success ? <p className="form-success full">{closureState.success}</p> : null}
            <div className="toolbar full">
              <SaveSetupButton />
            </div>
          </form>
          <div className="closure-list">
            {closures.length ? (
              closures.map((closure) => (
                <div className="closure-row" key={closure.id}>
                  <div>
                    <strong>{closure.title}</strong>
                    <span>{formatClosureRange(closure.starts_on, closure.ends_on)}</span>
                    {closure.message ? <p>{closure.message}</p> : null}
                  </div>
                  <button className="icon-action-button danger" onClick={() => handleDeleteClosure(closure.id)} title="Delete closure" type="button">
                    <TrashIcon />
                  </button>
                </div>
              ))
            ) : (
              <p className="meta">No closed dates scheduled.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function OwnerList({ account, csrfToken }: { account: AdminAccount; csrfToken: string }) {
  if (!account.owners.length) return <span className="meta">No owner linked</span>;

  return (
    <div className="mini-stack">
      {account.owners.map((owner) => (
        <div key={owner.id}>
          <OwnerNameEditor csrfToken={csrfToken} owner={owner} />
          <div className="meta">{owner.phone ?? owner.email ?? "No contact"}</div>
        </div>
      ))}
    </div>
  );
}

function setupStatusClass(status: VoiceSetupStatus | SmsSetupStatus) {
  if (status === "active") return "success";
  if (status === "blocked") return "danger";
  if (status === "pending" || status === "transition") return "warn";
  return "info";
}

function PhoneScenarioPicker({
  selectedMode,
  onSelect
}: {
  selectedMode: PhoneSetupMode;
  onSelect: (mode: PhoneSetupMode) => void;
}) {
  return (
    <fieldset className="scenario-picker">
      <legend>Phone setup scenario</legend>
      <div className="scenario-grid">
        {setupScenarios.map((scenario) => (
          <label className={`scenario-option ${selectedMode === scenario.mode ? "selected" : ""}`} key={scenario.mode}>
            <input
              checked={selectedMode === scenario.mode}
              name="phoneSetupMode"
              onChange={() => onSelect(scenario.mode)}
              type="radio"
              value={scenario.mode}
            />
            <span>
              <strong>{scenario.title}</strong>
              <small>{scenario.bestFor}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PhoneSetup({ csrfToken, data }: { csrfToken: string; data: AdminPortalData }) {
  return (
    <div className="grid">
      <section className="card">
        <h2>Phone Setup</h2>
        <p className="meta">
          Track whether each business uses a Twilio number, call forwarding, number porting, or SMS transition. Existing personal
          mobile SMS cannot be read directly; transition mode gives owners a structured forwarding path.
        </p>
      </section>
      <div className="grid">
        {data.accounts.map((account) => (
          <PhoneSetupForm account={account} csrfToken={csrfToken} key={account.id} />
        ))}
      </div>
    </div>
  );
}

function PhoneSetupForm({ account, csrfToken }: { account: AdminAccount; csrfToken: string }) {
  const [state, formAction] = useActionState(updateBusinessPhoneSetup, {});
  const [selectedMode, setSelectedMode] = useState<PhoneSetupMode>(account.phone_setup_mode ?? "twilio_number");
  const selectedScenario = scenarioFor(selectedMode);

  return (
    <section className="card">
      <div className="section-card-header">
        <div>
          <h2>{account.name}</h2>
          <OwnerList account={account} csrfToken={csrfToken} />
        </div>
        <div className="phone-status-row">
          <span className={`pill ${setupStatusClass(account.voice_setup_status ?? "not_started")}`}>
            {voiceStatusLabels[account.voice_setup_status ?? "not_started"]}
          </span>
          <span className={`pill ${setupStatusClass(account.sms_setup_status ?? "not_started")}`}>
            {smsStatusLabels[account.sms_setup_status ?? "not_started"]}
          </span>
        </div>
      </div>
      <form action={formAction}>
        <CsrfField token={csrfToken} />
        <input name="businessId" type="hidden" value={account.id} />
        <PhoneScenarioPicker selectedMode={selectedMode} onSelect={setSelectedMode} />
        <div className="setup-guidance">
          <article className="row-card">
            <strong>{selectedScenario.title}</strong>
            <div className="meta">{selectedScenario.ownerMessage}</div>
            <ol className="setup-steps">
              {selectedScenario.adminSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Existing number type</span>
            <select defaultValue={account.existing_number_kind ?? "unknown"} name="existingNumberKind">
              <option value="unknown">Not confirmed</option>
              <option value="business">Dedicated business number</option>
              <option value="personal">Owner personal cell</option>
              <option value="mixed">Mixed business/personal number</option>
            </select>
          </label>
          <label className="field">
            <span>Porting status</span>
            <select defaultValue={account.porting_status ?? "not_started"} name="portingStatus">
              <option value="not_started">Not started</option>
              <option value="collecting_info">Collecting port info</option>
              <option value="submitted">Submitted to Twilio</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            <span>Business public number</span>
            <input defaultValue={account.phone ?? ""} name="businessPhone" placeholder="+13125551234" type="tel" />
          </label>
          <label className="field">
            <span>Twilio routing number</span>
            <input defaultValue={account.twilio_routing_phone ?? ""} name="twilioRoutingPhone" placeholder="Client Twilio number, e.g. +13125559876" type="tel" />
          </label>
          <label className="field">
            <span>Owner transfer cell</span>
            <input defaultValue={account.owner_transfer_phone ?? account.owners[0]?.phone ?? ""} name="ownerTransferPhone" placeholder="Owner real phone, e.g. +13125554321" type="tel" />
          </label>
          <label className="field">
            <span>Messaging Service SID</span>
            <input defaultValue={account.messaging_service_sid ?? ""} name="messagingServiceSid" placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          </label>
          <label className="field">
            <span>AI agent name</span>
            <input defaultValue={account.ai_voice_name ?? "Ana"} maxLength={40} name="aiAgentName" placeholder="Ana" required />
          </label>
          <AddressLookupInput
            className="full"
            defaultValue={account.base_address}
            label="Business address"
            name="businessAddress"
            placeholder="123 Main St, Austin, TX"
          />
          <label className="field">
            <span>Voice status</span>
            <select defaultValue={account.voice_setup_status ?? "not_started"} name="voiceSetupStatus">
              <option value="not_started">Not started</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            <span>SMS status</span>
            <select defaultValue={account.sms_setup_status ?? "not_started"} name="smsSetupStatus">
              <option value="not_started">Not started</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="transition">Transition</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            <span>Owner summary language</span>
            <select defaultValue={account.owner_summary_language ?? "en"} name="ownerSummaryLanguage">
              <option value="en">English</option>
	              <option value="es">Español</option>
            </select>
          </label>
          <label className="field">
            <span>Owner summary method</span>
            <select defaultValue={account.owner_summary_channel ?? "sms"} name="ownerSummaryChannel">
              <option value="sms">SMS text</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className="field">
            <span>Booking time zone</span>
            <select defaultValue={account.booking_time_zone ?? "America/Chicago"} name="bookingTimeZone">
              {timeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </label>
          <label className="field full">
            <span>Business hours</span>
            <input
              defaultValue={account.business_hours_text ?? "Monday through Friday, 8:00 AM to 5:00 PM"}
              maxLength={240}
              name="businessHoursText"
            />
          </label>
          <MinuteLimitPolicyFields defaultValue={account.minute_limit_policy ?? "continue_overage"} />
          <label className="field full checkbox-field">
            <input defaultChecked={account.phone_setup_owner_approved} name="phoneSetupOwnerApproved" type="checkbox" />
            <span>Owner approved this path and understands what number customers will see.</span>
          </label>
          <label className="field full">
            <span>Setup notes</span>
            <textarea
              defaultValue={
                account.phone_setup_notes ??
                "For SMS transition, owner forwards old-number texts to the Twilio number as: FWD +1CUSTOMERNUMBER then the customer message."
              }
              name="phoneSetupNotes"
            />
          </label>
        </div>
        {state.error ? <p className="form-error" style={{ marginTop: 16 }}>{state.error}</p> : null}
        {state.success ? <p className="form-success" style={{ marginTop: 16 }}>{state.success}</p> : null}
        <div className="toolbar" style={{ marginTop: 16 }}>
          <SaveSetupButton />
        </div>
      </form>
    </section>
  );
}

function Usage({ data }: { data: AdminPortalData }) {
  const totalUsedMinutes = data.accounts.reduce((sum, account) => sum + account.aiCallUsage.usedMinutes, 0);
  const totalIncludedMinutes = data.accounts.reduce((sum, account) => sum + account.aiCallUsage.allowanceMinutes, 0);
  const totalOverageAmount = data.accounts.reduce((sum, account) => sum + account.aiCallUsage.overageAmount, 0);

  return (
    <div className="grid">
      <div className="grid stats-grid">
        <Stat featured label="Used minutes" value={formatMinutes(totalUsedMinutes)} foot={data.accounts[0]?.aiCallUsage.monthLabel ?? "Current month"} icon={<MessageIcon />} />
        <Stat label="Included minutes" value={formatMinutes(totalIncludedMinutes)} foot="Across all accounts" icon={<CalendarIcon />} />
        <Stat label="Overage charges" value={formatCurrency(totalOverageAmount)} foot="Per-account plan rates" icon={<DollarIcon />} />
        <Stat label="Accounts" value={data.accounts.length} foot="Tracked customers" icon={<UsersIcon />} />
      </div>
      <section className="card">
        <div className="section-card-header">
          <div>
            <h2>AI Call Minutes</h2>
            <p className="meta">Current-month customer call minutes from Twilio status events.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Used</th>
                <th>Remaining</th>
                <th>Extra minutes</th>
                <th>Overage charge</th>
                <th>Month</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => {
                const usage = account.aiCallUsage;

                return (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.name}</strong>
                      <div className="meta">{account.owners[0]?.email ?? account.owners[0]?.phone ?? "No owner contact"}</div>
                    </td>
                    <td>
                      <div>{usage.planName}</div>
                      <div className="meta">{formatMinutes(usage.allowanceMinutes)} included · overage after {formatMinutes(usage.overageStartsAtMinutes)}</div>
                    </td>
                    <td>
                      <div>{formatMinutes(usage.usedMinutes)} min</div>
                      <div className="usage-meter" aria-label={`${usage.usagePercent.toFixed(0)} percent used`}>
                        <span style={{ width: `${usage.usagePercent}%` }} />
                      </div>
                    </td>
                    <td>{formatMinutes(usage.remainingMinutes)} min</td>
                    <td>{formatMinutes(usage.overageMinutes)} min</td>
                    <td>
                      <div>{formatCurrency(usage.overageAmount)}</div>
                      <div className="meta">{formatCurrency(usage.overageRatePerMinute ?? 0)}/min</div>
                    </td>
                    <td>{usage.monthLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Billing({ data, onAction }: { data: AdminPortalData; onAction: () => void }) {
  return (
    <section className="card">
      <h2>Manual Billing</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Plan</th>
              <th>Monthly</th>
              <th>Onboarding</th>
              <th>Status</th>
              <th>Next Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((account) => {
              const billing = account.manual_billing_accounts?.[0];
              return (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>
                    <div>{account.aiCallUsage.planName}</div>
                    <div className="meta">
                      {formatMinutes(account.aiCallUsage.allowanceMinutes)} included · overage after {formatMinutes(account.aiCallUsage.overageStartsAtMinutes)} · {formatCurrency(account.aiCallUsage.overageRatePerMinute ?? 0)}/min
                    </div>
                  </td>
                  <td>{formatCurrency(billing?.monthly_price ?? 149)}</td>
                  <td>{billing?.onboarding_paid ? "Paid" : formatCurrency(billing?.onboarding_fee ?? 199)}</td>
                  <td>{billing?.billing_status ?? "trial"}</td>
                  <td>{billing?.next_payment_due_at ?? "Not set"}</td>
                  <td>
                    <button className="button ghost" onClick={onAction} type="button">
                      Add note
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Playbook({ onAction }: { onAction: () => void }) {
  return (
    <section className="card">
      <h2>AI Playbook</h2>
      <div className="grid three-col">
        <article className="row-card">
          <strong>English answer</strong>
          <div className="meta">Answer in English, disclose AI, and collect job details clearly.</div>
        </article>
        <article className="row-card">
          <strong>Quote approval</strong>
          <div className="meta">Draft only. Owner approval is required before final price reaches customer.</div>
        </article>
        <article className="row-card">
          <strong>Referral funnel</strong>
          <div className="meta">Review first, referral request after 3-4 completed services.</div>
        </article>
      </div>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <label className="field full">
          <span>Default AI instructions</span>
          <textarea defaultValue="Speak as the configured AI receptionist. Use English for customer conversations and owner summaries. Ask service-specific questions. Check service radius. Request photos when helpful. Never finalize a quote without approval." />
        </label>
      </div>
      <button className="button primary" onClick={onAction} style={{ marginTop: 16 }} type="button">
        Save playbook
      </button>
    </section>
  );
}
