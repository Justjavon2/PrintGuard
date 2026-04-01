"""Station router – CRUD for printer stations + convenience stream/control endpoints."""

from __future__ import annotations

import time
from typing import Generator, List, Optional

import cv2
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from backend.routers import video
from backend.services.cameraManager import CameraManager
from backend.services.stationRegistry import PrinterStation, StationRegistry
from backend.services.supabaseAuth import authService

router = APIRouter(prefix="/api/stations", tags=["stations"])

# Shared singletons – injected from main.py at startup.
_registry: Optional[StationRegistry] = None
_cameraManager: Optional[CameraManager] = None


def init(registry: StationRegistry, cameraManager: CameraManager) -> None:
    """Called once from main.py to wire shared singletons."""
    global _registry, _cameraManager
    _registry = registry
    _cameraManager = cameraManager


def _reg() -> StationRegistry:
    assert _registry is not None, "StationRegistry not initialised"
    return _registry


def _cam() -> CameraManager:
    assert _cameraManager is not None, "CameraManager not initialised"
    return _cameraManager


class StationCreateRequest(BaseModel):
    name: str = Field(..., description="Human-readable label")
    cameraSourceKeys: List[str] = Field(default_factory=list, description="List of camera source keys")
    defaultCameraSourceKey: Optional[str] = Field(default=None, description="Default camera source key")
    cameraSourceId: Optional[int] = Field(default=None, ge=0, le=31, description="Legacy local camera index")
    serialPort: Optional[str] = Field(default=None)
    baudRate: int = Field(default=115200, ge=9600, le=1000000)


class StationUpdateCamerasRequest(BaseModel):
    cameraSourceKeys: List[str] = Field(..., min_items=1, max_items=16)
    defaultCameraSourceKey: str = Field(...)


class StationResponse(BaseModel):
    stationId: str
    name: str
    cameraSourceKeys: List[str]
    defaultCameraSourceKey: str
    cameraSourceId: Optional[int]
    serialPort: Optional[str]
    baudRate: int


def _normaliseStationCameraInput(payload: StationCreateRequest) -> tuple[List[str], str, Optional[int]]:
    cameraSourceKeys = payload.cameraSourceKeys
    cameraSourceId = payload.cameraSourceId
    if len(cameraSourceKeys) == 0 and cameraSourceId is not None:
        cameraSourceKeys = [f"local:{cameraSourceId}"]
    if len(cameraSourceKeys) == 0:
        raise HTTPException(status_code=400, detail="Provide at least one camera source")

    defaultCameraSourceKey = payload.defaultCameraSourceKey or cameraSourceKeys[0]
    if defaultCameraSourceKey not in cameraSourceKeys:
        raise HTTPException(status_code=400, detail="defaultCameraSourceKey must be part of cameraSourceKeys")
    if cameraSourceId is None and defaultCameraSourceKey.startswith("local:"):
        _, rawIndex = defaultCameraSourceKey.split(":", maxsplit=1)
        if rawIndex.isdigit():
            cameraSourceId = int(rawIndex)
    return cameraSourceKeys, defaultCameraSourceKey, cameraSourceId


def _resolveStationSource(station: PrinterStation, sourceKey: Optional[str]) -> str:
    resolvedSourceKey = sourceKey or station.defaultCameraSourceKey
    if resolvedSourceKey not in station.cameraSourceKeys:
        raise HTTPException(status_code=404, detail="Camera source not assigned to station")
    return resolvedSourceKey


def _ensureSourceWorker(sourceKey: str) -> None:
    source = video.sourceRegistry.getSourceByKey(sourceKey, maxSources=32)
    if source is None:
        raise HTTPException(status_code=404, detail=f"Camera source '{sourceKey}' not available")
    _cam().ensureWorker(
        sourceKey=source.sourceKey,
        sourceValue=source.sourceValueForCapture(),
        width=None,
        height=None,
        maxFps=30,
    )


@router.get("/", response_model=List[StationResponse])
def listStations(request: Request, accessToken: Optional[str] = Query(default=None)) -> List[StationResponse]:
    authService.requireAuth(request, accessToken=accessToken)
    return [StationResponse(**station.model_dump()) for station in _reg().list_all()]


@router.post("/", response_model=StationResponse, status_code=201)
def createStation(
    payload: StationCreateRequest,
    request: Request,
    accessToken: Optional[str] = Query(default=None),
) -> StationResponse:
    authService.requireAuth(request, accessToken=accessToken)
    cameraSourceKeys, defaultCameraSourceKey, cameraSourceId = _normaliseStationCameraInput(payload)
    for sourceKey in cameraSourceKeys:
        source = video.sourceRegistry.getSourceByKey(sourceKey, maxSources=32)
        if source is None:
            raise HTTPException(status_code=404, detail=f"Camera source '{sourceKey}' not available")
    station = PrinterStation(
        name=payload.name,
        cameraSourceKeys=cameraSourceKeys,
        defaultCameraSourceKey=defaultCameraSourceKey,
        cameraSourceId=cameraSourceId,
        serialPort=payload.serialPort,
        baudRate=payload.baudRate,
    )
    _reg().add(station)
    _ensureSourceWorker(defaultCameraSourceKey)
    return StationResponse(**station.model_dump())


