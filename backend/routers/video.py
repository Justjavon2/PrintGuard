from __future__ import annotations

import asyncio
from pathlib import Path
from typing import List, Optional

import cv2
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from backend.services.cameraManager import CameraManager
from backend.services.videoSourceRegistry import (
    NetworkSourceCreate,
    VideoPreferences,
    VideoPreferencesStore,
    VideoPreferencesUpdateRequest,
    VideoSource,
    VideoSourceRegistry,
)
from backend.services.supabaseAuth import authService

router = APIRouter(prefix="/api/video", tags=["video"])
cameraManager = CameraManager()
sourceRegistry = VideoSourceRegistry()
preferencesStore = VideoPreferencesStore(
    Path(__file__).resolve().parents[1] / "data" / "videoPreferences.json"
)


class VideoAnalysisResponse(BaseModel):
    sourceKey: str
    timestamp: float
    yoloConfigured: bool
    detections: List[dict]


class VideoBatchRequest(BaseModel):
    sourceKeys: List[str] = Field(default_factory=list, max_items=16)
    sourceIds: List[int] = Field(default_factory=list, max_items=16)
    width: Optional[int] = Field(default=None, ge=1, le=4096)
    height: Optional[int] = Field(default=None, ge=1, le=4096)
    maxFps: int = Field(default=30, ge=1, le=60)


class VideoBatchResult(BaseModel):
    sourceKey: str
    timestamp: float
    yoloConfigured: bool
    detections: List[dict]


class VideoBatchResponse(BaseModel):
    results: List[VideoBatchResult]


class NetworkSourceResponse(BaseModel):
    status: str
    source: VideoSource


class DeleteNetworkSourceResponse(BaseModel):
    status: str
    sourceKey: str


def _encodeJpeg(frame: object) -> Optional[bytes]:
    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return None
    return buffer.tobytes()


def _resolveSource(
    sourceKey: Optional[str],
    sourceId: Optional[int],
    printerId: Optional[str],
    maxSources: int,
) -> VideoSource:
    if sourceKey is not None:
        source = sourceRegistry.getSourceByKey(sourceKey, maxSources=maxSources)
        if source is None:
            raise HTTPException(status_code=404, detail=f"Camera sourceKey '{sourceKey}' not available")
        return source

    if sourceId is not None:
        legacySourceKey = f"local:{sourceId}"
        source = sourceRegistry.getSourceByKey(legacySourceKey, maxSources=maxSources)
        if source is None:
            raise HTTPException(status_code=404, detail=f"Camera sourceId '{sourceId}' not available")
        return source

    allSources = sourceRegistry.listSources(maxSources=maxSources)
    preferences = preferencesStore.getPreferences()
    defaultSourceKey = sourceRegistry.chooseDefaultSourceKey(
        sources=allSources,
        preferences=preferences,
        printerId=printerId,
    )
    if defaultSourceKey is None:
        raise HTTPException(status_code=404, detail="No camera sources available")
    source = next((item for item in allSources if item.sourceKey == defaultSourceKey), None)
    if source is None:
        raise HTTPException(status_code=404, detail="Default camera source is no longer available")
    return source


def _enforceVideoAccess(
    request: Request,
    accessToken: Optional[str],
    printerId: Optional[str],
    sourceKey: Optional[str],
    organizationId: Optional[str],
) -> Optional[str]:
    authContext = authService.requireAuth(request, accessToken=accessToken)
    if not authService.isEnabled():
        return organizationId

    resolvedOrganizationId = organizationId
    if resolvedOrganizationId is None:
        if printerId is not None:
            resolvedOrganizationId = authService.resolveOrganizationIdForPrinter(authContext, printerId)
        elif len(authContext.organizationIds) == 1:
            resolvedOrganizationId = authContext.organizationIds[0]
        else:
            raise HTTPException(
                status_code=400,
                detail="organizationId or printerId is required for camera access",
            )
    authService.requireOrganizationMember(authContext, resolvedOrganizationId)

    if printerId is not None and sourceKey is not None:
        authService.ensureSourceAssignedToPrinter(
            authContext=authContext,
            organizationId=resolvedOrganizationId,
            printerId=printerId,
            sourceKey=sourceKey,
        )

    return resolvedOrganizationId


