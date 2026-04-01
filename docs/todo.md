# PrintGuard Unified To-Do

This is the implementation backlog for productionizing PrintGuard for industrial manufacturing users.

## Current Priority Snapshot
- `P0` Fix camera mesh data integrity and stream assignment reliability.
- `P0` Implement email + browser notifications end-to-end.
- `P0` Integrate YOLO inference with actionable controls.
- `P1` Complete industrial UX overhaul and remove remaining mock/demo bleed risk.
- `P1` Harden observability, resilience, and security.

---

## P0: Critical Product Functionality

### 1) Notifications: Email + Browser Push
- [x] Add initial `Guard this Print` email flow (camera-gated, placeholder YOLO running state).
- [ ] Build notification orchestration service in backend (`incident -> notificationEvents` pipeline).
- [ ] Implement email sender with provider abstraction (`Resend` or SMTP fallback), retries, and dead-letter status.
- [ ] Implement browser push notifications in frontend (permission flow + service worker + Supabase-backed preferences).
- [ ] Add user-level and printer-level notification preferences UI in settings.
- [ ] Add backend rate limits and deduplication window (prevent alert spam for same printer/incident burst).
- [ ] Add templates for `warning`, `confirmed`, `resolved` with printer name, org, confidence, and deep link.
- [ ] Add notification audit view (delivery history by channel/status).

Acceptance criteria:
- Confirmed incident triggers notification event(s) once per policy.
- Email and browser notifications can be independently toggled.
- Failed sends are retried and surfaced as `failed` with reason.

### 2) Camera Mesh Integrity + Persistence
- [ ] Enforce `stationCameras` insert/update rules everywhere (`videoSourceId` required, valid `slotOrder`, no collisions).
- [ ] Add backend/frontend transaction-safe assignment flow (`upsert videoSource -> assign stationCamera -> optional default`).
- [ ] Ensure printer detail only renders assigned cameras (never org-wide fallback if unassigned).
- [ ] Add explicit user-facing errors for camera add/update failures (not silent redirect loops).
- [ ] Add “Repair camera mesh” admin action to normalize slot ordering and orphaned rows.
- [ ] Add DB constraints + migration checks for `videoSources`/`stationCameras` consistency.

Acceptance criteria:
- No `videoSourceId NULL`, slot constraint, or unique-slot errors during normal add/delete/default operations.
- Refreshing the printer page always reflects persisted DB state.

### 3) YOLO Integration + Control Buttons
- [ ] Integrate YOLO inference worker service with per-source pipeline (local, RTSP, HTTP MJPEG).
- [ ] Add backend endpoints:
  - [ ] `POST /api/yolo/start` (single camera)
  - [ ] `POST /api/yolo/start-all-for-printer`
  - [ ] `POST /api/yolo/stop`
  - [ ] `GET /api/yolo/status`
- [ ] Add printer detail buttons:
  - [ ] `Start YOLO on Camera`
  - [ ] `Start YOLO on All Printer Cameras`
  - [ ] `Stop YOLO`
- [ ] Persist model config and thresholds (confidence, consecutive frames) by org and optional printer override.
- [ ] On confirmed failure, trigger action policy (`pause`, `emergencyStop`, `notifyOnly`).
- [ ] Store detections/incidents snapshots and timeline in Supabase.

Acceptance criteria:
- YOLO status is visible per camera in UI and backend.
- Confirmed detections create incidents and notifications using configured policy.

### 4) UI Reliability: “All Elements Work Correctly”
- [ ] Remove remaining broken/placeholder controls or wire them fully.
- [ ] Add optimistic UI + rollback + toast feedback for all mutation actions.
- [ ] Fix profile header identity mismatch (always show current logged-in user).
- [ ] Add explicit logout control in protected shell (desktop + mobile).
- [ ] Add loading, empty, and error states for every protected data panel.
- [ ] Add client/server validation for camera form by source type:
  - [ ] `local`: numeric index only
  - [ ] `rtsp`: valid `rtsp://`
  - [ ] `httpMjpeg`: valid `http(s)://`

Acceptance criteria:
- No silent failures in UI flows.
- Every failed action produces actionable feedback for user.

