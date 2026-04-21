from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from uuid import uuid4

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.core.md_renderer import md_to_docx, md_to_pdf
from apps.api.app.ports.interfaces import DocumentRenderPort
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.trademark import ApplicationDraftRequest


RISK_LEVEL_LABEL: dict[str, str] = {
    "red": "红色（高风险）",
    "yellow": "黄色（中风险）",
    "green": "绿色（低风险）",
}


def build_application_markdown(
    payload: ApplicationDraftRequest, summary: dict[str, Any]
) -> str:
    """Compose the trademark application draft as Markdown.

    This is the single source of truth; ``md_to_docx`` / ``md_to_pdf`` then
    produce the download-friendly artifacts.
    """
    risk = (payload.risk_level or "").lower()
    risk_label = RISK_LEVEL_LABEL.get(risk, payload.risk_level or "未评估")
    categories = ", ".join(payload.categories) if payload.categories else "待补充"
    summary_text = (summary or {}).get("summary") or "待补充"

    lines: list[str] = []
    lines.append("# A1+ 商标申请书草稿 / Trademark Application Draft")
    lines.append("")
    lines.append("## 一、基础信息")
    lines.append(f"- **商标名称 / Trademark**：{payload.trademark_name}")
    lines.append(f"- **申请人 / Applicant**：{payload.applicant_name}")
    lines.append(f"- **申请人类型 / Applicant Type**：{payload.applicant_type}")
    lines.append(f"- **建议类别 / Suggested Classes**：{categories}")
    lines.append(f"- **风险等级 / Risk Level**：{risk_label}")
    lines.append("")
    lines.append("## 二、AI 摘要")
    lines.append(summary_text)
    lines.append("")
    lines.append("## 三、合规声明")
    lines.append(
        "A1+ 只负责文档准备与提交指引，不代用户提交到官方系统。用户需在官方系统自行提交并对提交结果负责。"
    )
    lines.append("")
    lines.append(
        "> Compliance Notice: A1+ only prepares documents and submission guidance."
        " Users submit to official systems on their own."
    )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*本申请书由 A1+ 自动生成，仅供参考，以官方要求为准。*")
    return "\n".join(lines)


def build_contract_markdown(context: dict[str, Any]) -> str:
    """Compose a service agreement draft for the e-signature adapter."""
    envelope_id = context.get("envelope_id") or "—"
    order_id = context.get("order_id") or "—"
    title = context.get("title") or f"服务委托合同 / Service Agreement ({order_id})"
    generated_at = context.get("generated_at") or "—"
    signers = context.get("signers") or []

    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append("## 一、基础信息")
    lines.append(f"- **合同编号 / Envelope**：{envelope_id}")
    lines.append(f"- **关联订单 / Order**：{order_id}")
    lines.append(f"- **生成时间 / Generated**：{generated_at}")
    lines.append("")
    lines.append("## 二、签署人 / Signers")
    if signers:
        for i, s in enumerate(signers, 1):
            if not isinstance(s, dict):
                lines.append(f"{i}. {s}")
                continue
            name = s.get("name") or s.get("full_name") or "—"
            role = s.get("role") or s.get("party") or ""
            contact = s.get("email") or s.get("phone") or ""
            suffix_parts = [x for x in (role, contact) if x]
            suffix = f"（{' · '.join(suffix_parts)}）" if suffix_parts else ""
            lines.append(f"{i}. **{name}**{suffix}")
    else:
        lines.append("暂未指定签署人。")
    lines.append("")
    lines.append("## 三、合同条款")
    lines.append(
        "甲乙双方在平等自愿的基础上，就委托服务事项达成如下合同条款。双方应当遵守《中华人民共和国民法典》"
        "及相关法律法规，妥善履行合同义务。"
    )
    lines.append("")
    lines.append("1. 服务范围以订单中列明的条目为准，双方如需变更应签署补充协议。")
    lines.append("2. 服务费用及支付方式以订单为准，服务方在收到费用后开始执行。")
    lines.append("3. 服务过程中产生的知识产权成果归属以订单附加条款约定为准。")
    lines.append("4. 任一方违约，守约方有权要求违约方承担违约责任并赔偿损失。")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(
        "*本合同由 A1+ 沙箱电子签生成，未调用真实 CA。正式签署请以平台接入的官方电子签 / 线下签署为准。*"
    )
    return "\n".join(lines)


class RealDocumentRenderAdapter(DocumentRenderPort):
    port_name = "documentRender"
    provider_name = "md-unified-pipeline"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _generated_dir(self) -> Path:
        target = Path(self.settings.generated_dir)
        target.mkdir(parents=True, exist_ok=True)
        return target

    def _write_triplet(self, base_name: str, md: str) -> tuple[Path, Path, Path]:
        """Persist ``base_name.md / .docx / .pdf`` and return all three paths.

        Having the Markdown source alongside derived formats makes audits
        trivial — you can diff the MD to see what changed between runs.
        """
        root = self._generated_dir()
        md_path = root / f"{base_name}.md"
        docx_path = root / f"{base_name}.docx"
        pdf_path = root / f"{base_name}.pdf"
        md_path.write_text(md, encoding="utf-8")
        md_to_docx(md, docx_path)
        md_to_pdf(md, pdf_path)
        return md_path, docx_path, pdf_path

    # ------------------------------------------------------------------
    # Port: trademark application
    # ------------------------------------------------------------------

    def render_application(
        self, payload: ApplicationDraftRequest, summary: dict, trace_id: str
    ) -> tuple[str, str]:
        safe_name = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", payload.trademark_name)[:40]
        base_name = f"{safe_name}-{uuid4().hex[:8]}"
        md = build_application_markdown(payload, summary or {})
        _, docx_path, pdf_path = self._write_triplet(base_name, md)
        return str(docx_path), str(pdf_path)

    # ------------------------------------------------------------------
    # Generic render used by the e-signature adapter
    # ------------------------------------------------------------------

    def render(
        self,
        template_id: str,
        context: dict[str, Any],
        trace_id: str,
    ):
        """Render a generic document (Markdown → DOCX + PDF).

        Currently wired up for ``service_agreement_v1``; unknown templates
        fall back to the service-agreement layout so callers always get a
        working file pair. The e-signature adapter consumes the returned
        ``pdf_path`` directly.
        """
        context = dict(context or {})
        template = (template_id or "service_agreement_v1").strip()

        if template == "service_agreement_v1":
            md = build_contract_markdown(context)
            prefix = "contract"
        else:
            # Safe default: still produce a Markdown-driven contract so
            # documentRender.render never silently returns nothing.
            md = build_contract_markdown(context)
            prefix = re.sub(r"[^\w\-]", "_", template) or "document"

        order_id = str(context.get("order_id") or uuid4().hex)[:8]
        base_name = f"{prefix}-{order_id}-{uuid4().hex[:6]}"
        md_path, docx_path, pdf_path = self._write_triplet(base_name, md)

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title=f"documentRender render({template})",
                    note=f"md={md_path.name}",
                ),
            ],
            disclaimer="文档由 Markdown → DOCX/PDF 统一管线生成，仅供参考。",
            normalized_payload={
                "template_id": template,
                "md_path": str(md_path),
                "docx_path": str(docx_path),
                "pdf_path": str(pdf_path),
            },
        )
