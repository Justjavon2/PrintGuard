import type { Alert, DefectLabel, FleetMetrics, Printer, PrinterStatus } from "@/lib/mock-data";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CameraSourceRecord {
  sourceKey: string;
  sourceType: "local" | "rtsp" | "httpMjpeg";
  displayName: string;
  sourceValue: string;
  isExternal: boolean;
  isNetwork: boolean;
}

interface IncidentRow {
  id: string;
  printerId: string;
  incidentStatus: string;
  detectionLabel: string | null;
  confidence: number | null;
  consecutiveFrames: number | null;
  createdAt: string;
}

interface PrintJobRow {
  id: string;
  printerId: string;
  fileName: string | null;
  jobStatus: string;
  progressPercent: number | null;
  filamentUsedG: number | null;
  estimatedTimeLeftMin: number | null;
  createdAt: string;
}

interface StationInfo {
  id: string;
  defaultCameraSourceKey: string | null;
}

interface PrinterRow {
  id: string;
  name: string;
  model: string | null;
  status: string | null;
  lab: Array<{ name: string | null }> | { name: string | null } | null;
  stations: StationInfo[] | StationInfo | null;
}

interface StationRow {
  id: string;
  defaultCameraSourceKey: string | null;
}

interface StationCameraRow {
  cameraSourceKey: string;
}

interface VideoSourceRow {
  sourceKey: string;
  sourceType: "local" | "rtsp" | "httpMjpeg";
  displayName: string;
  sourceValue: string;
  isExternal: boolean | null;
  isNetwork: boolean | null;
}

function toPrinterStatus(value: string | null | undefined): PrinterStatus {
  if (
    value === "monitoring" ||
    value === "warning" ||
    value === "danger" ||
    value === "paused" ||
    value === "offline" ||
    value === "idle"
  ) {
    return value;
  }
  return "idle";
}

function toDefectLabel(value: string | null | undefined): DefectLabel {
  const upperValue = (value ?? "good").toUpperCase();
  if (
    upperValue === "SPAGHETTI" ||
    upperValue === "WARPING" ||
    upperValue === "DETACHMENT" ||
    upperValue === "STRINGING" ||
    upperValue === "GOOD"
  ) {
    return upperValue;
  }
  return "GOOD";
}

function defaultPrinter(id: string): Printer {
  return {
    id,
    name: "Unknown Printer",
    model: "Unknown",
    lab: "Unknown Lab",
    status: "idle",
    currentJob: null,
    jobProgress: 0,
    confidence: 0,
    consecutiveFrames: 0,
    detectedLabel: "GOOD",
    lastFrameAt: new Date().toISOString(),
    cameraConnected: false,
    latencyMs: 0,
    filamentUsedG: 0,
    estimatedTimeLeftMin: 0,
  };
}

function firstLabName(lab: PrinterRow["lab"]): string {
  if (!lab) {
    return "Unknown Lab";
  }
  if (Array.isArray(lab)) {
    return lab[0]?.name ?? "Unknown Lab";
  }
  return lab.name ?? "Unknown Lab";
}

function firstStation(stations: PrinterRow["stations"]): StationInfo | null {
  if (!stations) {
    return null;
  }
  if (Array.isArray(stations)) {
    return stations[0] ?? null;
  }
  return stations;
}

async function getUserCameraPreference(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  printerId: string
): Promise<{ preferredDefaultSourceKey: string | null; preferredPrinterSourceKey: string | null }> {
  const { data } = await supabase
    .from("auditLogs")
    .select("metadata, createdAt")
    .eq("organizationId", organizationId)
    .eq("actorUserId", userId)
    .in("action", ["pref:setCameraDefault", "pref:setCameraGlobalDefault"])
    .order("createdAt", { ascending: false })
    .limit(50);

  let preferredDefaultSourceKey: string | null = null;
  let preferredPrinterSourceKey: string | null = null;

  for (const row of data ?? []) {
    const metadata = row.metadata as Record<string, unknown> | null;
    if (!metadata) {
      continue;
    }

    if (preferredPrinterSourceKey === null) {
      const metadataPrinterId = typeof metadata.printerId === "string" ? metadata.printerId : null;
      const metadataSourceKey = typeof metadata.sourceKey === "string" ? metadata.sourceKey : null;
      if (metadataPrinterId === printerId && metadataSourceKey) {
        preferredPrinterSourceKey = metadataSourceKey;
      }
    }

    if (preferredDefaultSourceKey === null) {
      const metadataDefaultSourceKey =
        typeof metadata.preferredDefaultSourceKey === "string"
          ? metadata.preferredDefaultSourceKey
          : typeof metadata.sourceKey === "string"
            ? metadata.sourceKey
            : null;
      if (metadataDefaultSourceKey) {
        preferredDefaultSourceKey = metadataDefaultSourceKey;
      }
    }

    if (preferredPrinterSourceKey && preferredDefaultSourceKey) {
      break;
    }
  }

  return { preferredDefaultSourceKey, preferredPrinterSourceKey };
}

