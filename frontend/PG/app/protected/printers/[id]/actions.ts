"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";

interface StationRow {
  id: string;
  defaultCameraSourceKey: string | null;
}

interface StationCameraRow {
  cameraSourceKey: string;
  slotOrder: number | null;
}

function assertNoError(error: PostgrestError | null, message: string): void {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }
}

async function ensureOrganizationMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizationMembers")
    .select("organizationId")
    .eq("organizationId", organizationId)
    .eq("userId", userId)
    .maybeSingle();
  return Boolean(data);
}

async function appendAuditLog(
  organizationId: string,
  actorUserId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("auditLogs").insert({
    organizationId,
    actorUserId,
    action,
    metadata,
  });
  assertNoError(error, "Failed to append audit log");
}

async function ensureStation(
  organizationId: string,
  printerId: string,
  printerName: string,
  defaultCameraSourceKey: string | null
): Promise<StationRow> {
  const supabase = await createClient();
  const { data: existingStationRow } = await supabase
    .from("stations")
    .select("id,defaultCameraSourceKey")
    .eq("organizationId", organizationId)
    .eq("printerId", printerId)
    .maybeSingle();

  if (existingStationRow) {
    return existingStationRow as StationRow;
  }

  const insertPayload: {
    organizationId: string;
    printerId: string;
    name: string;
    defaultCameraSourceKey?: string;
  } = {
    organizationId,
    printerId,
    name: `${printerName} Station`,
  };

  if (defaultCameraSourceKey) {
    insertPayload.defaultCameraSourceKey = defaultCameraSourceKey;
  }

  const { data: insertedStationRow, error } = await supabase
    .from("stations")
    .insert(insertPayload)
    .select("id,defaultCameraSourceKey")
    .single();

  if (error || !insertedStationRow) {
    throw new Error(error?.message ?? "Unable to create station");
  }

  return insertedStationRow as StationRow;
}

async function ensureSourceAssignedToStation(
  organizationId: string,
  stationId: string,
  sourceKey: string
): Promise<void> {
  const supabase = await createClient();
  const { data: existingCameraRows, error: existingCameraRowsError } = await supabase
    .from("stationCameras")
    .select("cameraSourceKey,slotOrder")
    .eq("organizationId", organizationId)
    .eq("stationId", stationId)
    .order("slotOrder", { ascending: true });
  assertNoError(existingCameraRowsError, "Failed to load station cameras");

  const typedExistingCameraRows = (existingCameraRows ?? []) as StationCameraRow[];
  const sourceKeys = typedExistingCameraRows.map((row) => row.cameraSourceKey);
  if (sourceKeys.includes(sourceKey)) {
    return;
  }

  const { data: videoSourceRow, error: videoSourceLookupError } = await supabase
    .from("videoSources")
    .select("id")
    .eq("organizationId", organizationId)
    .eq("sourceKey", sourceKey)
    .maybeSingle();
  assertNoError(videoSourceLookupError, "Failed to load video source");
  if (!videoSourceRow?.id) {
    throw new Error(`Missing video source id for source key: ${sourceKey}`);
  }

  const maxSlotOrder = typedExistingCameraRows.reduce((maxValue, row) => {
    if (typeof row.slotOrder === "number" && row.slotOrder > maxValue) {
      return row.slotOrder;
    }
    return maxValue;
  }, 0);

  const insertPayload: Record<string, unknown> = {
    organizationId,
    stationId,
    cameraSourceKey: sourceKey,
    slotOrder: maxSlotOrder + 1,
    videoSourceId: videoSourceRow.id,
  };
  const { error } = await supabase.from("stationCameras").insert(insertPayload);
  assertNoError(error, "Failed to assign source to station");
}

async function getUserAndValidateOrg(organizationId: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const isMember = await ensureOrganizationMember(organizationId, user.id);
  if (!isMember) {
    redirect("/protected/select-org");
  }

  return user.id;
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
}

function sourceTypeFromFormValue(
  value: FormDataEntryValue | null
): "local" | "rtsp" | "httpMjpeg" {
  const sourceTypeValue = String(value ?? "local");
  if (sourceTypeValue === "rsvp") {
    return "rtsp";
  }
  if (
    sourceTypeValue === "local" ||
    sourceTypeValue === "rtsp" ||
    sourceTypeValue === "httpMjpeg"
  ) {
    return sourceTypeValue;
  }
  return "local";
}

export async function addCameraSourceForPrinterAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const printerId = String(formData.get("printerId") ?? "");
  const printerName = String(formData.get("printerName") ?? "Printer");
  const rawSourceKey = String(formData.get("sourceKey") ?? "").trim();
  const sourceType = sourceTypeFromFormValue(formData.get("sourceType"));
  const rawSourceValue = String(formData.get("sourceValue") ?? "").trim();
  const rawDisplayName = String(formData.get("displayName") ?? "").trim();
  const setAsDefault = String(formData.get("setAsDefault") ?? "") === "true";

  if (!organizationId || !printerId) {
    redirect(`/protected/printers/${printerId}`);
  }

  const userId = await getUserAndValidateOrg(organizationId);
  const supabase = await createClient();
  const sourceKey = rawSourceKey;
  const sourceValue = rawSourceValue;
  const displayName = rawDisplayName;
  const normalizedSourceType: "local" | "rtsp" | "httpMjpeg" = sourceType;

  if (!sourceKey || !sourceValue) {
    redirect(`/protected/printers/${printerId}`);
  }

  const { data: upsertedVideoSource, error: videoSourceError } = await supabase
    .from("videoSources")
    .upsert(
      {
        organizationId,
        sourceKey,
        sourceType: normalizedSourceType,
        sourceValue,
        displayName: displayName || sourceKey,
        isExternal: normalizedSourceType !== "local" || sourceKey !== "local:0",
        isNetwork: normalizedSourceType !== "local",
      },
      { onConflict: "organizationId,sourceKey" }
    )
    .select("id")
    .single();
  assertNoError(videoSourceError, "Failed to upsert video source");
  if (!upsertedVideoSource?.id) {
    throw new Error(`Failed to resolve video source id for source key: ${sourceKey}`);
  }

  const stationRow = await ensureStation(
    organizationId,
    printerId,
    printerName,
    sourceKey
  );

  const { data: cameraRows, error: stationCamerasError } = await supabase
    .from("stationCameras")
    .select("cameraSourceKey,slotOrder")
    .eq("organizationId", organizationId)
    .eq("stationId", stationRow.id)
    .order("slotOrder", { ascending: true });
  assertNoError(stationCamerasError, "Failed to load station cameras");

  const typedCameraRows = (cameraRows ?? []) as StationCameraRow[];
  const existingSourceKeys = typedCameraRows.map((row) => row.cameraSourceKey);
  if (!existingSourceKeys.includes(sourceKey)) {
    const maxSlotOrder = typedCameraRows.reduce((maxValue, row) => {
      if (typeof row.slotOrder === "number" && row.slotOrder > maxValue) {
        return row.slotOrder;
      }
      return maxValue;
    }, 0);
    const insertPayload: Record<string, unknown> = {
      organizationId,
      stationId: stationRow.id,
      cameraSourceKey: sourceKey,
      slotOrder: maxSlotOrder + 1,
      videoSourceId: upsertedVideoSource.id,
    };
    const { error: stationCameraInsertError } = await supabase.from("stationCameras").insert(insertPayload);
    assertNoError(stationCameraInsertError, "Failed to create station camera");
  }

  if (setAsDefault || !stationRow.defaultCameraSourceKey) {
    const { error: stationUpdateError } = await supabase
      .from("stations")
      .update({ defaultCameraSourceKey: sourceKey })
      .eq("organizationId", organizationId)
      .eq("id", stationRow.id);
    assertNoError(stationUpdateError, "Failed to set station default camera");

    await appendAuditLog(organizationId, userId, "pref:setCameraDefault", {
      printerId,
      sourceKey,
      preferredDefaultSourceKey: sourceKey,
    });
  }

  revalidatePath(`/protected/printers/${printerId}`);
  revalidatePath("/protected/dashboard");
  revalidatePath("/protected/fleet");
  redirect(`/protected/printers/${printerId}`);
}

export async function setDefaultPrinterCameraAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const printerId = String(formData.get("printerId") ?? "");
  const sourceKey = String(formData.get("sourceKey") ?? "");

  if (!organizationId || !printerId || !sourceKey) {
    redirect(`/protected/printers/${printerId}`);
  }

  const userId = await getUserAndValidateOrg(organizationId);
  const supabase = await createClient();

  const { data: stationRow } = await supabase
    .from("stations")
    .select("id")
    .eq("organizationId", organizationId)
    .eq("printerId", printerId)
    .maybeSingle();

  if (stationRow?.id) {
    await ensureSourceAssignedToStation(organizationId, stationRow.id, sourceKey);

    const { error: stationDefaultUpdateError } = await supabase
      .from("stations")
      .update({ defaultCameraSourceKey: sourceKey })
      .eq("organizationId", organizationId)
      .eq("id", stationRow.id);
    assertNoError(stationDefaultUpdateError, "Failed to update station default camera");

    await appendAuditLog(organizationId, userId, "pref:setCameraDefault", {
      printerId,
      sourceKey,
      preferredDefaultSourceKey: sourceKey,
    });
  }

  revalidatePath(`/protected/printers/${printerId}`);
  redirect(`/protected/printers/${printerId}`);
}

export async function deleteCameraFromPrinterAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const printerId = String(formData.get("printerId") ?? "");
  const sourceKey = String(formData.get("sourceKey") ?? "");

  if (!organizationId || !printerId || !sourceKey) {
    redirect(`/protected/printers/${printerId}`);
  }

  const userId = await getUserAndValidateOrg(organizationId);
  const supabase = await createClient();

  const { data: stationRow } = await supabase
    .from("stations")
    .select("id,defaultCameraSourceKey")
    .eq("organizationId", organizationId)
    .eq("printerId", printerId)
    .maybeSingle();

  if (!stationRow?.id) {
    redirect(`/protected/printers/${printerId}`);
  }

  const { error: deleteStationCameraError } = await supabase
    .from("stationCameras")
    .delete()
    .eq("organizationId", organizationId)
    .eq("stationId", stationRow.id)
    .eq("cameraSourceKey", sourceKey);
  assertNoError(deleteStationCameraError, "Failed to delete station camera");

  const { data: remainingCameraRows } = await supabase
    .from("stationCameras")
    .select("cameraSourceKey,slotOrder")
    .eq("organizationId", organizationId)
    .eq("stationId", stationRow.id)
    .order("slotOrder", { ascending: true });

  const remainingSourceKeys = ((remainingCameraRows ?? []) as StationCameraRow[]).map(
    (row) => row.cameraSourceKey
  );

  if (stationRow.defaultCameraSourceKey === sourceKey) {
    const { error: fallbackDefaultError } = await supabase
      .from("stations")
      .update({
        defaultCameraSourceKey:
          remainingSourceKeys.length > 0 ? remainingSourceKeys[0] : null,
      })
      .eq("organizationId", organizationId)
      .eq("id", stationRow.id);
    assertNoError(fallbackDefaultError, "Failed to set fallback default camera");
  }

  await appendAuditLog(organizationId, userId, "camera:removedFromPrinter", {
    printerId,
    sourceKey,
  });

  revalidatePath(`/protected/printers/${printerId}`);
  revalidatePath("/protected/dashboard");
  revalidatePath("/protected/fleet");
  redirect(`/protected/printers/${printerId}`);
}

export async function startGuardForPrinterAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const organizationName = String(formData.get("organizationName") ?? "");
  const printerId = String(formData.get("printerId") ?? "");

  if (!organizationId || !printerId) {
    redirect(`/protected/printers/${printerId}`);
  }

  await getUserAndValidateOrg(organizationId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;
  if (!userEmail) {
    throw new Error("Signed-in user email is missing");
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;
  if (!accessToken) {
    throw new Error("Missing Supabase access token for guard action");
  }

  const response = await fetch(`${getApiBaseUrl()}/api/notifications/guard/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      organizationId,
      organizationName: organizationName || null,
      printerId,
      userEmail,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    let responseDetail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload?.detail) {
        responseDetail = payload.detail;
      }
    } catch {
      // keep default response detail
    }
    throw new Error(`Failed to start guard mode: ${responseDetail}`);
  }

  const payload = (await response.json()) as {
    notificationSent?: boolean;
    skippedReason?: string | null;
    retryAfterSeconds?: number | null;
  };

  revalidatePath(`/protected/printers/${printerId}`);
  if (payload.notificationSent === false && payload.skippedReason === "cooldown_active") {
    const retryAfterSeconds = Number(payload.retryAfterSeconds ?? 0);
    redirect(
      `/protected/printers/${printerId}?guardStatus=cooldown&retryAfterSeconds=${encodeURIComponent(String(retryAfterSeconds))}`
    );
  }

  redirect(`/protected/printers/${printerId}?guardStatus=sent`);
}
