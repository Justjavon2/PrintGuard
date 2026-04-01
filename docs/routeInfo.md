# PrintGuard Backend — Route Reference

All routes are served by the FastAPI backend (default: `http://localhost:8000`).

---

## General

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Root endpoint. Returns a simple health message (`{"message": "Hello World"}`). |
| `GET` | `/health` | Health check. Returns `{"status": "healthy"}` to confirm the server is running. |

---

## Environment & Data (`/api`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/env` | Returns the public Supabase URL and publishable key so the frontend can initialise its Supabase client. |
| `GET` | `/api/data` | Example data endpoint. Returns a placeholder JSON response. |

---

## Video (`/api/video`)

Endpoints for discovering cameras, grabbing snapshots, streaming live feeds, and running frame analysis.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/video/sources` | Returns normalized camera metadata for local + network sources. Query param: `maxSources` (default 8, max 32). Source object fields: `sourceKey`, `sourceType` (`local`/`rtsp`/`httpMjpeg`), `displayName`, `sourceValue`, `isExternal`, `isNetwork`. |
| `POST` | `/api/video/sources/network` | Registers a network camera source. Body: `{"sourceUrl": "rtsp://... or http(s)://...", "displayName": "optional"}`. |
| `DELETE` | `/api/video/sources/network/{sourceKey}` | Removes a previously registered network source and stops its worker. |
| `GET` | `/api/video/preferences` | Returns camera default preferences: `preferredDefaultSourceKey` + optional `preferredByPrinterId` map. |
| `PUT` | `/api/video/preferences` | Updates camera default preferences. Body supports `preferredDefaultSourceKey` and/or `preferredByPrinterId`. |
| `GET` | `/api/video/snapshot` | Returns one JPEG frame. Query params: `sourceKey` (preferred), legacy `sourceId` (backward compatible), optional `printerId`, `width`, `height`, `maxFps`. |
| `GET` | `/api/video/stream` | Opens MJPEG stream. Query params: `sourceKey` (preferred), legacy `sourceId` (backward compatible), optional `printerId`, `fps`. |
| `GET` | `/api/video/analyze` | Grabs frame and runs placeholder YOLO pipeline. Query params mirror `/snapshot`. Returns `sourceKey`, `timestamp`, `yoloConfigured`, `detections`. |
| `POST` | `/api/video/analyze/batch` | Batch analyze by `sourceKeys` and/or legacy `sourceIds`. Body: `{"sourceKeys": [], "sourceIds": [], "width", "height", "maxFps"}`. |

---

## Printer (`/api/printer`)

Direct serial (pyserial) control of 3D printers via G-code commands.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/printer/ports` | Lists all serial ports currently visible on the system (e.g. `/dev/ttyUSB0`, `COM3`). |
| `POST` | `/api/printer/pause` | Sends a pause command (`M25`) to a printer. Body: `{"port": "/dev/ttyUSB0", "baudRate": 115200}`. Optional `command` field to override the G-code. |
| `POST` | `/api/printer/stop` | Sends an emergency stop command (`M112`) to a printer. Same body format as `/pause`. |

---

## Stations (`/api/stations`)

Higher-level abstraction that links a camera to a printer as a named **station**. Provides CRUD management plus convenience shortcuts for streaming and printer control per station.

### CRUD

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stations/` | List all registered stations. Returns an array of station objects. |
| `POST` | `/api/stations/` | Register a new station. Body supports multi-camera: `{"name": "Printer A", "cameraSourceKeys": ["local:0","net:abc"], "defaultCameraSourceKey": "local:0", "serialPort": "...", "baudRate": 115200}`. Legacy `cameraSourceId` is accepted for compatibility. |
| `GET` | `/api/stations/{stationId}` | Get details for a single station by ID. |
| `PUT` | `/api/stations/{stationId}/cameras` | Replace station camera assignment. Body: `{"cameraSourceKeys": [...], "defaultCameraSourceKey": "..."}`. |
| `DELETE` | `/api/stations/{stationId}` | Remove a station registration. |

### Camera (per station)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stations/{stationId}/snapshot` | Returns a JPEG snapshot from station camera set. Optional query param: `sourceKey` (defaults to station default camera). |
| `GET` | `/api/stations/{stationId}/stream` | Opens MJPEG stream from station camera set. Optional query param: `sourceKey` (defaults to station default camera), `fps` (default 10). |

### Printer Control (per station)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/stations/{stationId}/pause` | Sends `M25` (pause) to the printer linked to this station. Returns an error if no serial port is configured. |
| `POST` | `/api/stations/{stationId}/stop` | Sends `M112` (emergency stop) to the printer linked to this station. |

---

> **Interactive docs**: When the server is running, visit [`http://localhost:8000/docs`](http://localhost:8000/docs) for the auto-generated Swagger UI with try-it-out functionality.