---

## P1: Industrial UX Overhaul (Manufacturing-Focused)

### 5) Visual/UX Redesign for Industrial Operators
- [ ] Redesign protected app shell for operator workflows (large status surfaces, quick triage, low cognitive load).
- [ ] Introduce role-aware dashboards (`operator`, `supervisor`, `admin`) with purpose-specific panels.
- [ ] Replace consumer-style styling with industrial visual language:
  - [ ] high-contrast safety color system
  - [ ] clear machine state hierarchy
  - [ ] compact dense tables for many printers
- [ ] Build “Control Room” view for 20+ printers with keyboard navigation and batch actions.
- [ ] Add “Shift Handoff” summary panel (new incidents, paused printers, unresolved alerts).
- [ ] Ensure mobile remains functional for alerts/acknowledgement, while desktop is primary ops surface.

Acceptance criteria:
- Operators can identify warning/danger printers in <5 seconds at fleet scale.
- Key actions (open printer, acknowledge alert, pause) are <=2 clicks.

### 6) Fleet Status Correctness + Idle Monitoring
- [ ] Move status reconciliation to backend scheduled job (not page-load dependent only).
- [ ] Define source of truth for printer state transitions (`running`, `idle`, `paused`, `offline`, `warning`, `danger`).
- [ ] Add stale heartbeat/offline detection by last telemetry/frame timestamp.
- [ ] Add status transition audit trail.

Acceptance criteria:
- Printer status updates without requiring manual page navigation.
- “Idle” vs “Monitoring” is accurate within target interval.

---

## P1: Security, Org Isolation, and Access

### 7) Auth + RLS + API Guard Hardening
- [ ] Confirm all camera/station/yolo endpoints require Supabase JWT.
- [ ] Enforce organization ownership checks on every resource read/write/stream.
- [ ] Add integration tests for cross-org denial (`403`) across all sensitive routes.
- [ ] Ensure demo mode remains fully isolated from real org data.

Acceptance criteria:
- No cross-org data access possible via frontend routes or backend direct calls.

---

## P2: Performance, Ops, and Quality

### 8) Performance + Scalability
- [ ] Profile and reduce protected route render time (remove redundant Supabase round-trips).
- [ ] Add caching strategy for stable read models (dashboard/fleet aggregates).
- [ ] Add pagination/virtualization for large incident and fleet tables.
- [ ] Evaluate streaming transport roadmap (MJPEG now, WebRTC/HLS later phase).

### 9) Observability + Incident Response
- [ ] Structured logs with correlation ids across frontend -> backend -> database.
- [ ] Add metrics (`cameraFps`, frame drop rate, yolo latency, notification latency).
- [ ] Add health dashboards and alerting for failed workers, notification backlog, and stream errors.

### 10) Testing + CI/CD
- [ ] Add backend unit/integration tests for camera actions, yolo lifecycle, notifications.
- [ ] Add frontend tests for camera setup flows and protected route data correctness.
- [ ] Add end-to-end smoke tests for core operator journey.
- [ ] Enforce lint/type/test gates in CI before merge.

---

## Data Model + Migration Backlog
- [ ] Add/verify migrations for notification preferences/events and incident queue triggers.
- [ ] Add DB function for slot normalization per station.
- [ ] Add index review for high-frequency printer/incident/detection queries.
- [ ] Add safe seed data script for demo org and realistic manufacturing fixtures.

---

## Documentation Backlog
- [ ] Update `docs/routeInfo.md` with YOLO and notification endpoints.
- [ ] Update `docs/newarchitecture.md` with inference worker and notification pipeline diagrams.
- [ ] Keep `docs/scope.md` synchronized after each major milestone.
- [ ] Add runbooks:
  - [ ] camera onboarding
  - [ ] yolo tuning
  - [ ] notification provider setup
  - [ ] incident escalation workflow

---

## Suggested Execution Order
1. Camera mesh reliability fixes + user-facing error feedback.
2. Notification pipeline (email first, then browser push).
3. YOLO controls and inference lifecycle.
4. Industrial UI overhaul and operator workflows.
5. Performance/observability/test hardening.
