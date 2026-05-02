"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { onboardOwner, updateBusinessPhoneSetup } from "@/app/actions/admin";
import { CalendarIcon, DollarIcon, MessageIcon, UsersIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency } from "@/lib/format";
import type { AdminAccount, AdminPortalData } from "@/lib/admin-data";
import type { ExistingNumberKind, PhoneSetupMode, PortingStatus, SmsSetupStatus, VoiceSetupStatus } from "@/lib/types";

export type AdminTab = "overview" | "onboarding" | "accounts" | "phone" | "usage" | "billing" | "playbook";

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

const existingNumberKindLabels: Record<ExistingNumberKind, string> = {
  business: "Dedicated business number",
  mixed: "Mixed business/personal number",
  personal: "Owner personal cell",
  unknown: "Not confirmed"
};

const portingStatusLabels: Record<PortingStatus, string> = {
  blocked: "Blocked",
  collecting_info: "Collecting port info",
  completed: "Port completed",
  not_started: "Not started",
  submitted: "Submitted to Twilio"
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
    ownerMessage: "Customers keep using the number they already know. Ana answers calls and texts from that same number."
  },
  {
    mode: "sms_transition",
    title: "Keep personal/mixed number + SMS transition",
    bestFor: "Best when the owner uses one cell for personal and business.",
    adminSteps: [
      "Do not port the personal cell.",
      "Forward calls from the old number to Ana's Twilio number.",
      "Owner forwards old-number customer texts to Ana using FWD +1CUSTOMER and the message."
    ],
    ownerMessage: "Ana helps move customer conversations to the business texting number without taking over private messages."
  },
  {
    mode: "twilio_number",
    title: "Use new Ana/Twilio number",
    bestFor: "Best for new businesses or owners ready to use a new official number.",
    adminSteps: [
      "Add the Twilio number to the Messaging Service sender pool.",
      "Use the Twilio number on website, Google profile, cards, and ads.",
      "Set voice and SMS to active after a live call/text test."
    ],
    ownerMessage: "Customers call and text Ana directly on the new business number."
  },
  {
    mode: "call_forwarding",
    title: "Calls only: keep number + forward calls",
    bestFor: "Useful when SMS migration is delayed but call answering can start.",
    adminSteps: [
      "Set up carrier call forwarding from the existing number to Ana's Twilio number.",
      "Keep SMS marked pending or transition until the owner chooses a texting path.",
      "Test a customer-style call and a personal-transfer call."
    ],
    ownerMessage: "Ana answers forwarded calls. Text messages stay on the existing phone until SMS transition or porting is chosen."
  }
];

function scenarioFor(mode: PhoneSetupMode) {
  return setupScenarios.find((scenario) => scenario.mode === mode) ?? setupScenarios[2];
}

