from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import video
from backend.services.videoSourceRegistry import VideoPreferences, VideoSource, VideoSourceRegistry


def testNetworkSourceValidation() -> None:
    registry = VideoSourceRegistry()
    rtspSource = registry.registerNetworkSource("rtsp://10.0.0.2/stream")
    httpSource = registry.registerNetworkSource("http://10.0.0.5:8080/mjpeg")
    assert rtspSource.sourceType == "rtsp"
    assert httpSource.sourceType == "httpMjpeg"

    try:
        registry.registerNetworkSource("ftp://10.0.0.2/file")
        assert False, "Expected unsupported scheme to raise"
    except ValueError:
        assert True


def testDefaultSourceResolutionOrder() -> None:
    registry = VideoSourceRegistry()
    sources = [
        VideoSource(
            sourceKey="local:0",
            sourceType="local",
            displayName="Built-in",
            sourceValue="0",
            isExternal=False,
            isNetwork=False,
        ),
        VideoSource(
            sourceKey="local:1",
            sourceType="local",
            displayName="External",
            sourceValue="1",
            isExternal=True,
            isNetwork=False,
        ),
    ]

    preferences = VideoPreferences(preferredDefaultSourceKey="local:1", preferredByPrinterId={"printer-1": "local:0"})
    assert registry.chooseDefaultSourceKey(sources=sources, preferences=preferences, printerId="printer-1") == "local:0"
    assert registry.chooseDefaultSourceKey(sources=sources, preferences=preferences, printerId="printer-2") == "local:1"

    emptyPreferences = VideoPreferences()
    assert registry.chooseDefaultSourceKey(sources=sources, preferences=emptyPreferences, printerId=None) == "local:0"


def testSnapshotSupportsLegacyAndSourceKey(monkeypatch) -> None:
    def fakeListSources(maxSources: int = 8):
        return [
            VideoSource(
                sourceKey="local:0",
                sourceType="local",
                displayName="Built-in",
                sourceValue="0",
                isExternal=False,
                isNetwork=False,
            )
        ]

    def fakeGetSourceByKey(sourceKey: str, maxSources: int = 8):
        if sourceKey == "local:0":
            return fakeListSources()[0]
        return None

    def fakeGetLatestFrame(*args, **kwargs):
        frame = np.zeros((16, 16, 3), dtype=np.uint8)
        return (1.0, frame)

    monkeypatch.setattr(video.sourceRegistry, "listSources", fakeListSources)
    monkeypatch.setattr(video.sourceRegistry, "getSourceByKey", fakeGetSourceByKey)
    monkeypatch.setattr(video.cameraManager, "getLatestFrame", fakeGetLatestFrame)

    client = TestClient(app)
    responseLegacy = client.get("/api/video/snapshot", params={"sourceId": 0})
    responseModern = client.get("/api/video/snapshot", params={"sourceKey": "local:0"})

    assert responseLegacy.status_code == 200
    assert responseModern.status_code == 200
    assert responseLegacy.headers["content-type"] == "image/jpeg"
    assert responseModern.headers["content-type"] == "image/jpeg"
