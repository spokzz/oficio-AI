"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCustomerSourceOption } from "@/lib/customer-sources";
import { isServiceOption } from "@/lib/services";

export type AddCustomerState = {
  error?: string;
  success?: string;
};

export type AddBookingState = {
  error?: string;
  success?: string;
};

function customerInput(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "auto");
  const address = String(formData.get("address") ?? "").trim();
  const serviceType = String(formData.get("serviceType") ?? "");
  const serviceFeeValue = String(formData.get("serviceFee") ?? "").trim();
  const referralSource = String(formData.get("referralSource") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const serviceFee = serviceFeeValue ? Number(serviceFeeValue) : null;

  if (!fullName) {
    return { error: "Customer name is required." };
  }

  if (!isServiceOption(serviceType)) {
    return { error: "Choose a valid service." };
  }

  if (serviceFee !== null && (!Number.isFinite(serviceFee) || serviceFee < 0)) {
    return { error: "Enter a valid service fee." };
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
  notes,
  serviceType,
  supabase
}: {
  address: string;
  businessId: string;
  customerId: string;
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
    owner_notes: notes || null
  });

  return jobInsertError?.message;
}

function bookingInput(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "auto");
  const address = String(formData.get("address") ?? "").trim();
  const serviceType = String(formData.get("serviceType") ?? "");
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

  if (!scheduledStart || Number.isNaN(scheduledStart.getTime())) {
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
  const input = bookingInput(formData);
  if ("error" in input) {
    return input;
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  let customerId = input.customerId;
  let bookingAddress = input.address;
  let customerName = "Customer";

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

  const title = bookingTitle(input.serviceType);
  const { error: bookingError } = await owner.supabase.from("jobs").insert({
    address: bookingAddress || null,
    business_id: owner.businessId,
    customer_id: customerId,
    estimated_value: input.estimatedValue,
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
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const input = bookingInput(formData);

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
  const { data: booking, error: bookingError } = await owner.supabase
    .from("jobs")
    .update({
      address: input.address || String(customer.address ?? "") || null,
      customer_id: input.customerId,
      estimated_value: input.estimatedValue,
      owner_notes: input.notes || null,
      scheduled_end: null,
      scheduled_start: input.scheduledStart.toISOString(),
      service_type: input.serviceType,
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

export async function deleteOwnerBooking(bookingId: string): Promise<AddBookingState> {
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
  const input = customerInput(formData);
  if ("error" in input) {
    return input;
  }

  const owner = await ownerBusinessId();
  if ("error" in owner) {
    return { error: owner.error };
  }

  const { data: customer, error: customerError } = await owner.supabase
    .from("customers")
    .insert({
      business_id: owner.businessId,
      full_name: input.fullName,
      phone: input.phone || null,
      email: input.email || null,
      preferred_language: input.preferredLanguage,
      address: input.address || null,
      notes: input.notes || null,
      referral_source: input.referralSource,
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

  const { data: customer, error: customerError } = await owner.supabase
    .from("customers")
    .update({
      full_name: input.fullName,
      phone: input.phone || null,
      email: input.email || null,
      preferred_language: input.preferredLanguage,
      address: input.address || null,
      notes: input.notes || null,
      referral_source: input.referralSource,
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

export async function deleteOwnerCustomer(customerId: string): Promise<AddCustomerState> {
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
