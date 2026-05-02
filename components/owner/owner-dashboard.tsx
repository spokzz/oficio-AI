"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addOwnerBooking,
  addOwnerCustomer,
  deleteOwnerBooking,
  deleteOwnerCustomer,
  updateOwnerBooking,
  updateOwnerCustomer,
  type AddBookingState,
  type AddCustomerState
} from "@/app/actions/owner";
import {
  CalendarIcon,
  DollarIcon,
  EyeIcon,
  LeafIcon,
  MessageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
  UsersIcon
} from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { customerSourceOptions, type CustomerSourceOption } from "@/lib/customer-sources";
import { serviceOptions, type ServiceOption } from "@/lib/services";
import type { OwnerPortalData } from "@/lib/owner-data";
import type { Customer, Job } from "@/lib/types";

type Tab = "home" | "bookings" | "customers" | "quotes" | "messages";
type Lang = "es" | "en";
type BookingView = "current" | "past";
type CustomerSort = "asc" | "desc";

const copy = {
  es: {
    home: "Inicio",
    totalBookings: "Reservas",
    todayJobs: "Trabajos hoy",
    revenue: "Ingresos",
    recovered: "Llamadas recuperadas",
    today: "Hoy",
    currentData: "Datos actuales",
    aiOutcomes: "Resultados AI",
    bookings: "Reservas",
    customers: "Clientes",
    quotes: "Cotizaciones",
    messages: "Mensajes",
    agenda: "Agenda de hoy",
    pendingQuote: "Cotización para aprobar",
    noJobs: "No hay trabajos todavía.",
    noCustomers: "No hay clientes todavía.",
    approve: "Aprobar",
    edit: "Editar precio",
    photos: "Pedir fotos",
    noPendingQuotes: "No hay cotizaciones pendientes.",
    aiCallAnalytics: "Análisis de llamadas AI",
    weeklyAiCallActivity: "Actividad semanal de llamadas AI",
    anaVoiceAgent: "Agente de voz Ana",
    liveTestWindow: "Ventana de prueba en vivo",
    job: "Trabajo",
    customer: "Cliente",
    schedule: "Horario",
    status: "Estado",
    value: "Valor",
    name: "Nombre",
    newCustomer: "Cliente nuevo",
    phone: "Teléfono",
    language: "Idioma",
    source: "Fuente",
    sourceQuestion: "¿Cómo nos encontró?",
    address: "Dirección",
    bookingAddress: "Dirección del trabajo",
    addBooking: "Agregar reserva",
    addBookingTitle: "Agregar reserva",
    addBookingSubtitle: "Agenda un trabajo para un cliente existente o nuevo.",
    bookingDate: "Fecha y hora",
    bookingValue: "Valor estimado",
    yardCleaningBooking: "Reserva de limpieza de patio",
    currentBookings: "Reservas actuales",
    pastBooking: "Reservas pasadas",
    pastBookingSubtitle: "Lista de todas las citas pasadas.",
    bookingDetails: "Detalles de la reserva",
    editBooking: "Editar reserva",
    editBookingTitle: "Editar reserva",
    deleteBooking: "Eliminar reserva",
    confirmDeleteBooking: "¿Eliminar esta reserva?",
    bookingDeleted: "Reserva eliminada.",
    chooseCustomer: "Elegir cliente",
    missing: "Faltante",
    unknown: "Desconocido",
    noAddress: "Sin dirección",
    service: "Servicio",
    serviceFee: "Tarifa de servicio",
    joinedOn: "Se unió",
    automatic: "Automático",
    recurringService: "Servicio recurrente",
    recurringEveryWeeks: "Repetir cada (semanas)",
    notRecurring: "No recurrente",
    every: "cada",
    week: "semana",
    weeks: "semanas",
    customerReminders: "Recordatorios de clientes",
    customerRemindersSubtitle: "Clientes recurrentes que ya necesitan seguimiento.",
    noCustomerReminders: "No hay recordatorios pendientes.",
    dueForService: "Listo para servicio",
    lastService: "Último servicio",
    phoneSetup: "Configuración telefónica",
    phoneSetupSubtitle: "Cómo Ana recibe llamadas y mensajes para este negocio.",
    publicBusinessNumber: "Número público",
    anaRoutingNumber: "Número de Ana",
    ownerTransferNumber: "Transferir al dueño",
    messagingStatus: "Estado SMS",
    voiceStatus: "Estado de voz",
    currentPhonePlan: "Plan actual",
    customerWillSee: "El cliente verá",
    ownerPrivateNumber: "Número privado del dueño",
    existingNumberType: "Tipo de número actual",
    portingStatus: "Estado de portación",
    smsTransitionHelp: "Para mensajes al número anterior, reenvía a Ana con: FWD +1CLIENTE y pega el mensaje.",
    ownerSetupMessages: {
      call_forwarding: "Ana contesta llamadas reenviadas. Los SMS siguen en el teléfono actual hasta elegir transición o portación.",
      port_existing: "Cuando la portación termine, los clientes usarán el mismo número de siempre y Ana manejará llamadas y mensajes.",
      sms_transition: "Ana no lee mensajes privados automáticamente. Reenvía mensajes de clientes a Ana con el formato indicado para registrarlos.",
      twilio_number: "Este número de Ana es el número oficial para llamadas y mensajes del negocio."
    },
    existingNumberKinds: {
      business: "Número de negocio",
      mixed: "Negocio y personal",
      personal: "Celular personal",
      unknown: "No confirmado"
    },
    portingStatuses: {
      blocked: "Bloqueado",
      collecting_info: "Recopilando información",
      completed: "Completado",
      not_started: "No iniciado",
      submitted: "Enviado a Twilio"
    },
    phoneSetupModes: {
      call_forwarding: "Mantener número y reenviar llamadas",
      port_existing: "Portar número existente",
      sms_transition: "Transición de SMS",
      twilio_number: "Usar número de Ana"
    },
    setupStatuses: {
      active: "Activo",
      blocked: "Bloqueado",
      not_started: "No iniciado",
      pending: "Pendiente",
      transition: "Transición"
    },
    noAiObservations: "No hay observaciones de AI todavía.",
    review: "Revisar",
    actions: "Acciones",
    close: "Cerrar",
    confirmDeleteCustomer: "Eliminar este cliente?",
    customerDeleted: "Cliente eliminado.",
    aiSummaries: "Resúmenes AI",
    summary: "Resumen",
    addCustomer: "Agregar cliente",
    addCustomerTitle: "Agregar cliente",
    addCustomerSubtitle: "Crea o actualiza la información del cliente.",
    fullName: "Nombre completo",
    email: "Email",
    preferredLanguage: "Idioma preferido",
    autoDetect: "Detectar automáticamente",
    spanish: "Español",
    english: "Inglés",
    notes: "Notas",
    cancel: "Cancelar",
    customerDetails: "Detalles del cliente",
    deleteCustomer: "Eliminar cliente",
    editCustomer: "Editar cliente",
    editCustomerTitle: "Editar cliente",
    nameAscending: "Nombre A-Z",
    nameDescending: "Nombre Z-A",
    noNotes: "Sin notas",
    viewCustomer: "Ver cliente",
    viewBooking: "Ver",
    newCustomerOption: "Cliente nuevo",
    totalCustomer: "Total cliente",
    saveCustomer: "Guardar cliente",
    searchBookings: "Buscar reservas",
    searchCustomers: "Buscar clientes",
    searchBookingPlaceholder: "Buscar por cliente o dirección",
    searchCustomerPlaceholder: "Buscar por nombre o dirección",
    matchingResults: "resultados",
    of: "de",
    clearSearch: "Limpiar",
    noMatchingBookings: "No hay reservas que coincidan con esa búsqueda.",
    noMatchingCustomers: "No hay clientes que coincidan con esa búsqueda.",
    saving: "Guardando...",
    updateCustomer: "Actualizar cliente",
    updating: "Actualizando...",
    updateBooking: "Actualizar reserva",
    notSet: "No definido",
    statuses: {
      accepted: "Aceptada",
      approved: "Aprobada",
      canceled: "Cancelado",
      completed: "Completado",
      confirmed: "Confirmado",
      declined: "Rechazada",
      draft: "Borrador",
      expired: "Vencida",
      in_progress: "En progreso",
      lead: "Cliente potencial",
      needs_owner_approval: "Necesita aprobación",
      pending: "Pendiente",
      sent: "Enviada"
    },
    services: {
      landscaping: "Paisajismo",
      mowing: "Corte de césped",
      tree_cutting: "Corte de árboles",
      yard_cleanup: "Limpieza de patio",
      irrigation: "Riego"
    },
    sources: {
      referral: "Referencia",
      facebook: "Facebook",
      google: "Google",
      website: "Sitio web",
      instagram: "Instagram",
      other: "Otro"
    },
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
    today: "Today",
    currentData: "Current data",
    aiOutcomes: "AI outcomes",
    bookings: "Bookings",
    customers: "Customers",
    quotes: "Quotes",
    messages: "Messages",
    agenda: "Today's agenda",
    pendingQuote: "Quote to approve",
    noJobs: "No jobs yet.",
    noCustomers: "No customers yet.",
    approve: "Approve",
    edit: "Edit price",
    photos: "Ask for photos",
    noPendingQuotes: "No pending quotes.",
    aiCallAnalytics: "AI Call Analytics",
    weeklyAiCallActivity: "Weekly AI call activity",
    anaVoiceAgent: "Ana Voice Agent",
    liveTestWindow: "Live test window",
    job: "Job",
    customer: "Customer",
    schedule: "Schedule",
    status: "Status",
    value: "Value",
    name: "Name",
    newCustomer: "New customer",
    phone: "Phone",
    language: "Language",
    source: "Source",
    sourceQuestion: "How did they hear about us?",
    address: "Address",
    bookingAddress: "Job address",
    addBooking: "Add booking",
    addBookingTitle: "Add booking",
    addBookingSubtitle: "Schedule a job for an existing or new customer.",
    bookingDate: "Date and time",
    bookingValue: "Estimated value",
    yardCleaningBooking: "Yard cleaning booking",
    currentBookings: "Current bookings",
    pastBooking: "Past booking",
    pastBookingSubtitle: "List of all past appointments.",
    bookingDetails: "Booking details",
    editBooking: "Edit booking",
    editBookingTitle: "Edit booking",
    deleteBooking: "Delete booking",
    confirmDeleteBooking: "Delete this booking?",
    bookingDeleted: "Booking deleted.",
    chooseCustomer: "Choose customer",
    missing: "Missing",
    unknown: "Unknown",
    noAddress: "No address",
    service: "Service",
    serviceFee: "Service fee",
    joinedOn: "Joined on",
    automatic: "Automatic",
    recurringService: "Recurring service",
    recurringEveryWeeks: "Repeat every (weeks)",
    notRecurring: "Not recurring",
    every: "every",
    week: "week",
    weeks: "weeks",
    customerReminders: "Customer reminders",
    customerRemindersSubtitle: "Recurring customers who are ready for follow-up.",
    noCustomerReminders: "No customer reminders due.",
    dueForService: "Due for service",
    lastService: "Last service",
    phoneSetup: "Phone setup",
    phoneSetupSubtitle: "How Ana receives calls and texts for this business.",
    publicBusinessNumber: "Public number",
    anaRoutingNumber: "Ana number",
    ownerTransferNumber: "Owner transfer",
    messagingStatus: "SMS status",
    voiceStatus: "Voice status",
    currentPhonePlan: "Current plan",
    customerWillSee: "Customer will see",
    ownerPrivateNumber: "Owner private number",
    existingNumberType: "Existing number type",
    portingStatus: "Porting status",
    smsTransitionHelp: "For texts sent to the old number, forward to Ana with: FWD +1CUSTOMER and paste the message.",
    ownerSetupMessages: {
      call_forwarding: "Ana answers forwarded calls. Text messages stay on the existing phone until SMS transition or porting is chosen.",
      port_existing: "After the port completes, customers keep using the same number and Ana handles calls and texts from it.",
      sms_transition: "Ana does not read private texts automatically. Forward customer texts to Ana in the format shown so they can be logged.",
      twilio_number: "This Ana number is the official business number for customer calls and texts."
    },
    existingNumberKinds: {
      business: "Business number",
      mixed: "Business and personal",
      personal: "Personal cell",
      unknown: "Not confirmed"
    },
    portingStatuses: {
      blocked: "Blocked",
      collecting_info: "Collecting info",
      completed: "Completed",
      not_started: "Not started",
      submitted: "Submitted to Twilio"
    },
    phoneSetupModes: {
      call_forwarding: "Keep number and forward calls",
      port_existing: "Port existing number",
      sms_transition: "SMS transition",
      twilio_number: "Use Ana number"
    },
    setupStatuses: {
      active: "Active",
      blocked: "Blocked",
      not_started: "Not started",
      pending: "Pending",
      transition: "Transition"
    },
    noAiObservations: "No AI observations yet.",
    review: "Review",
    actions: "Actions",
    close: "Close",
    confirmDeleteCustomer: "Delete this customer?",
    customerDeleted: "Customer deleted.",
    aiSummaries: "AI summaries",
    summary: "Summary",
    addCustomer: "Add customer",
    addCustomerTitle: "Add customer",
    addCustomerSubtitle: "Create or update the customer profile.",
    fullName: "Full name",
    email: "Email",
    preferredLanguage: "Preferred language",
    autoDetect: "Auto-detect",
    spanish: "Spanish",
    english: "English",
    notes: "Notes",
    cancel: "Cancel",
    customerDetails: "Customer details",
    deleteCustomer: "Delete customer",
    editCustomer: "Edit customer",
    editCustomerTitle: "Edit customer",
    nameAscending: "Name A-Z",
    nameDescending: "Name Z-A",
    noNotes: "No notes",
    viewCustomer: "View customer",
    viewBooking: "View",
    newCustomerOption: "New customer",
    totalCustomer: "Total customer",
    saveCustomer: "Save customer",
    searchBookings: "Search bookings",
    searchCustomers: "Search customers",
    searchBookingPlaceholder: "Search by customer or address",
    searchCustomerPlaceholder: "Search by name or address",
    matchingResults: "results",
    of: "of",
    clearSearch: "Clear",
    noMatchingBookings: "No bookings match that search.",
    noMatchingCustomers: "No customers match that search.",
    saving: "Saving...",
    updateCustomer: "Update customer",
    updating: "Updating...",
    updateBooking: "Update booking",
    notSet: "Not set",
    statuses: {
      accepted: "Accepted",
      approved: "Approved",
      canceled: "Canceled",
      completed: "Completed",
      confirmed: "Confirmed",
      declined: "Declined",
      draft: "Draft",
      expired: "Expired",
      in_progress: "In progress",
      lead: "Lead",
      needs_owner_approval: "Needs approval",
      pending: "Pending",
      sent: "Sent"
    },
    services: {
      landscaping: "Landscaping",
      mowing: "Mowing",
      tree_cutting: "Tree cutting",
      yard_cleanup: "Yard cleaning",
      irrigation: "Irrigation"
    },
    sources: {
      referral: "Referral",
      facebook: "Facebook",
      google: "Google",
      website: "Website",
      instagram: "Instagram",
      other: "Other"
    },
    languageNote: "The AI speaks the customer's language and sends the owner a Spanish summary.",
    saved: "Saved for demo. In production this will call a server action.",
    actionSent: "Action ready. In production this will save in Supabase and notify the customer."
  }
};

