"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addOwnerAvailabilityException,
  addOwnerBooking,
  addOwnerCustomer,
  deleteOwnerAvailabilityException,
  deleteOwnerBooking,
  deleteOwnerCustomer,
  updateOwnerBooking,
  updateOwnerCustomer,
  updateOwnerServiceArea,
  updateOwnerSettings,
  type AddBookingState,
  type AddCustomerState,
  type OwnerClosureState,
  type OwnerServiceAreaState,
  type OwnerSettingsState
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
import { AddressLookupInput } from "@/components/ui/address-lookup-input";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { customerSourceOptions, type CustomerSourceOption } from "@/lib/customer-sources";
import { serviceOptions, type ServiceOption } from "@/lib/services";
import type { OwnerPortalData } from "@/lib/owner-data";
import type { Customer, Job } from "@/lib/types";

type Tab = "home" | "bookings" | "customers" | "quotes" | "messages" | "settings";
type Lang = "es" | "en";
type BookingView = "current" | "past" | "leads";
type CustomerSort = "asc" | "desc";

const CSRF_FIELD_NAME = "csrfToken";
const DAY_MS = 86_400_000;
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

const copy = {
  es: {
    home: "Inicio",
    totalBookings: "Reservas hoy",
    todayJobs: "Trabajos hoy",
    revenue: "Ingresos",
    recovered: "Llamadas recuperadas",
    aiCallMinutes: "Minutos AI",
    aiCallMinutesSubtitle: "Uso mensual incluido en tu plan.",
    plan: "Plan",
    usedMinutes: "Minutos usados",
    remainingMinutes: "Minutos restantes",
    includedMinutes: "Minutos incluidos",
    overageStartsAfter: "El exceso comienza después de",
    extraMinutes: "Minutos extra",
    overageCharge: "Cargo por exceso",
    vipOverage: "Exceso",
    noOverageBilling: "Sin cobro por exceso",
    voicemail: "Buzón de voz",
    playVoicemail: "Reproducir mensaje",
    today: "Hoy",
    currentData: "Datos actuales",
    aiOutcomes: "Resultados AI",
    bookings: "Reservas",
    customers: "Clientes",
    quotes: "Cotizaciones",
    messages: "Mensajes",
    settings: "Configuración",
    agenda: "Agenda de hoy",
    pendingQuote: "Cotización para aprobar",
    noJobs: "No hay trabajos todavía.",
    noCustomers: "No hay clientes todavía.",
    approve: "Aprobar",
    edit: "Editar precio",
    photos: "Pedir fotos",
    noPendingQuotes: "No hay cotizaciones pendientes.",
    aiCallAnalytics: "Análisis de llamadas AI",
    weeklyAiCallActivity: "Actividad mensual de llamadas AI",
    previousWeek: "Semana anterior",
    nextWeek: "Semana siguiente",
    anaVoiceAgent: "Agente de voz Ana",
    activeCall: "Llamada activa",
    lastCall: "Última llamada",
    noCallActivity: "Sin actividad de llamadas",
    call: "llamada",
    calls: "llamadas",
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
    leadBookings: "Clientes potenciales",
    leadBookingsSubtitle: "Solicitudes que necesitan seguimiento o una cita.",
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
    ownerSummarySettings: "Resúmenes para el dueño",
    ownerSummarySettingsSubtitle: "Elige cómo Ana agenda trabajos, explica horarios y envía resúmenes.",
    minuteLimitBehavior: "Cuando se usen los minutos mensuales",
    continueOverage: "Continuar llamadas y cobrar exceso",
    continueOverageDescription: "Ana sigue contestando y los minutos extra se cobran según tu tarifa.",
    takeVoicemail: "Detener llamadas AI y tomar buzón de voz básico",
    takeVoicemailDescription: "La persona deja su nombre, número y motivo de la llamada.",
    forwardAtLimit: "Reenviar llamadas al dueño",
    forwardAtLimitDescription: "Las llamadas nuevas van al teléfono privado configurado.",
    availabilitySettings: "Días cerrados",
    availabilitySettingsSubtitle: "Bloquea vacaciones, días festivos o cierres para que Ana no ofrezca citas.",
    closureReason: "Motivo",
    closureStartDate: "Primer día cerrado",
    closureEndDate: "Último día cerrado",
    closureMessage: "Mensaje para el cliente",
    addClosure: "Agregar cierre",
    closedDatesSaved: "Días cerrados guardados.",
    upcomingClosures: "Próximos cierres",
    noClosures: "No hay días cerrados programados.",
    removeClosure: "Eliminar cierre",
    confirmDeleteClosure: "¿Eliminar estos días cerrados?",
    closureDeleted: "Días cerrados eliminados.",
    serviceAreaSettings: "Área de servicio",
    serviceAreaSettingsSubtitle: "Configura la dirección base y el radio que Ana usa antes de aceptar citas.",
    companyAddress: "Dirección de la compañía",
    serviceRadiusMiles: "Radio de servicio",
    outsideRadiusPolicy: "Fuera del radio",
    addressLookupEmpty: "Sin resultados",
    declineOutsideRadius: "Ana rechaza automáticamente",
    allowOutsideRadius: "Permitir con aprobación del dueño",
    serviceAreaSaved: "Área de servicio guardada.",
    summaryLanguage: "Idioma de resumen del dueño",
    summaryMethod: "Método de resumen",
    summaryMethodSms: "Texto SMS",
    summaryMethodEmail: "Email",
    bookingTimeZone: "Zona horaria de reservas",
    businessDays: "Días de servicio",
    businessStartTime: "Hora de inicio",
    businessEndTime: "Hora de cierre",
    availableServices: "Servicios ofrecidos",
    availableServicesHelp: "Ana solo ofrecerá y reservará los servicios seleccionados.",
    saveSettings: "Guardar configuración",
    settingsSaved: "Configuración guardada.",
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
    anaCallLog: "Llamadas con Ana",
    anaCallLogSubtitle: "Cada llamada muestra el teléfono, nombre cuando Ana lo obtiene y un resumen claro.",
    callSummary: "Resumen de la llamada",
    serviceRequested: "Servicio solicitado",
    requestedTime: "Fecha solicitada",
    ownerAction: "Acción del dueño",
    notCollected: "No recopilado",
    translationPending: "Traducción en preparación. Se muestra el resumen disponible.",
    callStatuses: {
      booked: "Reservado",
      existing_customer: "Cliente existente",
      incomplete: "Incompleta",
      needs_approval: "Necesita aprobación",
      needs_callback: "Necesita llamada",
      needs_reschedule: "Necesita otro horario",
      not_confirmed: "Cita no confirmada",
      new_lead: "Cliente potencial"
    },
    noCalls: "No hay llamadas con Ana todavía.",
    caller: "Persona",
    phoneNumber: "Teléfono",
    mentionedName: "Nombre mencionado",
    latestMessages: "Mensajes recientes",
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
    noMatchingLeads: "No hay clientes potenciales que coincidan con esa búsqueda.",
    noLeads: "No hay clientes potenciales todavía.",
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
      lead_not_confirmed: "Cita no confirmada",
      needs_callback: "Necesita llamada",
      needs_owner_approval: "Necesita aprobación",
      needs_reschedule: "Necesita otro horario",
      pending: "Pendiente",
      pending_owner_approval: "Pendiente de aprobación",
      sent: "Enviada"
    },
    services: {
      landscaping: "Paisajismo",
      mowing: "Corte de césped",
      tree_cutting: "Servicios de árboles",
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
    totalBookings: "Bookings today",
    todayJobs: "Jobs today",
    revenue: "Revenue",
    recovered: "Recovered calls",
    aiCallMinutes: "AI minutes",
    aiCallMinutesSubtitle: "Monthly usage included with your plan.",
    plan: "Plan",
    usedMinutes: "Used minutes",
    remainingMinutes: "Remaining minutes",
    includedMinutes: "Included minutes",
    overageStartsAfter: "Overage starts after",
    extraMinutes: "Extra minutes",
    overageCharge: "Overage charge",
    vipOverage: "Overage",
    noOverageBilling: "No overage billing",
    voicemail: "Voicemail",
    playVoicemail: "Play voicemail",
    today: "Today",
    currentData: "Current data",
    aiOutcomes: "AI outcomes",
    bookings: "Bookings",
    customers: "Customers",
    quotes: "Quotes",
    messages: "Messages",
    settings: "Settings",
    agenda: "Today's agenda",
    pendingQuote: "Quote to approve",
    noJobs: "No jobs yet.",
    noCustomers: "No customers yet.",
    approve: "Approve",
    edit: "Edit price",
    photos: "Ask for photos",
    noPendingQuotes: "No pending quotes.",
    aiCallAnalytics: "AI Call Analytics",
    weeklyAiCallActivity: "Monthly AI call activity",
    previousWeek: "Previous week",
    nextWeek: "Next week",
    anaVoiceAgent: "Ana Voice Agent",
    activeCall: "Active call",
    lastCall: "Last call",
    noCallActivity: "No call activity",
    call: "call",
    calls: "calls",
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
    leadBookings: "Leads",
    leadBookingsSubtitle: "Requests that need follow-up or a scheduled appointment.",
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
    ownerSummarySettings: "Owner summaries",
    ownerSummarySettingsSubtitle: "Choose how Ana schedules jobs, explains hours, and sends owner summaries.",
    minuteLimitBehavior: "When monthly minutes are used",
    continueOverage: "Continue calls and bill overage",
    continueOverageDescription: "Ana keeps answering and extra minutes are billed at your configured rate.",
    takeVoicemail: "Stop AI calls and take basic voicemail",
    takeVoicemailDescription: "Callers leave their name, number, and reason for calling.",
    forwardAtLimit: "Forward calls to owner",
    forwardAtLimitDescription: "New calls go to the configured private owner phone.",
    availabilitySettings: "Closed dates",
    availabilitySettingsSubtitle: "Block vacations, holidays, or closures so Ana does not offer appointments.",
    closureReason: "Reason",
    closureStartDate: "First closed day",
    closureEndDate: "Last closed day",
    closureMessage: "Customer message",
    addClosure: "Add closure",
    closedDatesSaved: "Closed dates saved.",
    upcomingClosures: "Upcoming closures",
    noClosures: "No closed dates scheduled.",
    removeClosure: "Remove closure",
    confirmDeleteClosure: "Remove these closed dates?",
    closureDeleted: "Closed dates removed.",
    serviceAreaSettings: "Service area",
    serviceAreaSettingsSubtitle: "Set the base address and radius Ana checks before accepting appointments.",
    companyAddress: "Company address",
    serviceRadiusMiles: "Service radius",
    outsideRadiusPolicy: "Outside radius",
    addressLookupEmpty: "No matches",
    declineOutsideRadius: "Ana declines automatically",
    allowOutsideRadius: "Allow with owner approval",
    serviceAreaSaved: "Service area saved.",
    summaryLanguage: "Owner summary language",
    summaryMethod: "Summary method",
    summaryMethodSms: "SMS text",
    summaryMethodEmail: "Email",
    bookingTimeZone: "Booking time zone",
    businessDays: "Business days",
    businessStartTime: "Start time",
    businessEndTime: "End time",
    availableServices: "Services offered",
    availableServicesHelp: "Ana will only offer and book the selected services.",
    saveSettings: "Save settings",
    settingsSaved: "Settings saved.",
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
    anaCallLog: "Ana call log",
    anaCallLogSubtitle: "Every call shows the phone number, name when Ana gets one, and a clear summary.",
    callSummary: "Call summary",
    serviceRequested: "Service requested",
    requestedTime: "Requested time",
    ownerAction: "Owner action",
    notCollected: "Not collected",
    translationPending: "Translation is being prepared. Showing the available summary.",
    callStatuses: {
      booked: "Booked",
      existing_customer: "Existing customer",
      incomplete: "Incomplete",
      needs_approval: "Needs approval",
      needs_callback: "Needs callback",
      needs_reschedule: "Needs another time",
      not_confirmed: "Appointment not confirmed",
      new_lead: "New lead"
    },
    noCalls: "No Ana calls yet.",
    caller: "Caller",
    phoneNumber: "Phone",
    mentionedName: "Name mentioned",
    latestMessages: "Recent messages",
    addCustomer: "Add customer",
    addCustomerTitle: "Add customer",
    addCustomerSubtitle: "Create or update the customer profile.",
    fullName: "Full name",
    email: "Email",
    preferredLanguage: "Preferred language",
    autoDetect: "Auto-detect",
    spanish: "Español",
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
    noMatchingLeads: "No leads match that search.",
    noLeads: "No leads yet.",
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
      lead_not_confirmed: "Appointment not confirmed",
      needs_callback: "Needs callback",
      needs_owner_approval: "Needs approval",
      needs_reschedule: "Needs another time",
      pending: "Pending",
      pending_owner_approval: "Pending owner approval",
      sent: "Sent"
    },
    services: {
      landscaping: "Landscaping",
      mowing: "Lawn mowing",
      tree_cutting: "Tree services",
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

function businessServices(business: OwnerPortalData["business"]): ServiceOption[] {
  const selected = Array.isArray(business.available_services)
    ? business.available_services.filter((service): service is ServiceOption => serviceOptions.includes(service as ServiceOption))
    : [];

  return selected.length ? selected : [...serviceOptions];
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

function ownerSummaryLanguageLabel(labels: OwnerCopy, language?: string | null) {
  return language === "es" ? labels.spanish : labels.english;
}

function ownerSummaryChannelLabel(labels: OwnerCopy, channel?: string | null) {
  return channel === "email" ? labels.summaryMethodEmail : labels.summaryMethodSms;
}

function compactPreview(value?: string | null, maxLength = 260) {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

function mentionedCallerName(transcript?: string | null) {
  if (!transcript) return null;
  const callerText = transcript
    .split(/\n+/)
    .filter((line) => /^(caller|customer|cliente):/i.test(line.trim()))
    .map((line) => line.replace(/^(caller|customer|cliente):\s*/i, ""))
    .join(" ");
  const match = callerText.match(/\b(?:my name is|this is|i am|i'm|me llamo|soy)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ' -]{1,48})/i);
  const name = match?.[1]?.trim().replace(/[.,;:!?].*$/, "") ?? null;
  if (!name || /^(calling|looking|interested|trying|asking|from|about|de|para|por)\b/i.test(name)) return null;
  return name;
}

function summaryForCall(call: OwnerPortalData["calls"][number], summaries: OwnerPortalData["summaries"]) {
  return summaries.find((item) => item.call_session_id === call.id);
}

function callSummary(call: OwnerPortalData["calls"][number], summaries: OwnerPortalData["summaries"], labels: OwnerCopy) {
  const summary = summaryForCall(call, summaries);
  return summary?.display_summary || summary?.summary || call.outcome || labels.noAiObservations;
}

function callCallerName(call: OwnerPortalData["calls"][number], labels: OwnerCopy) {
  const name = call.customers?.full_name || mentionedCallerName(call.transcript);
  return name && name !== "Phone caller" ? name : labels.notCollected;
}

function callBusinessStatus(call: OwnerPortalData["calls"][number], labels: OwnerCopy) {
  const statuses: Record<string, string> = labels.callStatuses;
  if (call.jobs?.status === "confirmed") return statuses.booked;
  if (call.needs_owner_review || ["pending", "pending_owner_approval"].includes(call.jobs?.status ?? "")) return statuses.needs_approval;
  if (call.jobs?.status === "needs_reschedule") return statuses.needs_reschedule;
  if (call.jobs?.status === "needs_callback") return statuses.needs_callback;
  if (call.jobs?.status === "lead_not_confirmed") return statuses.not_confirmed;
  if (call.jobs?.status === "lead") return statuses.new_lead;
  if (call.status === "transferred") return statuses.needs_callback;
  if (!call.customer_id && !call.job_id) return statuses.incomplete;
  if (call.contact_type === "customer") return statuses.existing_customer;
  return statusLabel(labels, call.status);
}

function callOwnerAction(call: OwnerPortalData["calls"][number], labels: OwnerCopy) {
  const status = callBusinessStatus(call, labels);
  if (status === labels.callStatuses.needs_approval) return labels.callStatuses.needs_approval;
  if (status === labels.callStatuses.needs_reschedule) return labels.callStatuses.needs_reschedule;
  if (status === labels.callStatuses.not_confirmed) return labels.review;
  if (status === labels.callStatuses.new_lead) return labels.review;
  if (status === labels.callStatuses.incomplete || status === labels.callStatuses.needs_callback) return labels.callStatuses.needs_callback;
  return labels.notCollected;
}

function serviceFeeLabel(fee?: number | null) {
  const value = fee ?? 0;

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    style: "currency"
  }).format(value);
}

function formatMinutes(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 && value % 1 !== 0 ? 1 : 0,
    minimumFractionDigits: 0
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

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function callTimestamp(call: OwnerPortalData["calls"][number]) {
  const time = new Date(call.started_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function callDurationSeconds(call: OwnerPortalData["calls"][number], now = new Date()) {
  const startedAt = new Date(call.started_at);
  if (Number.isNaN(startedAt.getTime())) return 0;

  if (call.ended_at) {
    const endedAt = new Date(call.ended_at);
    if (!Number.isNaN(endedAt.getTime())) {
      return (endedAt.getTime() - startedAt.getTime()) / 1000;
    }
  }

  if (call.status === "active") {
    return (now.getTime() - startedAt.getTime()) / 1000;
  }

  return Number(call.qualified_business_seconds ?? 0);
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function monthStartFor(date: Date) {
  const value = startOfDay(date);
  value.setDate(1);
  return value;
}

function startOfMondayWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(value, mondayOffset);
}

function currentMonthWeekBounds() {
  const today = startOfDay(new Date());
  const monthStart = monthStartFor(today);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  return {
    currentWeekStart: startOfMondayWeek(today),
    firstWeekStart: startOfMondayWeek(monthStart),
    monthStart,
    nextMonthStart,
    today
  };
}

function monthlyCallActivity(calls: OwnerPortalData["calls"], language: Lang, weekStart: Date) {
  const { monthStart, nextMonthStart, today } = currentMonthWeekBounds();
  const weekEnd = addDays(weekStart, 7);
  const rangeStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
  const rangeEnd = new Date(Math.min(weekEnd.getTime(), nextMonthStart.getTime()));
  const daysToShow = Math.max(0, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS));

  return Array.from({ length: daysToShow }, (_, index) => {
    const date = addDays(rangeStart, index);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    const count = calls.filter((call) => {
      const startedAt = new Date(call.started_at);
      return !Number.isNaN(startedAt.getTime()) && startedAt >= date && startedAt < nextDate;
    }).length;

    return {
      active: date.getTime() === today.getTime(),
      count,
      dateLabel: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit" }).format(date),
      weekdayLabel: new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { weekday: "short" }).format(date)
    };
  });
}

function latestCall(calls: OwnerPortalData["calls"]) {
  return [...calls].sort((first, second) => callTimestamp(second) - callTimestamp(first))[0] ?? null;
}

function activeCall(calls: OwnerPortalData["calls"]) {
  return calls
    .filter((call) => call.status === "active")
    .sort((first, second) => callTimestamp(second) - callTimestamp(first))[0] ?? null;
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

function createdTime(job: OwnerPortalData["jobs"][number]) {
  const time = job.created_at ? new Date(job.created_at).getTime() : 0;
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

function CsrfField({ token }: { token: string }) {
  return <input name={CSRF_FIELD_NAME} type="hidden" value={token} />;
}

export function OwnerDashboard({
  csrfToken,
  data,
  initialLanguage = "es",
  initialTab = "home"
}: {
  csrfToken: string;
  data: OwnerPortalData;
  initialLanguage?: Lang;
  initialTab?: Tab;
}) {
  const activeTab = initialTab;
  const language = initialLanguage;
  const [toast, setToast] = useState<string | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [selectedCallWeekStart, setSelectedCallWeekStart] = useState(() => currentMonthWeekBounds().currentWeekStart);
  const [detailBooking, setDetailBooking] = useState<Job | null>(null);
  const [editBooking, setEditBooking] = useState<Job | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [clientNow, setClientNow] = useState<Date | null>(null);
  const callRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startDeleteTransition] = useTransition();
  const router = useRouter();
  const t = copy[language];

  const pendingQuote = useMemo(
    () => data.quotes.find((quote) => quote.status === "needs_owner_approval" || quote.status === "draft") ?? data.quotes[0],
    [data.quotes]
  );
  const scheduledBookings = useMemo(
    () => data.jobs.filter((job) => job.scheduled_start && ["confirmed", "in_progress", "completed"].includes(job.status)),
    [data.jobs]
  );
  const currentBookings = useMemo(() => scheduledBookings.filter((job) => !isPastBooking(job)).sort((a, b) => scheduledTime(a) - scheduledTime(b)), [scheduledBookings]);
  const pastBookings = useMemo(() => scheduledBookings.filter(isPastBooking).sort((a, b) => scheduledTime(b) - scheduledTime(a)), [scheduledBookings]);
  const leadBookings = useMemo(
    () =>
      data.jobs
        .filter((job) => ["lead", "pending", "pending_owner_approval", "needs_reschedule", "needs_callback", "lead_not_confirmed"].includes(job.status))
        .sort((a, b) => createdTime(b) - createdTime(a)),
    [data.jobs]
  );
  const todayJobs = useMemo(() => scheduledBookings.filter(isTodayJob), [scheduledBookings]);
  const callActivity = useMemo(() => monthlyCallActivity(data.calls, language, selectedCallWeekStart), [data.calls, language, selectedCallWeekStart]);
  const maxCallCount = Math.max(...callActivity.map((day) => day.count), 1);
  const callWeekBounds = useMemo(() => currentMonthWeekBounds(), []);
  const canGoToPreviousCallWeek = selectedCallWeekStart.getTime() > callWeekBounds.firstWeekStart.getTime();
  const canGoToNextCallWeek = selectedCallWeekStart.getTime() < callWeekBounds.currentWeekStart.getTime();
  const currentActiveCall = useMemo(() => activeCall(data.calls), [data.calls]);
  const mostRecentCall = useMemo(() => latestCall(data.calls), [data.calls]);
  const trackedCall = currentActiveCall ?? mostRecentCall;
  const durationNow = clientNow ?? new Date(data.generatedAt);
  const trackedCallDuration = trackedCall ? formatDuration(callDurationSeconds(trackedCall, durationNow)) : "00:00";

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const refreshCallData = useCallback(() => {
    if (callRefreshTimeoutRef.current) return;

    callRefreshTimeoutRef.current = setTimeout(() => {
      callRefreshTimeoutRef.current = null;
      router.refresh();
    }, 250);
  }, [router]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClientNow(new Date()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`owner-portal-live-${data.business.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `business_id=eq.${data.business.id}`,
          schema: "public",
          table: "call_sessions"
        },
        refreshCallData
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `business_id=eq.${data.business.id}`,
          schema: "public",
          table: "customers"
        },
        refreshCallData
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `business_id=eq.${data.business.id}`,
          schema: "public",
          table: "jobs"
        },
        refreshCallData
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `business_id=eq.${data.business.id}`,
          schema: "public",
          table: "ai_summaries"
        },
        refreshCallData
      )
      .subscribe();
    const intervalMs = currentActiveCall ? 5000 : activeTab === "home" ? 15000 : 20000;
    const intervalId = window.setInterval(refreshCallData, intervalMs);

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);

      if (callRefreshTimeoutRef.current) {
        clearTimeout(callRefreshTimeoutRef.current);
        callRefreshTimeoutRef.current = null;
      }
    };
  }, [activeTab, currentActiveCall, data.business.id, refreshCallData]);

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
        const result = await deleteOwnerBooking(booking.id, csrfToken);

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
    [csrfToken, router, showToast, t.bookingDeleted, t.confirmDeleteBooking]
  );

  const handleCustomerDeleted = useCallback(
    (customer: Customer) => {
      if (!window.confirm(t.confirmDeleteCustomer)) {
        return;
      }

      startDeleteTransition(async () => {
        const result = await deleteOwnerCustomer(customer.id, csrfToken);

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
    [csrfToken, router, showToast, t.confirmDeleteCustomer, t.customerDeleted]
  );

  return (
    <>
      {activeTab === "home" ? (
        <div className="grid">
          <div className="grid stats-grid">
            <Stat featured href={`/owner?lang=${language}&tab=bookings`} label={t.totalBookings} value={data.metrics.totalBookings} foot="" icon={<CalendarIcon />} />
            <Stat label={t.todayJobs} value={data.metrics.todayJobs} foot={t.today} icon={<LeafIcon />} />
            <Stat label={t.revenue} value={formatCurrency(data.metrics.revenue)} foot={t.currentData} icon={<DollarIcon />} />
            <Stat label={t.recovered} value={data.metrics.recoveredCalls} foot={t.aiOutcomes} icon={<MessageIcon />} />
          </div>
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
          <AiCallMinutesCard data={data} labels={t} />
          <div className="grid three-col">
            <section className="card span-2">
              <div className="analytics-card-header">
                <h2>{t.aiCallAnalytics}</h2>
                <div className="analytics-week-controls">
                  <button
                    aria-label={t.previousWeek}
                    disabled={!canGoToPreviousCallWeek}
                    onClick={() => setSelectedCallWeekStart((current) => addDays(current, -7))}
                    type="button"
                  >
                    <ChevronLeft strokeWidth={2.4} />
                  </button>
                  <button
                    aria-label={t.nextWeek}
                    disabled={!canGoToNextCallWeek}
                    onClick={() =>
                      setSelectedCallWeekStart((current) => {
                        const next = addDays(current, 7);
                        return next.getTime() > callWeekBounds.currentWeekStart.getTime() ? callWeekBounds.currentWeekStart : next;
                      })
                    }
                    type="button"
                  >
                    <ChevronRight strokeWidth={2.4} />
                  </button>
                </div>
              </div>
              <div className="bar-chart" aria-label={t.weeklyAiCallActivity}>
                {callActivity.map((day) => (
                  <div className="bar-column" key={`${day.weekdayLabel}-${day.dateLabel}`}>
                    <div
                      className={`bar ${day.count > 0 ? "has-calls" : ""} ${day.active ? "active" : ""}`.trim()}
                      title={`${day.weekdayLabel} ${day.dateLabel}: ${day.count} ${day.count === 1 ? t.call : t.calls}`}
                      style={{ height: `${day.count > 0 ? Math.max(18, (day.count / maxCallCount) * 100) : 8}%` }}
                    />
                    <span>{day.weekdayLabel}</span>
                    <small>{day.dateLabel}</small>
                    <strong>{day.count}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="card tracker-card">
              <h2>{t.anaVoiceAgent}</h2>
              <div className="timer">{trackedCallDuration}</div>
              <p>{trackedCall ? (currentActiveCall ? t.activeCall : t.lastCall) : t.noCallActivity}</p>
              {trackedCall ? (
                <div className="tracker-meta">
                  <span>{formatPhone(trackedCall.from_phone) ?? t.unknown}</span>
                  <span>{statusLabel(t, trackedCall.status)}</span>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "bookings" ? (
        <BookingsTab
          currentJobs={currentBookings}
          labels={t}
          leadJobs={leadBookings}
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
      {activeTab === "settings" ? <SettingsTab csrfToken={csrfToken} data={data} labels={t} onSaved={showToast} /> : null}
      {isBookingModalOpen ? (
        <AddBookingModal
          customers={data.customers}
          csrfToken={csrfToken}
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
          csrfToken={csrfToken}
          labels={t}
          onClose={() => setEditBooking(null)}
          onSuccess={handleBookingAdded}
        />
      ) : null}
      {isCustomerModalOpen ? (
        <AddCustomerModal csrfToken={csrfToken} labels={t} onClose={() => setIsCustomerModalOpen(false)} onSuccess={handleCustomerAdded} />
      ) : null}
      {detailCustomer ? (
        <CustomerDetailsModal
          customer={detailCustomer}
          labels={t}
          leads={leadBookings.filter((job) => job.customer_id === detailCustomer.id)}
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
          csrfToken={csrfToken}
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
  href,
  featured = false
}: {
  label: string;
  value: string | number;
  foot?: string;
  icon: React.ReactNode;
  href?: string;
  featured?: boolean;
}) {
  const content = (
    <article className={`card metric-card ${featured ? "featured" : ""}`}>
      <div className="icon-stat">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
        {icon}
      </div>
      {foot ? <div className="stat-foot">{foot}</div> : null}
    </article>
  );

  if (href) {
    return (
      <Link className="metric-card-link" href={href}>
        {content}
      </Link>
    );
  }

  return content;
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
            <article className="row-card reminder-row" key={reminder.id}>
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

function AiCallMinutesCard({ data, labels }: { data: OwnerPortalData; labels: OwnerCopy }) {
  const usage = data.aiCallUsage;
  const overageRateText =
    usage.overageRatePerMinute !== null ? `${formatCurrency(usage.overageRatePerMinute)}/min` : labels.noOverageBilling;

  return (
    <section className="card call-minutes-card">
      <div className="section-card-header">
        <div>
          <h2>{labels.aiCallMinutes}</h2>
          <p className="meta">{labels.aiCallMinutesSubtitle}</p>
        </div>
        <strong className="customer-count-badge">{usage.monthLabel}</strong>
      </div>
      <div className="usage-meter large" aria-label={`${usage.usagePercent.toFixed(0)} percent used`}>
        <span style={{ width: `${usage.usagePercent}%` }} />
      </div>
      <div className="grid three-col">
        <article className="row-card">
          <strong>{labels.plan}</strong>
          <div className="meta">
            {usage.planName} · {formatMinutes(usage.allowanceMinutes)} {labels.includedMinutes.toLowerCase()} · {labels.overageStartsAfter.toLowerCase()}{" "}
            {formatMinutes(usage.overageStartsAtMinutes)} min
          </div>
        </article>
        <article className="row-card">
          <strong>{labels.usedMinutes}</strong>
          <div className="meta">{formatMinutes(usage.usedMinutes)} min</div>
        </article>
        <article className="row-card">
          <strong>{labels.remainingMinutes}</strong>
          <div className="meta">{formatMinutes(usage.remainingMinutes)} min</div>
        </article>
        <article className="row-card">
          <strong>{labels.extraMinutes}</strong>
          <div className="meta">{formatMinutes(usage.overageMinutes)} min</div>
        </article>
        <article className="row-card">
          <strong>{labels.overageCharge}</strong>
          <div className="meta">{formatCurrency(usage.overageAmount)} · {overageRateText}</div>
        </article>
      </div>
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
          <div className="meta">{formatPhone(customerFacingNumber) ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.anaRoutingNumber}</strong>
          <div className="meta">{formatPhone(business.twilio_routing_phone) ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.ownerPrivateNumber}</strong>
          <div className="meta">{formatPhone(business.owner_transfer_phone ?? data.user.phone) ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.publicBusinessNumber}</strong>
          <div className="meta">{formatPhone(business.phone) ?? labels.notSet}</div>
        </article>
        <article className="row-card">
          <strong>{labels.existingNumberType}</strong>
          <div className="meta">{existingNumberKindLabel(labels, business.existing_number_kind)}</div>
        </article>
        <article className="row-card">
          <strong>{labels.portingStatus}</strong>
          <div className="meta">{portingStatusLabel(labels, business.porting_status)}</div>
        </article>
        <article className="row-card">
          <strong>{labels.summaryLanguage}</strong>
          <div className="meta">{ownerSummaryLanguageLabel(labels, business.owner_summary_language)}</div>
        </article>
        <article className="row-card">
          <strong>{labels.summaryMethod}</strong>
          <div className="meta">{ownerSummaryChannelLabel(labels, business.owner_summary_channel)}</div>
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

function SettingsSaveButton({ label, savingLabel }: { label: string; savingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? savingLabel : label}
    </button>
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

function ServicesDropdown({ initialServices, labels }: { initialServices: ServiceOption[]; labels: OwnerCopy }) {
  const [selectedServices, setSelectedServices] = useState<ServiceOption[]>(initialServices);
  const detailsRef = useCloseDetailsOnOutside();
  const selectedText = selectedServices.map((service) => serviceLabel(labels, service)).join(", ");

  const toggleService = (service: ServiceOption) => {
    setSelectedServices((current) => {
      if (current.includes(service)) {
        return current.length === 1 ? current : current.filter((selected) => selected !== service);
      }

      return [...current, service];
    });
  };

  return (
    <div className="service-dropdown">
      <details ref={detailsRef}>
        <summary title={selectedText}>
          <span>{selectedText}</span>
        </summary>
        <div className="service-dropdown-menu">
          {serviceOptions.map((service: ServiceOption) => {
            const checked = selectedServices.includes(service);

            return (
              <label className="service-dropdown-option" key={service}>
                <input
                  checked={checked}
                  name="availableServices"
                  onChange={() => toggleService(service)}
                  type="checkbox"
                  value={service}
                />
                <span>{serviceLabel(labels, service)}</span>
              </label>
            );
          })}
        </div>
      </details>
      <small className="field-help">{labels.availableServicesHelp}</small>
    </div>
  );
}

function BusinessHoursDropdowns({ initialText, labels }: { initialText?: string | null; labels: OwnerCopy }) {
  const parsedHours = parseBusinessHours(initialText);
  const detailsRef = useCloseDetailsOnOutside();
  const [selectedDays, setSelectedDays] = useState<BusinessDay[]>(parsedHours.days);
  const [startTime, setStartTime] = useState(parsedHours.startTime);
  const [endTime, setEndTime] = useState(parsedHours.endTime);
  const selectedDayText = selectedDays.map((day) => businessDayOptions.find((option) => option.value === day)?.shortLabel).filter(Boolean).join(", ");

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
      <input name="businessHoursText" type="hidden" value={businessHoursText(selectedDays, startTime, endTime)} />
      <div className="field">
        <span>{labels.businessDays}</span>
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
        <span>{labels.businessStartTime}</span>
        <select onChange={(event) => setStartTime(event.target.value)} value={startTime}>
          {businessTimeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{labels.businessEndTime}</span>
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

function AvailabilityExceptionsForm({
  csrfToken,
  exceptions,
  labels,
  onSaved
}: {
  csrfToken: string;
  exceptions: OwnerPortalData["availabilityExceptions"];
  labels: OwnerCopy;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<OwnerClosureState, FormData>(addOwnerAvailabilityException, {});
  const [isDeleting, startDeleteTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      onSaved(state.success || labels.closedDatesSaved);
      router.refresh();
    }
  }, [labels.closedDatesSaved, onSaved, router, state.success]);

  const handleDelete = useCallback(
    (exceptionId: string) => {
      if (!window.confirm(labels.confirmDeleteClosure)) return;

      startDeleteTransition(async () => {
        const result = await deleteOwnerAvailabilityException(exceptionId, csrfToken);
        if (result.error) {
          onSaved(result.error);
          return;
        }

        onSaved(result.success || labels.closureDeleted);
        router.refresh();
      });
    },
    [csrfToken, labels.closureDeleted, labels.confirmDeleteClosure, onSaved, router]
  );

  return (
    <section className="card owner-settings-card availability-card">
      <div className="section-card-header">
        <div>
          <h2>{labels.availabilitySettings}</h2>
          <p className="meta">{labels.availabilitySettingsSubtitle}</p>
        </div>
      </div>
      <form action={formAction} className="availability-closure-form">
        <CsrfField token={csrfToken} />
        <label className="field">
          <span>{labels.closureReason}</span>
          <input defaultValue="Vacation" maxLength={80} name="title" required />
        </label>
        <label className="field">
          <span>{labels.closureStartDate}</span>
          <input name="startsOn" required type="date" />
        </label>
        <label className="field">
          <span>{labels.closureEndDate}</span>
          <input name="endsOn" required type="date" />
        </label>
        <label className="field full">
          <span>{labels.closureMessage}</span>
          <input
            maxLength={180}
            name="message"
            placeholder="We are unavailable that day and can schedule another date."
          />
        </label>
        {state.error ? <p className="form-error full">{state.error}</p> : null}
        {state.success ? <p className="form-success full">{state.success}</p> : null}
        <div className="toolbar full">
          <SettingsSaveButton label={labels.addClosure} savingLabel={labels.saving} />
        </div>
      </form>
      <div className="availability-list">
        <h3>{labels.upcomingClosures}</h3>
        {exceptions.length ? (
          <div className="closure-list">
            {exceptions.map((exception) => (
              <div className="closure-row" key={exception.id}>
                <div>
                  <strong>{exception.title}</strong>
                  <span>{formatClosureRange(exception.starts_on, exception.ends_on)}</span>
                  {exception.message ? <p>{exception.message}</p> : null}
                </div>
                <button
                  className="icon-action-button danger"
                  disabled={isDeleting}
                  onClick={() => handleDelete(exception.id)}
                  title={labels.removeClosure}
                  type="button"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">{labels.noClosures}</p>
        )}
      </div>
    </section>
  );
}

function SummarySettingsForm({
  business,
  csrfToken,
  labels,
  onSaved
}: {
  business: OwnerPortalData["business"];
  csrfToken: string;
  labels: OwnerCopy;
  onSaved: (message: string) => void;
}) {
  const [state, formAction] = useActionState<OwnerSettingsState, FormData>(updateOwnerSettings, {});
  const selectedServices = businessServices(business);

  useEffect(() => {
    if (state.success) {
      onSaved(state.success || labels.settingsSaved);
    }
  }, [labels.settingsSaved, onSaved, state.success]);

  return (
    <section className="card owner-settings-card">
      <div className="section-card-header">
        <div>
          <h2>{labels.ownerSummarySettings}</h2>
          <p className="meta">{labels.ownerSummarySettingsSubtitle}</p>
        </div>
      </div>
      <form action={formAction}>
        <CsrfField token={csrfToken} />
        <div className="form-grid">
          <label className="field">
            <span>{labels.summaryLanguage}</span>
            <select defaultValue={business.owner_summary_language ?? "en"} name="ownerSummaryLanguage">
              <option value="en">{labels.english}</option>
              <option value="es">{labels.spanish}</option>
            </select>
          </label>
          <label className="field">
            <span>{labels.summaryMethod}</span>
            <select defaultValue={business.owner_summary_channel ?? "sms"} name="ownerSummaryChannel">
              <option value="sms">{labels.summaryMethodSms}</option>
              <option value="email">{labels.summaryMethodEmail}</option>
            </select>
          </label>
          <label className="field">
            <span>{labels.bookingTimeZone}</span>
            <select defaultValue={business.booking_time_zone ?? "America/Chicago"} name="bookingTimeZone">
              {timeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </label>
          <div className="field full compact-field">
            <BusinessHoursDropdowns initialText={business.business_hours_text} labels={labels} />
          </div>
          <div className="field full">
            <span>{labels.availableServices}</span>
            <ServicesDropdown initialServices={selectedServices} labels={labels} />
          </div>
          <fieldset className="field full">
            <legend>{labels.minuteLimitBehavior}</legend>
            <div className="list">
              {[
                {
                  description: labels.continueOverageDescription,
                  label: labels.continueOverage,
                  value: "continue_overage"
                },
                {
                  description: labels.takeVoicemailDescription,
                  label: labels.takeVoicemail,
                  value: "voicemail"
                },
                {
                  description: labels.forwardAtLimitDescription,
                  label: labels.forwardAtLimit,
                  value: "forward_owner"
                }
              ].map((option) => (
                <label className="row-card checkbox-field" key={option.value}>
                  <input
                    defaultChecked={(business.minute_limit_policy ?? "continue_overage") === option.value}
                    name="minuteLimitPolicy"
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
        </div>
        {state.error ? <p className="form-error" style={{ marginTop: 16 }}>{state.error}</p> : null}
        {state.success ? <p className="form-success" style={{ marginTop: 16 }}>{state.success}</p> : null}
        <div className="toolbar" style={{ marginTop: 16 }}>
          <SettingsSaveButton label={labels.saveSettings} savingLabel={labels.saving} />
        </div>
      </form>
    </section>
  );
}

function ServiceAreaSettingsForm({
  csrfToken,
  data,
  labels,
  onSaved
}: {
  csrfToken: string;
  data: OwnerPortalData;
  labels: OwnerCopy;
  onSaved: (message: string) => void;
}) {
  const [state, formAction] = useActionState<OwnerServiceAreaState, FormData>(updateOwnerServiceArea, {});
  const business = data.business;
  const radiusRule = data.radiusRule;

  useEffect(() => {
    if (state.success) {
      onSaved(state.success || labels.serviceAreaSaved);
    }
  }, [labels.serviceAreaSaved, onSaved, state.success]);

  return (
    <section className="card owner-settings-card service-area-card">
      <div className="section-card-header">
        <div>
          <h2>{labels.serviceAreaSettings}</h2>
          <p className="meta">{labels.serviceAreaSettingsSubtitle}</p>
        </div>
      </div>
      <form action={formAction}>
        <CsrfField token={csrfToken} />
        <div className="service-area-fields">
          <AddressLookupInput
            className="full"
            defaultValue={business.base_address}
            emptyLabel={labels.addressLookupEmpty}
            label={labels.companyAddress}
            name="baseAddress"
            placeholder="123 Main St, Austin, TX"
            required
          />
          <div className="service-area-row">
            <label className="field service-radius-field">
              <span>{labels.serviceRadiusMiles}</span>
              <input defaultValue={radiusRule?.radius_miles ?? 30} min="1" max="250" name="radiusMiles" required type="number" />
            </label>
            <label className="field">
              <span>{labels.outsideRadiusPolicy}</span>
              <select defaultValue={radiusRule?.allow_outside_radius ? "true" : "false"} name="allowOutsideRadius">
                <option value="false">{labels.declineOutsideRadius}</option>
                <option value="true">{labels.allowOutsideRadius}</option>
              </select>
            </label>
          </div>
        </div>
        {state.error ? <p className="form-error" style={{ marginTop: 16 }}>{state.error}</p> : null}
        {state.success ? <p className="form-success" style={{ marginTop: 16 }}>{state.success}</p> : null}
        <div className="toolbar" style={{ marginTop: 16 }}>
          <SettingsSaveButton label={labels.saveSettings} savingLabel={labels.saving} />
        </div>
      </form>
    </section>
  );
}

function SettingsTab({ csrfToken, data, labels, onSaved }: { csrfToken: string; data: OwnerPortalData; labels: OwnerCopy; onSaved: (message: string) => void }) {
  return (
    <div className="grid">
      <AvailabilityExceptionsForm csrfToken={csrfToken} exceptions={data.availabilityExceptions} labels={labels} onSaved={onSaved} />
      <ServiceAreaSettingsForm csrfToken={csrfToken} data={data} labels={labels} onSaved={onSaved} />
      <SummarySettingsForm business={data.business} csrfToken={csrfToken} labels={labels} onSaved={onSaved} />
      <PhoneSetupCard data={data} labels={labels} />
    </div>
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
  leadJobs,
  onAddBooking,
  onDeleteBooking,
  onEditBooking,
  onOpenBooking,
  pastJobs
}: {
  currentJobs: OwnerPortalData["jobs"];
  labels: OwnerCopy;
  leadJobs: OwnerPortalData["jobs"];
  onAddBooking: () => void;
  onDeleteBooking: (booking: Job) => void;
  onEditBooking: (booking: Job) => void;
  onOpenBooking: (booking: Job) => void;
  pastJobs: OwnerPortalData["jobs"];
}) {
  const [bookingView, setBookingView] = useState<BookingView>("current");
  const [searchQuery, setSearchQuery] = useState("");
  const visibleJobs = bookingView === "current" ? currentJobs : bookingView === "leads" ? leadJobs : pastJobs;
  const filteredJobs = useMemo(
    () => visibleJobs.filter((job) => matchesSearch(searchQuery, job.customers?.full_name, job.address, job.customers?.address)),
    [searchQuery, visibleJobs]
  );
  const activeBookingLabel = bookingView === "current" ? labels.currentBookings : bookingView === "leads" ? labels.leadBookings : labels.pastBooking;
  const subtitle = bookingView === "current" ? labels.addBookingSubtitle : bookingView === "leads" ? labels.leadBookingsSubtitle : labels.pastBookingSubtitle;
  const emptyLabel = bookingView === "leads" ? labels.noLeads : labels.noJobs;
  const noMatchingLabel = bookingView === "leads" ? labels.noMatchingLeads : labels.noMatchingBookings;

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
            <button className={bookingView === "leads" ? "active" : ""} onClick={() => setBookingView("leads")} type="button">
              {labels.leadBookings}
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
        <table className="customer-table owner-directory-table">
          <thead>
            <tr>
              <th>{labels.job}</th>
              <th>{labels.customer}</th>
              <th>{bookingView === "leads" ? labels.status : labels.schedule}</th>
              <th>{labels.address}</th>
              <th>{labels.value}</th>
              <th className="action-column">{labels.actions}</th>
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
                  <td>{bookingView === "leads" ? statusLabel(labels, job.status) : formatDateTime(job.scheduled_start)}</td>
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
                  <div className="empty-state">{visibleJobs.length ? noMatchingLabel : emptyLabel}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mobile-directory-list">
        {filteredJobs.length ? (
          filteredJobs.map((job) => (
            <article className="mobile-directory-card" key={job.id}>
              <div className="mobile-directory-card-header">
                <div>
                  <strong>{bookingTitleLabel(labels, job)}</strong>
                  <span>{customerName(job.customers, labels.newCustomer)}</span>
                </div>
                <span className="mobile-directory-value">{formatCurrency(job.final_value ?? job.estimated_value)}</span>
              </div>
              <dl className="mobile-directory-details">
                <div>
                  <dt>{bookingView === "leads" ? labels.status : labels.schedule}</dt>
                  <dd>{bookingView === "leads" ? statusLabel(labels, job.status) : formatDateTime(job.scheduled_start)}</dd>
                </div>
                <div>
                  <dt>{labels.address}</dt>
                  <dd>{job.address ?? labels.noAddress}</dd>
                </div>
              </dl>
              <div className="mobile-row-actions">
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
            </article>
          ))
        ) : (
          <div className="empty-state">{visibleJobs.length ? noMatchingLabel : emptyLabel}</div>
        )}
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
        <table className="customer-table owner-directory-table customer-list-table">
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
              <th>{labels.service}</th>
              <th>{labels.serviceFee}</th>
              <th>{labels.address}</th>
              <th className="action-column">{labels.actions}</th>
            </tr>
          </thead>
          <tbody>
            {sortedCustomers.length ? (
              sortedCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <span className="customer-name">{customer.full_name}</span>
                  </td>
                  <td>{formatPhone(customer.phone) ?? labels.missing}</td>
                  <td>{serviceLabel(labels, customerServices[customer.id])}</td>
                  <td>{serviceFeeLabel(customer.service_fee)}</td>
                  <td>
                    <span className="customer-address-cell">{customer.address ?? labels.noAddress}</span>
                  </td>
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
                <td colSpan={6}>
                  <div className="empty-state">{customers.length ? labels.noMatchingCustomers : labels.noCustomers}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mobile-directory-list">
        {sortedCustomers.length ? (
          sortedCustomers.map((customer) => (
            <article className="mobile-directory-card" key={customer.id}>
              <div className="mobile-directory-card-header">
                <div>
                  <strong>{customer.full_name}</strong>
                  <span>{formatPhone(customer.phone) ?? labels.missing}</span>
                </div>
                <span className="mobile-directory-value">{serviceFeeLabel(customer.service_fee)}</span>
              </div>
              <dl className="mobile-directory-details">
                <div>
                  <dt>{labels.service}</dt>
                  <dd>{serviceLabel(labels, customerServices[customer.id])}</dd>
                </div>
                <div>
                  <dt>{labels.address}</dt>
                  <dd>{customer.address ?? labels.noAddress}</dd>
                </div>
              </dl>
              <div className="mobile-row-actions">
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
            </article>
          ))
        ) : (
          <div className="empty-state">{customers.length ? labels.noMatchingCustomers : labels.noCustomers}</div>
        )}
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
  const recentSummaries = data.summaries.slice(0, 8);

  return (
    <div className="grid two-col">
      <section className="card span-2">
        <div className="section-card-header">
          <div>
            <h2>{labels.anaCallLog}</h2>
            <p className="meta">{labels.anaCallLogSubtitle}</p>
          </div>
        </div>
        <div className="call-log-list">
          {data.calls.length ? (
            data.calls.map((call) => {
              const summaryRecord = summaryForCall(call, data.summaries);
              const summary = callSummary(call, data.summaries, labels);
              const mentionedName = mentionedCallerName(call.transcript);
              const service = call.jobs?.service_type ? serviceLabel(labels, call.jobs.service_type) : labels.notCollected;
              const requestedTime = call.jobs?.scheduled_start ? formatDateTime(call.jobs.scheduled_start) : labels.notCollected;
              const address = call.jobs?.address || labels.notCollected;
              const ownerAction = summaryRecord?.display_action_needed ?? summaryRecord?.action_needed ?? callOwnerAction(call, labels);

              return (
                <article className="call-log-card" key={call.id}>
                  <div className="call-log-card-header">
                    <div>
                      <strong>{callCallerName(call, labels)}</strong>
                      <span>{formatDateTime(call.started_at)}</span>
                    </div>
                    <span className="pill info">{callBusinessStatus(call, labels)}</span>
                  </div>
                  <div className="call-meta-grid">
                    <div>
                      <span>{labels.phoneNumber}</span>
                      <strong>{formatPhone(call.from_phone ?? call.customers?.phone) ?? labels.notCollected}</strong>
                    </div>
                    <div>
                      <span>{labels.caller}</span>
                      <strong>{callCallerName(call, labels)}</strong>
                    </div>
                    <div>
                      <span>{labels.serviceRequested}</span>
                      <strong>{service}</strong>
                    </div>
                    <div>
                      <span>{labels.requestedTime}</span>
                      <strong>{requestedTime}</strong>
                    </div>
                    <div>
                      <span>{labels.address}</span>
                      <strong>{address}</strong>
                    </div>
                    <div>
                      <span>{labels.ownerAction}</span>
                      <strong>{ownerAction}</strong>
                    </div>
                    {mentionedName && !call.customers?.full_name ? (
                      <div>
                        <span>{labels.mentionedName}</span>
                        <strong>{mentionedName}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="call-summary-panel">
                    <span>{labels.callSummary}</span>
                    <p>{compactPreview(summary, 420)}</p>
                    {call.voicemail_recording_url ? (
                      <audio controls preload="none" src={`/api/owner/voicemail/${call.id}`}>
                        <a href={`/api/owner/voicemail/${call.id}`}>{labels.playVoicemail}</a>
                      </audio>
                    ) : null}
                    {summaryRecord?.display_translation_pending ? <small className="meta">{labels.translationPending}</small> : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{labels.noCalls}</div>
          )}
        </div>
      </section>
      <section className="card">
        <h2>{labels.latestMessages}</h2>
        <div className="list">
          {data.messages.map((message) => (
            <article className="row-card" key={message.id}>
              <strong>
                {message.direction} - {message.channel} - {customerName(message.customers, labels.newCustomer)}
              </strong>
              <div className="meta">
                {formatPhone(message.from_phone) ? `${formatPhone(message.from_phone)} - ` : ""}
                {message.body}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>{labels.aiSummaries}</h2>
        <div className="list">
          {recentSummaries.map((summary) => (
            <article className="row-card" key={summary.id}>
              <strong>{summary.display_action_needed ?? summary.action_needed ?? customerName(summary.customers, labels.summary)}</strong>
              <div className="meta">{summary.display_summary ?? summary.summary}</div>
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
  leads,
  onClose,
  onEdit,
  service
}: {
  customer: Customer;
  labels: OwnerCopy;
  leads: Job[];
  onClose: () => void;
  onEdit: () => void;
  service?: string;
}) {
  const latestLead = leads[0] ?? null;
  const details = [
    { label: labels.fullName, value: customer.full_name },
    { label: labels.phone, value: formatPhone(customer.phone) ?? labels.missing },
    { label: labels.email, value: customer.email ?? labels.missing },
    { label: labels.joinedOn, value: formatDate(customer.created_at, labels.notSet) },
    { label: labels.service, value: serviceLabel(labels, service) },
    { label: labels.recurringService, value: recurringServiceLabel(labels, customer) },
    { label: labels.serviceFee, value: serviceFeeLabel(customer.service_fee) },
    { label: labels.preferredLanguage, value: languageLabel(labels, customer.preferred_language) },
    { label: labels.source, value: sourceLabel(labels, customer.referral_source) },
    ...(latestLead
      ? [{ highlight: true, label: labels.status, value: statusLabel(labels, latestLead.status) }]
      : []),
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
            <div className={`${item.full ? "full" : ""} ${item.highlight ? "highlight" : ""}`.trim()} key={item.label}>
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
  csrfToken,
  labels,
  onClose,
  onSuccess
}: {
  csrfToken: string;
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
          <CsrfField token={csrfToken} />
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
          <AddressLookupInput emptyLabel={labels.addressLookupEmpty} label={labels.address} name="address" />
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
  csrfToken,
  labels,
  onClose,
  onSuccess
}: {
  customers: OwnerPortalData["customers"];
  csrfToken: string;
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
          <CsrfField token={csrfToken} />
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
          <AddressLookupInput className="full" emptyLabel={labels.addressLookupEmpty} label={labels.bookingAddress} name="address" />
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
    { label: labels.status, value: statusLabel(labels, booking.status) },
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
  csrfToken,
  labels,
  onClose,
  onSuccess
}: {
  booking: Job;
  customers: OwnerPortalData["customers"];
  csrfToken: string;
  labels: OwnerCopy;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const initialState: AddBookingState = {};
  const [state, formAction] = useActionState(updateOwnerBooking, initialState);
  const selectedCustomer = customers.some((customer) => customer.id === booking.customer_id) ? (booking.customer_id ?? "") : "";
  const selectedService = serviceOptions.includes(booking.service_type as ServiceOption) ? (booking.service_type as ServiceOption) : "landscaping";
  const initialBookingStatus = booking.status === "confirmed" ? "confirmed" : "lead";
  const [bookingStatus, setBookingStatus] = useState(initialBookingStatus);

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
          <CsrfField token={csrfToken} />
          <input name="bookingId" type="hidden" value={booking.id} />
          <label className="field">
            <span>{labels.status}</span>
            <select name="bookingStatus" onChange={(event) => setBookingStatus(event.target.value as "lead" | "confirmed")} value={bookingStatus}>
              <option value="lead">{statusLabel(labels, "lead")}</option>
              <option value="confirmed">{labels.customer}</option>
            </select>
          </label>
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
            <input defaultValue={toDateTimeLocalValue(booking.scheduled_start)} name="scheduledStart" required={bookingStatus === "confirmed"} type="datetime-local" />
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
          <AddressLookupInput
            className="full"
            defaultValue={booking.address}
            emptyLabel={labels.addressLookupEmpty}
            label={labels.bookingAddress}
            name="address"
          />
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
  csrfToken,
  labels,
  onClose,
  onSuccess,
  service
}: {
  customer: Customer;
  csrfToken: string;
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
          <CsrfField token={csrfToken} />
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
          <AddressLookupInput defaultValue={customer.address} emptyLabel={labels.addressLookupEmpty} label={labels.address} name="address" />
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
