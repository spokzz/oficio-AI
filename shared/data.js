export const palette = {
  deepGreen: "#173F35",
  actionGreen: "#2F7A55",
  warmGold: "#F6C85F",
  cream: "#F7F5EF",
  charcoal: "#1E2420",
  muted: "#6B6256",
  infoBlue: "#3D6F91",
  alertRed: "#B84A3A"
};

export const pricingPlan = {
  name: "Growth",
  monthlyPrice: 149,
  onboardingFee: 199,
  includedVoiceMinutes: 200,
  includedSms: 500,
  voiceOverageRate: 0.6,
  smsOverageRate: 0.04,
  extraNumberMonthly: 10
};

export const translations = {
  es: {
    greeting: "Buenas tardes, Miguel",
    subtitle: "Tu recepcionista AI está tomando llamadas y mensajes.",
    newBooking: "Nueva reserva",
    totalBookings: "Reservas",
    todayJobs: "Trabajos hoy",
    revenue: "Ingresos",
    recoveredCalls: "Llamadas recuperadas",
    agenda: "Agenda de hoy",
    quoteApproval: "Cotización para aprobar",
    messages: "Mensajes del AI",
    settings: "Ajustes del negocio",
    approve: "Aprobar",
    editPrice: "Editar precio",
    askPhotos: "Pedir fotos",
    navHome: "Inicio",
    navBookings: "Reservas",
    navCalendar: "Calendario",
    navCustomers: "Clientes",
    navGrowth: "Crecimiento",
    navSettings: "Ajustes",
    monthUp: "+12% este mes",
    pendingCount: "2 pendientes",
    currentMonth: "Mes actual",
    recoveredJobs: "Trabajos que no se perdieron",
    suggestedPrice: "Precio sugerido",
    range: "Rango",
    currentUsage: "Uso actual",
    aiMinutes: "minutos AI",
    estimatedMargin: "Margen estimado para este cliente",
    referralFunnel: "Embudo de referidos",
    referralCopy: "El AI detecta clientes felices y prepara mensajes para pedir referidos sin sonar agresivo.",
    prepareMessage: "Preparar mensaje",
    bookings: "Reservas",
    time: "Hora",
    customer: "Cliente",
    service: "Servicio",
    address: "Dirección",
    status: "Estado",
    value: "Valor",
    pending: "Pendiente",
    view: "Ver",
    calendar: "Calendario",
    monday: "Lunes",
    tuesday: "Martes",
    wednesday: "Miércoles",
    open: "Libre",
    noJob: "Sin trabajo",
    capacityAvailable: "Capacidad disponible",
    customers: "Clientes",
    services: "Servicios",
    language: "Idioma",
    source: "Fuente",
    automation: "Automación",
    referralReady: "Referido listo",
    normal: "Normal",
    growthAutomations: "Growth Automations",
    reviewFirst: "Reseña primero",
    reviewFirstCopy: "Enviar reseña 24 horas después de completar el trabajo.",
    referralAfter: "Referido después de 3-4 servicios",
    referralAfterCopy: "Pedir referido solo a clientes repetidos o felices.",
    winBack: "Recuperar después de 90 días",
    winBackCopy: "Enviar mensaje si el cliente no reserva en 90 días.",
    readyMessage: "Mensaje listo",
    sendToMaria: "Enviar a Maria",
    businessName: "Nombre del negocio",
    baseAddress: "Dirección base",
    serviceRadius: "Radio de servicio",
    phoneMode: "Modo de teléfono",
    aiRules: "Reglas del AI",
    aiRulesValue: "Responder en el idioma del cliente. Mandar resumen al dueño en español. Pedir fotos para cotizaciones grandes. No enviar cotización final sin aprobación.",
    saveSettings: "Guardar ajustes",
    newBookingToast: "Nueva reserva manual lista para crear.",
    approveQuoteToast: "Cotización aprobada. El AI enviará el precio al cliente.",
    editPriceToast: "Abrimos edición de precio. En producción será un modal.",
    askPhotosToast: "El AI pedirá más fotos por SMS.",
    referralPreparedToast: "Mensaje de referido preparado para revisión.",
    referralSentToast: "Mensaje enviado al cliente.",
    settingsSavedToast: "Ajustes guardados.",
    bookingViewedToast: "Detalle de reserva abierto.",
    ownerSummaryFallback: "Nuevo cliente referido por Maria Lopez. Habló en hindi. Quiere limpieza de patio. Está dentro del radio de servicio. Patio mediano y crecido. Precio sugerido: $280-$350."
  },
  en: {
    greeting: "Good afternoon, Miguel",
    subtitle: "Your AI receptionist is handling calls and messages.",
    newBooking: "New booking",
    totalBookings: "Bookings",
    todayJobs: "Jobs today",
    revenue: "Revenue",
    recoveredCalls: "Recovered calls",
    agenda: "Today's agenda",
    quoteApproval: "Quote to approve",
    messages: "AI messages",
    settings: "Business settings",
    approve: "Approve",
    editPrice: "Edit price",
    askPhotos: "Ask for photos",
    navHome: "Home",
    navBookings: "Bookings",
    navCalendar: "Calendar",
    navCustomers: "Customers",
    navGrowth: "Growth",
    navSettings: "Settings",
    monthUp: "+12% this month",
    pendingCount: "2 pending",
    currentMonth: "Current month",
    recoveredJobs: "Jobs that were not missed",
    suggestedPrice: "Suggested price",
    range: "Range",
    currentUsage: "Current usage",
    aiMinutes: "AI minutes",
    estimatedMargin: "Estimated margin for this customer",
    referralFunnel: "Referral funnel",
    referralCopy: "The AI detects happy customers and prepares referral messages without sounding pushy.",
    prepareMessage: "Prepare message",
    bookings: "Bookings",
    time: "Time",
    customer: "Customer",
    service: "Service",
    address: "Address",
    status: "Status",
    value: "Value",
    pending: "Pending",
    view: "View",
    calendar: "Calendar",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    open: "Open",
    noJob: "No job",
    capacityAvailable: "Capacity available",
    customers: "Customers",
    services: "Services",
    language: "Language",
    source: "Source",
    automation: "Automation",
    referralReady: "Referral ready",
    normal: "Normal",
    growthAutomations: "Growth Automations",
    reviewFirst: "Review first",
    reviewFirstCopy: "Send the review request 24 hours after the job is completed.",
    referralAfter: "Referral after 3-4 services",
    referralAfterCopy: "Ask only repeat or happy customers for referrals.",
    winBack: "Win back after 90 days",
    winBackCopy: "Send a message if the customer has not booked again in 90 days.",
    readyMessage: "Message ready",
    sendToMaria: "Send to Maria",
    businessName: "Business name",
    baseAddress: "Base address",
    serviceRadius: "Service radius",
    phoneMode: "Phone mode",
    aiRules: "AI rules",
    aiRulesValue: "Reply in the customer's language. Send the owner a Spanish summary. Ask for photos for larger quotes. Do not send a final quote without approval.",
    saveSettings: "Save settings",
    newBookingToast: "Manual booking form ready to create.",
    approveQuoteToast: "Quote approved. The AI will send the price to the customer.",
    editPriceToast: "Opening price editor. In production this will be a modal.",
    askPhotosToast: "The AI will ask for more photos by SMS.",
    referralPreparedToast: "Referral message prepared for review.",
    referralSentToast: "Message sent to the customer.",
    settingsSavedToast: "Settings saved.",
    bookingViewedToast: "Booking detail opened.",
    ownerSummaryFallback: "New customer referred by Maria Lopez. They spoke Hindi and need yard cleanup. The address is inside the service radius. Medium overgrown yard. Suggested price: $280-$350."
  }
};

