from __future__ import annotations

from typing import Literal

from apps.api.app.schemas.common import ApiModel


class ChatMessage(ApiModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(ApiModel):
    message: str
    history: list[ChatMessage] = []
    context: dict = {}
    session_id: str | None = None
