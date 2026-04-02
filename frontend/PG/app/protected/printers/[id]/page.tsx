import { notFound, redirect } from "next/navigation";
import { LiveFeedPanel } from "@/components/live-feed-panel";
import { DetectionConfidenceCard } from "@/components/detection-confidence-card";
import { IncidentEvidenceCard } from "@/components/incident-evidence-card";
import { ActionBar } from "@/components/action-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChevronLeft, Cpu, Camera } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getProtectedContext } from "@/lib/data/context";
import { loadSinglePrinter } from "@/lib/data/real-data";
import { CameraSourceForm } from "@/components/camera-source-form";
import {
  deleteCameraFromPrinterAction,
  startGuardForPrinterAction,
  setDefaultPrinterCameraAction,
} from "@/app/protected/printers/[id]/actions";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface CameraSelectionInfo {
  initialSelectedSourceKeys: string[];
  resolvedDefaultSourceKey: string | null;
}

function computeCameraSelection(
  assignedSourceKeys: string[],
  defaultSourceKey: string | null,
  preferredPrinterSourceKey: string | null,
  preferredDefaultSourceKey: string | null
): CameraSelectionInfo {
  const assignedSourceSet = new Set(assignedSourceKeys);

  const candidateDefault = [
    defaultSourceKey,
    preferredPrinterSourceKey,
    preferredDefaultSourceKey,
    assignedSourceKeys[0] ?? null,
  ].find((sourceKey) => sourceKey !== null && assignedSourceSet.has(sourceKey));

  const resolvedDefaultSourceKey = candidateDefault ?? null;

  const selectedSourceKeys = [...assignedSourceKeys];
  if (resolvedDefaultSourceKey && !selectedSourceKeys.includes(resolvedDefaultSourceKey)) {
    selectedSourceKeys.unshift(resolvedDefaultSourceKey);
  }

  return {
    initialSelectedSourceKeys: selectedSourceKeys.filter((sourceKey) => assignedSourceSet.has(sourceKey)),
    resolvedDefaultSourceKey,
  };
}