export const ownerBusiness = {
  id: "biz_green_valley",
  ownerName: "Miguel Hernandez",
  businessName: "Green Valley Landscaping",
  baseAddress: "2148 W Cermak Rd, Chicago, IL",
  serviceRadiusMiles: 30,
  language: "es",
  phoneMode: "Call forwarding",
  aiVoiceName: "Ana",
  plan: "Growth"
};

export const metrics = {
  totalBookings: 42,
  todayJobs: 7,
  revenue: 8420,
  recoveredCalls: 18,
  quoteWinRate: 64,
  repeatCustomers: 23
};

export const jobs = [
  {
    id: "job_101",
    time: "10:00 AM",
    customer: "Maria Lopez",
    service: "Patio cleanup",
    serviceEs: "Limpieza de patio",
    address: "842 Oak Street",
    status: "confirmed",
    value: 240
  },
  {
    id: "job_102",
    time: "1:30 PM",
    customer: "Robert Smith",
    service: "Mulch estimate",
    serviceEs: "Estimado para mulch",
    address: "22 Maple Drive",
    status: "pending",
    value: 0
  },
  {
    id: "job_103",
    time: "3:00 PM",
    customer: "James Wilson",
    service: "Lawn mowing",
    serviceEs: "Corte de césped",
    address: "110 Pine Avenue",
    status: "confirmed",
    value: 85
  }
];