type OwnerCopy = (typeof copy)[Lang];

function customerName(customer?: Customer | Pick<Customer, "full_name"> | null, fallback = "New customer") {
  return customer?.full_name ?? fallback;
}

function statusLabel(labels: OwnerCopy, status: string) {
  const statuses: Record<string, string> = labels.statuses;
  return statuses[status] ?? status.replaceAll("_", " ");
}

function serviceLabel(labels: OwnerCopy, service?: string | null) {
  if (!service) return labels.notSet;
  const services: Record<string, string> = labels.services;
  return services[service] ?? service.replaceAll("_", " ");
}

function phoneSetupModeLabel(labels: OwnerCopy, mode?: string | null) {
  const modes: Record<string, string> = labels.phoneSetupModes;
  return modes[mode ?? "twilio_number"] ?? labels.phoneSetupModes.twilio_number;
}

function setupStatusLabel(labels: OwnerCopy, status?: string | null) {
  const statuses: Record<string, string> = labels.setupStatuses;
  return statuses[status ?? "not_started"] ?? labels.setupStatuses.not_started;
}

function ownerSetupMessage(labels: OwnerCopy, mode?: string | null) {
  const messages: Record<string, string> = labels.ownerSetupMessages;
  return messages[mode ?? "twilio_number"] ?? labels.ownerSetupMessages.twilio_number;
}

