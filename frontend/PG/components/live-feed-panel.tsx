"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Printer } from "@/lib/mock-data";
import { formatRelativeTime, getConfidenceLevel } from "@/lib/mock-data";
import { StatusBadge } from "@/components/ui/status-badge";
import { Wifi, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { useOptionalSupabase } from "@/components/supabase-provider";

interface VideoSource {
  sourceKey: string;
  sourceType: "local" | "rtsp" | "httpMjpeg";
  displayName: string;
  sourceValue: string;
  isExternal: boolean;
  isNetwork: boolean;
}

interface VideoPreferences {
  preferredDefaultSourceKey: string | null;
  preferredByPrinterId: Record<string, string>;
}

interface LiveFeedPanelProps {
  printer: Printer;
  className?: string;
  organizationId?: string | null;
  streamPrinterId?: string | null;
  initialSources?: VideoSource[];
  initialSelectedSourceKeys?: string[];
  disableBackendSourceLoading?: boolean;
  hideSourceControls?: boolean;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function chooseBestDefaultSource(
  sources: VideoSource[],
  preferences: VideoPreferences | null,
  printerId: string
): string | null {
  if (sources.length === 0) {
    return null;
  }
  const printerDefault = preferences?.preferredByPrinterId?.[printerId];
  if (printerDefault && sources.some((item) => item.sourceKey === printerDefault)) {
    return printerDefault;
  }
  const globalDefault = preferences?.preferredDefaultSourceKey;
  if (globalDefault && sources.some((item) => item.sourceKey === globalDefault)) {
    return globalDefault;
  }
  const localNonExternal = sources.find((item) => item.sourceType === "local" && !item.isExternal);
  if (localNonExternal) {
    return localNonExternal.sourceKey;
  }
  return sources[0].sourceKey;
}

function orderedSourceKeys(sources: VideoSource[], defaultKey: string | null): string[] {
  if (sources.length === 0) {
    return [];
  }
  if (!defaultKey) {
    return sources.map((item) => item.sourceKey);
  }
  const defaultSource = sources.find((item) => item.sourceKey === defaultKey);
  const others = sources.filter((item) => item.sourceKey !== defaultKey);
  if (!defaultSource) {
    return others.map((item) => item.sourceKey);
  }
  return [defaultSource.sourceKey, ...others.map((item) => item.sourceKey)];
}

export function LiveFeedPanel({
  printer,
  className,
  organizationId = null,
  streamPrinterId = printer.id,
  initialSources = [],
  initialSelectedSourceKeys = [],
  disableBackendSourceLoading = false,
  hideSourceControls = false,
}: LiveFeedPanelProps) {
  const supabase = useOptionalSupabase();
  const confLevel = getConfidenceLevel(printer.confidence);
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<string[]>([]);
  const [windowStart, setWindowStart] = useState<number>(0);
  const [loadingSources, setLoadingSources] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const feedBorder = {
    danger: "border-pg-danger/60 glow-danger",
    warning: "border-pg-warning/50 glow-warning",
    healthy: "border-pg-healthy/30 glow-healthy",
  }[confLevel];

  useEffect(() => {
    let isCancelled = false;

    async function loadSessionToken() {
      if (supabase === null) {
        setAccessToken(null);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (isCancelled) {
        return;
      }
      setAccessToken(data.session?.access_token ?? null);
    }

    loadSessionToken();
    const subscription =
      supabase === null
        ? null
        : supabase.auth.onAuthStateChange((_event, session) => {
            setAccessToken(session?.access_token ?? null);
          }).data.subscription;

    return () => {
      isCancelled = true;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [supabase]);

  useEffect(() => {
    if (disableBackendSourceLoading) {
      setSources(initialSources);
      setSelectedSourceKeys(initialSelectedSourceKeys);
      setWindowStart(0);
      setLoadingSources(false);
      setLoadingError(null);
      return;
    }

    let isCancelled = false;

    async function loadSources() {
      try {
        setLoadingSources(true);
        setLoadingError(null);
        const authHeaders: HeadersInit =
          accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` };
        const organizationQuery =
          organizationId === null ? "" : `&organizationId=${encodeURIComponent(organizationId)}`;
        const [sourcesResponse, preferencesResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/video/sources?maxSources=8${organizationQuery}`, {
            headers: authHeaders,
          }),
          fetch(`${apiBaseUrl}/api/video/preferences`, {
            headers: authHeaders,
          }),
        ]);
        if (!sourcesResponse.ok) {
          throw new Error("Unable to load camera sources");
        }

        const sourcesPayload = (await sourcesResponse.json()) as VideoSource[];
        const preferencesPayload = preferencesResponse.ok
          ? ((await preferencesResponse.json()) as VideoPreferences)
          : null;
        const defaultKey = chooseBestDefaultSource(sourcesPayload, preferencesPayload, printer.id);
        const orderedKeys = orderedSourceKeys(sourcesPayload, defaultKey);

        if (!isCancelled) {
          setSources(sourcesPayload);
          setSelectedSourceKeys(orderedKeys);
          setWindowStart(0);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadingError(error instanceof Error ? error.message : "Failed to load cameras");
          setSources([]);
          setSelectedSourceKeys([]);
        }
      } finally {
        if (!isCancelled) {
          setLoadingSources(false);
        }
      }
    }

    loadSources();
    return () => {
      isCancelled = true;
    };
  }, [
    accessToken,
    disableBackendSourceLoading,
    initialSelectedSourceKeys,
    initialSources,
    organizationId,
    printer.id,
  ]);

  const visibleSourceKeys = useMemo(() => {
    if (selectedSourceKeys.length === 0) {
      return [] as string[];
    }
    if (selectedSourceKeys.length === 1) {
      return [selectedSourceKeys[0]];
    }
    const firstKey = selectedSourceKeys[windowStart % selectedSourceKeys.length];
    const secondKey = selectedSourceKeys[(windowStart + 1) % selectedSourceKeys.length];
    return [firstKey, secondKey];
  }, [selectedSourceKeys, windowStart]);

  const visibleSources = visibleSourceKeys
    .map((key) => sources.find((item) => item.sourceKey === key))
    .filter((item): item is VideoSource => item !== undefined);

  async function persistDefaultCamera(sourceKey: string) {
    const payload = {
      preferredDefaultSourceKey: sourceKey,
      preferredByPrinterId: {
        [printer.id]: sourceKey,
      },
    };
    if (!accessToken) {
      return;
    }
    await fetch(`${apiBaseUrl}/api/video/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  function assignSourceToSlot(sourceKey: string, slotNumber: 1 | 2) {
    setSelectedSourceKeys((previousKeys) => {
      if (previousKeys.includes(sourceKey)) {
        const sourceIndex = previousKeys.indexOf(sourceKey);
        const nextStartIndex =
          slotNumber === 1
            ? sourceIndex
            : (sourceIndex - 1 + previousKeys.length) % previousKeys.length;
        setWindowStart(nextStartIndex);
        return previousKeys;
      }
      const nextKeys = [...previousKeys, sourceKey];
      const sourceIndex = nextKeys.indexOf(sourceKey);
      const nextStartIndex = slotNumber === 1 ? sourceIndex : Math.max(sourceIndex - 1, 0);
      setWindowStart(nextStartIndex);
      return nextKeys;
    });
  }

  return (
    <div className={cn("bg-[hsl(0,80%,99%)] rounded-[14px] border border-border overflow-hidden flex flex-col shadow-sm", feedBorder, className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-pg-danger animate-pulse" />
          <span className="font-medium uppercase tracking-wide">Live Feeds</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Wifi size={11} />
            {printer.latencyMs}ms
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatRelativeTime(printer.lastFrameAt)}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border bg-card/30">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {visibleSources.length} of {selectedSourceKeys.length || 0} selected feeds
          </p>
          <button
            type="button"
            onClick={() => setWindowStart((value) => (selectedSourceKeys.length > 0 ? (value + 1) % selectedSourceKeys.length : 0))}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs font-medium hover:bg-accent"
            disabled={selectedSourceKeys.length < 2}
          >
            Next
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 bg-[hsl(220_14%_5%)] min-h-[280px]">
        {loadingSources ? (
          <div className="col-span-full flex items-center justify-center text-xs text-muted-foreground">
            Loading camera sources...
          </div>
        ) : null}
        {loadingError ? (
          <div className="col-span-full flex items-center justify-center text-xs text-pg-danger">
            {loadingError}
          </div>
        ) : null}
        {!loadingSources && !loadingError && visibleSources.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-2 text-muted-foreground/50 justify-center">
            <p className="text-xs font-medium">No camera feed</p>
            <p className="text-[11px]">No available camera sources were detected</p>
          </div>
        ) : null}

        {visibleSources.map((source, sourceIndex) => (
          <div key={source.sourceKey} className="relative rounded-lg overflow-hidden border border-border/30 bg-black min-h-[230px]">
            <img
              src={`${apiBaseUrl}/api/video/stream?sourceKey=${encodeURIComponent(source.sourceKey)}${streamPrinterId ? `&printerId=${encodeURIComponent(streamPrinterId)}` : ""}${organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ""}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`}
              alt={`Live Camera Feed for ${printer.name} (${source.displayName})`}
              className="absolute inset-0 w-full h-full object-cover z-10"
            />
            <div className="live-scan absolute inset-0 z-20 pointer-events-none" />
            <div className="absolute top-2 left-2 z-30 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white font-medium">
              Cam {sourceIndex + 1}: {source.displayName}
            </div>
            {printer.status !== "monitoring" && printer.status !== "idle" ? (
              <div className={cn(
                "absolute top-2 right-2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm border",
                printer.status === "danger" ? "bg-pg-danger/20 border-pg-danger/50 text-pg-danger" :
                  printer.status === "warning" ? "bg-pg-warning/20 border-pg-warning/50 text-pg-warning" :
                    printer.status === "paused" ? "bg-pg-paused/20 border-pg-paused/50 text-pg-paused" : ""
              )}>
                <AlertTriangle size={10} />
                {printer.detectedLabel !== "GOOD" ? printer.detectedLabel : printer.status.toUpperCase()}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {!hideSourceControls ? (
        <div className="px-4 py-3 border-t border-border bg-card/60">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Camera Controls</p>
        <div className="flex flex-wrap gap-2">
          {sources.map((source) => (
            <div key={source.sourceKey} className="inline-flex items-center gap-1.5 border border-border rounded-md px-2 py-1 bg-background">
              <span className="text-[11px] font-medium">{source.displayName}</span>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                onClick={() => assignSourceToSlot(source.sourceKey, 1)}
              >
                Use As Cam 1
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                onClick={() => assignSourceToSlot(source.sourceKey, 2)}
              >
                Use As Cam 2
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                onClick={() => persistDefaultCamera(source.sourceKey)}
              >
                Set As Default Camera
              </button>
            </div>
          ))}
        </div>
      </div>
      ) : null}

      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground bg-card/60">
        <div className="flex items-center gap-2">
          <StatusBadge status={printer.status} size="sm" />
          {printer.currentJob ? (
            <span className="truncate max-w-[140px]">{printer.currentJob}</span>
          ) : null}
        </div>
        {printer.currentJob ? <span className="font-medium text-foreground">{printer.jobProgress}%</span> : null}
      </div>
    </div>
  );
}