export default async function PrinterDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const context = await getProtectedContext();

  if (context.isDemoMode) {
    redirect(`/demo/printers/${id}`);
  }

  const activeOrganizationId = context.activeOrganizationId;
  if (!activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const printerResult = await loadSinglePrinter(
    context.supabase,
    activeOrganizationId,
    id,
    context.userId
  );

  if (!printerResult.printer) {
    notFound();
  }

  const { printer } = printerResult;
  const activeAlert = printerResult.alert;
  const guardStatus =
    typeof resolvedSearchParams.guardStatus === "string" ? resolvedSearchParams.guardStatus : null;
  const retryAfterSeconds =
    typeof resolvedSearchParams.retryAfterSeconds === "string"
      ? Number(resolvedSearchParams.retryAfterSeconds)
      : 0;
  const isActive = printer.status === "danger" || printer.status === "warning";
  const assignedSourceSet = new Set(printerResult.assignedSourceKeys);
  const assignedSources = printerResult.availableSources.filter((source) =>
    assignedSourceSet.has(source.sourceKey)
  );
  const cameraSelection = computeCameraSelection(
    printerResult.assignedSourceKeys,
    printerResult.defaultSourceKey,
    printerResult.preferredPrinterSourceKey,
    printerResult.preferredDefaultSourceKey
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link
          href="/protected/dashboard"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={14} />
          Dashboard
        </Link>
        <span className="text-muted-foreground/40 text-xs">/</span>
        <span className="text-xs text-foreground font-medium">{printer.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{printer.name}</h1>
          <p className="text-sm text-muted-foreground">{printer.model} · {printer.lab}</p>
        </div>
        <StatusBadge status={printer.status} />
      </div>

      {guardStatus === "sent" ? (
        <div className="rounded-lg border border-pg-healthy/30 bg-healthy-dim px-4 py-3 text-sm text-pg-healthy">
          Guard mode started and confirmation email sent.
        </div>
      ) : null}

      {guardStatus === "cooldown" ? (
        <div className="rounded-lg border border-pg-warning/30 bg-warning-dim px-4 py-3 text-sm text-pg-warning">
          Guard mode started, but email was skipped because of cooldown. Try again in about{" "}
          {Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).
        </div>
      ) : null}

      {isActive && (
        <div className={cn(
          "flex items-start gap-3 px-4 py-3 rounded-lg border text-sm animate-slide-up",
          printer.status === "danger"
            ? "bg-danger-dim border-pg-danger/40 text-pg-danger animate-pulse-ring"
            : "bg-warning-dim border-pg-warning/40 text-pg-warning"
        )}>
          <span className="font-semibold mt-px">
            {printer.status === "danger" ? "⚠ Confirmed Failure" : "⚠ Warning Detected"}
          </span>
          <span className="text-xs opacity-80">
            {printer.status === "danger"
              ? "3 consecutive failure frames confirmed. Immediate action recommended."
              : "Confidence is moderate. PrintGuard is monitoring for confirmation."}
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <LiveFeedPanel
            printer={printer}
            className="w-full"
            organizationId={activeOrganizationId}
            initialSources={assignedSources}
            initialSelectedSourceKeys={cameraSelection.initialSelectedSourceKeys}
            disableBackendSourceLoading={true}
            hideSourceControls={true}
          />

          {assignedSources.length === 0 ? (
            <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-dashed border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">No cameras assigned to this printer</p>
              <p className="text-xs text-muted-foreground">
                Add a source below to assign it to this printer and start streaming.
              </p>
            </div>
          ) : null}

          <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Camera Setup</p>
            <CameraSourceForm
              organizationId={activeOrganizationId}
              printerId={printer.id}
              printerName={printer.name}
            />
          </div>

          {assignedSources.length > 0 ? (
            <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned Cameras</p>
              <div className="space-y-2">
                {assignedSources.map((source) => (
                  <div key={source.sourceKey} className="border border-border rounded-lg p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{source.displayName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{source.sourceKey}</span> · {source.sourceType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={setDefaultPrinterCameraAction}>
                        <input type="hidden" name="organizationId" value={activeOrganizationId} />
                        <input type="hidden" name="printerId" value={printer.id} />
                        <input type="hidden" name="sourceKey" value={source.sourceKey} />
                        <button
                          type="submit"
                          className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent"
                        >
                          {cameraSelection.resolvedDefaultSourceKey === source.sourceKey ? "Default" : "Set as Default"}
                        </button>
                      </form>
                      <form action={deleteCameraFromPrinterAction}>
                        <input type="hidden" name="organizationId" value={activeOrganizationId} />
                        <input type="hidden" name="printerId" value={printer.id} />
                        <input type="hidden" name="sourceKey" value={source.sourceKey} />
                        <button
                          type="submit"
                          className="px-2.5 py-1 rounded-md border border-pg-danger/40 text-pg-danger text-xs hover:bg-danger-dim"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current Job</p>
              <p className="text-xs font-medium text-foreground truncate">{printer.currentJob ?? "None"}</p>
            </div>
            <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Progress</p>
              <p className="text-xs font-medium text-foreground">{printer.jobProgress}%</p>
            </div>
            <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Est. Time Left</p>
              <p className="text-xs font-medium text-foreground">
                {printer.estimatedTimeLeftMin > 0 ? `${printer.estimatedTimeLeftMin}m` : "—"}
              </p>
            </div>
          </div>

          <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-5">
            <p className="text-xs font-semibold text-foreground mb-3">Connection Health</p>
            <div className="grid grid-cols-2 gap-4 text-center">
              {[
                {
                  icon: <Camera size={14} />,
                  label: "Camera",
                  value: printer.cameraConnected ? "Connected" : "Offline",
                  ok: printer.cameraConnected,
                },
                {
                  icon: <Cpu size={14} />,
                  label: "Latency",
                  value: printer.latencyMs > 0 ? `${printer.latencyMs}ms` : "—",
                  ok: printer.latencyMs < 100,
                },
              ].map(({ icon, label, value, ok }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <span className={ok ? "text-pg-healthy" : "text-pg-danger"}>{icon}</span>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className={cn("text-xs font-medium", ok ? "text-pg-healthy" : "text-pg-danger")}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guard Controls</p>
            <form action={startGuardForPrinterAction} className="space-y-2">
              <input type="hidden" name="organizationId" value={activeOrganizationId} />
              <input
                type="hidden"
                name="organizationName"
                value={context.activeOrganizationName ?? activeOrganizationId}
              />
              <input type="hidden" name="printerId" value={printer.id} />
              <button
                type="submit"
                disabled={assignedSources.length < 1}
                className={cn(
                  "w-full px-3 py-2 rounded-md border text-xs font-semibold",
                  assignedSources.length < 1
                    ? "border-border text-muted-foreground cursor-not-allowed"
                    : "border-border hover:bg-accent text-foreground"
                )}
              >
                Guard this Print
              </button>
            </form>
            {assignedSources.length < 1 ? (
              <p className="text-[11px] text-muted-foreground">
                Assign at least one camera to this printer before starting guard mode.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Starts placeholder guard mode and sends you an email confirmation.
              </p>
            )}
          </div>
          <DetectionConfidenceCard printer={printer} />
          {activeAlert ? <IncidentEvidenceCard alert={activeAlert} /> : null}
          <ActionBar status={printer.status} printerId={printer.id} />
        </div>
      </div>
    </div>
  );
}
