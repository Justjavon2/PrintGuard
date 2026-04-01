import {
  MOCK_PRINTERS,
  MOCK_FLEET_METRICS,
  MOCK_ALERTS,
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

export default function DemoDashboardPage() {
  const printers = MOCK_PRINTERS;
  const metrics = MOCK_FLEET_METRICS;
  const recentAlerts = [...MOCK_ALERTS].slice(0, 10);

  const needsAttention = printers.filter(
    (item) => item.status === "danger" || item.status === "warning" || item.status === "paused"
  );

  return (
    <div className="p-6 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">Demo Organization · {printers.length} printers</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Active" value={metrics.activePrinters} icon={<Printer size={14} />} status="neutral" subtext="printers monitoring" />
        <MetricCard label="Warnings" value={metrics.warnings} icon={<AlertTriangle size={14} />} status={metrics.warnings > 0 ? "warning" : "neutral"} subtext="need attention" />
        <MetricCard label="Paused" value={metrics.paused} icon={<PauseCircle size={14} />} status={metrics.paused > 0 ? "warning" : "neutral"} subtext="awaiting override" />
        <MetricCard label="Filament Saved" value={(metrics.totalFilamentSavedG / 1000).toFixed(2)} unit="kg" icon={<Layers size={14} />} status="healthy" subtext="waste prevented" />
        <MetricCard label="Time Saved" value={Math.round(metrics.totalTimeSavedMin / 60)} unit="hrs" icon={<Clock size={14} />} status="healthy" subtext="across all jobs" />
      </div>

      {needsAttention.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle size={14} className="text-pg-warning" />
            Needs Attention
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">({needsAttention.length})</span>
          </h2>
          <div className="space-y-2">
            {needsAttention.map((item) => (
              <Link key={item.id} href={`/demo/printers/${item.id}`} className="bg-white rounded-[14px] border border-border flex items-stretch hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 group overflow-hidden">
                <div className={cn("w-36 sm:w-44 flex-shrink-0 flex items-center justify-center transition-colors", item.status === "danger" ? "bg-[#DF4A46]" : item.status === "warning" ? "bg-[#FAE6CE]" : "bg-[#F1F2F4]")}> 
                  <div className="flex items-center gap-2 bg-black/20 text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm">{item.status}</div>
                </div>
                <div className="flex-1 min-w-0 p-4 sm:px-6 flex items-center justify-between bg-[hsl(0,80%,99%)] group-hover:bg-[hsl(0,80%,97%)] transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-[15px] truncate">{item.name}</p>
                    <p className="text-[13px] text-muted-foreground truncate mt-0.5">{item.currentJob ?? "No active job"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-4 shrink-0 pr-2">{formatRelativeTime(item.lastFrameAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">All Printers</h2>
            <Link href="/demo/fleet" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">Manage <ChevronRight size={12} /></Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {printers.map((item) => (
              <PrinterStatusCard key={item.id} printer={item} basePath="/demo" />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Detections</h2>
            <Link href="/demo/alerts" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">All <ChevronRight size={12} /></Link>
          </div>
          <div className="space-y-2">
            {recentAlerts.slice(0, 4).map((item) => (
              <div key={item.id} className="bg-[hsl(0,80%,99%)] rounded-[14px] border p-4 space-y-2">
                <p className="text-xs font-medium text-foreground truncate">{item.printerName}</p>
                <p className="text-[11px] text-muted-foreground">{formatRelativeTime(item.timestamp)}</p>
              </div>
            ))}
          </div>
          <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground"><TrendingDown size={12} />Failure Rate (30d)</span>
              <span className="font-bold text-pg-healthy">{(metrics.failureRate * 100).toFixed(1)}%</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
