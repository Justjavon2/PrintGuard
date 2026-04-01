# Frontend Architecture & Route Information

This document provides a breakdown of each page in the PrintGuard frontend application, its main purpose, and the key UI elements it renders to the user.

## Core Application Pages (`/protected/*`)

### 1. Dashboard (`/protected/dashboard`)
**Purpose:** The main overview screen that users see upon logging in. It gives a high-level summary of the entire 3D printing fleet and surfaces immediate problems.
**Important Elements:**
- **Fleet Metrics Row:** 5 key metric cards showing Active Printers, Warnings, Paused Printers, Filament Saved (kg), and Time Saved (hrs).
- **Needs Attention:** A prominent banner list showing only printers currently in "Danger" (Failure), "Warning", or "Paused" states.
- **Printer Grid & Recent Detections:** Two columns. The left column surfaces a grid of `PrinterStatusCard` items for the entire fleet, and the right column lists recent AI detection alerts and a "Failure Rate (30d)" bar chart.

### 2. Fleet Management (`/protected/fleet`)
**Purpose:** A detailed administrative view of all connected printers, organized by physical laboratory grouping.
**Important Elements:**
- **Grouped Laboratory Tables:** Printers are grouped by their physical `lab` (e.g., "DSU Makerspace").
- **Table Data:** Displays connection health for each printer's camera feed and the timestamp of the last captured frame.
- **Add Printer Button:** CTA for registering new printers to the PrintGuard system.

### 3. Individual Printer Detail (`/protected/printers/[id]`)
**Purpose:** Deep-dive monitoring for a specific printer. Used to inspect a live broadcast and manually take action if the AI has flagged an issue.
**Important Elements:**
- **Status Banners:** Pulsing emergency banners that appear at the top of the page if a failure or warning is currently active.
- **LiveFeedPanel:** The central video feed streaming real-time MJPEG data from the backend's `/api/video/stream` endpoint, bypassing the mock placeholder.
- **Job Info & Connection Health:** Sub-panels showing the active G-code file, job progress (%), estimated time remaining, and latency ping of the connection.
- **ActionBar:** Control buttons to remotely "Pause" or "Emergency Stop" the printer if spaghetti/failure is spotted.
- **DetectionConfidenceCard:** A localized view of the AI's confidence percentages for that specific camera stream.

### 4. Alert Center (`/protected/alerts`)
**Purpose:** An aggregated inbox of all AI-detected incidents, including false positives and resolved warnings.
**Important Elements:**
- **Segmented Tabs:** Filter incidents by `Warnings`, `Confirmed`, and `Resolved`.
- **IncidentEvidenceCard:** Complex cards showing a snapshot frame of the failure, the timestamp, the defect type (e.g. Spaghetti vs Warping), and the AI's confidence rating.

### 5. Print History (`/protected/history`)
**Purpose:** An audit log of all completed, failed, or canceled print jobs. Used for waste tracking and analyzing long-term fleet performance.
**Important Elements:**
- **History Table:** Lists the job name, printer name, job status (Passed, Failed, Paused, Warned), duration, and filament saved.
- **False Positive CTA:** A "Thumbs Down" button allowing users to flag incorrect AI warnings to iteratively improve the PrintGuard model over time.

### 6. Settings (`/protected/settings`)
**Purpose:** User account configuration, alert preferences, and organization-wide settings.
**Important Elements:**
- **Profile & Auth:** Update display names, emails, and link Google OAuth.
- **Notification Toggles:** Toggle switches for Email alerts, SMS, and Browser Push Notifications based on warning severity.
- **Detection Sensitivity Slider:** Configuration for the minimum confidence threshold required before an alert is dispatched (Currently fixed placeholder in UI).

---

## Authentication Pages (`/auth/*`)

*Note: These pages utilize standard Supabase `@supabase/ssr` components.*

- **Login (`/auth/login`):** Standard email/password entry form to access the `/protected` routes. Features a temporary "Bypass for Demo" button.
- **Sign Up (`/auth/sign-up`):** Registration screen for new lab members to join the Makerspace.
- **Forgot Password & Update Password:** Flow for resetting forgotten credentials.
- **Error/Warnings (`/auth/error`):** Generic fallback for failed Supabase magic links or backend connectivity drops.

## Utility Pages
- **Global Error Boundary (`app/layout.tsx` -> `<ConfigError />`):** An application-wide blockade that prevents rendering if the FastAPI backend is down, if `.env` variables are missing, or if the database is inaccessible, guiding the user to troubleshooting steps.