function existingNumberKindLabel(labels: OwnerCopy, kind?: string | null) {
  const kinds: Record<string, string> = labels.existingNumberKinds;
  return kinds[kind ?? "unknown"] ?? labels.existingNumberKinds.unknown;
}

function portingStatusLabel(labels: OwnerCopy, status?: string | null) {
  const statuses: Record<string, string> = labels.portingStatuses;
  return statuses[status ?? "not_started"] ?? labels.portingStatuses.not_started;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bookingTitleLabel(labels: OwnerCopy, job: Job) {
  if (job.service_type === "yard_cleanup") return labels.yardCleaningBooking;
  return titleCase(job.title);
}

function sourceLabel(labels: OwnerCopy, source?: string | null) {
  if (!source) return labels.unknown;
  const sources: Record<string, string> = labels.sources;
  return sources[source] ?? source.replaceAll("_", " ");
}

function languageLabel(labels: OwnerCopy, language?: string | null) {
  if (language === "en") return labels.english;
  if (language === "es") return labels.spanish;
  if (language === "auto") return labels.autoDetect;
  return language || labels.unknown;
}

function serviceFeeLabel(labels: OwnerCopy, fee?: number | null) {
  const value = fee ?? 0;

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    style: "currency"
  }).format(value);
}

function formatDate(value: string | null | undefined, fallback = "Not set") {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function recurringServiceLabel(labels: OwnerCopy, customer: Customer) {
  if (!customer.recurring_interval_weeks) return labels.notRecurring;

  return `${serviceLabel(labels, customer.recurring_service_type)} ${labels.every} ${customer.recurring_interval_weeks} ${
    customer.recurring_interval_weeks === 1 ? labels.week : labels.weeks
  }`;
}

function normalizedSearch(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function matchesSearch(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = normalizedSearch(query);
  if (!normalizedQuery) return true;

  return values.some((value) => normalizedSearch(value).includes(normalizedQuery));
}

function isTodayJob(job: OwnerPortalData["jobs"][number]) {
  if (!job.scheduled_start) return false;

  const scheduled = new Date(job.scheduled_start);
  const today = new Date();

  return (
    scheduled.getFullYear() === today.getFullYear() &&
    scheduled.getMonth() === today.getMonth() &&
    scheduled.getDate() === today.getDate()
  );
}

function isPastBooking(job: OwnerPortalData["jobs"][number]) {
  if (!job.scheduled_start) return false;

  const scheduled = new Date(job.scheduled_start);
  if (Number.isNaN(scheduled.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return scheduled < today;
}

function scheduledTime(job: OwnerPortalData["jobs"][number]) {
  const time = job.scheduled_start ? new Date(job.scheduled_start).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function Toast({ message }: { message: string | null }) {
  return message ? <div className="toast show">{message}</div> : null;
}

export function OwnerDashboard({
  data,
  initialLanguage = "es",
  initialTab = "home"
}: {
  data: OwnerPortalData;
  initialLanguage?: Lang;
  initialTab?: Tab;
}) {
  const activeTab = initialTab;
  const language = initialLanguage;
  const [toast, setToast] = useState<string | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<Job | null>(null);
  const [editBooking, setEditBooking] = useState<Job | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [, startDeleteTransition] = useTransition();
  const router = useRouter();
  const t = copy[language];

  const pendingQuote = useMemo(
    () => data.quotes.find((quote) => quote.status === "needs_owner_approval" || quote.status === "draft") ?? data.quotes[0],
    [data.quotes]
  );
  const scheduledBookings = useMemo(() => data.jobs.filter((job) => job.scheduled_start && job.status !== "canceled"), [data.jobs]);
  const currentBookings = useMemo(() => scheduledBookings.filter((job) => !isPastBooking(job)).sort((a, b) => scheduledTime(a) - scheduledTime(b)), [scheduledBookings]);
  const pastBookings = useMemo(() => scheduledBookings.filter(isPastBooking).sort((a, b) => scheduledTime(b) - scheduledTime(a)), [scheduledBookings]);
  const todayJobs = useMemo(() => scheduledBookings.filter(isTodayJob), [scheduledBookings]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const handleCustomerAdded = useCallback(
    (message: string) => {
      setIsCustomerModalOpen(false);
      setEditCustomer(null);
      showToast(message);
      router.refresh();
    },
    [router, showToast]
  );

  const handleBookingAdded = useCallback(
    (message: string) => {
      setIsBookingModalOpen(false);
      setEditBooking(null);
      showToast(message);
      router.refresh();
    },
    [router, showToast]
  );

  const handleBookingDeleted = useCallback(
    (booking: Job) => {
      if (!window.confirm(t.confirmDeleteBooking)) {
        return;
      }

      startDeleteTransition(async () => {
        const result = await deleteOwnerBooking(booking.id);

        if (result.error) {
          showToast(result.error);
          return;
        }

        setDetailBooking(null);
        setEditBooking(null);
        showToast(result.success ?? t.bookingDeleted);
        router.refresh();
      });
    },
    [router, showToast, t.bookingDeleted, t.confirmDeleteBooking]
  );

  const handleCustomerDeleted = useCallback(
    (customer: Customer) => {
      if (!window.confirm(t.confirmDeleteCustomer)) {
        return;
      }

      startDeleteTransition(async () => {
        const result = await deleteOwnerCustomer(customer.id);

        if (result.error) {
          showToast(result.error);
          return;
        }

        setDetailCustomer(null);
        setEditCustomer(null);
        showToast(result.success ?? t.customerDeleted);
        router.refresh();
      });
    },
    [router, showToast, t.confirmDeleteCustomer, t.customerDeleted]
  );

  return (
    <>
      {activeTab === "home" ? (
        <div className="grid">
          <div className="grid stats-grid">
            <Stat featured label={t.totalBookings} value={data.metrics.totalBookings} foot="+ Supabase" icon={<CalendarIcon />} />
            <Stat label={t.todayJobs} value={data.metrics.todayJobs} foot={t.today} icon={<LeafIcon />} />
            <Stat label={t.revenue} value={formatCurrency(data.metrics.revenue)} foot={t.currentData} icon={<DollarIcon />} />
            <Stat label={t.recovered} value={data.metrics.recoveredCalls} foot={t.aiOutcomes} icon={<MessageIcon />} />
          </div>
          <PhoneSetupCard data={data} labels={t} />
          <div className="grid two-col">
            <section className="card">
              <h2>{t.agenda}</h2>
              <JobList empty={t.noJobs} jobs={todayJobs} labels={t} onOpenJob={(job) => setDetailBooking(job)} />
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
                      {customerName(pendingQuote.customers, t.newCustomer)}
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
                  {t.noPendingQuotes}
                </p>
              )}
            </section>
          </div>
          <CustomerReminderList data={data} labels={t} />
          <div className="grid three-col">
            <section className="card span-2">
              <h2>{t.aiCallAnalytics}</h2>
              <div className="bar-chart" aria-label={t.weeklyAiCallActivity}>
                {[58, 82, 68, 94, 76, 62, 88].map((height, index) => (
                  <div className="bar-column" key={index}>
                    <div className={index === 3 ? "bar active" : "bar"} style={{ height: `${height}%` }} />
                    <span>{["S", "M", "T", "W", "T", "F", "S"][index]}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card tracker-card">
              <h2>{t.anaVoiceAgent}</h2>
              <div className="timer">01:24:08</div>
              <p>{t.liveTestWindow}</p>
              <div className="toolbar">
                <button className="round-control pause" type="button">II</button>
                <button className="round-control stop" type="button">S</button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "bookings" ? (
        <BookingsTab
          currentJobs={currentBookings}
          labels={t}
          onAddBooking={() => setIsBookingModalOpen(true)}
          onDeleteBooking={handleBookingDeleted}
          onEditBooking={(booking) => setEditBooking(booking)}
          onOpenBooking={(booking) => setDetailBooking(booking)}
          pastJobs={pastBookings}
        />
      ) : null}
      {activeTab === "customers" ? (
        <CustomersTab
          customerServices={data.customerServices}
          customers={data.customers}
          labels={t}
          onAddCustomer={() => setIsCustomerModalOpen(true)}
          onDeleteCustomer={handleCustomerDeleted}
          onEditCustomer={(customer) => setEditCustomer(customer)}
          onOpenCustomer={(customer) => setDetailCustomer(customer)}
        />
      ) : null}
      {activeTab === "quotes" ? <QuotesTab labels={t} quotes={data.quotes} onAction={() => showToast(t.actionSent)} /> : null}
      {activeTab === "messages" ? <MessagesTab data={data} labels={t} /> : null}
      {isBookingModalOpen ? (
        <AddBookingModal
          customers={data.customers}
          labels={t}
          onClose={() => setIsBookingModalOpen(false)}
          onSuccess={handleBookingAdded}
        />
      ) : null}
      {detailBooking ? (
        <BookingDetailsModal
          booking={detailBooking}
          labels={t}
          onClose={() => setDetailBooking(null)}
          onEdit={() => {
            setEditBooking(detailBooking);
            setDetailBooking(null);
          }}
        />
      ) : null}
      {editBooking ? (
        <EditBookingModal
          booking={editBooking}
          customers={data.customers}
          labels={t}
          onClose={() => setEditBooking(null)}
          onSuccess={handleBookingAdded}
        />
      ) : null}
      {isCustomerModalOpen ? (
        <AddCustomerModal labels={t} onClose={() => setIsCustomerModalOpen(false)} onSuccess={handleCustomerAdded} />
      ) : null}
      {detailCustomer ? (
        <CustomerDetailsModal
          customer={detailCustomer}
          labels={t}
          onClose={() => setDetailCustomer(null)}
          onEdit={() => {
            setEditCustomer(detailCustomer);
            setDetailCustomer(null);
          }}
          service={data.customerServices[detailCustomer.id]}
        />
      ) : null}
      {editCustomer ? (
        <EditCustomerModal
          customer={editCustomer}
          labels={t}
          onClose={() => setEditCustomer(null)}
          onSuccess={handleCustomerAdded}
          service={data.customerServices[editCustomer.id]}
        />
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

function JobList({
  jobs,
  empty,
  labels,
  onOpenJob
}: {
  jobs: OwnerPortalData["jobs"];
  empty: string;
  labels: OwnerCopy;
  onOpenJob: (job: Job) => void;
}) {
  if (!jobs.length) return <div className="empty-state">{empty}</div>;

  return (
    <div className="list">
      {jobs.map((job) => (
        <article className="row-card split" key={job.id}>
          <div>
            <strong>{bookingTitleLabel(labels, job)}</strong>
            <div className="meta agenda-job-meta">
              <span>{formatDateTime(job.scheduled_start)}</span>
              <span>{customerName(job.customers, labels.newCustomer)}</span>
              <span>{job.address ?? labels.noAddress}</span>
            </div>
          </div>
          <button className="icon-action-button agenda-view-button" onClick={() => onOpenJob(job)} type="button">
            <EyeIcon />
            <span>{labels.viewBooking}</span>
          </button>
        </article>
      ))}
    </div>
  );
}

function CustomerReminderList({ data, labels }: { data: OwnerPortalData; labels: OwnerCopy }) {
  return (
    <section className="card reminder-card">
      <div className="section-card-header">
        <div>
          <h2>{labels.customerReminders}</h2>
          <p className="meta">{labels.customerRemindersSubtitle}</p>
        </div>
        <strong className="reminder-count">{data.customerReminders.length}</strong>
      </div>
      {data.customerReminders.length ? (
        <div className="list">
          {data.customerReminders.slice(0, 4).map((reminder) => (
            <article className="row-card reminder-row" key={reminder.customerId}>
              <strong>{reminder.customerName}</strong>
              <div className="meta">
                {serviceLabel(labels, reminder.serviceType)} {labels.every} {reminder.intervalWeeks}{" "}
                {reminder.intervalWeeks === 1 ? labels.week : labels.weeks}
              </div>
              <div className="meta">
                {labels.dueForService}: {formatDate(reminder.dueAt, labels.notSet)}
                {reminder.lastServiceAt ? ` · ${labels.lastService}: ${formatDate(reminder.lastServiceAt, labels.notSet)}` : ""}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">{labels.noCustomerReminders}</div>
      )}
    </section>
  );
}

function PhoneSetupCard({ data, labels }: { data: OwnerPortalData; labels: OwnerCopy }) {
  const business = data.business;
  const mode = business.phone_setup_mode ?? "twilio_number";
  const customerFacingNumber = mode === "twilio_number" ? business.twilio_routing_phone : business.phone;

  return (
    <section className="card">
      <div className="section-card-header">
        <div>
          <h2>{labels.phoneSetup}</h2>
          <p className="meta">{labels.phoneSetupSubtitle}</p>
        </div>
        <strong className="customer-count-badge">{phoneSetupModeLabel(labels, mode)}</strong>
      </div>
      <article className="row-card phone-guidance-card">
        <strong>{labels.currentPhonePlan}</strong>
        <div className="meta">{ownerSetupMessage(labels, mode)}</div>
      </article>
      <div className="grid three-col">
        <article className="row-card">
          <strong>{labels.customerWillSee}</strong>
          <div className="meta">{customerFacingNumber ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.anaRoutingNumber}</strong>
          <div className="meta">{business.twilio_routing_phone ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.ownerPrivateNumber}</strong>
          <div className="meta">{business.owner_transfer_phone ?? data.user.phone ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.publicBusinessNumber}</strong>
          <div className="meta">{business.phone ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.existingNumberType}</strong>
          <div className="meta">{existingNumberKindLabel(labels, business.existing_number_kind)}</div>
        </article>
        <article className="row-card">
          <strong>{labels.portingStatus}</strong>
          <div className="meta">{portingStatusLabel(labels, business.porting_status)}</div>
        </article>
      </div>
      <div className="toolbar" style={{ marginTop: 14 }}>
        <span className="pill info">
          {labels.voiceStatus}: {setupStatusLabel(labels, business.voice_setup_status)}
        </span>
        <span className="pill warn">
          {labels.messagingStatus}: {setupStatusLabel(labels, business.sms_setup_status)}
        </span>
      </div>
      {mode === "sms_transition" ? <p className="meta" style={{ marginTop: 12 }}>{labels.smsTransitionHelp}</p> : null}
    </section>
  );
}

function DirectorySearch({
  clearLabel,
  count,
  label,
  ofLabel,
  onChange,
  placeholder,
  resultsLabel,
  total,
  value
}: {
  clearLabel: string;
  count: number;
  label: string;
  ofLabel: string;
  onChange: (value: string) => void;
  placeholder: string;
  resultsLabel: string;
  total: number;
  value: string;
}) {
  return (
    <div className="directory-search-panel">
      <label aria-label={label} className="directory-search-box">
        <SearchIcon />
        <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type="search" value={value} />
      </label>
      <div className="directory-search-summary" aria-live="polite">
        <strong>{count}</strong>
        <span>
          {ofLabel} {total} {resultsLabel}
        </span>
      </div>
      {value ? (
        <button className="directory-search-clear" onClick={() => onChange("")} type="button">
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

function BookingsTab({
  currentJobs,
  labels,
  onAddBooking,
  onDeleteBooking,
  onEditBooking,
  onOpenBooking,
  pastJobs
}: {
  currentJobs: OwnerPortalData["jobs"];
  labels: OwnerCopy;
  onAddBooking: () => void;
  onDeleteBooking: (booking: Job) => void;
  onEditBooking: (booking: Job) => void;
  onOpenBooking: (booking: Job) => void;
  pastJobs: OwnerPortalData["jobs"];
}) {
  const [bookingView, setBookingView] = useState<BookingView>("current");
  const [searchQuery, setSearchQuery] = useState("");
  const visibleJobs = bookingView === "current" ? currentJobs : pastJobs;
  const filteredJobs = useMemo(
    () => visibleJobs.filter((job) => matchesSearch(searchQuery, job.customers?.full_name, job.address, job.customers?.address)),
    [searchQuery, visibleJobs]
  );
  const activeBookingLabel = bookingView === "current" ? labels.currentBookings : labels.pastBooking;
  const subtitle = bookingView === "current" ? labels.addBookingSubtitle : labels.pastBookingSubtitle;

  return (
    <section className="customer-directory">
      <div className="customer-directory-header">
        <div className="booking-header-copy">
          <h2>{labels.bookings}</h2>
          <p className="meta">{subtitle}</p>
          <div className="booking-view-toggle" aria-label={labels.bookings}>
            <button className={bookingView === "current" ? "active" : ""} onClick={() => setBookingView("current")} type="button">
              {labels.currentBookings}
            </button>
            <button className={bookingView === "past" ? "active" : ""} onClick={() => setBookingView("past")} type="button">
              {labels.pastBooking}
            </button>
          </div>
        </div>
        <div className="customer-directory-actions">
          <div className="customer-count-badge">
            <CalendarIcon />
            <span>{activeBookingLabel}</span>
            <strong>{visibleJobs.length}</strong>
          </div>
          <button className="button gold customer-add-button" onClick={onAddBooking} type="button">
            <PlusIcon />
            <span>{labels.addBooking}</span>
          </button>
        </div>
      </div>
      <DirectorySearch
        clearLabel={labels.clearSearch}
        count={filteredJobs.length}
        label={labels.searchBookings}
        ofLabel={labels.of}
        onChange={setSearchQuery}
        placeholder={labels.searchBookingPlaceholder}
        resultsLabel={labels.matchingResults}
        total={visibleJobs.length}
        value={searchQuery}
      />
      <div className="customer-table-wrap">
        <table className="customer-table">
          <thead>
            <tr>
              <th>{labels.job}</th>
              <th>{labels.customer}</th>
              <th>{labels.schedule}</th>
              <th>{labels.address}</th>
              <th>{labels.value}</th>
              <th aria-label={labels.actions} className="action-column" />
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length ? (
              filteredJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="customer-name">{bookingTitleLabel(labels, job)}</span>
                  </td>
                  <td>{customerName(job.customers, labels.newCustomer)}</td>
                  <td>{formatDateTime(job.scheduled_start)}</td>
                  <td>{job.address ?? labels.noAddress}</td>
                  <td>{formatCurrency(job.final_value ?? job.estimated_value)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-action-button" onClick={() => onOpenBooking(job)} type="button">
                        <EyeIcon />
                        <span>{labels.viewBooking}</span>
                      </button>
                      <button className="icon-action-button edit" onClick={() => onEditBooking(job)} type="button">
                        <PencilIcon />
                        <span>{labels.editBooking}</span>
                      </button>
                      <button className="icon-action-button danger" onClick={() => onDeleteBooking(job)} type="button">
                        <TrashIcon />
                        <span>{labels.deleteBooking}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">{visibleJobs.length ? labels.noMatchingBookings : labels.noJobs}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomersTab({
  customerServices,
  customers,
  labels,
  onAddCustomer,
  onDeleteCustomer,
  onEditCustomer,
  onOpenCustomer
}: {
  customerServices: OwnerPortalData["customerServices"];
  customers: OwnerPortalData["customers"];
  labels: OwnerCopy;
  onAddCustomer: () => void;
  onDeleteCustomer: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
  onOpenCustomer: (customer: Customer) => void;
}) {
  const [sortDirection, setSortDirection] = useState<CustomerSort>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const sortedCustomers = useMemo(
    () =>
      customers
        .filter((customer) => matchesSearch(searchQuery, customer.full_name, customer.address))
        .sort((first, second) => {
          const result = first.full_name.localeCompare(second.full_name, undefined, { sensitivity: "base" });
          return sortDirection === "asc" ? result : -result;
        }),
    [customers, searchQuery, sortDirection]
  );

  return (
    <section className="customer-directory">
      <div className="customer-directory-header">
        <div>
          <h2>{labels.customers}</h2>
          <p className="meta">{labels.addCustomerSubtitle}</p>
        </div>
        <div className="customer-directory-actions">
          <div className="customer-count-badge">
            <UsersIcon />
            <span>{labels.totalCustomer}</span>
            <strong>{customers.length}</strong>
          </div>
          <button className="button gold customer-add-button" onClick={onAddCustomer} type="button">
            <PlusIcon />
            <span>{labels.addCustomer}</span>
          </button>
        </div>
      </div>
      <DirectorySearch
        clearLabel={labels.clearSearch}
        count={sortedCustomers.length}
        label={labels.searchCustomers}
        ofLabel={labels.of}
        onChange={setSearchQuery}
        placeholder={labels.searchCustomerPlaceholder}
        resultsLabel={labels.matchingResults}
        total={customers.length}
        value={searchQuery}
      />
      <div className="customer-table-wrap">
        <table className="customer-table">
          <thead>
            <tr>
              <th>
                <button
                  className="column-sort-button"
                  onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  type="button"
                >
                  <span>{labels.name}</span>
                  <SortIcon className={sortDirection === "desc" ? "desc" : ""} />
                </button>
              </th>
              <th>{labels.phone}</th>
              <th>{labels.joinedOn}</th>
              <th>{labels.service}</th>
              <th>{labels.recurringService}</th>
              <th>{labels.serviceFee}</th>
              <th>{labels.language}</th>
              <th>{labels.address}</th>
              <th aria-label={labels.actions} className="action-column" />
            </tr>
          </thead>
          <tbody>
            {sortedCustomers.length ? (
              sortedCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <span className="customer-name">{customer.full_name}</span>
                  </td>
                  <td>{customer.phone ?? labels.missing}</td>
                  <td>{formatDate(customer.created_at, labels.notSet)}</td>
                  <td>{serviceLabel(labels, customerServices[customer.id])}</td>
                  <td>{recurringServiceLabel(labels, customer)}</td>
                  <td>{serviceFeeLabel(labels, customer.service_fee)}</td>
                  <td>{languageLabel(labels, customer.preferred_language)}</td>
                  <td>{customer.address ?? labels.noAddress}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-action-button" onClick={() => onOpenCustomer(customer)} type="button">
                        <EyeIcon />
                        <span>{labels.viewCustomer}</span>
                      </button>
                      <button className="icon-action-button edit" onClick={() => onEditCustomer(customer)} type="button">
                        <PencilIcon />
                        <span>{labels.editCustomer}</span>
                      </button>
                      <button className="icon-action-button danger" onClick={() => onDeleteCustomer(customer)} type="button">
                        <TrashIcon />
                        <span>{labels.deleteCustomer}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">{customers.length ? labels.noMatchingCustomers : labels.noCustomers}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuotesTab({ quotes, labels, onAction }: { quotes: OwnerPortalData["quotes"]; labels: OwnerCopy; onAction: () => void }) {
  return (
    <section className="card">
      <h2>{labels.quotes}</h2>
      <div className="list">
        {quotes.map((quote) => (
          <article className="row-card split" key={quote.id}>
            <div>
              <strong>{customerName(quote.customers, labels.newCustomer)}</strong>
              <div className="meta">
                {quote.service_type ?? labels.service} - {formatCurrency(quote.suggested_low)} - {formatCurrency(quote.suggested_high)}
              </div>
              <div className="meta">{quote.ai_observations ?? labels.noAiObservations}</div>
            </div>
            <div className="toolbar">
              <StatusPill label={statusLabel(labels, quote.status)} status={quote.status} />
              <button className="button ghost" onClick={onAction} type="button">
                {labels.review}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MessagesTab({ data, labels }: { data: OwnerPortalData; labels: OwnerCopy }) {
  return (
    <div className="grid two-col">
      <section className="card">
        <h2>{labels.messages}</h2>
        <div className="list">
          {data.messages.map((message) => (
            <article className="row-card" key={message.id}>
              <strong>
                {message.direction} - {message.channel} - {customerName(message.customers, labels.newCustomer)}
              </strong>
              <div className="meta">{message.body}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>{labels.aiSummaries}</h2>
        <div className="list">
          {data.summaries.map((summary) => (
            <article className="row-card" key={summary.id}>
              <strong>{summary.action_needed ?? labels.summary}</strong>
              <div className="meta">{summary.summary}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CustomerDetailsModal({
  customer,
  labels,
  onClose,
  onEdit,
  service
}: {
  customer: Customer;
  labels: OwnerCopy;
  onClose: () => void;
  onEdit: () => void;
  service?: string;
}) {
  const details = [
    { label: labels.fullName, value: customer.full_name },
    { label: labels.phone, value: customer.phone ?? labels.missing },
    { label: labels.email, value: customer.email ?? labels.missing },
    { label: labels.joinedOn, value: formatDate(customer.created_at, labels.notSet) },
    { label: labels.service, value: serviceLabel(labels, service) },
    { label: labels.recurringService, value: recurringServiceLabel(labels, customer) },
    { label: labels.serviceFee, value: serviceFeeLabel(labels, customer.service_fee) },
    { label: labels.preferredLanguage, value: languageLabel(labels, customer.preferred_language) },
    { label: labels.source, value: sourceLabel(labels, customer.referral_source) },
    { label: labels.address, value: customer.address ?? labels.noAddress },
    { label: labels.notes, value: customer.notes ?? labels.noNotes, full: true }
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        aria-labelledby="customer-details-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-card-header">
          <div>
            <h2 id="customer-details-title">{labels.customerDetails}</h2>
            <p className="meta">{customer.full_name}</p>
          </div>
          <div className="toolbar flush">
            <button className="button ghost" onClick={onEdit} type="button">
              {labels.editCustomer}
            </button>
            <button className="button ghost" onClick={onClose} type="button">
              {labels.close}
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

function AddCustomerModal({
  labels,
  onClose,
  onSuccess
}: {
  labels: OwnerCopy;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const initialState: AddCustomerState = {};
  const [state, formAction] = useActionState(addOwnerCustomer, initialState);

  useEffect(() => {
    if (state.success) {
      onSuccess(state.success);
    }
  }, [onSuccess, state.success]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        aria-labelledby="add-customer-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-card-header">
          <div>
            <h2 id="add-customer-title">{labels.addCustomerTitle}</h2>
            <p className="meta">{labels.addCustomerSubtitle}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            {labels.cancel}
          </button>
        </div>
        <form action={formAction} className="form-grid">
          <label className="field">
            <span>{labels.fullName}</span>
            <input autoFocus name="fullName" required />
          </label>
          <label className="field">
            <span>{labels.phone}</span>
            <input name="phone" type="tel" />
          </label>
          <label className="field">
            <span>{labels.email}</span>
            <input name="email" type="email" />
          </label>
          <label className="field">
            <span>{labels.joinedOn}</span>
            <input readOnly value={labels.automatic} />
          </label>
          <label className="field">
            <span>{labels.service}</span>
            <select defaultValue="landscaping" name="serviceType" required>
              {serviceOptions.map((service: ServiceOption) => (
                <option key={service} value={service}>
                  {serviceLabel(labels, service)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.serviceFee}</span>
            <div className="currency-input">
              <span aria-hidden="true">$</span>
              <input className="service-fee-input" inputMode="decimal" min="0" name="serviceFee" step="0.01" type="number" />
            </div>
          </label>
          <label className="field">
            <span>{labels.recurringEveryWeeks}</span>
            <input inputMode="numeric" max="52" min="1" name="recurringIntervalWeeks" placeholder="2" type="number" />
          </label>
          <label className="field">
            <span>{labels.sourceQuestion}</span>
            <select defaultValue="referral" name="referralSource" required>
              {customerSourceOptions.map((source: CustomerSourceOption) => (
                <option key={source} value={source}>
                  {sourceLabel(labels, source)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.preferredLanguage}</span>
            <select defaultValue="auto" name="preferredLanguage">
              <option value="auto">{labels.autoDetect}</option>
              <option value="es">{labels.spanish}</option>
              <option value="en">{labels.english}</option>
            </select>
          </label>
          <label className="field">
            <span>{labels.address}</span>
            <input name="address" />
          </label>
          <label className="field full">
            <span>{labels.notes}</span>
            <textarea name="notes" />
          </label>
          {state.error ? <p className="form-message error">{state.error}</p> : null}
          <div className="form-actions">
            <button className="button ghost" onClick={onClose} type="button">
              {labels.cancel}
            </button>
            <AddCustomerSubmitButton labels={labels} />
          </div>
        </form>
      </section>
    </div>
  );
}

function AddBookingModal({
  customers,
  labels,
  onClose,
  onSuccess
}: {
  customers: OwnerPortalData["customers"];
  labels: OwnerCopy;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const initialState: AddBookingState = {};
  const [state, formAction] = useActionState(addOwnerBooking, initialState);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? "__new");
  const isNewCustomer = selectedCustomerId === "__new";

  useEffect(() => {
    if (state.success) {
      onSuccess(state.success);
    }
  }, [onSuccess, state.success]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        aria-labelledby="add-booking-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-card-header">
          <div>
            <h2 id="add-booking-title">{labels.addBookingTitle}</h2>
            <p className="meta">{labels.addBookingSubtitle}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            {labels.cancel}
          </button>
        </div>
        <form action={formAction} className="form-grid">
          <label className="field">
            <span>{labels.chooseCustomer}</span>
            <select name="customerId" onChange={(event) => setSelectedCustomerId(event.target.value)} value={selectedCustomerId}>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name}
                </option>
              ))}
              <option value="__new">{labels.newCustomerOption}</option>
            </select>
          </label>
          {isNewCustomer ? (
            <>
              <label className="field">
                <span>{labels.fullName}</span>
                <input autoFocus name="fullName" required />
              </label>
              <label className="field">
                <span>{labels.phone}</span>
                <input name="phone" type="tel" />
              </label>
              <label className="field">
                <span>{labels.email}</span>
                <input name="email" type="email" />
              </label>
              <label className="field">
                <span>{labels.preferredLanguage}</span>
                <select defaultValue="auto" name="preferredLanguage">
                  <option value="auto">{labels.autoDetect}</option>
                  <option value="es">{labels.spanish}</option>
                  <option value="en">{labels.english}</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="field">
            <span>{labels.service}</span>
            <select defaultValue="landscaping" name="serviceType" required>
              {serviceOptions.map((service: ServiceOption) => (
                <option key={service} value={service}>
                  {serviceLabel(labels, service)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.bookingDate}</span>
            <input name="scheduledStart" required type="datetime-local" />
          </label>
          <label className="field">
            <span>{labels.bookingValue}</span>
            <div className="currency-input">
              <span aria-hidden="true">$</span>
              <input className="service-fee-input" inputMode="decimal" min="0" name="estimatedValue" step="0.01" type="number" />
            </div>
          </label>
          <label className="field full">
            <span>{labels.bookingAddress}</span>
            <input name="address" />
          </label>
          <label className="field full">
            <span>{labels.notes}</span>
            <textarea name="notes" />
          </label>
          {state.error ? <p className="form-message error">{state.error}</p> : null}
          <div className="form-actions">
            <button className="button ghost" onClick={onClose} type="button">
              {labels.cancel}
            </button>
            <AddBookingSubmitButton labels={labels} />
          </div>
        </form>
      </section>
    </div>
  );
}

function BookingDetailsModal({
  booking,
  labels,
  onClose,
  onEdit
}: {
  booking: Job;
  labels: OwnerCopy;
  onClose: () => void;
  onEdit: () => void;
}) {
  const details = [
    { label: labels.job, value: bookingTitleLabel(labels, booking) },
    { label: labels.customer, value: customerName(booking.customers, labels.newCustomer) },
    { label: labels.service, value: serviceLabel(labels, booking.service_type) },
    { label: labels.schedule, value: formatDateTime(booking.scheduled_start) },
    { label: labels.address, value: booking.address ?? labels.noAddress },
    { label: labels.value, value: formatCurrency(booking.final_value ?? booking.estimated_value) },
    { label: labels.notes, value: booking.owner_notes ?? booking.ai_notes ?? labels.noNotes, full: true }
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        aria-labelledby="booking-details-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-card-header">
          <div>
            <h2 id="booking-details-title">{labels.bookingDetails}</h2>
            <p className="meta">{customerName(booking.customers, labels.newCustomer)}</p>
          </div>
          <div className="toolbar flush">
            <button className="button ghost" onClick={onEdit} type="button">
              {labels.editBooking}
            </button>
            <button className="button ghost" onClick={onClose} type="button">
              {labels.close}
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

function EditBookingModal({
  booking,
  customers,
  labels,
  onClose,
  onSuccess
}: {
  booking: Job;
  customers: OwnerPortalData["customers"];
  labels: OwnerCopy;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const initialState: AddBookingState = {};
  const [state, formAction] = useActionState(updateOwnerBooking, initialState);
  const selectedCustomer = customers.some((customer) => customer.id === booking.customer_id) ? (booking.customer_id ?? "") : "";
  const selectedService = serviceOptions.includes(booking.service_type as ServiceOption) ? (booking.service_type as ServiceOption) : "landscaping";

  useEffect(() => {
    if (state.success) {
      onSuccess(state.success);
    }
  }, [onSuccess, state.success]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        aria-labelledby="edit-booking-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-card-header">
          <div>
            <h2 id="edit-booking-title">{labels.editBookingTitle}</h2>
            <p className="meta">{customerName(booking.customers, labels.newCustomer)}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            {labels.cancel}
          </button>
        </div>
        <form action={formAction} className="form-grid">
          <input name="bookingId" type="hidden" value={booking.id} />
          <label className="field">
            <span>{labels.chooseCustomer}</span>
            <select defaultValue={selectedCustomer} name="customerId" required>
              <option disabled value="">
                {labels.chooseCustomer}
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.service}</span>
            <select defaultValue={selectedService} name="serviceType" required>
              {serviceOptions.map((service: ServiceOption) => (
                <option key={service} value={service}>
                  {serviceLabel(labels, service)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.bookingDate}</span>
            <input defaultValue={toDateTimeLocalValue(booking.scheduled_start)} name="scheduledStart" required type="datetime-local" />
          </label>
          <label className="field">
            <span>{labels.bookingValue}</span>
            <div className="currency-input">
              <span aria-hidden="true">$</span>
              <input
                className="service-fee-input"
                defaultValue={booking.estimated_value ?? booking.final_value ?? ""}
                inputMode="decimal"
                min="0"
                name="estimatedValue"
                step="0.01"
                type="number"
              />
            </div>
          </label>
          <label className="field full">
            <span>{labels.bookingAddress}</span>
            <input defaultValue={booking.address ?? ""} name="address" />
          </label>
          <label className="field full">
            <span>{labels.notes}</span>
            <textarea defaultValue={booking.owner_notes ?? ""} name="notes" />
          </label>
          {state.error ? <p className="form-message error">{state.error}</p> : null}
          <div className="form-actions">
            <button className="button ghost" onClick={onClose} type="button">
              {labels.cancel}
            </button>
            <EditBookingSubmitButton labels={labels} />
          </div>
        </form>
      </section>
    </div>
  );
}

function EditCustomerModal({
  customer,
  labels,
  onClose,
  onSuccess,
  service
}: {
  customer: Customer;
  labels: OwnerCopy;
  onClose: () => void;
  onSuccess: (message: string) => void;
  service?: string;
}) {
  const initialState: AddCustomerState = {};
  const [state, formAction] = useActionState(updateOwnerCustomer, initialState);
  const selectedService = serviceOptions.includes(service as ServiceOption) ? (service as ServiceOption) : "landscaping";
  const selectedLanguage = ["auto", "es", "en"].includes(customer.preferred_language) ? customer.preferred_language : "auto";
  const selectedSource = customerSourceOptions.includes(customer.referral_source as CustomerSourceOption)
    ? (customer.referral_source as CustomerSourceOption)
    : "other";

  useEffect(() => {
    if (state.success) {
      onSuccess(state.success);
    }
  }, [onSuccess, state.success]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        aria-labelledby="edit-customer-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-card-header">
          <div>
            <h2 id="edit-customer-title">{labels.editCustomerTitle}</h2>
            <p className="meta">{customer.full_name}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            {labels.cancel}
          </button>
        </div>
        <form action={formAction} className="form-grid">
          <input name="customerId" type="hidden" value={customer.id} />
          <label className="field">
            <span>{labels.fullName}</span>
            <input autoFocus defaultValue={customer.full_name} name="fullName" required />
          </label>
          <label className="field">
            <span>{labels.phone}</span>
            <input defaultValue={customer.phone ?? ""} name="phone" type="tel" />
          </label>
          <label className="field">
            <span>{labels.email}</span>
            <input defaultValue={customer.email ?? ""} name="email" type="email" />
          </label>
          <label className="field">
            <span>{labels.joinedOn}</span>
            <input readOnly value={formatDate(customer.created_at, labels.notSet)} />
          </label>
          <label className="field">
            <span>{labels.service}</span>
            <select defaultValue={selectedService} name="serviceType" required>
              {serviceOptions.map((serviceOption: ServiceOption) => (
                <option key={serviceOption} value={serviceOption}>
                  {serviceLabel(labels, serviceOption)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.serviceFee}</span>
            <div className="currency-input">
              <span aria-hidden="true">$</span>
              <input
                className="service-fee-input"
                defaultValue={customer.service_fee ?? ""}
                inputMode="decimal"
                min="0"
                name="serviceFee"
                step="0.01"
                type="number"
              />
            </div>
          </label>
          <label className="field">
            <span>{labels.recurringEveryWeeks}</span>
            <input
              defaultValue={customer.recurring_interval_weeks ?? ""}
              inputMode="numeric"
              max="52"
              min="1"
              name="recurringIntervalWeeks"
              placeholder="2"
              type="number"
            />
          </label>
          <label className="field">
            <span>{labels.sourceQuestion}</span>
            <select defaultValue={selectedSource} name="referralSource" required>
              {customerSourceOptions.map((source: CustomerSourceOption) => (
                <option key={source} value={source}>
                  {sourceLabel(labels, source)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.preferredLanguage}</span>
            <select defaultValue={selectedLanguage} name="preferredLanguage">
              <option value="auto">{labels.autoDetect}</option>
              <option value="es">{labels.spanish}</option>
              <option value="en">{labels.english}</option>
            </select>
          </label>
          <label className="field">
            <span>{labels.address}</span>
            <input defaultValue={customer.address ?? ""} name="address" />
          </label>
          <label className="field full">
            <span>{labels.notes}</span>
            <textarea defaultValue={customer.notes ?? ""} name="notes" />
          </label>
          {state.error ? <p className="form-message error">{state.error}</p> : null}
          <div className="form-actions">
            <button className="button ghost" onClick={onClose} type="button">
              {labels.cancel}
            </button>
            <EditCustomerSubmitButton labels={labels} />
          </div>
        </form>
      </section>
    </div>
  );
}

function AddCustomerSubmitButton({ labels }: { labels: OwnerCopy }) {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? labels.saving : labels.saveCustomer}
    </button>
  );
}

function AddBookingSubmitButton({ labels }: { labels: OwnerCopy }) {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? labels.saving : labels.addBooking}
    </button>
  );
}

function EditBookingSubmitButton({ labels }: { labels: OwnerCopy }) {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? labels.updating : labels.updateBooking}
    </button>
  );
}

function EditCustomerSubmitButton({ labels }: { labels: OwnerCopy }) {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? labels.updating : labels.updateCustomer}
    </button>
  );
}