export function AdminDashboard({ data, activeTab }: { data: AdminPortalData; activeTab: AdminTab }) {
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      {activeTab === "overview" ? <Overview data={data} /> : null}
      {activeTab === "onboarding" ? <Onboarding onQueuedCall={() => showToast("Test call queued for demo.")} /> : null}
      {activeTab === "accounts" ? <Accounts data={data} onAction={() => showToast("Account opened for review.")} /> : null}
      {activeTab === "phone" ? <PhoneSetup data={data} /> : null}
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
        <Stat featured label="MRR" value={formatCurrency(data.totals.monthlyRevenue)} foot="Manual billing" icon={<DollarIcon />} />
        <Stat label="Businesses" value={data.totals.businesses} foot="Total accounts" icon={<UsersIcon />} />
        <Stat label="Live" value={data.totals.live} foot="Taking calls" icon={<MessageIcon />} />
        <Stat label="Onboarding" value={data.totals.onboarding} foot="$199 setup" icon={<CalendarIcon />} />
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

function AccountTable({ data, onAction }: { data: AdminPortalData; onAction?: () => void }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Owner</th>
            <th>Trade</th>
            <th>Phone setup</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Billing</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.accounts.map((account) => {
            const billing = account.manual_billing_accounts?.[0];
            return (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>
                  <OwnerList account={account} />
                </td>
                <td>{account.trade}</td>
                <td>
                  <div>{phoneSetupLabels[account.phone_setup_mode ?? "twilio_number"]}</div>
                  <div className="meta">{existingNumberKindLabels[account.existing_number_kind ?? "unknown"]}</div>
                  <div className="meta">{smsStatusLabels[account.sms_setup_status ?? "not_started"]}</div>
                </td>
                <td>
                  <StatusPill status={account.status} />
                </td>
                <td>{billing?.plan_name ?? "Growth"}</td>
                <td>{billing?.billing_status ?? "not set"}</td>
                <td>
                  <button className="button ghost" onClick={onAction} type="button">
                    Review
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SaveSetupButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? "Saving..." : "Save setup"}
    </button>
  );
}

function Onboarding({ onQueuedCall }: { onQueuedCall: () => void }) {
  const [state, formAction] = useActionState(onboardOwner, {});
  const [selectedMode, setSelectedMode] = useState<PhoneSetupMode>("twilio_number");
  const selectedScenario = scenarioFor(selectedMode);

  return (
    <div className="grid">
      <section className="card">
        <h2>New Owner Setup</h2>
        <form action={formAction}>
          <div className="form-grid">
            <p className="meta full">
              Leave password blank to link an existing Supabase Auth user. Add a temporary password to create a new Auth user.
            </p>
            <label className="field">
              <span>Business name</span>
              <input name="businessName" placeholder="Green Valley Landscaping" required />
            </label>
            <label className="field">
              <span>Owner name</span>
              <input name="ownerName" placeholder="Lowa Winter" />
            </label>
            <label className="field">
              <span>Owner email</span>
              <input name="ownerEmail" placeholder="owner@example.com" required type="email" />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input name="ownerPassword" placeholder="At least 8 characters" type="password" />
            </label>
            <label className="field">
              <span>Trade</span>
              <select defaultValue="landscaping" name="trade">
                <option value="landscaping">Landscaping</option>
                <option value="roofing">Roofing</option>
                <option value="plumbing">Plumbing</option>
                <option value="cleaning">Cleaning</option>
              </select>
            </label>
            <label className="field">
              <span>Service radius</span>
              <select defaultValue="30" name="radiusMiles">
                <option value="15">15 miles</option>
                <option value="30">30 miles</option>
                <option value="45">45 miles</option>
              </select>
            </label>
            <label className="field full">
              <span>AI launch instructions</span>
              <textarea
                defaultValue="Speak as Ana. Use English for customer conversations and owner summaries. Require owner approval before final quotes."
                name="aiInstructions"
              />
            </label>
          </div>
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
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Existing number type</span>
              <select defaultValue={selectedMode === "port_existing" ? "business" : "unknown"} name="existingNumberKind">
                <option value="unknown">Not confirmed</option>
                <option value="business">Dedicated business number</option>
                <option value="personal">Owner personal cell</option>
                <option value="mixed">Mixed business/personal number</option>
              </select>
            </label>
            <label className="field">
              <span>Business public number</span>
              <input name="businessPhone" placeholder="+13125551234" type="tel" />
            </label>
            <label className="field">
              <span>Twilio/Ana number</span>
              <input name="twilioRoutingPhone" placeholder="+13125559876" type="tel" />
            </label>
            <label className="field">
              <span>Owner private cell for transfers</span>
              <input name="ownerTransferPhone" placeholder="+13125554321" type="tel" />
            </label>
            <label className="field">
              <span>Messaging Service SID</span>
              <input name="messagingServiceSid" placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </label>
            <label className="field full checkbox-field">
              <input name="phoneSetupOwnerApproved" type="checkbox" />
              <span>Owner approved this phone setup path and understands what number customers will see.</span>
            </label>
            <label className="field full">
              <span>Phone setup notes</span>
              <textarea
                defaultValue="Capture porting readiness, forwarding instructions, customer-facing intro message, and any owner concerns. Do not store carrier account PINs here."
                name="phoneSetupNotes"
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
          {["Business profile", "Service radius", "Services and quote rules", "Phone setup", "SMS compliance", "AI scripts", "Test calls", "Manual billing"].map(
            (item, index) => (
              <article className="row-card split" key={item}>
                <div>
                  <strong>{item}</strong>
                  <div className="meta">{index < 3 ? "Configured first in Supabase." : "Complete before going live."}</div>
                </div>
                <StatusPill status={index < 3 ? "confirmed" : "needs_review"} />
              </article>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function Accounts({ data, onAction }: { data: AdminPortalData; onAction: () => void }) {
  return (
    <section className="card">
      <h2>Accounts</h2>
      <AccountTable data={data} onAction={onAction} />
    </section>
  );
}

function OwnerList({ account }: { account: AdminAccount }) {
  if (!account.owners.length) return <span className="meta">No owner linked</span>;

  return (
    <div className="mini-stack">
      {account.owners.map((owner) => (
        <div key={owner.id}>
          <strong>{owner.full_name ?? owner.email ?? "Owner"}</strong>
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

function PhoneSetup({ data }: { data: AdminPortalData }) {
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
          <PhoneSetupForm account={account} key={account.id} />
        ))}
      </div>
    </div>
  );
}

function PhoneSetupForm({ account }: { account: AdminAccount }) {
  const [state, formAction] = useActionState(updateBusinessPhoneSetup, {});
  const [selectedMode, setSelectedMode] = useState<PhoneSetupMode>(account.phone_setup_mode ?? "twilio_number");
  const selectedScenario = scenarioFor(selectedMode);

  return (
    <section className="card">
      <div className="section-card-header">
        <div>
          <h2>{account.name}</h2>
          <OwnerList account={account} />
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
            <input defaultValue={account.twilio_routing_phone ?? ""} name="twilioRoutingPhone" placeholder="+13125559876" type="tel" />
          </label>
          <label className="field">
            <span>Owner transfer cell</span>
            <input defaultValue={account.owner_transfer_phone ?? account.owners[0]?.phone ?? ""} name="ownerTransferPhone" placeholder="+13125554321" type="tel" />
          </label>
          <label className="field">
            <span>Messaging Service SID</span>
            <input defaultValue={account.messaging_service_sid ?? ""} name="messagingServiceSid" placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
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
  return (
    <div className="grid three-col">
      {data.accounts.map((account) => {
        const billing = account.manual_billing_accounts?.[0];
        return (
          <article className="card" key={account.id}>
            <h2>{account.name}</h2>
            <div className="meta">Plan: {billing?.plan_name ?? "Growth"}</div>
            <div className="meta">Monthly price: {formatCurrency(billing?.monthly_price ?? 149)}</div>
            <div className="stat-value">70%+</div>
            <div className="stat-foot">Target gross margin</div>
          </article>
        );
      })}
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
          <textarea defaultValue="Speak as Ana, a warm AI receptionist. Use English for customer conversations and owner summaries. Ask service-specific questions. Check service radius. Request photos when helpful. Never finalize a quote without approval." />
        </label>
      </div>
      <button className="button primary" onClick={onAction} style={{ marginTop: 16 }} type="button">
        Save playbook
      </button>
    </section>
  );
}
