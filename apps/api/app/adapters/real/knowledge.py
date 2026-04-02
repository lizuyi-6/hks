from __future__ import annotations

import json

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import KnowledgeBasePort
from apps.api.app.schemas.common import SourceRef


class RealKnowledgeBaseAdapter(KnowledgeBasePort):
    port_name = "knowledgeBase"
    provider_name = "official-kb-snapshot"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        schema_path = self.settings.knowledge_base_dir / "metadata" / "schema.json"
        return schema_path.exists(), None if schema_path.exists() else "knowledge base schema missing"

    def retrieve(self, topic: str, trace_id: str):
        catalog_path = self.settings.knowledge_base_dir / "metadata" / "catalog.json"
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        items = [item for item in catalog["documents"] if topic in item["topics"]]

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title=item["title"],
                    note=f"{item['priority']} {item['kind']}",
                    url=item.get("source_url"),
                )
                for item in items
            ],
            disclaimer="知识库内容基于官方文件和内部结构化整理，仅供参考，以官方为准。",
            normalized_payload={"topic": topic, "items": items},
        )