@router.get("/{stationId}", response_model=StationResponse)
def getStation(
    stationId: str,
    request: Request,
    accessToken: Optional[str] = Query(default=None),
) -> StationResponse:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return StationResponse(**station.model_dump())


@router.put("/{stationId}/cameras", response_model=StationResponse)
def updateStationCameras(
    stationId: str,
    payload: StationUpdateCamerasRequest,
    request: Request,
    accessToken: Optional[str] = Query(default=None),
) -> StationResponse:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    if payload.defaultCameraSourceKey not in payload.cameraSourceKeys:
        raise HTTPException(status_code=400, detail="defaultCameraSourceKey must be part of cameraSourceKeys")
    for sourceKey in payload.cameraSourceKeys:
        source = video.sourceRegistry.getSourceByKey(sourceKey, maxSources=32)
        if source is None:
            raise HTTPException(status_code=404, detail=f"Camera source '{sourceKey}' not available")

    station.cameraSourceKeys = payload.cameraSourceKeys
    station.defaultCameraSourceKey = payload.defaultCameraSourceKey
    if payload.defaultCameraSourceKey.startswith("local:"):
        _, rawSourceId = payload.defaultCameraSourceKey.split(":", maxsplit=1)
        station.cameraSourceId = int(rawSourceId) if rawSourceId.isdigit() else None
    else:
        station.cameraSourceId = None
    _reg().add(station)
    _ensureSourceWorker(station.defaultCameraSourceKey)
    return StationResponse(**station.model_dump())


@router.delete("/{stationId}")
def deleteStation(
    stationId: str,
    request: Request,
    accessToken: Optional[str] = Query(default=None),
) -> dict:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    _reg().remove(stationId)
    return {"status": "removed", "stationId": stationId}


def _encodeJpeg(frame: object) -> Optional[bytes]:
    ok, buffer = cv2.imencode(".jpg", frame)
    return buffer.tobytes() if ok else None


@router.get("/{stationId}/snapshot")
def stationSnapshot(
    stationId: str,
    request: Request,
    sourceKey: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> Response:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    resolvedSourceKey = _resolveStationSource(station, sourceKey)
    source = video.sourceRegistry.getSourceByKey(resolvedSourceKey, maxSources=32)
    if source is None:
        raise HTTPException(status_code=404, detail="Camera source not available")

    frameData = _cam().getLatestFrame(
        sourceKey=source.sourceKey,
        sourceValue=source.sourceValueForCapture(),
        width=None,
        height=None,
        maxFps=30,
    )
    if frameData is None:
        raise HTTPException(status_code=404, detail="Camera not available")
    _, frame = frameData
    jpg = _encodeJpeg(frame)
    if jpg is None:
        raise HTTPException(status_code=500, detail="Failed to encode frame")
    return Response(content=jpg, media_type="image/jpeg")


@router.get("/{stationId}/stream")
def stationStream(
    stationId: str,
    request: Request,
    sourceKey: Optional[str] = Query(default=None),
    fps: int = Query(default=10, ge=1, le=60),
    accessToken: Optional[str] = Query(default=None),
) -> StreamingResponse:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    resolvedSourceKey = _resolveStationSource(station, sourceKey)
    source = video.sourceRegistry.getSourceByKey(resolvedSourceKey, maxSources=32)
    if source is None:
        raise HTTPException(status_code=404, detail="Camera source not available")

    def generate() -> Generator[bytes, None, None]:
        frameDelay = 1.0 / float(fps)
        while True:
            frameData = _cam().getLatestFrame(
                sourceKey=source.sourceKey,
                sourceValue=source.sourceValueForCapture(),
                width=None,
                height=None,
                maxFps=fps,
            )
            if frameData is None:
                time.sleep(frameDelay)
                continue
            _, frame = frameData
            jpg = _encodeJpeg(frame)
            if jpg is None:
                time.sleep(frameDelay)
                continue
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
            time.sleep(frameDelay)

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


def _sendSerial(station: PrinterStation, command: str) -> dict:
    if station.serialPort is None:
        raise HTTPException(
            status_code=400,
            detail=f"Station '{station.name}' has no serial port configured",
        )
    from serial import Serial, SerialException

    try:
        with Serial(station.serialPort, station.baudRate, timeout=2) as serialPort:
            serialPort.write((command + "\n").encode("utf-8"))
            serialPort.flush()
    except SerialException as exc:
        raise HTTPException(status_code=500, detail=f"Serial error: {exc}") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"OS error: {exc}") from exc

    return {
        "status": "sent",
        "stationId": station.stationId,
        "port": station.serialPort,
        "baudRate": station.baudRate,
        "command": command,
    }


@router.post("/{stationId}/pause")
def stationPause(
    stationId: str,
    request: Request,
    accessToken: Optional[str] = Query(default=None),
) -> dict:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return _sendSerial(station, "M25")


@router.post("/{stationId}/stop")
def stationStop(
    stationId: str,
    request: Request,
    accessToken: Optional[str] = Query(default=None),
) -> dict:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    try:
        authService.resolveOrganizationIdForStation(authContext, stationId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    station = _reg().get(stationId)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return _sendSerial(station, "M112")
