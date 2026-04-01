from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import stations, video
from backend.services.videoSourceRegistry import VideoSource


class FakeCameraManager:
    def ensureWorker(self, sourceKey: str, sourceValue: int | str, width, height, maxFps: int):
        return None

    def getLatestFrame(self, sourceKey: str, sourceValue: int | str, width, height, maxFps: int):
        frame = np.zeros((20, 20, 3), dtype=np.uint8)
        return (1.0, frame)


def testStationCreateUpdateAndSnapshot(monkeypatch) -> None:
    def fakeGetSourceByKey(sourceKey: str, maxSources: int = 32):
        if sourceKey == "local:0":
            return VideoSource(
                sourceKey="local:0",
                sourceType="local",
                displayName="Built-in",
                sourceValue="0",
                isExternal=False,
                isNetwork=False,
            )
        if sourceKey == "net:abc123":
            return VideoSource(
                sourceKey="net:abc123",
                sourceType="rtsp",
                displayName="IP Cam",
                sourceValue="rtsp://10.0.0.50/stream",
                isExternal=True,
                isNetwork=True,
            )
        return None

    monkeypatch.setattr(video.sourceRegistry, "getSourceByKey", fakeGetSourceByKey)
    monkeypatch.setattr(stations, "_cameraManager", FakeCameraManager())

    client = TestClient(app)

    createResponse = client.post(
        "/api/stations/",
        json={
            "name": "Printer A",
            "cameraSourceKeys": ["local:0", "net:abc123"],
            "defaultCameraSourceKey": "local:0",
            "serialPort": None,
        },
    )
    assert createResponse.status_code == 201
    station = createResponse.json()

    updateResponse = client.put(
        f"/api/stations/{station['stationId']}/cameras",
        json={
            "cameraSourceKeys": ["local:0", "net:abc123"],
            "defaultCameraSourceKey": "net:abc123",
        },
    )
    assert updateResponse.status_code == 200
    assert updateResponse.json()["defaultCameraSourceKey"] == "net:abc123"

    snapshotResponse = client.get(
        f"/api/stations/{station['stationId']}/snapshot",
        params={"sourceKey": "net:abc123"},
    )
    assert snapshotResponse.status_code == 200
    assert snapshotResponse.headers["content-type"] == "image/jpeg"
