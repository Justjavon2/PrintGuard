from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Dict


@dataclass(frozen=True)
class ThrottleDecision:
    allowed: bool
    remainingSeconds: int


class NotificationThrottleStore:
    def __init__(self) -> None:
        cooldownRaw = os.getenv("NOTIFICATION_GUARD_START_COOLDOWN_SECONDS", "600")
        try:
            parsedCooldown = int(cooldownRaw)
        except ValueError:
            parsedCooldown = 600
        self.cooldownSeconds = max(30, parsedCooldown)
        self._lastSentEpochByKey: Dict[str, int] = {}
        self._lock = Lock()

    def checkAndRecord(self, dedupeKey: str) -> ThrottleDecision:
        nowEpoch = int(datetime.now(timezone.utc).timestamp())
        with self._lock:
            previousEpoch = self._lastSentEpochByKey.get(dedupeKey)
            if previousEpoch is not None:
                elapsedSeconds = nowEpoch - previousEpoch
                if elapsedSeconds < self.cooldownSeconds:
                    return ThrottleDecision(
                        allowed=False,
                        remainingSeconds=self.cooldownSeconds - elapsedSeconds,
                    )
            self._lastSentEpochByKey[dedupeKey] = nowEpoch
        return ThrottleDecision(allowed=True, remainingSeconds=0)
