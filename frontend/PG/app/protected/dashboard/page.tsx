import {
  formatRelativeTime,
} from "@/lib/mock-data";
import { MetricCard } from "@/components/metric-card";
import { PrinterStatusCard } from "@/components/printer-status-card";
import {
  Printer,
  AlertTriangle,
  PauseCircle,
  Layers,
  Clock,
  TrendingDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";
import { redirect } from "next/navigation";

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

  const needsAttention = printers.filter(
    (item) => item.status === "danger" || item.status === "warning" || item.status === "paused"
  );

  return (
    <div className="p-6 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {context.activeOrganizationName ?? "Organization"} · {printers.length} printers
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Active"
          value={metrics.activePrinters}
          icon={<Printer size={14} />}
          status="neutral"
          subtext="printers monitoring"
        />
        <MetricCard
          label="Warnings"
          value={metrics.warnings}
          icon={<AlertTriangle size={14} />}
          status={metrics.warnings > 0 ? "warning" : "neutral"}
          subtext="need attention"
        />
        <MetricCard
          label="Paused"
          value={metrics.paused}
          icon={<PauseCircle size={14} />}
          status={metrics.paused > 0 ? "warning" : "neutral"}
          subtext="awaiting override"
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
          subtext="across all jobs"
        />
      </div>

      {needsAttention.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle size={14} className="text-pg-warning" />
            Needs Attention
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              ({needsAttention.length})
            </span>
          </h2>
          <div className="space-y-2">
            {needsAttention.map((item) => (
              <Link
                key={item.id}
                href={`/protected/printers/${item.id}`}
                className="bg-white rounded-[14px] border border-border flex items-stretch hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 group overflow-hidden"
              >
                <div
                  className={cn(
                    "w-36 sm:w-44 flex-shrink-0 flex items-center justify-center transition-colors",
                    item.status === "danger"
                      ? "bg-[#DF4A46]"
                      : item.status === "warning"
                        ? "bg-[#FAE6CE]"
                        : "bg-[#F1F2F4]"
                  )}
                >
                  {item.status === "danger" && (
                    <div className="flex items-center gap-2 bg-[#C23330] text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                      Failure
                    </div>
                  )}
                  {item.status === "warning" && (
                    <div className="flex items-center gap-2 bg-[#F0C995] text-[#8F5318] px-3 py-1.5 rounded-full text-sm font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8F5318] flex-shrink-0" />
                      Warning
                    </div>
                  )}
                  {item.status === "paused" && (
                    <div className="flex items-center gap-2 bg-[#E1E3E8] text-[#555C6A] px-3 py-1.5 rounded-full text-sm font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#555C6A] flex-shrink-0" />
                      Paused
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 p-4 sm:px-6 flex items-center justify-between bg-[hsl(0,80%,99%)] group-hover:bg-[hsl(0,80%,97%)] transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-[15px] truncate">{item.name}</p>
                    <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                      {item.detectedLabel !== "GOOD"
                        ? `${item.detectedLabel} - ${Math.round(item.confidence * 100)}% confidence`
                        : item.currentJob ?? "No active job"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-4 shrink-0 pr-2">
                    {formatRelativeTime(item.lastFrameAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">All Printers</h2>
            <Link
              href="/protected/fleet"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              Manage <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {printers.map((item) => (
              <PrinterStatusCard key={item.id} printer={item} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Detections</h2>
            <Link
              href="/protected/alerts"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              All <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {recentAlerts.slice(0, 4).map((item) => {
              const confidencePercent = Math.round(item.confidence * 100);
              const isHigh = item.confidence >= 0.85;
              const isMid = item.confidence >= 0.5 && !isHigh;
              return (
                <div
                  key={item.id}
                  className="bg-[hsl(0,80%,99%)] rounded-[14px] border p-4 space-y-2 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.printerName}</p>
                      <p className="text-[11px] text-muted-foreground">{formatRelativeTime(item.timestamp)}</p>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0",
                        isHigh
                          ? "text-pg-danger bg-danger-dim border-pg-danger/20"
                          : isMid
                            ? "text-pg-warning bg-warning-dim border-pg-warning/20"
                            : "text-muted-foreground bg-muted border-border"
                      )}
                    >
                      {confidencePercent}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono bg-background/50 px-1.5 py-0.5 rounded text-muted-foreground">
                      {item.defect}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] capitalize",
                        item.type === "confirmed"
                          ? "text-pg-danger"
                          : item.type === "warning"
                            ? "text-pg-warning"
                            : "text-muted-foreground"
                      )}
                    >
                      {item.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border p-5 space-y-3 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingDown size={12} />
                Failure Rate (30d)
              </span>
              <span className="font-bold text-pg-healthy">{(metrics.failureRate * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-pg-healthy rounded-full"
                style={{ width: `${metrics.failureRate * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Target: &lt;1%</p>
          </div>
        </section>
      </div>
    </div>
  );
}
