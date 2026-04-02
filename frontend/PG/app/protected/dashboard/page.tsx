import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Printer,
  AlertTriangle,
  PauseCircle,
  XOctagon,
  ChevronRight,
  Layers,
  Clock,
  TrendingDown,
  Activity,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PrinterStatusCard } from "@/components/printer-status-card";
import { SectionNav } from "@/components/section-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";
import { formatRelativeTime } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "attention", label: "Attention Needed" },
  { id: "fleet", label: "Fleet Status" },
  { id: "activity", label: "Recent Activity" },
];

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        {title}
        {typeof count === "number" ? (
          <span className="text-xs font-normal text-muted-foreground">({count})</span>
        ) : null}
      </h2>
      {action ? (
        <Link
          href={action.href}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {action.label} <ChevronRight size={12} />
        </Link>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const context = await getProtectedContext();
  if (context.isDemoMode) {
    redirect("/demo/dashboard");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const { printers, metrics, recentAlerts } = await loadRealPrinters(
    context.supabase,
    context.activeOrganizationId
  );

  const failureCount = printers.filter((printer) => printer.status === "danger").length;
  const activeCount = printers.filter((printer) => printer.status === "monitoring").length;
  const needsAttention = printers.filter((printer) =>
    ["danger", "warning", "paused"].includes(printer.status)
  );

  return (
    <div className="animate-fade-in">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Operations Overview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {context.activeOrganizationName ?? "Organization"} · {printers.length} printers
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <Activity size={12} />
            Live organization view
          </div>
        </div>
      </div>

      <SectionNav sections={sections} />

      <div className="px-6 py-8 space-y-12">
        <section id="overview">
          <SectionHeader title="Operational Overview" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <MetricCard
              label="Active"
              value={activeCount}
              icon={<Printer size={14} />}
              status="neutral"
              subtext="monitoring"
            />
            <MetricCard
              label="Paused"
              value={metrics.paused}
              icon={<PauseCircle size={14} />}
              status={metrics.paused > 0 ? "paused" : "neutral"}
              subtext="awaiting override"
            />
            <MetricCard
              label="Warnings"
              value={metrics.warnings}
              icon={<AlertTriangle size={14} />}
              status={metrics.warnings > 0 ? "warning" : "neutral"}
              subtext="need attention"
            />
            <MetricCard
              label="Failures"
              value={failureCount}
              icon={<XOctagon size={14} />}
              status={failureCount > 0 ? "danger" : "neutral"}
              subtext="confirmed incidents"
            />
            <MetricCard
              label="Filament Saved"
              value={(metrics.totalFilamentSavedG / 1000).toFixed(2)}
              unit="kg"
              icon={<Layers size={14} />}
              status="healthy"
              subtext="waste prevented"
            />
            <MetricCard
              label="Time Saved"
              value={Math.round(metrics.totalTimeSavedMin / 60)}
              unit="hrs"
              icon={<Clock size={14} />}
              status="healthy"
              subtext="recovered runtime"
            />
            <MetricCard
              label="Failure Rate"
              value={`${(metrics.failureRate * 100).toFixed(1)}%`}
              icon={<TrendingDown size={14} />}
              status={metrics.failureRate > 0.1 ? "warning" : "healthy"}
              subtext="30 day estimate"
            />
          </div>
        </section>

        <section id="attention">
          <SectionHeader
            title="Attention Needed"
            count={needsAttention.length}
            action={
              needsAttention.length > 0
                ? { label: "View Alerts", href: "/protected/alerts" }
                : undefined
            }
          />
          {needsAttention.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <span className="w-2 h-2 rounded-full bg-pg-healthy" />
              All printers are stable. No active issues require intervention.
            </div>
          ) : (
            <div className="space-y-2">
              {needsAttention.map((printer) => (
                <Link
                  key={printer.id}
                  href={`/protected/printers/${printer.id}`}
                  className={cn(
                    "flex items-stretch bg-card border border-border rounded-lg overflow-hidden",
                    "hover:bg-surface-2 hover:shadow-sm transition-all duration-150 group"
                  )}
                >
                  <div
                    className={cn(
                      "w-1 shrink-0",
                      printer.status === "danger"
                        ? "bg-pg-danger"
                        : printer.status === "warning"
                          ? "bg-pg-warning"
                          : "bg-pg-paused"
                    )}
                  />
                  <div className="flex-1 min-w-0 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{printer.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {printer.detectedLabel !== "GOOD"
                          ? `${printer.detectedLabel} · ${Math.round(printer.confidence * 100)}% confidence`
                          : printer.currentJob ?? "No active job"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={printer.status} size="sm" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatRelativeTime(printer.lastFrameAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="fleet">
          <SectionHeader
            title="Fleet Status"
            count={printers.length}
            action={{ label: "Manage Fleet", href: "/protected/fleet" }}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {printers.map((printer) => (
              <PrinterStatusCard key={printer.id} printer={printer} />
            ))}
          </div>
        </section>

        <section id="activity">
          <SectionHeader
            title="Recent Detections"
            count={recentAlerts.length}
            action={{ label: "All Alerts", href: "/protected/alerts" }}
          />
          <div className="space-y-2">
            {recentAlerts.slice(0, 6).map((alert) => {
              const confidencePercent = Math.round(alert.confidence * 100);
              const isHigh = alert.confidence >= 0.85;
              const isMid = alert.confidence >= 0.5 && !isHigh;
              return (
                <div
                  key={alert.id}
                  className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        isHigh ? "bg-pg-danger" : isMid ? "bg-pg-warning" : "bg-muted-foreground"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{alert.printerName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{alert.defect}</span> · {alert.lab}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded border",
                        isHigh
                          ? "text-pg-danger bg-danger-dim border-pg-danger/20"
                          : isMid
                            ? "text-pg-warning bg-warning-dim border-pg-warning/20"
                            : "text-muted-foreground bg-muted border-border"
                      )}
                    >
                      {confidencePercent}%
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatRelativeTime(alert.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
