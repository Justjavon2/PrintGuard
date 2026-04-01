import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type DataMode = "demo" | "real";

export interface OrganizationMembership {
  organizationId: string;
  role: "admin" | "member";
  organizationName: string;
  organizationSlug: string;
}

export interface ProtectedContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
  userInitials: string;
  memberships: OrganizationMembership[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  dataMode: DataMode;
  isDemoMode: boolean;
}

const activeOrganizationCookieName = "pg_active_org";
const dataModeCookieName = "pg_data_mode";

function parseDataMode(value: string | undefined): DataMode {
  if (value === "demo") {
    return "demo";
  }
  return "real";
}

function resolveDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string | null {
  const rawMetadata = user.user_metadata ?? {};
  const metadataName =
    typeof rawMetadata.full_name === "string"
      ? rawMetadata.full_name
      : typeof rawMetadata.name === "string"
        ? rawMetadata.name
        : null;
  if (metadataName && metadataName.trim().length > 0) {
    return metadataName.trim();
  }
  if (typeof user.email === "string" && user.email.length > 0) {
    return user.email.split("@")[0];
  }
  return null;
}

function resolveInitials(displayName: string | null, email: string | null): string {
  const source = (displayName ?? email ?? "").trim();
  if (source.length === 0) {
    return "U";
  }
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

async function getPersistedPreferenceFromAuditLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  memberships: OrganizationMembership[]
): Promise<{ persistedDataMode: DataMode | null; persistedActiveOrganizationId: string | null }> {
  const organizationIds = memberships.map((item) => item.organizationId);
  if (organizationIds.length === 0) {
    return { persistedDataMode: null, persistedActiveOrganizationId: null };
  }

  const { data, error } = await supabase
    .from("auditLogs")
    .select("action, metadata, organizationId, createdAt")
    .eq("actorUserId", userId)
    .in("organizationId", organizationIds)
    .in("action", ["pref:setDataMode", "pref:setActiveOrganization"])
    .order("createdAt", { ascending: false })
    .limit(40);

  if (error || !data) {
    return { persistedDataMode: null, persistedActiveOrganizationId: null };
  }

  let persistedDataMode: DataMode | null = null;
  let persistedActiveOrganizationId: string | null = null;

  for (const row of data) {
    if (persistedDataMode === null && row.action === "pref:setDataMode") {
      const mode = typeof row.metadata?.dataMode === "string" ? row.metadata.dataMode : null;
      if (mode === "demo" || mode === "real") {
        persistedDataMode = mode;
      }
    }
    if (persistedActiveOrganizationId === null && row.action === "pref:setActiveOrganization") {
      const organizationId =
        typeof row.metadata?.activeOrganizationId === "string"
          ? row.metadata.activeOrganizationId
          : null;
      if (organizationId) {
        persistedActiveOrganizationId = organizationId;
      }
    }

    if (persistedDataMode !== null && persistedActiveOrganizationId !== null) {
      break;
    }
  }

  return { persistedDataMode, persistedActiveOrganizationId };
}

export async function getProtectedContext(): Promise<ProtectedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      userId: "",
      userEmail: null,
      userDisplayName: null,
      userInitials: "U",
      memberships: [],
      activeOrganizationId: null,
      activeOrganizationName: null,
      dataMode: "real",
      isDemoMode: false,
    };
  }

  const cookieStore = await cookies();
  const demoBypass = cookieStore.get("demo_bypass")?.value === "true";
  const dataModeCookie = parseDataMode(cookieStore.get(dataModeCookieName)?.value);
  const activeOrganizationCookie = cookieStore.get(activeOrganizationCookieName)?.value ?? null;

  const { data: membershipRows } = await supabase
    .from("organizationMembers")
    .select("organizationId, role, organizations(name, slug)")
    .eq("userId", user.id);

  const memberships: OrganizationMembership[] = (membershipRows ?? []).map((row) => {
    const organizationsJoin = row.organizations as
      | { name?: string | null; slug?: string | null }
      | Array<{ name?: string | null; slug?: string | null }>
      | null;
    const firstOrganization = Array.isArray(organizationsJoin)
      ? organizationsJoin[0]
      : organizationsJoin;
    return {
      organizationId: row.organizationId,
      role: row.role,
      organizationName: firstOrganization?.name ?? "Organization",
      organizationSlug: firstOrganization?.slug ?? "",
    };
  });

  const { persistedDataMode, persistedActiveOrganizationId } = await getPersistedPreferenceFromAuditLogs(
    supabase,
    user.id,
    memberships
  );

  const organizationIdSet = new Set(memberships.map((item) => item.organizationId));
  const resolvedOrganizationId =
    [activeOrganizationCookie, persistedActiveOrganizationId].find(
      (value) => value !== null && organizationIdSet.has(value)
    ) ?? (memberships.length === 1 ? memberships[0].organizationId : null);

  const activeMembership =
    memberships.find((item) => item.organizationId === resolvedOrganizationId) ?? null;
  const resolvedDataMode = demoBypass ? "demo" : dataModeCookie ?? persistedDataMode ?? "real";
  const userEmail = user.email ?? null;
  const userDisplayName = resolveDisplayName({
    email: user.email,
    user_metadata: user.user_metadata as Record<string, unknown> | undefined,
  });
  const userInitials = resolveInitials(userDisplayName, userEmail);

  return {
    supabase,
    userId: user.id,
    userEmail,
    userDisplayName,
    userInitials,
    memberships,
    activeOrganizationId: resolvedOrganizationId,
    activeOrganizationName: activeMembership?.organizationName ?? null,
    dataMode: resolvedDataMode,
    isDemoMode: resolvedDataMode === "demo",
  };
}

export function getContextCookies() {
  return {
    activeOrganizationCookieName,
    dataModeCookieName,
  };
}
