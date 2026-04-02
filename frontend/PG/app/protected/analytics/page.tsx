import { Layers, Clock, TrendingDown, BarChart3, Activity } from "lucide-react";
import { redirect } from "next/navigation";
import { SectionNav } from "@/components/section-nav";
import { cn } from "@/lib/utils";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";

interface PrintJobSummaryRow {
  printerId: string;
  fileName: string | null;
  jobStatus: string;
}

const sections = [
  { id: "savings", label: "Savings" },
  { id: "utilization", label: "Utilization" },
  { id: "failure-trends", label: "Failure Trends" },
  { id: "fleet-perf", label: "Fleet Performance" },
];

function StatCard({
  label,
  value,
  unit,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground mb-0.5">{unit}</span> : null}
      </div>
      {subtext ? <p className="text-xs text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
    </div>
  );
}

export default async function AnalyticsPage() {
  const context = await getProtectedContext();
  if (context.isDemoMode) {
    redirect("/demo/dashboard");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const [{ printers, metrics, recentAlerts }, jobsResult] = await Promise.all([
    loadRealPrinters(context.supabase, context.activeOrganizationId),
    context.supabase
      .from("printJobs")
      .select("printerId,fileName,jobStatus")
      .eq("organizationId", context.activeOrganizationId)
      .order("createdAt", { ascending: false })
      .limit(200),
  ]);

  const jobs = (jobsResult.data ?? []) as PrintJobSummaryRow[];
  const failedJobs = jobs.filter((job) => job.jobStatus === "failed" || job.jobStatus === "canceled").length;
  const completedJobs = jobs.filter((job) => job.jobStatus === "completed").length;

  const defectCounts: Record<string, number> = {};
  recentAlerts.forEach((alert) => {
    defectCounts[alert.defect] = (defectCounts[alert.defect] ?? 0) + 1;
  });
  const defectEntries = Object.entries(defectCounts).sort((left, right) => right[1] - left[1]);
  const maxDefectCount = defectEntries[0]?.[1] ?? 1;

  const printerPerfMap: Record<string, { passed: number; total: number }> = {};
  printers.forEach((printer) => {
    printerPerfMap[printer.name] = { passed: 0, total: 0 };
  });
  jobs.forEach((job) => {
    const printer = printers.find((candidate) => candidate.id === job.printerId);
    if (!printer) {
      return;
    }
    const current = printerPerfMap[printer.name] ?? { passed: 0, total: 0 };
    current.total += 1;
    if (job.jobStatus === "completed") {
      current.passed += 1;
    }
    printerPerfMap[printer.name] = current;
  });

  const printerPerf = Object.entries(printerPerfMap)
    .map(([name, summary]) => ({
      name,
      passed: summary.passed,
      total: summary.total,
      rate: summary.total > 0 ? summary.passed / summary.total : 0,
    }))
    .sort((left, right) => right.rate - left.rate);

  return (
    <div className="animate-fade-in">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <h1 className="text-lg font-bold text-foreground tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Operational performance, savings metrics, and fleet efficiency over time
        </p>
      </div>

      <SectionNav sections={sections} />

      <div className="px-6 py-8 space-y-12">
        <section id="savings" className="scroll-mt-20">
          <SectionHeader
            title="Waste Prevention & Savings"
            description="Rollup metrics derived from your current organization data"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Filament Saved"
              value={(metrics.totalFilamentSavedG / 1000).toFixed(2)}
              unit="kg"
              subtext="waste prevented"
              icon={Layers}
            />
            <StatCard
              label="Time Saved"
              value={Math.round(metrics.totalTimeSavedMin / 60)}
              unit="hrs"
              subtext="across all jobs"
              icon={Clock}
            />
            <StatCard
              label="Jobs Protected"
              value={failedJobs}
              subtext={`out of ${jobs.length} total`}
              icon={Activity}
            />
            <StatCard
              label="Success Rate"
              value={`${jobs.length > 0 ? Math.round((completedJobs / jobs.length) * 100) : 0}%`}
              subtext="jobs completed"
              icon={TrendingDown}
            />
          </div>
        </section>

        <section id="utilization" className="scroll-mt-20">
          <SectionHeader
            title="Fleet Utilization"
            description="Activity and throughput across printers in the active organization"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total Print Jobs" value={metrics.totalPrintJobs} subtext="all recorded" icon={BarChart3} />
            <StatCard label="Active Printers" value={metrics.activePrinters} subtext="monitoring now" icon={Activity} />
            <StatCard
              label="Fleet Failure Rate"
              value={`${(metrics.failureRate * 100).toFixed(1)}%`}
              subtext="confirmed incidents"
              icon={TrendingDown}
            />
          </div>
        </section>

        <section id="failure-trends" className="scroll-mt-20">
          <SectionHeader
            title="Failure Trends"
            description="Most common recent defect types across the fleet"
          />
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
                Defect frequency
              </p>
              {defectEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent defects recorded.</p>
              ) : (
                <div className="space-y-4">
                  {defectEntries.map(([defect, count]) => {
                    const percent = (count / maxDefectCount) * 100;
                    return (
                      <div key={defect} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-foreground">{defect}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {count} detection{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              defect === "SPAGHETTI" || defect === "DETACHMENT"
                                ? "bg-pg-danger"
                                : defect === "WARPING"
                                  ? "bg-pg-warning"
                                  : "bg-pg-paused"
                            )}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fleet failure rate
              </p>
              <div className="flex items-end gap-3">
                <span
                  className={cn(
                    "text-3xl font-bold tabular-nums",
                    metrics.failureRate < 0.05
                      ? "text-pg-healthy"
                      : metrics.failureRate < 0.15
                        ? "text-pg-warning"
                        : "text-pg-danger"
                  )}
                >
                  {(metrics.failureRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground mb-1">Target: &lt;10%</span>
              </div>
              <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    metrics.failureRate < 0.05
                      ? "bg-pg-healthy"
                      : metrics.failureRate < 0.15
                        ? "bg-pg-warning"
                        : "bg-pg-danger"
                  )}
                  style={{ width: `${Math.min(metrics.failureRate * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {failedJobs} failed jobs out of {jobs.length} tracked jobs.
              </p>
            </div>
          </div>
        </section>

        <section id="fleet-perf" className="scroll-mt-20">
          <SectionHeader
            title="Fleet Performance"
            description="Printer reliability ranked by completion rate"
          />
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_60px_60px_80px_100px] gap-4 px-4 py-2.5 border-b border-border bg-surface-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              <span>Printer</span>
              <span>Jobs</span>
              <span>Passed</span>
              <span>Pass Rate</span>
              <span>Reliability</span>
            </div>
            <div className="divide-y divide-border">
              {printerPerf.map(({ name, passed, total, rate }) => (
                <div
                  key={name}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_60px_60px_80px_100px] gap-2 sm:gap-4 px-4 py-3.5 hover:bg-surface-2 transition-colors"
                >
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground self-center tabular-nums">{total}</p>
                  <p className="text-xs text-muted-foreground self-center tabular-nums">{passed}</p>
                  <p
                    className={cn(
                      "text-xs font-medium self-center tabular-nums",
                      rate >= 0.8 ? "text-pg-healthy" : rate >= 0.5 ? "text-pg-warning" : "text-pg-danger"
                    )}
                  >
                    {Math.round(rate * 100)}%
                  </p>
                  <div className="self-center">
                    <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          rate >= 0.8 ? "bg-pg-healthy" : rate >= 0.5 ? "bg-pg-warning" : "bg-pg-danger"
                        )}
                        style={{ width: `${Math.max(rate * 100, 4)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
