from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import NotificationPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


class RealNotificationAdapter(NotificationPort):
    port_name = "notification"
    provider_name = "smtp"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        if not self.settings.smtp_host:
            return True, "SMTP not configured, emails will be logged only"
        return True, None

    def send_email(self, to_email: str, subject: str, body: str, trace_id: str):
        sent = False
        error_detail = None

        if self.settings.smtp_host and self.settings.smtp_username and self.settings.smtp_password:
            try:
                msg = MIMEText(body, "plain", "utf-8")
                msg["Subject"] = subject
                msg["From"] = self.settings.smtp_from
                msg["To"] = to_email

                port = self.settings.smtp_port
                if self.settings.smtp_use_tls:
                    server = smtplib.SMTP(self.settings.smtp_host, port)
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                else:
                    server = smtplib.SMTP_SSL(self.settings.smtp_host, port)

                server.login(self.settings.smtp_username, self.settings.smtp_password)
                server.sendmail(self.settings.smtp_from, [to_email], msg.as_string())
                server.quit()
                sent = True
                logger.info("Email sent to %s, subject=%s", to_email, subject)
            except Exception as exc:
                error_detail = str(exc)
                logger.warning("SMTP send failed: %s", exc)
        else:
            logger.info("SMTP not fully configured, skipping actual send for %s", to_email)

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="SMTP", note=f"目标邮箱 {to_email}")],
            disclaimer="邮件发送结果仅用于任务跟踪。",
            normalized_payload={
                "subject": subject,
                "preview": body[:80],
                "sent": sent,
                "error": error_detail,
            },
        )
