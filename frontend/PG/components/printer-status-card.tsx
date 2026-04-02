import Link from "next/link";
import { Camera, CameraOff } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { Printer } from "@/lib/mock-data";
import { formatRelativeTime } from "@/lib/mock-data";

interface PrinterStatusCardProps {
  printer: Printer;
  className?: string;
  basePath?: "/protected" | "/demo";
}

const statusBorderMap: Record<string, string> = {
  danger: "border-l-[3px] border-l-pg-danger",
  warning: "border-l-[3px] border-l-pg-warning",
  paused: "border-l-[3px] border-l-pg-paused",
  offline: "border-l-[3px] border-l-pg-offline",
  monitoring: "border-l-[3px] border-l-border",
  idle: "border-l-[3px] border-l-border",
};

export function PrinterStatusCard({
  printer,
  className,
  basePath = "/protected",
}: PrinterStatusCardProps) {
  const borderClass = statusBorderMap[printer.status] ?? statusBorderMap.monitoring;

  return (
    <Link href={`${basePath}/printers/${printer.id}`}>
      <div
        className={cn(
          "bg-card border border-border rounded-lg p-4 sm:p-5 flex flex-col gap-3",
          "cursor-pointer hover:bg-surface-2 hover:shadow-sm transition-all duration-150",
          borderClass,
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-[15px] tracking-tight truncate text-foreground">
              {printer.name}
            </p>
            <p className="text-[12px] truncate mt-0.5 text-muted-foreground">{printer.model}</p>
          </div>
          <StatusBadge status={printer.status} size="sm" />
        </div>

        {printer.currentJob ? (
          <div className="text-[13px] font-medium truncate text-foreground/80">{printer.currentJob}</div>
        ) : (
          <div className="text-[12px] italic text-muted-foreground">No active job</div>
        )}

        {printer.currentJob ? (
          <div className="w-full h-1 rounded-full overflow-hidden bg-surface-3">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                printer.status === "danger"
                  ? "bg-pg-danger"
                  : printer.status === "warning"
                    ? "bg-pg-warning"
                    : printer.status === "paused"
                      ? "bg-pg-paused"
                      : "bg-pg-healthy"
              )}
              style={{ width: `${printer.jobProgress}%` }}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <div className="flex items-center gap-2.5">
            {printer.cameraConnected ? (
              <Camera size={13} className="text-pg-healthy" />
            ) : (
              <CameraOff size={13} className="text-pg-offline opacity-60" />
            )}
          </div>
          <span className="tabular-nums">{formatRelativeTime(printer.lastFrameAt)}</span>
        </div>
      </div>
    </Link>
  );
}
