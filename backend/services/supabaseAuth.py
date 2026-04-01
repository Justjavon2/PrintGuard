from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException, Request


@dataclass(frozen=True)
class AuthContext:
    userId: str
    accessToken: str
    organizationIds: List[str]
    userEmail: Optional[str]


class SupabaseAuthService:
    def __init__(self) -> None:
        self.supabaseUrl = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.publishableKey = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or os.getenv(
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
        )

    def isEnabled(self) -> bool:
        return bool(self.supabaseUrl and self.publishableKey)

    def requireAuth(self, request: Request, accessToken: Optional[str] = None) -> AuthContext:
        if not self.isEnabled():
            return AuthContext(userId="dev-user", accessToken="", organizationIds=[], userEmail=None)

        resolvedToken = self._extractAccessToken(request, accessToken)
        if resolvedToken is None:
            raise HTTPException(status_code=401, detail="Missing bearer token")

        userPayload = self._getAuthenticatedUser(resolvedToken)
        userId = userPayload.get("id")
        if not isinstance(userId, str) or len(userId) == 0:
            raise HTTPException(status_code=401, detail="Invalid auth payload")

        organizationIds = self._loadMembershipOrganizationIds(resolvedToken, userId)
        userEmail = self._extractUserEmail(userPayload)
        return AuthContext(
            userId=userId,
            accessToken=resolvedToken,
            organizationIds=organizationIds,
            userEmail=userEmail,
        )

    def requireOrganizationMember(self, authContext: AuthContext, organizationId: str) -> None:
        if not self.isEnabled():
            return
        if organizationId not in authContext.organizationIds:
            raise HTTPException(status_code=403, detail="Cross-organization access denied")

    def resolveOrganizationIdForPrinter(self, authContext: AuthContext, printerId: str) -> str:
        if not self.isEnabled():
            return ""

        rows = self._restSelect(
            authContext.accessToken,
            "printers",
            {
                "select": "organizationId,id",
                "id": f"eq.{printerId}",
                "limit": "1",
            },
        )
        if len(rows) == 0:
            raise HTTPException(status_code=404, detail="Printer not found")
        organizationId = rows[0].get("organizationId")
        if not isinstance(organizationId, str) or len(organizationId) == 0:
            raise HTTPException(status_code=404, detail="Printer organization not found")
        self.requireOrganizationMember(authContext, organizationId)
        return organizationId

    def resolveOrganizationIdForStation(self, authContext: AuthContext, stationId: str) -> str:
        if not self.isEnabled():
            return ""

        rows = self._restSelect(
            authContext.accessToken,
            "stations",
            {
                "select": "organizationId,id",
                "id": f"eq.{stationId}",
                "limit": "1",
            },
        )
        if len(rows) == 0:
            raise HTTPException(status_code=404, detail="Station not found")
        organizationId = rows[0].get("organizationId")
        if not isinstance(organizationId, str) or len(organizationId) == 0:
            raise HTTPException(status_code=404, detail="Station organization not found")
        self.requireOrganizationMember(authContext, organizationId)
        return organizationId

    def ensureSourceAssignedToPrinter(
        self,
        authContext: AuthContext,
        organizationId: str,
        printerId: str,
        sourceKey: str,
    ) -> None:
        if not self.isEnabled():
            return

        stationRows = self._restSelect(
            authContext.accessToken,
            "stations",
            {
                "select": "id,defaultCameraSourceKey",
                "organizationId": f"eq.{organizationId}",
                "printerId": f"eq.{printerId}",
                "limit": "1",
            },
        )
        if len(stationRows) == 0:
            raise HTTPException(status_code=404, detail="Station not configured for printer")

        stationId = stationRows[0].get("id")
        defaultCameraSourceKey = stationRows[0].get("defaultCameraSourceKey")
        if isinstance(defaultCameraSourceKey, str) and defaultCameraSourceKey == sourceKey:
            return

        if not isinstance(stationId, str) or len(stationId) == 0:
            raise HTTPException(status_code=404, detail="Station camera mapping missing")

        cameraRows = self._restSelect(
            authContext.accessToken,
            "stationCameras",
            {
                "select": "cameraSourceKey",
                "organizationId": f"eq.{organizationId}",
                "stationId": f"eq.{stationId}",
                "cameraSourceKey": f"eq.{sourceKey}",
                "limit": "1",
            },
        )
        if len(cameraRows) == 0:
            raise HTTPException(status_code=403, detail="Camera source is not assigned to this printer")

    def getPrinterName(self, authContext: AuthContext, organizationId: str, printerId: str) -> str:
        if not self.isEnabled():
            return "Printer"

        rows = self._restSelect(
            authContext.accessToken,
            "printers",
            {
                "select": "id,name",
                "organizationId": f"eq.{organizationId}",
                "id": f"eq.{printerId}",
                "limit": "1",
            },
        )
        if len(rows) == 0:
            raise HTTPException(status_code=404, detail="Printer not found")
        printerName = rows[0].get("name")
        if not isinstance(printerName, str) or len(printerName.strip()) == 0:
            return "Printer"
        return printerName

    def getLabNameForPrinter(self, authContext: AuthContext, organizationId: str, printerId: str) -> Optional[str]:
        if not self.isEnabled():
            return None

        printerRows = self._restSelect(
            authContext.accessToken,
            "printers",
            {
                "select": "labId,id",
                "organizationId": f"eq.{organizationId}",
                "id": f"eq.{printerId}",
                "limit": "1",
            },
        )
        if len(printerRows) == 0:
            return None
        labId = printerRows[0].get("labId")
        if not isinstance(labId, str) or len(labId) == 0:
            return None

        labRows = self._restSelect(
            authContext.accessToken,
            "labs",
            {
                "select": "id,name",
                "organizationId": f"eq.{organizationId}",
                "id": f"eq.{labId}",
                "limit": "1",
            },
        )
        if len(labRows) == 0:
            return None
        labName = labRows[0].get("name")
        if isinstance(labName, str) and len(labName.strip()) > 0:
            return labName
        return None

    def countAssignedStationCameras(self, authContext: AuthContext, organizationId: str, printerId: str) -> int:
        if not self.isEnabled():
            return 1

        stationRows = self._restSelect(
            authContext.accessToken,
            "stations",
            {
                "select": "id",
                "organizationId": f"eq.{organizationId}",
                "printerId": f"eq.{printerId}",
                "limit": "1",
            },
        )
        if len(stationRows) == 0:
            return 0
        stationId = stationRows[0].get("id")
        if not isinstance(stationId, str) or len(stationId) == 0:
            return 0

        cameraRows = self._restSelect(
            authContext.accessToken,
            "stationCameras",
            {
                "select": "cameraSourceKey",
                "organizationId": f"eq.{organizationId}",
                "stationId": f"eq.{stationId}",
            },
        )
        return len(cameraRows)

    def _extractAccessToken(self, request: Request, queryAccessToken: Optional[str]) -> Optional[str]:
        authorizationHeader = request.headers.get("authorization")
        if authorizationHeader:
            tokenPrefix = "bearer "
            if authorizationHeader.lower().startswith(tokenPrefix):
                return authorizationHeader[len(tokenPrefix) :].strip()

        if queryAccessToken and len(queryAccessToken) > 0:
            return queryAccessToken

        return None

    def _getAuthenticatedUser(self, accessToken: str) -> Dict[str, Any]:
        assert self.supabaseUrl is not None
        assert self.publishableKey is not None

        response = httpx.get(
            f"{self.supabaseUrl}/auth/v1/user",
            headers={
                "apikey": self.publishableKey,
                "Authorization": f"Bearer {accessToken}",
            },
            timeout=8.0,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return response.json()

    def _loadMembershipOrganizationIds(self, accessToken: str, userId: str) -> List[str]:
        rows = self._restSelect(
            accessToken,
            "organizationMembers",
            {
                "select": "organizationId",
                "userId": f"eq.{userId}",
            },
        )
        organizationIds: List[str] = []
        for row in rows:
            organizationId = row.get("organizationId")
            if isinstance(organizationId, str):
                organizationIds.append(organizationId)
        return organizationIds

    def _extractUserEmail(self, userPayload: Dict[str, Any]) -> Optional[str]:
        directEmail = userPayload.get("email")
        if isinstance(directEmail, str) and len(directEmail.strip()) > 0:
            return directEmail.strip()

        pendingEmail = userPayload.get("new_email")
        if isinstance(pendingEmail, str) and len(pendingEmail.strip()) > 0:
            return pendingEmail.strip()

        userMetadata = userPayload.get("user_metadata")
        if isinstance(userMetadata, dict):
            metadataEmail = userMetadata.get("email")
            if isinstance(metadataEmail, str) and len(metadataEmail.strip()) > 0:
                return metadataEmail.strip()

        identities = userPayload.get("identities")
        if isinstance(identities, list):
            for identity in identities:
                if not isinstance(identity, dict):
                    continue
                identityData = identity.get("identity_data")
                if not isinstance(identityData, dict):
                    continue
                identityEmail = identityData.get("email")
                if isinstance(identityEmail, str) and len(identityEmail.strip()) > 0:
                    return identityEmail.strip()

        return None

    def _restSelect(self, accessToken: str, tableName: str, queryParams: Dict[str, str]) -> List[Dict[str, Any]]:
        assert self.supabaseUrl is not None
        assert self.publishableKey is not None

        response = httpx.get(
            f"{self.supabaseUrl}/rest/v1/{tableName}",
            headers={
                "apikey": self.publishableKey,
                "Authorization": f"Bearer {accessToken}",
                "Accept": "application/json",
            },
            params=queryParams,
            timeout=8.0,
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=403, detail=f"Authorization check failed for {tableName}")
        payload = response.json()
        if isinstance(payload, list):
            return payload
        return []


authService = SupabaseAuthService()
