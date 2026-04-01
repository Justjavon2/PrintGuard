"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContextCookies, type DataMode } from "@/lib/data/context";

const { activeOrganizationCookieName, dataModeCookieName } = getContextCookies();

async function logPreference(
  organizationId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  await supabase.from("auditLogs").insert({
    organizationId,
    actorUserId: user.id,
    action,
    metadata,
  });
}

export async function setDataModeAction(formData: FormData): Promise<void> {
  const modeRaw = formData.get("dataMode");
  const mode: DataMode = modeRaw === "demo" ? "demo" : "real";
  const organizationId = String(formData.get("organizationId") ?? "");

  const cookieStore = await cookies();
  cookieStore.set(dataModeCookieName, mode, { path: "/", httpOnly: false, sameSite: "lax" });

  if (organizationId) {
    await logPreference(organizationId, "pref:setDataMode", { dataMode: mode });
  }

  redirect("/protected/dashboard");
}

export async function openDemoModeAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("demo_bypass", "true", { path: "/", httpOnly: false, sameSite: "lax" });
  cookieStore.set(dataModeCookieName, "demo", { path: "/", httpOnly: false, sameSite: "lax" });
  redirect("/demo/dashboard");
}

export async function exitDemoModeAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("demo_bypass", "false", { path: "/", httpOnly: false, sameSite: "lax" });
  cookieStore.set(dataModeCookieName, "real", { path: "/", httpOnly: false, sameSite: "lax" });
  redirect("/protected/dashboard");
}

export async function setActiveOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) {
    redirect("/protected/select-org");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase
    .from("organizationMembers")
    .select("organizationId")
    .eq("userId", user.id)
    .eq("organizationId", organizationId)
    .maybeSingle();

  if (!membership) {
    redirect("/protected/select-org");
  }

  const cookieStore = await cookies();
  cookieStore.set(activeOrganizationCookieName, organizationId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });

  await logPreference(organizationId, "pref:setActiveOrganization", {
    activeOrganizationId: organizationId,
  });

  redirect("/protected/dashboard");
}
