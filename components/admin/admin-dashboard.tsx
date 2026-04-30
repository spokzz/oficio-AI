"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { onboardOwner } from "@/app/actions/admin";
import { CalendarIcon, DollarIcon, MessageIcon, UsersIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency } from "@/lib/format";
import type { AdminPortalData } from "@/lib/admin-data";

type AdminTab = "overview" | "onboarding" | "accounts" | "usage" | "billing" | "playbook";

const tabLabels: Record<AdminTab, string> = {
  overview: "Overview",
  onboarding: "Onboarding",
  accounts: "Accounts",
  usage: "Usage",
  billing: "Billing",
  playbook: "AI Playbook"
};

export function AdminDashboard({ data }: { data: AdminPortalData }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 18 }}>
        {(Object.keys(tabLabels) as AdminTab[]).map((tab) => (
          <button className={`button ${activeTab === tab ? "gold" : "ghost"}`} key={tab} onClick={() => setActiveTab(tab)} type="button">
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? <Overview data={data} /> : null}
      {activeTab === "onboarding" ? <Onboarding onQueuedCall={() => showToast("Test call queued for demo.")} /> : null}
      {activeTab === "accounts" ? <Accounts data={data} onAction={() => showToast("Account opened for review.")} /> : null}
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
            <th>Trade</th>
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
                <td>{account.trade}</td>
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

  return (
    <div className="grid two-col">
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
              defaultValue="Speak as Ana. Detect customer language. Summarize to owner in Spanish. Require owner approval before final quotes."
              name="aiInstructions"
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
          <strong>Multilingual answer</strong>
          <div className="meta">Detect language, continue naturally, disclose AI, and collect job details.</div>
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
          <textarea defaultValue="Speak as Ana, a warm AI receptionist. Handle English, Spanish, Hindi, Punjabi, Urdu, Gujarati, Arabic, Mandarin, Vietnamese, and other major languages. Ask service-specific questions. Check service radius. Request photos when helpful. Summarize to owner in Spanish. Never finalize a quote without approval." />
        </label>
      </div>
      <button className="button primary" onClick={onAction} style={{ marginTop: 16 }} type="button">
        Save playbook
      </button>
    </section>
  );
}
