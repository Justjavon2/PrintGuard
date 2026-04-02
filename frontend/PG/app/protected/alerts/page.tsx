import { Bell } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { IncidentEvidenceCard } from "@/components/incident-evidence-card";
import { SectionNav } from "@/components/section-nav";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";

const sections = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
];

export default async function AlertsPage() {
  const context = await getProtectedContext();
  if (context.isDemoMode) {
    redirect("/demo/alerts");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const { recentAlerts } = await loadRealPrinters(context.supabase, context.activeOrganizationId);
  const activeAlerts = recentAlerts.filter((alert) => alert.type === "warning" || alert.type === "confirmed");
  const resolvedAlerts = recentAlerts.filter((alert) => alert.type === "resolved");

  return (
    <div className="animate-fade-in">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <h1 className="text-lg font-bold text-foreground tracking-tight">Alert Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Live incident queue for {context.activeOrganizationName ?? "your organization"}
        </p>
      </div>

      <SectionNav sections={sections} />

      <div className="px-6 py-8 space-y-12">
        <section id="active">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-foreground">Active Incidents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Warnings and confirmed failures that still need operator review
            </p>
          </div>
          {activeAlerts.length === 0 ? (
            <EmptyState
              icon={<Bell size={32} />}
              title="No active incidents"
              description="Warnings and confirmed failures will appear here as detections are recorded."
            />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeAlerts.map((alert) => (
                <IncidentEvidenceCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </section>

        <section id="resolved">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-foreground">Resolved</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recent incidents already marked as resolved
            </p>
          </div>
          {resolvedAlerts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No resolved incidents yet.</div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {resolvedAlerts.map((alert) => (
                <IncidentEvidenceCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
