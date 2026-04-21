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
            return True, (
                "SMTP env unset; will use per-tenant provider_integrations"
                "(smtp) if available, otherwise emails are logged only"
            )
        return True, None

    def _resolve_cfg(self, tenant_id: str | None) -> dict | None:
        from apps.api.app.core.database import SessionLocal
        from apps.api.app.db.repositories.integrations import resolve_integration

        db = SessionLocal()
        try:
            return resolve_integration(db, tenant_id, "smtp", self.settings)
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(
                "notification.smtp.resolve_failed tenant=%s error=%s",
                tenant_id,
                exc,
            )
            return None
        finally:
            db.close()

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        trace_id: str,
        tenant_id: str | None = None,
    ):
        sent = False
        error_detail = None

        cfg = self._resolve_cfg(tenant_id)
        secrets = (cfg or {}).get("secrets", {})
        config = (cfg or {}).get("config", {})
        host = config.get("host") or ""
        username = config.get("username") or ""
        password = secrets.get("password") or ""
        from_addr = config.get("from_addr") or "noreply@a1plus.local"
        port = int(config.get("port") or 587)
        use_tls = bool(config.get("use_tls") if config.get("use_tls") is not None else True)

        if host and username and password:
            try:
                msg = MIMEText(body, "plain", "utf-8")
                msg["Subject"] = subject
                msg["From"] = from_addr
                msg["To"] = to_email

                if use_tls:
                    server = smtplib.SMTP(host, port)
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                else:
                    server = smtplib.SMTP_SSL(host, port)

                server.login(username, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
                server.quit()
                sent = True
                logger.info("Email sent to %s, subject=%s", to_email, subject)
            except Exception as exc:
                error_detail = str(exc)
                logger.warning("SMTP send failed: %s", exc)
        else:
            logger.info(
                "SMTP not fully configured (source=%s), skipping actual send for %s",
                (cfg or {}).get("source", "none"),
                to_email,
            )

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
