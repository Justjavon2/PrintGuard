from __future__ import annotations

import os
import smtplib
import time
from email.message import EmailMessage
from typing import Callable, Literal, Optional

import httpx

EmailProvider = Literal["smtp", "resend"]


class NotificationEmailService:
    def __init__(self) -> None:
        configuredProvider = (os.getenv("EMAIL_PROVIDER") or "smtp").strip().lower()
        self.provider: EmailProvider = "resend" if configuredProvider == "resend" else "smtp"
        retryAttemptsRaw = os.getenv("NOTIFICATION_EMAIL_RETRY_ATTEMPTS", "3")
        try:
            retryAttemptsParsed = int(retryAttemptsRaw)
        except ValueError:
            retryAttemptsParsed = 3
        self.retryAttempts = max(1, min(6, retryAttemptsParsed))

    def sendGuardStartedEmail(
        self,
        toEmail: str,
        organizationName: str,
        printerName: str,
        fleetName: Optional[str],
        cameraCount: int,
    ) -> None:
        subject = f"PrintGuard: Guard started for {printerName}"
        fleetText = fleetName if fleetName else "Unassigned Fleet"
        plainBody = (
            "PrintGuard Guard Started\n\n"
            f"You started Guard this Print.\n"
            f"Organization: {organizationName}\n"
            f"Fleet: {fleetText}\n"
            f"Printer: {printerName}\n"
            f"Assigned Cameras: {cameraCount}\n\n"
            "YOLO live inference has not been enabled yet in this environment.\n"
            "This notification confirms guard mode was started for this specific print."
        )
        htmlBody = (
            "<h2>PrintGuard Guard Started</h2>"
            "<p>You started <strong>Guard this Print</strong>.</p>"
            f"<p><strong>Organization:</strong> {organizationName}<br/>"
            f"<strong>Fleet:</strong> {fleetText}<br/>"
            f"<strong>Printer:</strong> {printerName}<br/>"
            f"<strong>Assigned Cameras:</strong> {cameraCount}</p>"
            "<p>YOLO live inference has not been enabled yet in this environment.<br/>"
            "This notification confirms guard mode was started for this specific print.</p>"
        )

        if self.provider == "resend":
            self._sendWithRetry(
                lambda: self._sendViaResend(
                    toEmail=toEmail,
                    subject=subject,
                    plainBody=plainBody,
                    htmlBody=htmlBody,
                )
            )
            return
        self._sendWithRetry(
            lambda: self._sendViaSmtp(
                toEmail=toEmail,
                subject=subject,
                plainBody=plainBody,
                htmlBody=htmlBody,
            )
        )

    def _sendWithRetry(self, sendOperation: Callable[[], None]) -> None:
        lastError: Optional[Exception] = None
        for attemptIndex in range(self.retryAttempts):
            try:
                sendOperation()
                return
            except Exception as exc:
                lastError = exc
                if not self._isRetryableError(exc):
                    raise
                if attemptIndex == self.retryAttempts - 1:
                    raise
                backoffSeconds = min(8, 2**attemptIndex)
                time.sleep(backoffSeconds)
        if lastError is not None:
            raise lastError

    def _isRetryableError(self, error: Exception) -> bool:
        if isinstance(error, smtplib.SMTPResponseException):
            return int(error.smtp_code) in {421, 450, 451, 452}
        if isinstance(error, (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError)):
            return True

        if isinstance(error, RuntimeError):
            message = str(error).lower()
            if "resend send failed: 429" in message:
                return True
            if "resend send failed: 5" in message:
                return True
            if "deferred" in message or "throttled" in message:
                return True
        return False

    def _sendViaSmtp(self, toEmail: str, subject: str, plainBody: str, htmlBody: str) -> None:
        smtpHost = os.getenv("SMTP_HOST")
        smtpPortRaw = os.getenv("SMTP_PORT", "587")
        smtpUsername = os.getenv("SMTP_USERNAME")
        smtpPassword = os.getenv("SMTP_PASSWORD")
        smtpFromEmail = os.getenv("SMTP_FROM_EMAIL")
        smtpUseTls = (os.getenv("SMTP_USE_TLS", "true").strip().lower() != "false")

        if not smtpHost or not smtpFromEmail:
            raise RuntimeError("SMTP email is not configured (SMTP_HOST / SMTP_FROM_EMAIL missing)")

        try:
            smtpPort = int(smtpPortRaw)
        except ValueError as exc:
            raise RuntimeError("SMTP_PORT must be a valid integer") from exc

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = smtpFromEmail
        message["To"] = toEmail
        message.set_content(plainBody)
        message.add_alternative(htmlBody, subtype="html")

        with smtplib.SMTP(smtpHost, smtpPort, timeout=12) as smtpClient:
            if smtpUseTls:
                smtpClient.starttls()
            if smtpUsername and smtpPassword:
                smtpClient.login(smtpUsername, smtpPassword)
            smtpClient.send_message(message)

    def _sendViaResend(self, toEmail: str, subject: str, plainBody: str, htmlBody: str) -> None:
        resendApiKey = os.getenv("RESEND_API_KEY")
        resendFromEmail = os.getenv("RESEND_FROM_EMAIL")
        if not resendApiKey or not resendFromEmail:
            raise RuntimeError("Resend email is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL missing)")

        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resendApiKey}",
                "Content-Type": "application/json",
            },
            json={
                "from": resendFromEmail,
                "to": [toEmail],
                "subject": subject,
                "text": plainBody,
                "html": htmlBody,
            },
            timeout=12.0,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Resend send failed: {response.status_code} {response.text}")
