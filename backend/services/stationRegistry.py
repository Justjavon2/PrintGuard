"""In-memory registry that maps cameras to printers as named stations."""

from __future__ import annotations

import uuid
from threading import Lock
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PrinterStation(BaseModel):
    """A single monitoring station: one camera feed linked to one printer."""

    stationId: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = Field(..., description="Human-readable label, e.g. 'Printer A – Front Cam'")
    cameraSourceKeys: List[str] = Field(
        default_factory=list,
        description="Source keys for this station, e.g. ['local:0', 'net:abc123']",
    )
    defaultCameraSourceKey: str = Field(..., description="Default source key for this station")
    cameraSourceId: Optional[int] = Field(
        default=None,
        ge=0,
        le=31,
        description="Legacy local camera index compatibility field",
    )
    serialPort: Optional[str] = Field(
        default=None,
        description="Serial port path, e.g. /dev/ttyUSB0 or COM3 (None if no printer attached)",
    )
    baudRate: int = Field(default=115200, ge=9600, le=1000000)


class StationRegistry:
    """Thread-safe CRUD store for PrinterStation objects."""

    def __init__(self) -> None:
        self._stations: Dict[str, PrinterStation] = {}
        self._lock = Lock()

    # -- Create ---------------------------------------------------------------

    def add(self, station: PrinterStation) -> PrinterStation:
        with self._lock:
            self._stations[station.stationId] = station
        return station

    # -- Read -----------------------------------------------------------------

    def get(self, stationId: str) -> Optional[PrinterStation]:
        with self._lock:
            return self._stations.get(stationId)

    def list_all(self) -> List[PrinterStation]:
        with self._lock:
            return list(self._stations.values())

    def getByCameraSourceKey(self, cameraSourceKey: str) -> Optional[PrinterStation]:
        with self._lock:
            for station in self._stations.values():
                if cameraSourceKey in station.cameraSourceKeys:
                    return station
            return None

    # -- Delete ---------------------------------------------------------------

    def remove(self, stationId: str) -> bool:
        """Remove a station. Returns True if it existed, False otherwise."""
        with self._lock:
            return self._stations.pop(stationId, None) is not None