export const quoteLead = {
  id: "lead_991",
  customer: "Amit Patel",
  language: "Hindi",
  referredBy: "Maria Lopez",
  phone: "+1 312 555 0198",
  address: "911 S Ashland Ave, Chicago, IL",
  distanceMiles: 7.8,
  service: "Yard cleanup",
  serviceEs: "Limpieza de patio",
  answers: {
    yardSize: "Medium",
    overgrown: "Yes, grass above ankle height",
    access: "Gate access on left side",
    recurring: "Interested if first service goes well"
  },
  suggestedLow: 280,
  suggestedHigh: 350,
  recommended: 320,
  ownerSummary:
    "Nuevo cliente referido por Maria Lopez. Habló en hindi. Quiere limpieza de patio. Está dentro del radio de servicio. Patio mediano y crecido. Precio sugerido: $280-$350.",
  ownerSummaryEn:
    "New customer referred by Maria Lopez. They spoke Hindi and need yard cleanup. The address is inside the service radius. Medium overgrown yard. Suggested price: $280-$350."
};

export const messages = [
  {
    id: "msg_1",
    title: "Nueva cita confirmada",
    titleEn: "New appointment confirmed",
    body: "James Wilson confirmó corte de césped este viernes a las 2:00 PM.",
    bodyEn: "James Wilson confirmed lawn mowing this Friday at 2:00 PM.",
    type: "success"
  },
  {
    id: "msg_2",
    title: "Foto recibida",
    titleEn: "Photo received",
    body: "Amit Patel envió 3 fotos para cotización de limpieza.",
    bodyEn: "Amit Patel sent 3 photos for a cleanup quote.",
    type: "info"
  },
  {
    id: "msg_3",
    title: "Seguimiento listo",
    titleEn: "Follow-up ready",
    body: "Maria Lopez completó 4 servicios. El AI preparó mensaje de referido.",
    bodyEn: "Maria Lopez completed 4 services. The AI prepared a referral message.",
    type: "warn"
  }
];

export const customers = [
  { name: "Maria Lopez", jobs: 4, lastService: "Patio cleanup", source: "Google", language: "Spanish", referralReady: true },
  { name: "James Wilson", jobs: 2, lastService: "Lawn mowing", source: "Yard sign", language: "English", referralReady: false },
  { name: "Amit Patel", jobs: 0, lastService: "Quote pending", source: "Referral", language: "Hindi", referralReady: false },
  { name: "Ana Garcia", jobs: 6, lastService: "Mulch", source: "Referral", language: "Spanish", referralReady: true }
];

export const adminAccounts = [
  {
    business: "Green Valley Landscaping",
    owner: "Miguel Hernandez",
    plan: "Growth",
    status: "Live",
    minutesUsed: 118,
    smsUsed: 244,
    onboarding: 92
  },
  {
    business: "Lopez Roofing",
    owner: "Carlos Lopez",
    plan: "Growth",
    status: "Onboarding",
    minutesUsed: 12,
    smsUsed: 31,
    onboarding: 58
  },
  {
    business: "Rivera Plumbing",
    owner: "Sofia Rivera",
    plan: "Pro",
    status: "Needs review",
    minutesUsed: 412,
    smsUsed: 804,
    onboarding: 100
  }
];

export const onboardingChecklist = [
  "Business profile",
  "Service radius",
  "Services and quote rules",
  "Phone number or forwarding",
  "SMS compliance",
  "AI voice and scripts",
  "Test calls",
  "Billing"
];
