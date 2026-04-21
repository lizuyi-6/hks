from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.core.file_parser import ALLOWED_EXTENSIONS, MAX_FILE_SIZE, extract_text
from apps.api.app.services import event_types
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.event_bus import emit_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["upload"])


def _emit_activity(db: Session, user, **kwargs) -> None:
    try:
        emit_event(
            db,
            user_id=user.id,
            tenant_id=user.tenant_id,
            **kwargs,
        )
        db.commit()
    except Exception:  # pragma: no cover — defensive
        logger.exception("upload activity event emit failed user_id=%s", getattr(user, "id", None))


@router.post("/extract-text")
async def extract_text_from_file(
    file: UploadFile,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename = file.filename or "unknown.txt"
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        return {"text": "", "filename": filename, "charCount": 0, "error": "文件超过 10MB 限制"}

    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        return {"text": "", "filename": filename, "charCount": 0, "error": f"不支持的格式 {ext}，请上传 PDF/DOCX/TXT"}

    text = extract_text(content, filename)
    _emit_activity(
        db,
        user,
        event_type=event_types.FILE_UPLOADED,
        source_entity_type="file",
        source_entity_id=filename,
        payload={
            "title": "上传文件",
            "detail": f"解析 {filename}（{len(text)} 字）",
            "filename": filename,
            "charCount": len(text),
            "purpose": "extract_text",
        },
    )
    return {"text": text, "filename": filename, "charCount": len(text)}


@router.post("/parse-business-license")
async def parse_business_license(
    file: UploadFile,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename = file.filename or "unknown"
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        return {"fields": {}, "error": "文件超过 10MB 限制"}

    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in {".pdf", ".docx", ".txt"}:
        return {"fields": {}, "error": "请上传 PDF/DOCX/TXT 格式的营业执照"}

    text = extract_text(content, filename)
    if not text.strip():
        return {"fields": {}, "error": "未能从文件中提取到文本"}

    # Use LLM to extract structured business info
    from apps.api.app.adapters.registry import provider_registry

    llm = provider_registry.get("llm")
    trace_id = f"license-{uuid.uuid4().hex[:12]}"

    system_prompt = (
        "你是一个企业信息提取助手。从提供的营业执照文本中提取以下字段，以 JSON 格式返回：\n"
        "- businessName: 企业名称\n"
        "- industry: 行业\n"
        "- applicantName: 企业全称（同企业名称）\n"
        "- legalPerson: 法定代表人\n"
        "- registeredCapital: 注册资本\n"
        "- address: 住所\n"
        "\n只返回 JSON，不要其他文字。如果某个字段无法识别，返回 null。"
    )
    user_prompt = f"营业执照文本：\n\n{text[:3000]}"

    try:
        envelope = llm.analyze_text(system_prompt, user_prompt, trace_id)
        payload = envelope.normalized_payload if hasattr(envelope, "normalized_payload") else envelope
        fields = payload if isinstance(payload, dict) else {}
    except Exception as exc:
        logger.warning("LLM license parsing failed: %s", exc)
        fields = {}

    business_name = fields.get("businessName") if isinstance(fields, dict) else None
    _emit_activity(
        db,
        user,
        event_type=event_types.LICENSE_PARSED,
        source_entity_type="file",
        source_entity_id=filename,
        payload={
            "title": "解析营业执照",
            "detail": f"已识别企业：{business_name}" if business_name else f"解析 {filename} 完成",
            "filename": filename,
            "businessName": business_name,
        },
    )
    return {"fields": fields, "filename": filename, "extractedCharCount": len(text)}
