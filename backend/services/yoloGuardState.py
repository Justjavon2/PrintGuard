from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, Optional


@dataclass(frozen=True)
class GuardState:
    printerId: str
    organizationId: str
    cameraCount: int
    startedAtIso: str
    isRunning: bool


class YoloGuardStateStore:
    """
    Placeholder runtime store until YOLO workers are implemented.
    """

    def __init__(self) -> None:
        self._statesByPrinterId: Dict[str, GuardState] = {}
        self._lock = Lock()

    def startGuard(self, organizationId: str, printerId: str, cameraCount: int) -> GuardState:
        nowIso = datetime.now(timezone.utc).isoformat()
        nextState = GuardState(
            printerId=printerId,
            organizationId=organizationId,
            cameraCount=cameraCount,
            startedAtIso=nowIso,
            isRunning=True,
        )
        with self._lock:
            self._statesByPrinterId[printerId] = nextState
        return nextState

    def getState(self, printerId: str) -> Optional[GuardState]:
        with self._lock:
            return self._statesByPrinterId.get(printerId)
