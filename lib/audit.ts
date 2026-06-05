import { headers } from "next/headers";

type AuditClient = {
  from: (table: "audit_events") => {
    insert: (payload: AuditEventPayload) => PromiseLike<{ error: { message: string } | null }>;
  };
};

type AuditEventPayload = {
  action: string;
  actor_role: string;
  actor_user_id?: string | null;
  after_json?: Record<string, unknown> | null;
  before_json?: Record<string, unknown> | null;
  business_id: string;
  entity_id?: string | null;
  entity_type: string;
  ip_address?: string | null;
  user_agent?: string | null;
};

export type AuditContext = {
  actorRole: string;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export async function requestAuditContext(actorRole: string, actorUserId?: string | null): Promise<AuditContext> {
  const requestHeaders = await headers();

  return {
    actorRole,
    actorUserId,
    ipAddress: firstHeaderValue(requestHeaders.get("x-forwarded-for")) ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent")
  };
}

export function auditContextFromHeaders(headersLike: Headers, actorRole: string, actorUserId?: string | null): AuditContext {
  return {
    actorRole,
    actorUserId,
    ipAddress: firstHeaderValue(headersLike.get("x-forwarded-for")) ?? headersLike.get("x-real-ip"),
    userAgent: headersLike.get("user-agent")
  };
}

export async function recordAuditEvent(
  supabase: AuditClient,
  {
    action,
    actorRole,
    actorUserId = null,
    after,
    before,
    businessId,
    entityId,
    entityType,
    ipAddress = null,
    userAgent = null
  }: {
    action: string;
    actorRole: string;
    actorUserId?: string | null;
    after?: Record<string, unknown> | null;
    before?: Record<string, unknown> | null;
    businessId: string;
    entityId?: string | null;
    entityType: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
) {
  const { error } = await supabase.from("audit_events").insert({
    action,
    actor_role: actorRole,
    actor_user_id: actorUserId,
    after_json: after ?? null,
    before_json: before ?? null,
    business_id: businessId,
    entity_id: entityId ?? null,
    entity_type: entityType,
    ip_address: ipAddress,
    user_agent: userAgent
  });

  if (error) {
    console.warn("Could not record audit event.", { action, businessId, entityId, entityType, error: error.message });
  }
}
