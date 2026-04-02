from __future__ import annotations

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import NotificationPort
from apps.api.app.schemas.common import SourceRef


class RealNotificationAdapter(NotificationPort):
    port_name = "notification"
    provider_name = "smtp"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        if not self.settings.smtp_host:
            return False, "SMTP_HOST 未配置"
        return True, None

    def send_email(self, to_email: str, subject: str, body: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="SMTP", note=f"目标邮箱 {to_email}")],
            disclaimer="邮件发送结果仅用于任务跟踪。",
            normalized_payload={"subject": subject, "preview": body[:80], "sent": bool(self.settings.smtp_host)},
        )

