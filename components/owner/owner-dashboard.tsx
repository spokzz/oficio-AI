"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, DollarIcon, LeafIcon, MessageIcon, UsersIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { OwnerPortalData } from "@/lib/owner-data";
import type { Customer } from "@/lib/types";

type Tab = "home" | "bookings" | "customers" | "quotes" | "messages" | "settings";
type Lang = "es" | "en";

const copy = {
  es: {
    home: "Inicio",
    totalBookings: "Reservas",
    todayJobs: "Trabajos hoy",
    revenue: "Ingresos",
    recovered: "Llamadas recuperadas",
    bookings: "Reservas",
    customers: "Clientes",
    quotes: "Cotizaciones",
    messages: "Mensajes",
    settings: "Ajustes",
    agenda: "Agenda de hoy",
    pendingQuote: "Cotización para aprobar",
    noJobs: "No hay trabajos todavía.",
    approve: "Aprobar",
    edit: "Editar precio",
    photos: "Pedir fotos",
    businessSettings: "Ajustes del negocio",
    radius: "Radio de servicio",
    billing: "Facturación manual",
    plan: "Plan",
    paymentStatus: "Estado de pago",
    nextDue: "Próximo pago",
    languageNote: "El AI habla el idioma del cliente y manda resumen al dueño en español.",
    saved: "Guardado para demo. En producción esto llamará una acción del servidor.",
    actionSent: "Acción lista. En producción se guardará en Supabase y notificará al cliente."
  },
  en: {
    home: "Home",
    totalBookings: "Bookings",
    todayJobs: "Jobs today",
    revenue: "Revenue",
    recovered: "Recovered calls",
    bookings: "Bookings",
    customers: "Customers",
    quotes: "Quotes",
    messages: "Messages",
    settings: "Settings",
    agenda: "Today's agenda",
    pendingQuote: "Quote to approve",
    noJobs: "No jobs yet.",
    approve: "Approve",
    edit: "Edit price",
    photos: "Ask for photos",
    businessSettings: "Business settings",
    radius: "Service radius",
    billing: "Manual billing",
    plan: "Plan",
    paymentStatus: "Payment status",
    nextDue: "Next due",
    languageNote: "The AI speaks the customer's language and sends the owner a Spanish summary.",
    saved: "Saved for demo. In production this will call a server action.",
    actionSent: "Action ready. In production this will save in Supabase and notify the customer."
  }
};

function customerName(customer?: Customer | Pick<Customer, "full_name"> | null) {
  return customer?.full_name ?? "New customer";
}

function Toast({ message }: { message: string | null }) {
  return message ? <div className="toast show">{message}</div> : null;
}