export async function loadRealPrinters(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ printers: Printer[]; metrics: FleetMetrics; recentAlerts: Alert[] }> {
  const { data: printerRows } = await supabase
    .from("printers")
    .select("id,name,model,status,lab:labs(name),stations(id,defaultCameraSourceKey)")
    .eq("organizationId", organizationId)
    .order("createdAt", { ascending: true });

  const typedPrinters = (printerRows ?? []) as PrinterRow[];
  const printerIds = typedPrinters.map((row) => row.id);

  const [incidentResult, jobResult] = await Promise.all([
    printerIds.length > 0
      ? supabase
          .from("incidents")
          .select("id,printerId,incidentStatus,detectionLabel,confidence,consecutiveFrames,createdAt")
          .eq("organizationId", organizationId)
          .in("printerId", printerIds)
          .order("createdAt", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] as IncidentRow[] }),
    printerIds.length > 0
      ? supabase
          .from("printJobs")
          .select("id,printerId,fileName,jobStatus,progressPercent,filamentUsedG,estimatedTimeLeftMin,createdAt")
          .eq("organizationId", organizationId)
          .in("printerId", printerIds)
          .order("createdAt", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] as PrintJobRow[] }),
  ]);

  const incidentRows = (incidentResult.data ?? []) as IncidentRow[];
  const jobRows = (jobResult.data ?? []) as PrintJobRow[];

  const latestIncidentByPrinter = new Map<string, IncidentRow>();
  for (const row of incidentRows) {
    if (!latestIncidentByPrinter.has(row.printerId)) {
      latestIncidentByPrinter.set(row.printerId, row);
    }
  }

  const latestJobByPrinter = new Map<string, PrintJobRow>();
  for (const row of jobRows) {
    if (!latestJobByPrinter.has(row.printerId)) {
      latestJobByPrinter.set(row.printerId, row);
    }
  }

  const monitoringPrinterIds: string[] = [];
  const idlePrinterIds: string[] = [];
  for (const printerRow of typedPrinters) {
    const latestJob = latestJobByPrinter.get(printerRow.id);
    const hasRunningJob = latestJob?.jobStatus === "running";
    const currentStatus = toPrinterStatus(printerRow.status);
    if (hasRunningJob && currentStatus === "idle") {
      monitoringPrinterIds.push(printerRow.id);
    }
    if (!hasRunningJob && currentStatus === "monitoring") {
      idlePrinterIds.push(printerRow.id);
    }
  }

  if (monitoringPrinterIds.length > 0) {
    await supabase
      .from("printers")
      .update({ status: "monitoring" })
      .eq("organizationId", organizationId)
      .in("id", monitoringPrinterIds);
  }
  if (idlePrinterIds.length > 0) {
    await supabase
      .from("printers")
      .update({ status: "idle" })
      .eq("organizationId", organizationId)
      .in("id", idlePrinterIds);
  }

  const printers: Printer[] = typedPrinters.map((row) => {
    const base = defaultPrinter(row.id);
    const incident = latestIncidentByPrinter.get(row.id);
    const job = latestJobByPrinter.get(row.id);
    const station = firstStation(row.stations);

    const incidentStatus = incident?.incidentStatus;
    const mappedStatus: PrinterStatus =
      incidentStatus === "confirmed"
        ? "danger"
        : incidentStatus === "warning"
          ? "warning"
          : toPrinterStatus(row.status);

    return {
      ...base,
      id: row.id,
      name: row.name,
      model: row.model ?? "Unknown",
      lab: firstLabName(row.lab),
      status: mappedStatus,
      currentJob: job?.jobStatus === "running" ? (job.fileName ?? null) : null,
      jobProgress: Math.round(Number(job?.progressPercent ?? 0)),
      confidence: Number(incident?.confidence ?? 0),
      consecutiveFrames: Number(incident?.consecutiveFrames ?? 0),
      detectedLabel: toDefectLabel(incident?.detectionLabel),
      lastFrameAt: incident?.createdAt ?? job?.createdAt ?? base.lastFrameAt,
      cameraConnected: Boolean(station?.defaultCameraSourceKey),
      latencyMs: 0,
      filamentUsedG: Number(job?.filamentUsedG ?? 0),
      estimatedTimeLeftMin: Number(job?.estimatedTimeLeftMin ?? 0),
    };
  });

  const recentAlerts: Alert[] = incidentRows.slice(0, 10).map((row) => {
    const printer = printers.find((item) => item.id === row.printerId);
    const alertType =
      row.incidentStatus === "confirmed" || row.incidentStatus === "warning" || row.incidentStatus === "resolved"
        ? row.incidentStatus
        : "warning";

    return {
      id: row.id,
      printerId: row.printerId,
      printerName: printer?.name ?? "Unknown Printer",
      lab: printer?.lab ?? "Unknown Lab",
      type: alertType,
      defect: toDefectLabel(row.detectionLabel),
      confidence: Number(row.confidence ?? 0),
      consecutiveFrames: Number(row.consecutiveFrames ?? 0),
      timestamp: row.createdAt,
      snapshotUrl: null,
      explanation: "Generated from live incident data.",
    };
  });

  const activePrinters = printers.filter(
    (item) => item.status === "monitoring" || item.status === "idle"
  ).length;
  const warnings = printers.filter((item) => item.status === "warning").length;
  const paused = printers.filter((item) => item.status === "paused").length;

  const totalFilamentSavedG = printers.reduce((sum, item) => sum + item.filamentUsedG, 0);
  const totalTimeSavedMin = printers.reduce((sum, item) => sum + item.estimatedTimeLeftMin, 0);
  const totalPrintJobs = jobRows.length;
  const failedCount = incidentRows.filter((item) => item.incidentStatus === "confirmed").length;
  const failureRate = totalPrintJobs > 0 ? failedCount / totalPrintJobs : 0;

  const metrics: FleetMetrics = {
    activePrinters,
    warnings,
    paused,
    totalFilamentSavedG,
    totalTimeSavedMin,
    totalPrintJobs,
    failureRate,
  };

  return { printers, metrics, recentAlerts };
}

