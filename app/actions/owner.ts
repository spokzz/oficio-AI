"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCustomerSourceOption } from "@/lib/customer-sources";
import { isServiceOption, serviceOptionDefaults } from "@/lib/services";
import { normalizePhone } from "@/lib/phone";
import { geocodeAddress } from "@/lib/geocoding";
import type { ContactClassification } from "@/lib/types";
import { validateCurrentUserCsrfToken, validateFormCsrfToken } from "@/lib/csrf";

export type AddCustomerState = {
  error?: string;
  success?: string;
};

export type AddBookingState = {
  error?: string;
  success?: string;
};

export type MarkCallState = {
  error?: string;
  success?: string;
};

export type OwnerSettingsState = {
  error?: string;
  success?: string;
};

export type OwnerServiceAreaState = {
  error?: string;
  success?: string;
};

export type OwnerClosureState = {
  error?: string;
  success?: string;
};

const callClassificationOptions: ContactClassification[] = ["customer", "personal", "vendor", "spam", "unknown"];
const ownerSummaryLanguages = ["en", "es"] as const;
const ownerSummaryChannels = ["sms", "email"] as const;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function customerInput(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "auto");
  const address = String(formData.get("address") ?? "").trim();
  const serviceType = String(formData.get("serviceType") ?? "");
  const serviceFeeValue = String(formData.get("serviceFee") ?? "").trim();
  const recurringIntervalValue = String(formData.get("recurringIntervalWeeks") ?? "").trim();
  const referralSource = String(formData.get("referralSource") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const serviceFee = serviceFeeValue ? Number(serviceFeeValue) : null;
  const recurringIntervalWeeks = recurringIntervalValue ? Number(recurringIntervalValue) : null;

  if (!fullName) {
    return { error: "Customer name is required." };
  }

  if (!isServiceOption(serviceType)) {
    return { error: "Choose a valid service." };
  }

  if (serviceFee !== null && (!Number.isFinite(serviceFee) || serviceFee < 0)) {
    return { error: "Enter a valid service fee." };
  }

  if (
    recurringIntervalWeeks !== null &&
    (!Number.isInteger(recurringIntervalWeeks) || recurringIntervalWeeks < 1 || recurringIntervalWeeks > 52)
  ) {
    return { error: "Enter a recurring interval between 1 and 52 weeks." };
  }

  if (!["auto", "es", "en"].includes(preferredLanguage)) {
    return { error: "Choose a valid customer language." };
  }

  if (!isCustomerSourceOption(referralSource)) {
    return { error: "Choose a valid source." };
  }

  return {
    address,
    email,
    fullName,
    notes,
    phone,
    preferredLanguage,
    recurringIntervalWeeks,
    recurringServiceType: recurringIntervalWeeks ? serviceType : null,
    referralSource,
    serviceFee,
    serviceType
  };
}

async function ownerBusinessId() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to manage customers." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_users")
    .select("business_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message };
  }

  if (!membership) {
    return { error: "No business is linked to this owner account." };
  }

  return { businessId: membership.business_id as string, supabase };
}

async function optionalGeocode(address: string) {
  if (!address.trim()) return null;
  const geocoded = await geocodeAddress(address);
  return geocoded.ok ? geocoded.address : null;
}

