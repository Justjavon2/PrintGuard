import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, CameraOff, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";
import { formatRelativeTime } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default async function FleetPage() {
  const context = await getProtectedContext();
  if (context.isDemoMode) {
    redirect("/demo/fleet");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const printers = (await loadRealPrinters(context.supabase, context.activeOrganizationId)).printers;
  const labs = [...new Set(printers.map((printer) => printer.lab))];

  return (
    <div className="p-6 space-y-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Fleet Management</h1>
          <p className="text-sm text-muted-foreground">
            {printers.length} printers across {labs.length} labs
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={14} />
          Add Printer
        </button>
      </div>

      {labs.map((lab) => {
        const labPrinters = printers.filter((printer) => printer.lab === lab);
        return (
          <section key={lab} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{lab}</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_120px_90px_120px_80px] gap-4 px-4 py-2.5 border-b border-border bg-surface-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                <span>Printer</span>
                <span>Status</span>
                <span className="flex items-center gap-1">
                  <Camera size={10} />
                  Camera
                </span>
                <span>Last Frame</span>
                <span>Actions</span>
              </div>
              <div className="divide-y divide-border">
                {labPrinters.map((printer) => (
                  <div
                    key={printer.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_120px_90px_120px_80px] gap-2 sm:gap-4 px-4 py-3.5 hover:bg-surface-2 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{printer.name}</p>
                      <p className="text-[11px] text-muted-foreground">{printer.model}</p>
                    </div>

                    <div className="self-center">
                      <StatusBadge status={printer.status} size="sm" />
                    </div>

                    <div className="self-center flex items-center gap-1.5 text-xs">
                      {printer.cameraConnected ? (
                        <Camera size={13} className="text-pg-healthy" />
                      ) : (
                        <CameraOff size={13} className="text-pg-offline" />
                      )}
                      <span
                        className={cn(
                          "text-[11px]",
                          printer.cameraConnected ? "text-pg-healthy" : "text-pg-offline"
                        )}
                      >
                        {printer.cameraConnected ? "OK" : "Off"}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground self-center">
                      {formatRelativeTime(printer.lastFrameAt)}
                    </p>

                    <div className="self-center">
                      <Link
                        href={`/protected/printers/${printer.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Monitor →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