export async function loadSinglePrinter(
  supabase: SupabaseClient,
  organizationId: string,
  printerId: string,
  userId: string
): Promise<{
  printer: Printer | null;
  stationId: string | null;
  assignedSourceKeys: string[];
  defaultSourceKey: string | null;
  availableSources: CameraSourceRecord[];
  preferredDefaultSourceKey: string | null;
  preferredPrinterSourceKey: string | null;
  alert: Alert | null;
}> {
  const { printers, recentAlerts } = await loadRealPrinters(supabase, organizationId);
  const printer = printers.find((item) => item.id === printerId) ?? null;
  if (!printer) {
    return {
      printer: null,
      stationId: null,
      assignedSourceKeys: [],
      defaultSourceKey: null,
      availableSources: [],
      preferredDefaultSourceKey: null,
      preferredPrinterSourceKey: null,
      alert: null,
    };
  }

  const { data: stationRow } = await supabase
    .from("stations")
    .select("id,defaultCameraSourceKey")
    .eq("organizationId", organizationId)
    .eq("printerId", printerId)
    .maybeSingle();

  const typedStationRow = (stationRow ?? null) as StationRow | null;
  const stationId = typedStationRow?.id ?? null;
  let assignedSourceKeys: string[] = [];
  if (stationId) {
    const { data: stationCameraRows } = await supabase
      .from("stationCameras")
      .select("cameraSourceKey")
      .eq("organizationId", organizationId)
      .eq("stationId", stationId)
      .order("slotOrder", { ascending: true });

    assignedSourceKeys = ((stationCameraRows ?? []) as StationCameraRow[]).map(
      (item) => item.cameraSourceKey
    );
  }

  const { data: sourceRows } = await supabase
    .from("videoSources")
    .select("sourceKey,sourceType,displayName,sourceValue,isExternal,isNetwork")
    .eq("organizationId", organizationId)
    .order("createdAt", { ascending: true });

  const availableSources: CameraSourceRecord[] = ((sourceRows ?? []) as VideoSourceRow[]).map(
    (row) => ({
      sourceKey: row.sourceKey,
      sourceType: row.sourceType,
      displayName: row.displayName,
      sourceValue: row.sourceValue,
      isExternal: Boolean(row.isExternal),
      isNetwork: Boolean(row.isNetwork),
    })
  );

  const { preferredDefaultSourceKey, preferredPrinterSourceKey } = await getUserCameraPreference(
    supabase,
    userId,
    organizationId,
    printerId
  );

  const alert =
    recentAlerts.find(
      (item) =>
        item.printerId === printerId &&
        (item.type === "confirmed" || item.type === "warning")
    ) ?? null;

  return {
    printer,
    stationId,
    assignedSourceKeys,
    defaultSourceKey: typedStationRow?.defaultCameraSourceKey ?? null,
    availableSources,
    preferredDefaultSourceKey,
    preferredPrinterSourceKey,
    alert,
  };
}