@router.get("/sources", response_model=List[VideoSource])
def listVideoSources(
    request: Request,
    maxSources: int = Query(default=8, ge=1, le=32),
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> List[VideoSource]:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=None,
        sourceKey=None,
        organizationId=organizationId,
    )
    return sourceRegistry.listSources(maxSources=maxSources)


@router.post("/sources/network", response_model=NetworkSourceResponse, status_code=201)
def createNetworkSource(
    payload: NetworkSourceCreate,
    request: Request,
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> NetworkSourceResponse:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=None,
        sourceKey=None,
        organizationId=organizationId,
    )
    try:
        source = sourceRegistry.registerNetworkSource(
            sourceUrl=payload.sourceUrl,
            displayName=payload.displayName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return NetworkSourceResponse(status="registered", source=source)


@router.delete("/sources/network/{sourceKey}", response_model=DeleteNetworkSourceResponse)
def deleteNetworkSource(
    sourceKey: str,
    request: Request,
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> DeleteNetworkSourceResponse:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=None,
        sourceKey=None,
        organizationId=organizationId,
    )
    removed = sourceRegistry.removeNetworkSource(sourceKey)
    if not removed:
        raise HTTPException(status_code=404, detail="Network source not found")
    cameraManager.stopOne(sourceKey)
    return DeleteNetworkSourceResponse(status="removed", sourceKey=sourceKey)


@router.get("/preferences", response_model=VideoPreferences)
def getVideoPreferences(
    request: Request,
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> VideoPreferences:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=None,
        sourceKey=None,
        organizationId=organizationId,
    )
    return preferencesStore.getPreferences()


@router.put("/preferences", response_model=VideoPreferences)
def updateVideoPreferences(
    payload: VideoPreferencesUpdateRequest,
    request: Request,
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> VideoPreferences:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=None,
        sourceKey=None,
        organizationId=organizationId,
    )
    return preferencesStore.updatePreferences(payload)


@router.get("/snapshot")
def getSnapshot(
    request: Request,
    sourceKey: Optional[str] = Query(default=None),
    sourceId: Optional[int] = Query(default=None, ge=0, le=31),
    printerId: Optional[str] = Query(default=None),
    width: Optional[int] = Query(default=None, ge=1, le=4096),
    height: Optional[int] = Query(default=None, ge=1, le=4096),
    maxFps: int = Query(default=30, ge=1, le=60),
    maxSources: int = Query(default=8, ge=1, le=32),
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> Response:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=printerId,
        sourceKey=sourceKey,
        organizationId=organizationId,
    )
    resolvedSource = _resolveSource(
        sourceKey=sourceKey,
        sourceId=sourceId,
        printerId=printerId,
        maxSources=maxSources,
    )
    frameData = cameraManager.getLatestFrame(
        sourceKey=resolvedSource.sourceKey,
        sourceValue=resolvedSource.sourceValueForCapture(),
        width=width,
        height=height,
        maxFps=maxFps,
    )
    if frameData is None:
        raise HTTPException(status_code=404, detail=f"Camera source '{resolvedSource.sourceKey}' not available")
    _, frame = frameData
    frameBytes = _encodeJpeg(frame)
    if frameBytes is None:
        raise HTTPException(status_code=500, detail="Failed to encode frame")
    return Response(content=frameBytes, media_type="image/jpeg")


@router.get("/stream")
async def streamVideo(
    request: Request,
    sourceKey: Optional[str] = Query(default=None),
    sourceId: Optional[int] = Query(default=None, ge=0, le=31),
    printerId: Optional[str] = Query(default=None),
    fps: int = Query(default=10, ge=1, le=60),
    maxSources: int = Query(default=8, ge=1, le=32),
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> StreamingResponse:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=printerId,
        sourceKey=sourceKey,
        organizationId=organizationId,
    )
    resolvedSource = _resolveSource(
        sourceKey=sourceKey,
        sourceId=sourceId,
        printerId=printerId,
        maxSources=maxSources,
    )

    async def frameGenerator():
        frameDelay = 1.0 / float(fps)
        while True:
            if await request.is_disconnected():
                break
            frameData = cameraManager.getLatestFrame(
                sourceKey=resolvedSource.sourceKey,
                sourceValue=resolvedSource.sourceValueForCapture(),
                width=None,
                height=None,
                maxFps=fps,
            )
            if frameData is None:
                await asyncio.sleep(frameDelay)
                continue
            _, frame = frameData
            frameBytes = _encodeJpeg(frame)
            if frameBytes is None:
                await asyncio.sleep(frameDelay)
                continue
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frameBytes + b"\r\n"
            await asyncio.sleep(frameDelay)

    return StreamingResponse(frameGenerator(), media_type="multipart/x-mixed-replace; boundary=frame")


@router.get("/analyze", response_model=VideoAnalysisResponse)
def analyzeFrame(
    request: Request,
    sourceKey: Optional[str] = Query(default=None),
    sourceId: Optional[int] = Query(default=None, ge=0, le=31),
    printerId: Optional[str] = Query(default=None),
    width: Optional[int] = Query(default=None, ge=1, le=4096),
    height: Optional[int] = Query(default=None, ge=1, le=4096),
    maxFps: int = Query(default=30, ge=1, le=60),
    maxSources: int = Query(default=8, ge=1, le=32),
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> VideoAnalysisResponse:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=printerId,
        sourceKey=sourceKey,
        organizationId=organizationId,
    )
    resolvedSource = _resolveSource(
        sourceKey=sourceKey,
        sourceId=sourceId,
        printerId=printerId,
        maxSources=maxSources,
    )
    frameData = cameraManager.getLatestFrame(
        sourceKey=resolvedSource.sourceKey,
        sourceValue=resolvedSource.sourceValueForCapture(),
        width=width,
        height=height,
        maxFps=maxFps,
    )
    if frameData is None:
        raise HTTPException(status_code=404, detail=f"Camera source '{resolvedSource.sourceKey}' not available")
    timestamp, _frame = frameData

    return VideoAnalysisResponse(
        sourceKey=resolvedSource.sourceKey,
        timestamp=timestamp,
        yoloConfigured=False,
        detections=[],
    )


@router.post("/analyze/batch", response_model=VideoBatchResponse)
def analyzeBatch(
    payload: VideoBatchRequest,
    request: Request,
    organizationId: Optional[str] = Query(default=None),
    accessToken: Optional[str] = Query(default=None),
) -> VideoBatchResponse:
    _enforceVideoAccess(
        request=request,
        accessToken=accessToken,
        printerId=None,
        sourceKey=None,
        organizationId=organizationId,
    )
    requestedSourceKeys: List[str] = []
    requestedSourceKeys.extend(payload.sourceKeys)
    requestedSourceKeys.extend([f"local:{sourceId}" for sourceId in payload.sourceIds])
    if len(requestedSourceKeys) == 0:
        raise HTTPException(status_code=400, detail="Provide at least one sourceKey or sourceId")
    if len(requestedSourceKeys) > 16:
        raise HTTPException(status_code=400, detail="At most 16 camera sources are supported per batch")

    results: List[VideoBatchResult] = []
    for currentSourceKey in requestedSourceKeys:
        resolvedSource = sourceRegistry.getSourceByKey(currentSourceKey, maxSources=32)
        if resolvedSource is None:
            raise HTTPException(status_code=404, detail=f"Camera source '{currentSourceKey}' not available")
        frameData = cameraManager.getLatestFrame(
            sourceKey=resolvedSource.sourceKey,
            sourceValue=resolvedSource.sourceValueForCapture(),
            width=payload.width,
            height=payload.height,
            maxFps=payload.maxFps,
        )
        if frameData is None:
            raise HTTPException(status_code=404, detail=f"Camera source '{currentSourceKey}' not available")
        timestamp, _frame = frameData
        results.append(
            VideoBatchResult(
                sourceKey=resolvedSource.sourceKey,
                timestamp=timestamp,
                yoloConfigured=False,
                detections=[],
            )
        )
    return VideoBatchResponse(results=results)