export function OwnerDashboard({ data, initialLanguage = "es" }: { data: OwnerPortalData; initialLanguage?: Lang }) {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [language, setLanguage] = useState<Lang>(initialLanguage);
  const [toast, setToast] = useState<string | null>(null);
  const t = copy[language];

  const pendingQuote = useMemo(
    () => data.quotes.find((quote) => quote.status === "needs_owner_approval" || quote.status === "draft") ?? data.quotes[0],
    [data.quotes]
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 18 }}>
        {(["home", "bookings", "customers", "quotes", "messages", "settings"] as Tab[]).map((tab) => (
          <button className={`button ${activeTab === tab ? "gold" : "ghost"}`} key={tab} onClick={() => setActiveTab(tab)} type="button">
            {t[tab]}
          </button>
        ))}
      </div>

      {activeTab === "home" ? (
        <div className="grid">
          <div className="grid stats-grid">
            <Stat featured label={t.totalBookings} value={data.metrics.totalBookings} foot="+ Supabase" icon={<CalendarIcon />} />
            <Stat label={t.todayJobs} value={data.metrics.todayJobs} foot="Today" icon={<LeafIcon />} />
            <Stat label={t.revenue} value={formatCurrency(data.metrics.revenue)} foot="Current data" icon={<DollarIcon />} />
            <Stat label={t.recovered} value={data.metrics.recoveredCalls} foot="AI outcomes" icon={<MessageIcon />} />
          </div>
          <div className="grid two-col">
            <section className="card">
              <h2>{t.agenda}</h2>
              <JobList jobs={data.jobs} empty={t.noJobs} />
            </section>
            <section className="card dark">
              <h2>{t.pendingQuote}</h2>
              {pendingQuote ? (
                <div className="list">
                  <p className="meta" style={{ color: "#ddefe5" }}>
                    {pendingQuote.ai_observations ?? t.languageNote}
                  </p>
                  <div>
                    <div className="stat-label" style={{ color: "#cfe8db" }}>
                      {customerName(pendingQuote.customers)}
                    </div>
                    <div className="stat-value" style={{ color: "#fff" }}>
                      {formatCurrency(pendingQuote.owner_price ?? pendingQuote.suggested_high ?? pendingQuote.suggested_low)}
                    </div>
                    <div className="meta" style={{ color: "#ddefe5" }}>
                      {formatCurrency(pendingQuote.suggested_low)} - {formatCurrency(pendingQuote.suggested_high)}
                    </div>
                  </div>
                  <div className="toolbar">
                    <button className="button gold" onClick={() => showToast(t.actionSent)} type="button">
                      {t.approve}
                    </button>
                    <button className="button ghost" onClick={() => showToast(t.actionSent)} type="button">
                      {t.edit}
                    </button>
                    <button className="button ghost" onClick={() => showToast(t.actionSent)} type="button">
                      {t.photos}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="meta" style={{ color: "#ddefe5" }}>
                  No pending quotes.
                </p>
              )}
            </section>
          </div>
          <div className="grid three-col">
            <section className="card span-2">
              <h2>AI Call Analytics</h2>
              <div className="bar-chart" aria-label="Weekly AI call activity">
                {[58, 82, 68, 94, 76, 62, 88].map((height, index) => (
                  <div className="bar-column" key={index}>
                    <div className={index === 3 ? "bar active" : "bar"} style={{ height: `${height}%` }} />
                    <span>{["S", "M", "T", "W", "T", "F", "S"][index]}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card tracker-card">
              <h2>Ana Voice Agent</h2>
              <div className="timer">01:24:08</div>
              <p>Live test window</p>
              <div className="toolbar">
                <button className="round-control pause" type="button">II</button>
                <button className="round-control stop" type="button">S</button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "bookings" ? <BookingsTab jobs={data.jobs} /> : null}
      {activeTab === "customers" ? <CustomersTab customers={data.customers} /> : null}
      {activeTab === "quotes" ? <QuotesTab quotes={data.quotes} onAction={() => showToast(t.actionSent)} /> : null}
      {activeTab === "messages" ? <MessagesTab data={data} /> : null}
      {activeTab === "settings" ? (
        <SettingsTab data={data} labels={t} onSave={() => showToast(t.saved)} />
      ) : null}
      <Toast message={toast} />
    </>
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

function JobList({ jobs, empty }: { jobs: OwnerPortalData["jobs"]; empty: string }) {
  if (!jobs.length) return <div className="empty-state">{empty}</div>;

  return (
    <div className="list">
      {jobs.map((job) => (
        <article className="row-card split" key={job.id}>
          <div>
            <strong>{job.title}</strong>
            <div className="meta">
              {formatDateTime(job.scheduled_start)} - {customerName(job.customers)} - {job.address ?? "No address"}
            </div>
          </div>
          <StatusPill status={job.status} />
        </article>
      ))}
    </div>
  );
}

function BookingsTab({ jobs }: { jobs: OwnerPortalData["jobs"] }) {
  return (
    <section className="card">
      <h2>Bookings</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Customer</th>
              <th>Schedule</th>
              <th>Status</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.title}</td>
                <td>{customerName(job.customers)}</td>
                <td>{formatDateTime(job.scheduled_start)}</td>
                <td>
                  <StatusPill status={job.status} />
                </td>
                <td>{formatCurrency(job.final_value ?? job.estimated_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomersTab({ customers }: { customers: OwnerPortalData["customers"] }) {
  return (
    <section className="card">
      <h2>Customers</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Language</th>
              <th>Source</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.full_name}</td>
                <td>{customer.phone ?? "Missing"}</td>
                <td>{customer.preferred_language}</td>
                <td>{customer.referral_source ?? "Unknown"}</td>
                <td>{customer.address ?? "No address"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuotesTab({ quotes, onAction }: { quotes: OwnerPortalData["quotes"]; onAction: () => void }) {
  return (
    <section className="card">
      <h2>Quotes</h2>
      <div className="list">
        {quotes.map((quote) => (
          <article className="row-card split" key={quote.id}>
            <div>
              <strong>{customerName(quote.customers)}</strong>
              <div className="meta">
                {quote.service_type ?? "Service"} - {formatCurrency(quote.suggested_low)} - {formatCurrency(quote.suggested_high)}
              </div>
              <div className="meta">{quote.ai_observations ?? "No AI observations yet."}</div>
            </div>
            <div className="toolbar">
              <StatusPill status={quote.status} />
              <button className="button ghost" onClick={onAction} type="button">
                Review
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MessagesTab({ data }: { data: OwnerPortalData }) {
  return (
    <div className="grid two-col">
      <section className="card">
        <h2>Messages</h2>
        <div className="list">
          {data.messages.map((message) => (
            <article className="row-card" key={message.id}>
              <strong>
                {message.direction} - {message.channel} - {customerName(message.customers)}
              </strong>
              <div className="meta">{message.body}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>AI summaries</h2>
        <div className="list">
          {data.summaries.map((summary) => (
            <article className="row-card" key={summary.id}>
              <strong>{summary.action_needed ?? "Summary"}</strong>
              <div className="meta">{summary.summary}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsTab({
  data,
  labels,
  onSave
}: {
  data: OwnerPortalData;
  labels: (typeof copy)["es"];
  onSave: () => void;
}) {
  return (
    <section className="card">
      <h2>{labels.businessSettings}</h2>
      <div className="form-grid">
        <label className="field">
          <span>Business</span>
          <input readOnly value={data.business.name} />
        </label>
        <label className="field">
          <span>Trade</span>
          <input readOnly value={data.business.trade} />
        </label>
        <label className="field">
          <span>{labels.radius}</span>
          <input readOnly value={`${data.radiusRule?.radius_miles ?? 30} miles`} />
        </label>
        <label className="field">
          <span>AI voice</span>
          <input readOnly value={data.business.ai_voice_name} />
        </label>
        <label className="field">
          <span>{labels.plan}</span>
          <input readOnly value={data.billing?.plan_name ?? "Growth"} />
        </label>
        <label className="field">
          <span>{labels.paymentStatus}</span>
          <input readOnly value={data.billing?.billing_status ?? "trial"} />
        </label>
        <label className="field full">
          <span>{labels.billing}</span>
          <textarea readOnly value={`${labels.nextDue}: ${data.billing?.next_payment_due_at ?? "Not set"}`} />
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="button primary" onClick={onSave} type="button">
          Save settings
        </button>
      </div>
    </section>
  );
}
