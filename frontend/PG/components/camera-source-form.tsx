"use client";

import { useMemo, useState } from "react";
import { addCameraSourceForPrinterAction } from "@/app/protected/printers/[id]/actions";

type SourceType = "local" | "rtsp" | "httpMjpeg";

interface CameraSourceFormProps {
  organizationId: string;
  printerId: string;
  printerName: string;
}

export function CameraSourceForm({
  organizationId,
  printerId,
  printerName,
}: CameraSourceFormProps) {
  const [sourceType, setSourceType] = useState<SourceType>("local");
  const [localIndex, setLocalIndex] = useState<string>("0");
  const [displayName, setDisplayName] = useState<string>("");

  const resolvedLocalIndex = useMemo(() => {
    const parsed = Number(localIndex);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }, [localIndex]);

  const localSourceKey = `local:${resolvedLocalIndex}`;
  const localSourceValue = String(resolvedLocalIndex);

  return (
    <form
      action={addCameraSourceForPrinterAction}
      className="space-y-3 border border-border rounded-lg p-4 bg-background/70"
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="printerId" value={printerId} />
      <input type="hidden" name="printerName" value={printerName} />

      <div>
        <label className="text-[11px] text-muted-foreground">Source Type</label>
        <select
          name="sourceType"
          value={sourceType}
          onChange={(event) => setSourceType(event.target.value as SourceType)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="local">Local (Mac / USB Camera)</option>
          <option value="rtsp">RTSP</option>
          <option value="httpMjpeg">HTTP MJPEG</option>
        </select>
      </div>

      {sourceType === "local" ? (
        <>
          <div>
            <label className="text-[11px] text-muted-foreground">Local Camera Index</label>
            <input
              type="number"
              min={0}
              value={localIndex}
              onChange={(event) => setLocalIndex(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <input type="hidden" name="sourceKey" value={localSourceKey} />
          <input type="hidden" name="sourceValue" value={localSourceValue} />
        </>
      ) : (
        <>
          <div>
            <label className="text-[11px] text-muted-foreground">Source Key</label>
            <input
              name="sourceKey"
              placeholder="net:cam-01"
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              required
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">
              Source URL ({sourceType === "rtsp" ? "rtsp://..." : "http(s)://..."})
            </label>
            <input
              name="sourceValue"
              placeholder={sourceType === "rtsp" ? "rtsp://..." : "http://.../mjpeg"}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              required
            />
          </div>
        </>
      )}

      <div>
        <label className="text-[11px] text-muted-foreground">Display Name (optional)</label>
        <input
          name="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={sourceType === "local" ? `Local Camera ${resolvedLocalIndex}` : "Camera label"}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
      </div>

      <div className="flex items-center gap-2">
        <input id="setAsDefault" name="setAsDefault" type="checkbox" value="true" className="w-3.5 h-3.5" />
        <label htmlFor="setAsDefault" className="text-[11px] text-muted-foreground">Set as default camera</label>
      </div>

      <button
        type="submit"
        className="w-full px-3 py-2 rounded-md border border-border text-xs font-medium hover:bg-accent"
      >
        Add Camera Source
      </button>
    </form>
  );
}
