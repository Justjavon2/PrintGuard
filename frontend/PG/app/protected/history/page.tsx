import { History, Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { SectionNav } from "@/components/section-nav";
import { getProtectedContext } from "@/lib/data/context";
import { formatRelativeTime } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface PrintJobRow {
  id: string;
  fileName: string | null;
  jobStatus: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  printerId: string;
}

const sections = [
  { id: "recent", label: "Recent Jobs" },
  { id: "summary", label: "Summary" },
];

const statusLabelByKey: Record<string, string> = {
  running: "Running",
  queued: "Queued",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

export default async function HistoryPage() {
  const context = await getProtectedContext();
  if (context.isDemoMode) {
    redirect("/demo/history");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const { data: rows } = await context.supabase
    .from("printJobs")
    .select("id,fileName,jobStatus,startedAt,endedAt,createdAt,printerId")
    .eq("organizationId", context.activeOrganizationId)
    .order("createdAt", { ascending: false })
    .limit(100);

  const jobs = (rows ?? []) as PrintJobRow[];
  const completedCount = jobs.filter((job) => job.jobStatus === "completed").length;
  const failedCount = jobs.filter((job) => job.jobStatus === "failed").length;

  return (
    <div className="animate-fade-in">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <h1 className="text-lg font-bold text-foreground tracking-tight">Print History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Recent print job activity for {context.activeOrganizationName ?? "your organization"}
        </p>
      </div>

      <SectionNav sections={sections} />

      <div className="px-6 py-8 space-y-12">
        <section id="recent">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-foreground">Recent Jobs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest queue and completion activity
            </p>
          </div>
          {jobs.length === 0 ? (
            <EmptyState
              icon={<History size={32} />}
              title="No print history yet"
              description="Completed print jobs will appear here once printers begin reporting jobs."
            />
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="divide-y divide-border">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="px-4 py-3.5 hover:bg-surface-2 transition-colors flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {job.fileName ?? "Untitled Job"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(job.createdAt)} · Printer {job.printerId}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0",
                        job.jobStatus === "completed"
                          ? "text-pg-healthy bg-healthy-dim border-pg-healthy/20"
                          : job.jobStatus === "failed"
                            ? "text-pg-danger bg-danger-dim border-pg-danger/20"
                            : "text-muted-foreground bg-muted border-border"
                      )}
                    >
                      {statusLabelByKey[job.jobStatus] ?? job.jobStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section id="summary">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-foreground">Summary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fast health readout from recent print history
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide font-medium">
                <History size={13} />
                Total Jobs
              </div>
              <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{jobs.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide font-medium">
                <Clock3 size={13} />
                Completed
              </div>
              <p className="text-2xl font-bold text-pg-healthy mt-2 tabular-nums">{completedCount}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide font-medium">
                <Clock3 size={13} />
                Failed
              </div>
              <p className="text-2xl font-bold text-pg-danger mt-2 tabular-nums">{failedCount}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
