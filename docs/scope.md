# PrintGuard Scope Tracking

## End Goal

Deliver a scalable, real-time printer monitoring platform where users can:
- Monitor many camera feeds per printer or per fleet.
- Detect print failures quickly and act (pause/stop) with minimal delay.
- Prefer laptop/built-in camera by default on macOS while optionally enabling iPhone/external cameras.

## Current Scope (In Progress)

- Camera source expansion:
  - Local cameras
  - `RTSP` network cameras
  - `HTTP MJPEG` network cameras
- Camera preference persistence:
  - Persisted organization camera source records in Supabase (`videoSources`)
  - Persisted station-level default source in Supabase (`stations.defaultCameraSourceKey`)
  - User preference history persisted via `auditLogs` (`pref:setCameraDefault`)
- Multi-camera station model:
  - `cameraSourceKeys[]`
  - `defaultCameraSourceKey`
- Frontend monitor UX:
  - Two concurrent feeds visible
  - Sliding window navigation for larger camera sets (`1+2`, `2+3`, `3+4`)
  - Source assignment controls (`Use As Cam 1`, `Use As Cam 2`, `Set As Default Camera`)
  - Manual camera setup on printer detail page (laptop `local:0`, RTSP, HTTP MJPEG)
  - Demo pages preserved under data mode switching (`demo` / `real`)
  - Active organization context switching for multi-org users

## Out of Scope For This Phase

- WebRTC/HLS streaming transport migration.
- YOLO live inference pipeline activation (placeholder analysis endpoint remains).

## Core Moving Parts

- `backend/routers/video.py`: source listing/registration, stream/snapshot, preferences.
- `backend/services/supabaseAuth.py`: Supabase token validation and organization access checks for video/station routes.
- `backend/services/videoSourceRegistry.py`: source normalization + preferences persistence.
- `backend/services/cameraManager.py`: worker lifecycle keyed by `sourceKey`.
- `backend/services/stationRegistry.py` + `backend/routers/stations.py`: multi-camera station CRUD and stream/snapshot access.
- `frontend/PG/lib/data/context.ts`: active org + data mode resolution.
- `frontend/PG/lib/data/real-data.ts`: typed Supabase query adapters for dashboard/fleet/printer detail.
- `frontend/PG/app/protected/printers/[id]/actions.ts`: camera source setup and station default persistence.
- `frontend/PG/components/live-feed-panel.tsx`: dual-feed rendering and authenticated stream URL composition.

## Scope Guardrails

- Preserve backward compatibility for legacy `sourceId` query usage while frontend migrates.
- Keep MJPEG streaming path stable while introducing source management capabilities.
- Keep camera selection behavior deterministic with preference-first fallback logic.
