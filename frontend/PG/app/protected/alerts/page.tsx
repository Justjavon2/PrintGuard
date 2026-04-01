import { EmptyState } from "@/components/empty-state";
import { IncidentEvidenceCard } from "@/components/incident-evidence-card";
import { Bell } from "lucide-react";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";
import { redirect } from "next/navigation";

export default async function AlertsPage() {
  const context = await getProtectedContext();
  if (context.isDemoMode) {
    redirect("/demo/alerts");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const { recentAlerts } = await loadRealPrinters(context.supabase, context.activeOrganizationId);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Alert Center</h1>
        <p className="text-sm text-muted-foreground">Live incidents for your active organization</p>
      </div>

      {recentAlerts.length === 0 ? (
        <EmptyState
          icon={<Bell size={32} />}
          title="No active incidents"
          description="Incidents and warning snapshots will appear here when detections are recorded."
        />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {recentAlerts.map((alert) => (
            <IncidentEvidenceCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