function dateKeyInZone(date: Date, timeZone = "America/Chicago") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validDateKey(value: string) {
  if (!dateKeyPattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function bookingClosureError({
  businessId,
  scheduledStart,
  supabase
}: {
  businessId: string;
  scheduledStart: Date;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("booking_time_zone")
    .eq("id", businessId)
    .maybeSingle<{ booking_time_zone: string | null }>();

  if (businessError) return businessError.message;

  const dateKey = dateKeyInZone(scheduledStart, business?.booking_time_zone || "America/Chicago");
  const { data: closure, error: closureError } = await supabase
    .from("business_availability_exceptions")
    .select("title")
    .eq("business_id", businessId)
    .lte("starts_on", dateKey)
    .gte("ends_on", dateKey)
    .limit(1)
    .maybeSingle<{ title: string | null }>();

  if (closureError) return closureError.message;
  if (closure) return `No appointments are available that day because ${closure.title || "the business is closed"}.`;

  return null;
}

export async function updateOwnerSettings(_state: OwnerSettingsState, formData: FormData): Promise<OwnerSettingsState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const ownerSummaryLanguage = String(formData.get("ownerSummaryLanguage") ?? "en");
  const ownerSummaryChannel = String(formData.get("ownerSummaryChannel") ?? "sms");
  const bookingTimeZone = String(formData.get("bookingTimeZone") ?? "America/Chicago").trim();
  const businessHoursText = String(formData.get("businessHoursText") ?? "").trim();
  const availableServices = formData
    .getAll("availableServices")
    .map((service) => String(service))
    .filter((service, index, services) => services.indexOf(service) === index);

  if (!ownerSummaryLanguages.includes(ownerSummaryLanguage as (typeof ownerSummaryLanguages)[number])) {
    return { error: "Choose a valid summary language." };
  }

  if (!ownerSummaryChannels.includes(ownerSummaryChannel as (typeof ownerSummaryChannels)[number])) {
    return { error: "Choose a valid summary method." };
  }

  if (!bookingTimeZone || !isValidTimeZone(bookingTimeZone)) {
    return { error: "Choose a valid booking time zone." };
  }

  if (!businessHoursText || businessHoursText.length > 240) {
    return { error: "Enter business hours under 240 characters." };
  }

  if (!availableServices.length || availableServices.some((service) => !isServiceOption(service))) {
    return { error: "Choose at least one valid service." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { error } = await owner.supabase
    .from("businesses")
    .update({
      available_services: availableServices.length ? availableServices : serviceOptionDefaults(),
      booking_time_zone: bookingTimeZone,
      business_hours_text: businessHoursText,
      owner_summary_channel: ownerSummaryChannel,
      owner_summary_language: ownerSummaryLanguage
    })
    .eq("id", owner.businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");

  return { success: "Settings saved." };
}

export async function updateOwnerServiceArea(_state: OwnerServiceAreaState, formData: FormData): Promise<OwnerServiceAreaState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const baseAddress = String(formData.get("baseAddress") ?? "").trim();
  const radiusMiles = Number(formData.get("radiusMiles") ?? 30);
  const allowOutsideRadius = String(formData.get("allowOutsideRadius") ?? "false") === "true";

  if (!baseAddress || baseAddress.length > 240) {
    return { error: "Enter a company address under 240 characters." };
  }

  if (!Number.isFinite(radiusMiles) || radiusMiles < 1 || radiusMiles > 250) {
    return { error: "Enter a service radius between 1 and 250 miles." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const geocoded = await geocodeAddress(baseAddress);
  if (!geocoded.ok) {
    return { error: geocoded.error };
  }

  const { error: businessError } = await owner.supabase
    .from("businesses")
    .update({
      base_address: geocoded.address.formattedAddress,
      base_geocode_accuracy: geocoded.address.accuracy,
      base_geocode_provider: geocoded.address.provider,
      base_geocoded_at: new Date().toISOString(),
      base_lat: geocoded.address.lat,
      base_lng: geocoded.address.lng
    })
    .eq("id", owner.businessId);

  if (businessError) {
    return { error: businessError.message };
  }

  const { data: radiusRule, error: radiusReadError } = await owner.supabase
    .from("service_radius_rules")
    .select("id")
    .eq("business_id", owner.businessId)
    .limit(1)
    .maybeSingle();

  if (radiusReadError) {
    return { error: radiusReadError.message };
  }

  const radiusPayload = {
    allow_outside_radius: allowOutsideRadius,
    business_id: owner.businessId,
    radius_miles: Math.round(radiusMiles),
    require_owner_approval_outside_radius: allowOutsideRadius
  };

  const radiusWrite = radiusRule?.id
    ? await owner.supabase.from("service_radius_rules").update(radiusPayload).eq("id", radiusRule.id)
    : await owner.supabase.from("service_radius_rules").insert(radiusPayload);

  if (radiusWrite.error) {
    return { error: radiusWrite.error.message };
  }

  revalidatePath("/owner");

  return { success: "Service area saved." };
}

export async function addOwnerAvailabilityException(_state: OwnerClosureState, formData: FormData): Promise<OwnerClosureState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const title = String(formData.get("title") ?? "Closed").replace(/\s+/g, " ").trim();
  const startsOn = String(formData.get("startsOn") ?? "").trim();
  const endsOn = String(formData.get("endsOn") ?? "").trim();
  const message = String(formData.get("message") ?? "").replace(/\s+/g, " ").trim();

  if (!title || title.length > 80) {
    return { error: "Enter a closure reason under 80 characters." };
  }

  if (!validDateKey(startsOn) || !validDateKey(endsOn)) {
    return { error: "Choose valid start and end dates." };
  }

  if (endsOn < startsOn) {
    return { error: "End date must be after the start date." };
  }

  if (message.length > 180) {
    return { error: "Keep the customer message under 180 characters." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { error } = await owner.supabase.from("business_availability_exceptions").insert({
    business_id: owner.businessId,
    ends_on: endsOn,
    message: message || null,
    starts_on: startsOn,
    title
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");

  return { success: "Closed dates saved." };
}

export async function deleteOwnerAvailabilityException(exceptionId: string, csrfToken: string): Promise<OwnerClosureState> {
  const csrfError = await validateCurrentUserCsrfToken(csrfToken);
  if (csrfError) return { error: csrfError };

  const trimmedExceptionId = exceptionId.trim();

  if (!trimmedExceptionId) {
    return { error: "Closure id is required." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { error } = await owner.supabase
    .from("business_availability_exceptions")
    .delete()
    .eq("id", trimmedExceptionId)
    .eq("business_id", owner.businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner");

  return { success: "Closed dates removed." };
}

function bookingTitle(serviceType: string) {
  const serviceName =
    serviceType === "yard_cleanup"
      ? "Yard cleaning"
      : serviceType
          .replaceAll("_", " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return `${serviceName} booking`;
}

async function upsertCustomerLead({
  address,
  businessId,
  customerId,
  geocodedAddress,
  notes,
  serviceType,
  supabase
}: {
  address: string;
  businessId: string;
  customerId: string;
  geocodedAddress?: Awaited<ReturnType<typeof optionalGeocode>>;
  notes: string;
  serviceType: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const title = `${serviceType.replaceAll("_", " ")} lead`;
  const { data: latestJob, error: latestJobError } = await supabase
    .from("jobs")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestJobError) {
    return latestJobError.message;
  }

  if (latestJob?.id) {
    const { error: jobUpdateError } = await supabase
      .from("jobs")
      .update({
        address: address || null,
        geocode_accuracy: geocodedAddress?.accuracy ?? null,
        geocode_provider: geocodedAddress?.provider ?? null,
        geocoded_at: geocodedAddress ? new Date().toISOString() : null,
        lat: geocodedAddress?.lat ?? null,
        lng: geocodedAddress?.lng ?? null,
        owner_notes: notes || null,
        service_type: serviceType,
        title
      })
      .eq("id", latestJob.id)
      .eq("business_id", businessId);

    return jobUpdateError?.message;
  }

  const { error: jobInsertError } = await supabase.from("jobs").insert({
    business_id: businessId,
    customer_id: customerId,
    title,
    service_type: serviceType,
    status: "lead",
    address: address || null,
    estimated_value: 0,
    geocode_accuracy: geocodedAddress?.accuracy ?? null,
    geocode_provider: geocodedAddress?.provider ?? null,
    geocoded_at: geocodedAddress ? new Date().toISOString() : null,
    lat: geocodedAddress?.lat ?? null,
    lng: geocodedAddress?.lng ?? null,
    owner_notes: notes || null
  });

  return jobInsertError?.message;
}

function bookingInput(formData: FormData, { allowLead = false } = {}) {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "auto");
  const address = String(formData.get("address") ?? "").trim();
  const serviceType = String(formData.get("serviceType") ?? "");
  const bookingStatus = String(formData.get("bookingStatus") ?? "confirmed");
  const scheduledStartValue = String(formData.get("scheduledStart") ?? "").trim();
  const estimatedValueText = String(formData.get("estimatedValue") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const estimatedValue = estimatedValueText ? Number(estimatedValueText) : null;
  const scheduledStart = scheduledStartValue ? new Date(scheduledStartValue) : null;

  if (!customerId) {
    return { error: "Choose a customer." };
  }

  if (customerId === "__new" && !fullName) {
    return { error: "Customer name is required." };
  }

  if (!isServiceOption(serviceType)) {
    return { error: "Choose a valid service." };
  }

  if (!["lead", "confirmed"].includes(bookingStatus) || (!allowLead && bookingStatus === "lead")) {
    return { error: "Choose a valid booking status." };
  }

  if (bookingStatus === "confirmed" && (!scheduledStart || Number.isNaN(scheduledStart.getTime()))) {
    return { error: "Choose a valid booking date and time." };
  }

  if (scheduledStart && Number.isNaN(scheduledStart.getTime())) {
    return { error: "Choose a valid booking date and time." };
  }

  if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0)) {
    return { error: "Enter a valid booking value." };
  }

  if (!["auto", "es", "en"].includes(preferredLanguage)) {
    return { error: "Choose a valid customer language." };
  }

  return {
    address,
    bookingStatus,
    customerId,
    email,
    estimatedValue,
    fullName,
    notes,
    phone,
    preferredLanguage,
    scheduledStart,
    serviceType
  };
}

export async function addOwnerBooking(_state: AddBookingState, formData: FormData): Promise<AddBookingState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const input = bookingInput(formData);
  if ("error" in input) {
    return input;
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  if (!input.scheduledStart) {
    return { error: "Choose a valid booking date and time." };
  }

  const closureError = await bookingClosureError({
    businessId: owner.businessId,
    scheduledStart: input.scheduledStart,
    supabase: owner.supabase
  });
  if (closureError) {
    return { error: closureError };
  }

  let customerId = input.customerId;
  let bookingAddress = input.address;
  let customerName = "Customer";
  const newCustomerGeocode = input.customerId === "__new" ? await optionalGeocode(input.address) : null;

  if (input.customerId === "__new") {
    const { data: customer, error: customerError } = await owner.supabase
      .from("customers")
      .insert({
        business_id: owner.businessId,
        full_name: input.fullName,
        phone: input.phone || null,
        email: input.email || null,
        preferred_language: input.preferredLanguage,
        address: input.address || null,
        geocode_accuracy: newCustomerGeocode?.accuracy ?? null,
        geocode_provider: newCustomerGeocode?.provider ?? null,
        geocoded_at: newCustomerGeocode ? new Date().toISOString() : null,
        lat: newCustomerGeocode?.lat ?? null,
        lng: newCustomerGeocode?.lng ?? null,
        notes: input.notes || null,
        referral_source: "other"
      })
      .select("id, full_name, address")
      .single();

    if (customerError || !customer) {
      return { error: customerError?.message ?? "Could not add customer for this booking." };
    }

    customerId = customer.id as string;
    customerName = String(customer.full_name ?? input.fullName);
    bookingAddress = bookingAddress || String(customer.address ?? "");
  } else {
    const { data: customer, error: customerError } = await owner.supabase
      .from("customers")
      .select("id, full_name, address")
      .eq("id", input.customerId)
      .eq("business_id", owner.businessId)
      .maybeSingle();

    if (customerError || !customer) {
      return { error: customerError?.message ?? "Choose a valid customer." };
    }

    customerName = String(customer.full_name ?? "Customer");
    bookingAddress = bookingAddress || String(customer.address ?? "");
  }

  const bookingGeocode = bookingAddress ? await optionalGeocode(bookingAddress) : null;
  const title = bookingTitle(input.serviceType);
  const { error: bookingError } = await owner.supabase.from("jobs").insert({
    address: bookingAddress || null,
    business_id: owner.businessId,
    customer_id: customerId,
    estimated_value: input.estimatedValue ?? 0,
    geocode_accuracy: bookingGeocode?.accuracy ?? null,
    geocode_provider: bookingGeocode?.provider ?? null,
    geocoded_at: bookingGeocode ? new Date().toISOString() : null,
    lat: bookingGeocode?.lat ?? null,
    lng: bookingGeocode?.lng ?? null,
    owner_notes: input.notes || null,
    scheduled_end: null,
    scheduled_start: input.scheduledStart.toISOString(),
    service_type: input.serviceType,
    status: "confirmed",
    title
  });

  if (bookingError) {
    return { error: bookingError.message };
  }

  revalidatePath("/owner");

  return { success: `${customerName} was booked.` };
}

export async function updateOwnerBooking(_state: AddBookingState, formData: FormData): Promise<AddBookingState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const input = bookingInput(formData, { allowLead: true });

  if (!bookingId) {
    return { error: "Booking id is required." };
  }

  if ("error" in input) {
    return input;
  }

  if (input.customerId === "__new") {
    return { error: "Choose an existing customer." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  if (input.bookingStatus === "confirmed" && input.scheduledStart) {
    const closureError = await bookingClosureError({
      businessId: owner.businessId,
      scheduledStart: input.scheduledStart,
      supabase: owner.supabase
    });
    if (closureError) {
      return { error: closureError };
    }
  }

  const { data: customer, error: customerError } = await owner.supabase
    .from("customers")
    .select("id, full_name, address")
    .eq("id", input.customerId)
    .eq("business_id", owner.businessId)
    .maybeSingle();

  if (customerError || !customer) {
    return { error: customerError?.message ?? "Choose a valid customer." };
  }

  const title = bookingTitle(input.serviceType);
  const scheduledStart = input.bookingStatus === "confirmed" ? input.scheduledStart?.toISOString() : null;
  const bookingAddress = input.address || String(customer.address ?? "");
  const bookingGeocode = bookingAddress ? await optionalGeocode(bookingAddress) : null;
  const { data: booking, error: bookingError } = await owner.supabase
    .from("jobs")
    .update({
      address: bookingAddress || null,
      customer_id: input.customerId,
      estimated_value: input.estimatedValue ?? 0,
      geocode_accuracy: bookingGeocode?.accuracy ?? null,
      geocode_provider: bookingGeocode?.provider ?? null,
      geocoded_at: bookingGeocode ? new Date().toISOString() : null,
      lat: bookingGeocode?.lat ?? null,
      lng: bookingGeocode?.lng ?? null,
      owner_notes: input.notes || null,
      scheduled_end: null,
      scheduled_start: scheduledStart,
      service_type: input.serviceType,
      status: input.bookingStatus,
      title
    })
    .eq("id", bookingId)
    .eq("business_id", owner.businessId)
    .select("id")
    .maybeSingle();

  if (bookingError || !booking) {
    return { error: bookingError?.message ?? "Could not update booking." };
  }

  revalidatePath("/owner");

  return { success: `${String(customer.full_name ?? "Booking")} was updated.` };
}

export async function deleteOwnerBooking(bookingId: string, csrfToken: string): Promise<AddBookingState> {
  const csrfError = await validateCurrentUserCsrfToken(csrfToken);
  if (csrfError) return { error: csrfError };

  const trimmedBookingId = bookingId.trim();

  if (!trimmedBookingId) {
    return { error: "Booking id is required." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { data: booking, error: bookingReadError } = await owner.supabase
    .from("jobs")
    .select("title")
    .eq("id", trimmedBookingId)
    .eq("business_id", owner.businessId)
    .maybeSingle();

  if (bookingReadError) {
    return { error: bookingReadError.message };
  }

  const { error: bookingDeleteError } = await owner.supabase
    .from("jobs")
    .delete()
    .eq("id", trimmedBookingId)
    .eq("business_id", owner.businessId);

  if (bookingDeleteError) {
    return { error: bookingDeleteError.message };
  }

  revalidatePath("/owner");

  return { success: `${String(booking?.title ?? "Booking")} was deleted.` };
}

export async function addOwnerCustomer(_state: AddCustomerState, formData: FormData): Promise<AddCustomerState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const input = customerInput(formData);
  if ("error" in input) {
    return input;
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const customerGeocode = await optionalGeocode(input.address);
  const { data: customer, error: customerError } = await owner.supabase
    .from("customers")
    .insert({
      business_id: owner.businessId,
      full_name: input.fullName,
      phone: input.phone || null,
      email: input.email || null,
      preferred_language: input.preferredLanguage,
      address: input.address || null,
      geocode_accuracy: customerGeocode?.accuracy ?? null,
      geocode_provider: customerGeocode?.provider ?? null,
      geocoded_at: customerGeocode ? new Date().toISOString() : null,
      lat: customerGeocode?.lat ?? null,
      lng: customerGeocode?.lng ?? null,
      notes: input.notes || null,
      referral_source: input.referralSource,
      recurring_interval_weeks: input.recurringIntervalWeeks,
      recurring_service_type: input.recurringServiceType,
      service_fee: input.serviceFee
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    return { error: customerError?.message ?? "Could not add customer." };
  }

  const jobError = await upsertCustomerLead({
    address: input.address,
    businessId: owner.businessId,
    customerId: customer.id as string,
    geocodedAddress: customerGeocode,
    notes: input.notes,
    serviceType: input.serviceType,
    supabase: owner.supabase
  });

  if (jobError) {
    return { error: jobError };
  }

  revalidatePath("/owner");

  return { success: `${input.fullName} was added.` };
}

export async function updateOwnerCustomer(_state: AddCustomerState, formData: FormData): Promise<AddCustomerState> {
  const csrfError = await validateFormCsrfToken(formData);
  if (csrfError) return { error: csrfError };

  const customerId = String(formData.get("customerId") ?? "").trim();
  const input = customerInput(formData);

  if (!customerId) {
    return { error: "Customer id is required." };
  }

  if ("error" in input) {
    return input;
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const customerGeocode = await optionalGeocode(input.address);
  const { data: customer, error: customerError } = await owner.supabase
    .from("customers")
    .update({
      full_name: input.fullName,
      phone: input.phone || null,
      email: input.email || null,
      preferred_language: input.preferredLanguage,
      address: input.address || null,
      geocode_accuracy: customerGeocode?.accuracy ?? null,
      geocode_provider: customerGeocode?.provider ?? null,
      geocoded_at: customerGeocode ? new Date().toISOString() : null,
      lat: customerGeocode?.lat ?? null,
      lng: customerGeocode?.lng ?? null,
      notes: input.notes || null,
      referral_source: input.referralSource,
      recurring_interval_weeks: input.recurringIntervalWeeks,
      recurring_service_type: input.recurringServiceType,
      service_fee: input.serviceFee
    })
    .eq("id", customerId)
    .eq("business_id", owner.businessId)
    .select("id")
    .maybeSingle();

  if (customerError || !customer) {
    return { error: customerError?.message ?? "Could not update customer." };
  }

  const jobError = await upsertCustomerLead({
    address: input.address,
    businessId: owner.businessId,
    customerId,
    geocodedAddress: customerGeocode,
    notes: input.notes,
    serviceType: input.serviceType,
    supabase: owner.supabase
  });

  if (jobError) {
    return { error: jobError };
  }

  revalidatePath("/owner");

  return { success: `${input.fullName} was updated.` };
}

export async function deleteOwnerCustomer(customerId: string, csrfToken: string): Promise<AddCustomerState> {
  const csrfError = await validateCurrentUserCsrfToken(csrfToken);
  if (csrfError) return { error: csrfError };

  const trimmedCustomerId = customerId.trim();

  if (!trimmedCustomerId) {
    return { error: "Customer id is required." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { data: customer, error: customerReadError } = await owner.supabase
    .from("customers")
    .select("full_name")
    .eq("id", trimmedCustomerId)
    .eq("business_id", owner.businessId)
    .maybeSingle();

  if (customerReadError) {
    return { error: customerReadError.message };
  }

  const { error: customerDeleteError } = await owner.supabase
    .from("customers")
    .delete()
    .eq("id", trimmedCustomerId)
    .eq("business_id", owner.businessId);

  if (customerDeleteError) {
    return { error: customerDeleteError.message };
  }

  revalidatePath("/owner");

  return { success: `${customer?.full_name ?? "Customer"} was deleted.` };
}

export async function markOwnerRecentCall(callSessionId: string, classification: ContactClassification, csrfToken: string): Promise<MarkCallState> {
  const csrfError = await validateCurrentUserCsrfToken(csrfToken);
  if (csrfError) return { error: csrfError };

  const trimmedCallSessionId = callSessionId.trim();

  if (!trimmedCallSessionId) {
    return { error: "Call session id is required." };
  }

  if (!callClassificationOptions.includes(classification)) {
    return { error: "Choose a valid call type." };
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { data: call, error: callError } = await owner.supabase
    .from("call_sessions")
    .select("id,from_phone,customer_id")
    .eq("id", trimmedCallSessionId)
    .eq("business_id", owner.businessId)
    .maybeSingle<{ id: string; from_phone: string | null; customer_id: string | null }>();

  if (callError || !call) {
    return { error: callError?.message ?? "Could not find that call." };
  }

  const phone = normalizePhone(call.from_phone);
  let customerId = call.customer_id;

  if (classification === "customer" && phone && !customerId) {
    const { data: existingCustomer, error: existingCustomerError } = await owner.supabase
      .from("customers")
      .select("id")
      .eq("business_id", owner.businessId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingCustomerError) {
      return { error: existingCustomerError.message };
    }

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
    } else {
      const { data: customer, error: customerError } = await owner.supabase
        .from("customers")
        .insert({
          business_id: owner.businessId,
          full_name: `Caller ${phone}`,
          phone,
          preferred_language: "auto",
          referral_source: "other",
          notes: "Created after owner marked a recent call as customer."
        })
        .select("id")
        .single<{ id: string }>();

      if (customerError || !customer) {
        return { error: customerError?.message ?? "Could not create a customer for this call." };
      }

      customerId = customer.id;
    }
  }

  const { error: callUpdateError } = await owner.supabase
    .from("call_sessions")
    .update({
      contact_type: classification,
      customer_id: classification === "customer" ? customerId : null,
      needs_owner_review: false,
      outcome: `Owner marked this call as ${classification}.`,
      screening_result: `owner_marked_${classification}`
    })
    .eq("id", trimmedCallSessionId)
    .eq("business_id", owner.businessId);

  if (callUpdateError) {
    return { error: callUpdateError.message };
  }

  if (phone) {
    const { error: contactError } = await owner.supabase.from("caller_contacts").upsert(
      {
        business_id: owner.businessId,
        phone,
        classification,
        customer_id: classification === "customer" ? customerId : null,
        confirmed_by_owner_at: new Date().toISOString()
      },
      { onConflict: "business_id,phone" }
    );

    if (contactError) {
      return { error: contactError.message };
    }
  }

  revalidatePath("/owner");

  return { success: `Call marked as ${classification}.` };
}
