import { EmptyState } from "@/components/empty-state";
import { History } from "lucide-react";
import { getProtectedContext } from "@/lib/data/context";
import { redirect } from "next/navigation";
import { formatRelativeTime } from "@/lib/mock-data";

interface PrintJobRow {
  id: string;
  fileName: string | null;
  jobStatus: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  printerId: string;
}

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

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Print History</h1>
        <p className="text-sm text-muted-foreground">Recent print jobs from your organization</p>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<History size={32} />}
          title="No print history yet"
          description="Completed print jobs will appear here once your printers begin reporting jobs."
        />
      ) : (
        <div className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border overflow-hidden shadow-sm">
          <div className="divide-y divide-border">
            {jobs.map((job) => (
              <div key={job.id} className="px-4 py-3.5 hover:bg-surface-2 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{job.fileName ?? "Untitled Job"}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelativeTime(job.createdAt)} · Printer {job.printerId}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded border text-muted-foreground bg-muted border-border">
                    {statusLabelByKey[job.jobStatus] ?? job.jobStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
