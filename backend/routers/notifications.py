from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.services.notificationEmailService import NotificationEmailService
from backend.services.notificationThrottle import NotificationThrottleStore
from backend.services.supabaseAuth import authService
from backend.services.yoloGuardState import YoloGuardStateStore

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
emailService = NotificationEmailService()
yoloGuardStateStore = YoloGuardStateStore()
notificationThrottleStore = NotificationThrottleStore()


class GuardStartRequest(BaseModel):
    organizationId: str = Field(..., min_length=1)
    printerId: str = Field(..., min_length=1)
    organizationName: Optional[str] = Field(default=None)
    userEmail: Optional[str] = Field(default=None)


class GuardStartResponse(BaseModel):
    status: str
    printerId: str
    organizationId: str
    cameraCount: int
    yoloRunning: bool
    emailTo: str
    notificationSent: bool
    skippedReason: Optional[str] = None
    retryAfterSeconds: Optional[int] = None


@router.post("/guard/start", response_model=GuardStartResponse)
def startGuardAndNotify(payload: GuardStartRequest, request: Request) -> GuardStartResponse:
    authContext = authService.requireAuth(request)
    authService.requireOrganizationMember(authContext, payload.organizationId)

    resolvedEmail = payload.userEmail.strip() if isinstance(payload.userEmail, str) else None
    if resolvedEmail is not None and len(resolvedEmail) == 0:
        resolvedEmail = None
    if resolvedEmail is None:
        resolvedEmail = authContext.userEmail
    if not resolvedEmail:
        raise HTTPException(status_code=400, detail="Authenticated user does not have an email address")

    cameraCount = authService.countAssignedStationCameras(
        authContext=authContext,
        organizationId=payload.organizationId,
        printerId=payload.printerId,
    )
    if cameraCount < 1:
        raise HTTPException(
            status_code=400,
            detail="Guard cannot start without at least one camera assigned to this printer",
        )

    printerName = authService.getPrinterName(
        authContext=authContext,
        organizationId=payload.organizationId,
        printerId=payload.printerId,
    )
    fleetName = authService.getLabNameForPrinter(
        authContext=authContext,
        organizationId=payload.organizationId,
        printerId=payload.printerId,
    )

    guardState = yoloGuardStateStore.startGuard(
        organizationId=payload.organizationId,
        printerId=payload.printerId,
        cameraCount=cameraCount,
    )
    if not guardState.isRunning:
        raise HTTPException(status_code=500, detail="YOLO guard did not start")

    resolvedOrganizationName = payload.organizationName or payload.organizationId
    dedupeKey = f"guardStart:{authContext.userId}:{payload.organizationId}:{payload.printerId}"
    throttleDecision = notificationThrottleStore.checkAndRecord(dedupeKey=dedupeKey)
    if not throttleDecision.allowed:
        return GuardStartResponse(
            status="guard_started",
            printerId=payload.printerId,
            organizationId=payload.organizationId,
            cameraCount=cameraCount,
            yoloRunning=True,
            emailTo=resolvedEmail,
            notificationSent=False,
            skippedReason="cooldown_active",
            retryAfterSeconds=throttleDecision.remainingSeconds,
        )

    try:
        emailService.sendGuardStartedEmail(
            toEmail=resolvedEmail,
            organizationName=resolvedOrganizationName,
            printerName=printerName,
            fleetName=fleetName,
            cameraCount=cameraCount,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send guard start email: {exc}") from exc

    return GuardStartResponse(
        status="guard_started",
        printerId=payload.printerId,
        organizationId=payload.organizationId,
        cameraCount=cameraCount,
        yoloRunning=True,
        emailTo=resolvedEmail,
        notificationSent=True,
        skippedReason=None,
        retryAfterSeconds=None,
    )
