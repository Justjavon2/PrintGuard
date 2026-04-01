from __future__ import annotations

import json
import platform
import hashlib
from pathlib import Path
from threading import Lock
from typing import Dict, List, Literal, Optional
from urllib.parse import urlparse

import cv2
from pydantic import BaseModel, Field

SourceType = Literal["local", "rtsp", "httpMjpeg"]


class VideoSource(BaseModel):
    sourceKey: str = Field(..., description="Stable source key, e.g. local:0 or net:abcd1234")
    sourceType: SourceType
    displayName: str
    sourceValue: str = Field(..., description="OpenCV source value (camera index string or URL)")
    isExternal: bool = Field(default=False, description="Best-effort external camera hint")
    isNetwork: bool = Field(default=False)

    def sourceValueForCapture(self) -> int | str:
        if self.sourceType == "local":
            return int(self.sourceValue)
        return self.sourceValue


class NetworkSourceCreate(BaseModel):
    sourceUrl: str
    displayName: Optional[str] = None


class VideoPreferences(BaseModel):
    preferredDefaultSourceKey: Optional[str] = None
    preferredByPrinterId: Dict[str, str] = Field(default_factory=dict)


class VideoPreferencesUpdateRequest(BaseModel):
    preferredDefaultSourceKey: Optional[str] = None
    preferredByPrinterId: Optional[Dict[str, str]] = None


class VideoSourceRegistry:
    def __init__(self) -> None:
        self._networkSources: Dict[str, VideoSource] = {}
        self._lock = Lock()

    def listSources(self, maxSources: int = 8) -> List[VideoSource]:
        localSources = self._probeLocalSources(maxSources=maxSources)
        with self._lock:
            networkSources = list(self._networkSources.values())
        return [*localSources, *networkSources]

    def registerNetworkSource(self, sourceUrl: str, displayName: Optional[str] = None) -> VideoSource:
        sourceType = self._classifyNetworkSourceType(sourceUrl)
        shortKey = hashlib.sha1(sourceUrl.encode("utf-8")).hexdigest()[:10]
        sourceKey = f"net:{shortKey}"
        source = VideoSource(
            sourceKey=sourceKey,
            sourceType=sourceType,
            displayName=displayName or sourceUrl,
            sourceValue=sourceUrl,
            isExternal=True,
            isNetwork=True,
        )
        with self._lock:
            self._networkSources[sourceKey] = source
        return source

    def removeNetworkSource(self, sourceKey: str) -> bool:
        with self._lock:
            return self._networkSources.pop(sourceKey, None) is not None

    def getSourceByKey(self, sourceKey: str, maxSources: int = 8) -> Optional[VideoSource]:
        for source in self.listSources(maxSources=maxSources):
            if source.sourceKey == sourceKey:
                return source
        return None

    def chooseDefaultSourceKey(
        self,
        sources: List[VideoSource],
        preferences: VideoPreferences,
        printerId: Optional[str] = None,
    ) -> Optional[str]:
        if len(sources) == 0:
            return None
        if printerId is not None:
            printerPreferred = preferences.preferredByPrinterId.get(printerId)
            if printerPreferred is not None and any(item.sourceKey == printerPreferred for item in sources):
                return printerPreferred
        if preferences.preferredDefaultSourceKey is not None and any(
            item.sourceKey == preferences.preferredDefaultSourceKey for item in sources
        ):
            return preferences.preferredDefaultSourceKey
        localNonExternal = [item for item in sources if item.sourceType == "local" and not item.isExternal]
        if len(localNonExternal) > 0:
            localNonExternal.sort(key=lambda item: int(item.sourceValue))
            return localNonExternal[0].sourceKey
        return sources[0].sourceKey

    def _probeLocalSources(self, maxSources: int) -> List[VideoSource]:
        sources: List[VideoSource] = []
        consecutiveFailures = 0
        maxConsecutiveFailures = 2  # stop after 2 misses to avoid OpenCV spam
        for sourceIndex in range(maxSources):
            capture = cv2.VideoCapture(sourceIndex)
            try:
                if not capture.isOpened():
                    consecutiveFailures += 1
                    if consecutiveFailures >= maxConsecutiveFailures:
                        break
                    continue
                ok, _ = capture.read()
                if not ok:
                    consecutiveFailures += 1
                    if consecutiveFailures >= maxConsecutiveFailures:
                        break
                    continue
            finally:
                capture.release()

            consecutiveFailures = 0
            isExternal = sourceIndex != 0
            if platform.system() == "Darwin" and sourceIndex == 0:
                displayName = "Mac Built-in Camera (Default)"
            else:
                displayName = f"Local Camera {sourceIndex}"
            sources.append(
                VideoSource(
                    sourceKey=f"local:{sourceIndex}",
                    sourceType="local",
                    displayName=displayName,
                    sourceValue=str(sourceIndex),
                    isExternal=isExternal,
                    isNetwork=False,
                )
            )
        return sources

    def _classifyNetworkSourceType(self, sourceUrl: str) -> SourceType:
        parsed = urlparse(sourceUrl)
        scheme = parsed.scheme.lower()
        if scheme == "rtsp":
            return "rtsp"
        if scheme in {"http", "https"}:
            return "httpMjpeg"
        raise ValueError("Unsupported network source URL scheme. Use rtsp:// or http(s)://")


class VideoPreferencesStore:
    def __init__(self, storagePath: Path) -> None:
        self.storagePath = storagePath
        self._lock = Lock()
        if not self.storagePath.parent.exists():
            self.storagePath.parent.mkdir(parents=True, exist_ok=True)

    def getPreferences(self) -> VideoPreferences:
        with self._lock:
            if not self.storagePath.exists():
                return VideoPreferences()
            try:
                rawText = self.storagePath.read_text(encoding="utf-8")
                data = json.loads(rawText)
                return VideoPreferences.model_validate(data)
            except (json.JSONDecodeError, OSError, ValueError):
                return VideoPreferences()

    def updatePreferences(self, update: VideoPreferencesUpdateRequest) -> VideoPreferences:
        with self._lock:
            if not self.storagePath.exists():
                current = VideoPreferences()
            else:
                try:
                    rawText = self.storagePath.read_text(encoding="utf-8")
                    data = json.loads(rawText)
                    current = VideoPreferences.model_validate(data)
                except (json.JSONDecodeError, OSError, ValueError):
                    current = VideoPreferences()
            if "preferredDefaultSourceKey" in update.model_fields_set:
                current.preferredDefaultSourceKey = update.preferredDefaultSourceKey
            if "preferredByPrinterId" in update.model_fields_set and update.preferredByPrinterId is not None:
                mergedByPrinterId = dict(current.preferredByPrinterId)
                mergedByPrinterId.update(update.preferredByPrinterId)
                current.preferredByPrinterId = mergedByPrinterId
            payload = current.model_dump()
            self.storagePath.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            return current
