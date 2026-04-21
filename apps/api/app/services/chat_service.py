from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.streaming import sse_event
from apps.api.app.db.models import IpAsset, User
from apps.api.app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

DISCLAIMER = "仅供参考，以官方为准"
MAX_HISTORY_TURNS = 10
MAX_TOOL_CALLS_PER_TURN = 3

SYSTEM_PROMPT_TEMPLATE = """你是 A1+ 法务大脑，一位覆盖知识产权法律服务全链路的 AI Agent。风格：专业、简洁、有温度，像资深律师同事。

## 你的能力（工具）
A. 即时工具（用户可免费使用）
- 商标查重与注册风险评估 · IP 全面诊断与策略建议 · 商标申请书生成
- 合同 IP 条款审查 · 专利可行性评估 · 政策速递 · 资产台账

B. 服务匹配工具（当用户需求涉及专业律师/代理时调用）
- find_lawyer：基于需求画像匹配 Top 3-5 位合适律师
- request_quote：向律师请求报价并建立订单
- start_consultation：发起咨询会话（AI 首诊 → 必要时转人工）
- compliance_scan：启动企业 IP 合规体检

C. 诉讼智能工具
- predict_litigation：当用户问「能不能打赢 / 会赔多少 / 要不要和解 / 对方起诉了怎么办」等诉讼/维权问题时调用，
  输入案情要点（类型、角色、管辖、证据充分度），返回胜诉率、赔偿金额区间、周期、最优策略与相似判例。
  调用后应基于结果向用户解读 1-2 条关键洞察，并按胜诉率高低建议：高 → 匹配诉讼律师；低 → 劝和解 / 补证。

## 重要规则
1. 所有输出必须附带免责声明：**仅供参考，以官方为准**
2. 不代替用户向任何官方系统提交材料
3. 涉及具体法律意见 / 高风险场景（侵权诉讼、竞业纠纷、合同争议、融资尽调、估价）时，应主动调用 find_lawyer 或 start_consultation，不要直接给结论
4. 当用户意图清晰时，主动调用工具执行，不要反复询问确认
5. 工具失败时，用基础建议回复，不暴露技术错误
6. 如果用户明显表达「我想找律师 / 需要人工 / 没法自己搞 / 转人工」之类意图 → 立即 start_consultation 并在回复中给出律师卡片

## 置信度与转人工信号
出现以下情况时，在回复中明确建议用户「发起咨询」或调用 start_consultation：
- 商标查重结果为「红灯」且用户想继续
- 合同中检测到高风险条款（归属 / 惩罚性违约 / 司法管辖异常）
- 监控命中真实侵权线索且用户想维权
- 用户描述中出现「诉讼」「维权」「对方律师函」「被起诉」

## 当前用户
- 用户：{full_name}
- 企业：{business_name}
- 行业：{industry}
- 阶段：{stage}

## 用户 IP 资产台账（{asset_count} 条）
{asset_summary}

## 对话约定
- 简洁回答，避免冗长列表
- 工具返回结果后，用1-2句话点评要点，再给出下一步建议
- 在每轮回复末尾提供1-2个自然的后续问题建议
- 当匹配到律师时，用一句话总结为什么推荐 TA
"""

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "trademark_check",
            "description": "查询商标近似情况，评估注册风险。用户提到注册商标、查重、商标查询时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trademark_name": {"type": "string", "description": "商标名称"},
                    "business_description": {"type": "string", "description": "业务描述，用于推断类别"},
                    "categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "尼斯分类号，如['42']，可根据业务描述推断",
                    },
                },
                "required": ["trademark_name", "business_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ip_diagnosis",
            "description": "对用户业务进行IP全面诊断，给出优先保护建议。用户询问IP策略、需要保护什么时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "business_name": {"type": "string"},
                    "business_description": {"type": "string"},
                    "industry": {"type": "string"},
                    "stage": {"type": "string", "description": "企业阶段: startup/growth/mature"},
                },
                "required": ["business_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_assets",
            "description": "查询用户已有的IP资产台账。用户询问我的商标、资产情况、有哪些IP时调用。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_application",
            "description": "生成商标申请书文档。用户确认要申请、说好的、生成申请书时调用。必须先有trademark_check结果。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trademark_name": {"type": "string"},
                    "applicant_name": {"type": "string"},
                    "business_description": {"type": "string"},
                    "categories": {"type": "array", "items": {"type": "string"}},
                    "risk_level": {"type": "string", "enum": ["green", "yellow", "red"]},
                },
                "required": ["trademark_name", "applicant_name", "categories", "risk_level"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "contract_review",
            "description": "审查合同中的知识产权条款。用户上传合同或提到审合同、合同审查时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "contract_text": {"type": "string", "description": "合同文本内容"},
                },
                "required": ["contract_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patent_assess",
            "description": "评估技术描述的专利保护可行性。用户提到申请专利、技术保护时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "技术方案描述"},
                },
                "required": ["description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "policy_digest",
            "description": "获取行业最新知识产权政策摘要。用户询问最新政策、补贴、扶持政策时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "industry": {"type": "string", "description": "行业名称"},
                },
                "required": ["industry"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_lawyer",
            "description": (
                "根据用户需求画像匹配最合适的律师/代理机构（Top 3-5）。"
                "用户提到找律师、找代理、需要专业人士、想咨询、担心自己做不好、涉及诉讼/争议/侵权等场景时调用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "raw_query": {
                        "type": "string",
                        "description": "用户原始需求（尽量保留原话，匹配引擎会自己抽取意图、紧急度、预算、地域）",
                    },
                    "top_k": {"type": "integer", "default": 3},
                },
                "required": ["raw_query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_quote",
            "description": "向一位律师请求报价并建立订单草稿。当用户明确选择某位律师且希望进入交易流程时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "provider_id": {"type": "string"},
                    "product_id": {"type": "string"},
                    "matching_request_id": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["provider_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_consultation",
            "description": (
                "发起一次咨询会话：AI 先做首诊，当问题复杂（置信度低 / 涉及法律意见 / 用户要求转人工）时自动转人工律师。"
                "涉及诉讼、维权、合同争议等场景应优先调用此工具。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "咨询主题（一句话概括）"},
                    "channel": {"type": "string", "enum": ["ai", "handoff", "human"], "default": "ai"},
                    "provider_id": {"type": "string", "description": "若已知偏好律师，可指定"},
                    "handoff_reason": {"type": "string"},
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compliance_scan",
            "description": "为企业用户发起 IP 合规体检（资产盘点 + 风险评分 + 热力图）。用户提到合规、审计、融资准备、新一轮尽调时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {"type": "string"},
                    "industry": {"type": "string"},
                    "scale": {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "predict_litigation",
            "description": (
                "预测一起 IP 诉讼/纠纷的胜诉率、金额区间、周期与最优策略，并返回相似判例。"
                "用户问「能不能打赢 / 会赔多少 / 要不要起诉 / 要不要和解 / 对方已经发律师函怎么办 / "
                "我被起诉了 / 竞品侵权我该怎么办」等涉及诉讼或维权的问题时应主动调用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "案件简称，如「商标 XX 被仿冒」"},
                    "case_type": {
                        "type": "string",
                        "enum": [
                            "trademark_infringement",
                            "patent_infringement",
                            "copyright_infringement",
                            "unfair_competition",
                            "ownership_dispute",
                            "trademark_opposition",
                        ],
                        "description": "案件类型",
                    },
                    "role": {
                        "type": "string",
                        "enum": ["plaintiff", "defendant"],
                        "description": "我方角色：原告 / 被告",
                    },
                    "jurisdiction": {
                        "type": "string",
                        "description": "管辖法院，例：北京知识产权法院、杭州互联网法院、最高人民法院知识产权法庭",
                    },
                    "summary": {"type": "string", "description": "一句话案情描述"},
                    "evidence_score": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 10,
                        "description": "证据充分度 0-10，默认 5",
                    },
                    "claim_amount": {"type": "integer", "description": "索赔或被索赔金额（元）"},
                    "opponent_scale": {
                        "type": "string",
                        "enum": ["individual", "startup", "sme", "enterprise", "listed"],
                        "description": "对方规模，默认 sme",
                    },
                    "has_expert_witness": {"type": "boolean", "default": False},
                    "prior_negotiation": {"type": "boolean", "default": False},
                },
                "required": ["case_type", "role", "summary"],
            },
        },
    },
]


def build_system_prompt(user: User, assets: list[IpAsset]) -> str:
    asset_lines = []
    for a in assets[:20]:
        expires = a.expires_at.strftime("%Y-%m-%d") if a.expires_at else "长期"
        asset_lines.append(
            f"  - [{a.asset_type}] {a.name} · 状态:{a.status} · 到期:{expires}"
        )
    asset_summary = "\n".join(asset_lines) if asset_lines else "  （暂无已登记资产）"

    return SYSTEM_PROMPT_TEMPLATE.format(
        full_name=user.full_name,
        business_name=user.business_name or "未填写",
        industry=user.industry or "未填写",
        stage=user.stage or "未填写",
        asset_count=len(assets),
        asset_summary=asset_summary,
    )


async def run_chat_stream(
    request: ChatRequest,
    user: User,
    db: Session,
    trace_id: str,
) -> AsyncGenerator[str, None]:
    assets = (
        db.query(IpAsset)
        .filter(IpAsset.owner_id == user.id)
        .order_by(IpAsset.created_at.desc())
        .limit(20)
        .all()
    )
    system_prompt = build_system_prompt(user, assets)

    history = request.history[-MAX_HISTORY_TURNS * 2 :]
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": request.message})

    llm = provider_registry.get("llm")
    tool_call_count = 0
    follow_ups: list[str] = []
    tool_action_names: list[str] = []
    assistant_total_text = ""

    while tool_call_count <= MAX_TOOL_CALLS_PER_TURN:
        pending_tool_call: dict | None = None
        accumulated_text = ""
        meta_sent = tool_call_count > 0

        stream_errored = False
        async for event in llm.multi_turn_stream(messages, CHAT_TOOLS, system_prompt, trace_id):
            event_type = event.get("type")

            if event_type == "meta":
                if not meta_sent:
                    yield sse_event("meta", event)
                    meta_sent = True
                continue

            if event_type == "token":
                accumulated_text += event.get("content", "")
                yield sse_event("token", {"content": event.get("content", "")})
                continue

            if event_type == "tool_call":
                pending_tool_call = event
                break

            if event_type == "error":
                # LLM adapter reported a hard failure mid-stream. We must NOT
                # fall through to emit a success-looking `done`, or the client
                # thinks the turn finished normally with empty content.
                logger.warning(
                    "chat_stream.llm_error trace_id=%s message=%s",
                    trace_id,
                    event.get("message"),
                )
                yield sse_event("error", {
                    "message": event.get("message") or "AI 服务暂时不可用，请稍后重试",
                    "traceId": trace_id,
                })
                stream_errored = True
                break

            if event_type == "done":
                break

        if stream_errored:
            return

        assistant_total_text += accumulated_text

        if pending_tool_call and tool_call_count < MAX_TOOL_CALLS_PER_TURN:
            tool_call_count += 1
            action_name = pending_tool_call["name"]
            tool_action_names.append(action_name)
            action_args = _enrich_args(pending_tool_call.get("args", {}), user, request.context)

            yield sse_event("action_start", {
                "action": action_name,
                "label": _action_label(action_name, action_args),
                "params": action_args,
            })

            try:
                tool_result = await _execute_action(action_name, action_args, user, db, trace_id)
                yield sse_event("action_result", tool_result)

                if accumulated_text:
                    messages.append({"role": "assistant", "content": accumulated_text})
                messages.append({
                    "role": "tool",
                    "tool_call_id": action_name,
                    "content": json.dumps(tool_result, ensure_ascii=False),
                })
                continue
            except Exception as exc:
                logger.warning("tool execution failed: %s %s", action_name, exc)
                yield sse_event("action_result", {
                    "action": action_name, "error": True,
                    "message": "工具调用失败，请稍后重试",
                })
                if accumulated_text:
                    messages.append({"role": "assistant", "content": accumulated_text})
                messages.append({
                    "role": "tool",
                    "tool_call_id": action_name,
                    "content": "工具调用失败，请基于已知信息给用户提供基础建议。",
                })
                continue

        break

    # Guard against "silent success": if the model produced no tokens and no
    # tool ran, something went wrong upstream (empty completion / zero-length
    # choice). Surface as an explicit error instead of an empty `done`.
    if not assistant_total_text.strip() and not tool_action_names:
        logger.warning(
            "chat_stream.empty_turn trace_id=%s user_id=%s",
            trace_id,
            getattr(user, "id", None),
        )
        yield sse_event("error", {
            "message": "AI 未能生成回复，请稍后重试",
            "traceId": trace_id,
        })
        return

    # Auto handoff: if the conversation smells like the AI should step aside,
    # create a ConsultationSession on behalf of the user and emit a `handoff`
    # event so the UI can surface it. Skip when the user already triggered
    # start_consultation as an explicit tool call in the same turn.
    if "start_consultation" not in tool_action_names:
        handoff = _maybe_auto_handoff(
            db, user, request.message, assistant_total_text, trace_id
        )
        if handoff:
            yield sse_event("handoff", handoff)

    yield sse_event("done", {
        "disclaimer": DISCLAIMER,
        "followUp": follow_ups or _default_follow_ups(request.message),
    })


def _score_turn_confidence(user_message: str, assistant_text: str) -> tuple[float, str | None]:
    """Pure helper — returns (confidence, handoff_reason|None).

    Same shape as ``order_service._recalc_ai_confidence`` but operates on the
    *current turn* without touching the DB, so we can call it from the
    streaming path before committing state.
    """
    from apps.api.app.services.order_service import _CONFIDENCE_DROP_KEYWORDS

    conf = 0.85
    reason: str | None = None
    for kw in _CONFIDENCE_DROP_KEYWORDS:
        if kw and kw in (user_message or ""):
            conf -= 0.3
            reason = f"用户提及「{kw}」"
            break
    if any(
        k in (assistant_text or "")
        for k in ("我无法", "建议咨询律师", "超出 AI", "无法确定", "请律师", "建议请律师")
    ):
        conf -= 0.25
        reason = reason or "AI 自认把握不足"
    # Explicit keyword handoff overrides confidence.
    kw_handoff, kw_reason = needs_human_handoff(user_message)
    if kw_handoff:
        conf = min(conf, 0.3)
        reason = reason or kw_reason
    return max(0.05, min(1.0, conf)), reason


def _maybe_auto_handoff(
    db: Session,
    user: User,
    user_message: str,
    assistant_text: str,
    trace_id: str,
) -> dict[str, Any] | None:
    conf, reason = _score_turn_confidence(user_message, assistant_text)
    if conf >= 0.45 or not reason:
        return None
    try:
        from apps.api.app.services.order_service import create_consultation_session

        session, info = create_consultation_session(
            db,
            user=user,
            topic=(user_message or "AI 转人工咨询")[:80],
            channel="handoff",
            handoff_reason=reason,
        )
        return {
            "consultation_id": session.id,
            "status": session.status,
            "reason": reason,
            "confidence": conf,
            "handoff": info,
            "detail_url": f"/consult/session/{session.id}",
        }
    except Exception as exc:  # pragma: no cover — defensive
        logger.warning("auto handoff failed trace=%s err=%s", trace_id, exc)
        return None


def _enrich_args(args: dict, user: User, context: dict) -> dict:
    enriched = dict(args)
    for k, v in context.items():
        if k not in enriched or not enriched[k]:
            enriched[k] = v
    if "applicant_name" not in enriched or not enriched["applicant_name"]:
        enriched["applicant_name"] = user.applicant_name or user.full_name
    return enriched


def _action_label(action: str, args: dict) -> str:
    labels = {
        "trademark_check": f"正在查询商标「{args.get('trademark_name', '...')}」...",
        "ip_diagnosis": "正在进行IP全面诊断...",
        "list_assets": "正在查询您的IP资产台账...",
        "generate_application": f"正在生成「{args.get('trademark_name', '...')}」申请书...",
        "contract_review": "正在审查合同知识产权条款...",
        "patent_assess": "正在评估专利可行性...",
        "policy_digest": f"正在获取{args.get('industry', '行业')}政策速递...",
        "find_lawyer": "正在为您匹配合适的律师/代理...",
        "request_quote": "正在向律师发送报价请求...",
        "start_consultation": f"正在发起咨询：{args.get('topic', '...')}",
        "compliance_scan": "正在启动企业 IP 合规体检...",
    }
    return labels.get(action, f"正在执行 {action}...")


_HANDOFF_KEYWORDS = [
    "找律师", "找代理", "人工客服", "转人工", "约律师", "需要律师",
    "被起诉", "律师函", "应诉", "维权", "侵权",
    "诉讼", "仲裁", "判决", "赔偿",
    "我不会", "搞不定", "搞不懂", "太复杂",
]


def needs_human_handoff(user_message: str) -> tuple[bool, str | None]:
    msg = user_message or ""
    for kw in _HANDOFF_KEYWORDS:
        if kw in msg:
            return True, f"用户触发关键字「{kw}」"
    return False, None


def _default_follow_ups(user_message: str) -> list[str]:
    handoff, _ = needs_human_handoff(user_message)
    if any(kw in user_message for kw in ("打赢", "胜诉", "赔多少", "赔偿", "起诉", "被告", "诉讼", "维权", "侵权", "律师函")):
        return ["要我直接预测这起案件的胜诉率和金额区间吗？", "要匹配擅长诉讼的律师吗？"]
    if handoff:
        return ["要我帮你匹配 3 位擅长此类问题的律师吗？", "要发起一次在线咨询吗？"]
    if any(kw in user_message for kw in ("商标", "注册", "品牌")):
        return ["需要我帮你生成申请书吗？", "要匹配专业商标律师吗？"]
    if "专利" in user_message:
        return ["要了解专利申请的完整流程吗？", "要匹配擅长专利的代理人吗？"]
    if "合同" in user_message:
        return ["需要我逐条分析风险条款吗？", "要请律师帮你把关合同吗？"]
    if any(kw in user_message for kw in ("合规", "审计", "融资", "尽调")):
        return ["要启动企业合规体检吗？", "要订阅政策雷达吗？"]
    return ["需要查看您的IP资产台账吗？", "要进行IP全面诊断吗？"]


async def _execute_action(
    action: str,
    args: dict,
    user: User,
    db: Session,
    trace_id: str,
) -> dict[str, Any]:
    if action == "trademark_check":
        from apps.api.app.schemas.trademark import TrademarkCheckRequest
        payload = TrademarkCheckRequest(
            trademark_name=args["trademark_name"],
            business_description=args.get("business_description", ""),
            applicant_name=args.get("applicant_name") or user.applicant_name or user.full_name,
            applicant_type=user.applicant_type or "company",
            categories=args.get("categories", ["35"]),
        )
        envelope = provider_registry.get("trademarkSearch").search(payload, trace_id)
        result = envelope.normalized_payload
        return {
            "action": "trademark_check",
            "risk_level": result.risk_level,
            "summary": result.summary,
            "recommendation": result.recommendation,
            "findings_count": len(result.findings),
            "alternatives": result.alternatives[:3],
        }

    elif action == "ip_diagnosis":
        from apps.api.app.schemas.diagnosis import DiagnosisRequest
        payload = DiagnosisRequest(
            business_name=args.get("business_name") or user.business_name,
            business_description=args["business_description"],
            industry=args.get("industry") or user.industry,
            stage=args.get("stage") or user.stage,
        )
        kb = provider_registry.get("knowledgeBase")
        knowledge = kb.retrieve("ip-strategy", trace_id).normalized_payload
        envelope = provider_registry.get("llm").diagnose(payload, knowledge, trace_id)
        result = envelope.normalized_payload
        return {
            "action": "ip_diagnosis",
            "summary": result.summary,
            "priority_assets": result.priority_assets,
            "risks": result.risks,
            "next_actions": result.next_actions,
        }

    elif action == "list_assets":
        assets = (
            db.query(IpAsset)
            .filter(IpAsset.owner_id == user.id)
            .order_by(IpAsset.created_at.desc())
            .all()
        )
        return {
            "action": "list_assets",
            "total": len(assets),
            "assets": [
                {
                    "name": a.name,
                    "type": a.asset_type,
                    "status": a.status,
                    "expires_at": a.expires_at.isoformat() if a.expires_at else None,
                }
                for a in assets
            ],
        }

    elif action == "generate_application":
        from apps.api.app.services.jobs import enqueue_job, process_job
        payload_data = {
            "trademark_name": args["trademark_name"],
            "applicant_name": args.get("applicant_name") or user.full_name,
            "applicant_type": user.applicant_type or "company",
            "business_description": args.get("business_description", ""),
            "categories": args.get("categories", ["35"]),
            "risk_level": args.get("risk_level", "yellow"),
        }
        job = enqueue_job(db, "trademark.application", payload_data)
        process_job(db, job)
        db.refresh(job)
        return {
            "action": "generate_application",
            "job_id": job.id,
            "status": job.status,
            "download_hint": f"申请书已生成，可通过 /trademarks/drafts/{job.id} 获取",
        }

    elif action == "contract_review":
        envelope = provider_registry.get("contractReview").review(
            args["contract_text"], trace_id
        )
        result = envelope.normalized_payload
        return {
            "action": "contract_review",
            "summary": result.get("summary", ""),
            "risks_count": len(result.get("risks", [])),
        }

    elif action == "patent_assess":
        envelope = provider_registry.get("patentAssist").assess(
            args["description"], trace_id
        )
        result = envelope.normalized_payload
        return {"action": "patent_assess", **result}

    elif action == "policy_digest":
        envelope = provider_registry.get("policyDigest").digest(
            args.get("industry", "通用"), trace_id
        )
        result = envelope.normalized_payload
        return {"action": "policy_digest", **result}

    elif action == "find_lawyer":
        from apps.api.app.services.matching_engine import run_matching
        top_k = int(args.get("top_k", 3)) or 3
        raw_query = args.get("raw_query") or args.get("topic") or ""
        request, candidates = run_matching(db, user, raw_query, top_k=top_k, trace_id=trace_id)
        preview = [{
            "provider_id": c.get("provider_id"),
            "name": c.get("name"),
            "rating": c.get("rating_avg"),
            "score": c.get("score"),
            "reasons": c.get("reasons", [])[:3],
            "product_name": c.get("product_name"),
            "product_price": c.get("product_price"),
            "product_id": c.get("product_id"),
            "response_sla_minutes": c.get("response_sla_minutes"),
        } for c in candidates]
        return {
            "action": "find_lawyer",
            "request_id": request.id,
            "intent": request.intent_category,
            "matched": len(candidates),
            "candidates": preview,
            "detail_url": f"/match/{request.id}",
        }

    elif action == "request_quote":
        from apps.api.app.services.order_service import create_order_from_match
        provider_id = args.get("provider_id")
        if not provider_id:
            return {"action": "request_quote", "error": True, "message": "缺少 provider_id"}
        order = create_order_from_match(
            db, user_id=user.id,
            provider_id=provider_id,
            product_id=args.get("product_id"),
            matching_request_id=args.get("matching_request_id"),
            note=args.get("note"),
        )
        return {
            "action": "request_quote",
            "order_id": order.id,
            "order_no": order.order_no,
            "status": order.status,
            "detail_url": f"/orders/{order.id}",
        }

    elif action == "start_consultation":
        from apps.api.app.services.order_service import create_consultation_session
        session, handoff = create_consultation_session(
            db,
            user=user,
            topic=args.get("topic", "咨询"),
            channel=args.get("channel", "ai"),
            provider_id=args.get("provider_id"),
            handoff_reason=args.get("handoff_reason"),
        )
        return {
            "action": "start_consultation",
            "consultation_id": session.id,
            "status": session.status,
            "handoff": handoff,
            "detail_url": f"/consult/session/{session.id}",
        }

    elif action == "compliance_scan":
        from apps.api.app.services.compliance_engine import run_compliance_audit
        result = run_compliance_audit(
            db, user=user,
            company_name=args.get("company_name") or user.business_name or user.full_name,
            industry=args.get("industry") or user.industry,
            scale=args.get("scale"),
            trace_id=trace_id,
        )
        return {
            "action": "compliance_scan",
            "profile_id": result["profile_id"],
            "score": result["score"],
            "findings_count": len(result.get("findings", [])),
            "summary": result.get("summary"),
            "detail_url": f"/enterprise/audit/{result['profile_id']}",
        }

    elif action == "predict_litigation":
        from apps.api.app.services.litigation_service import create_case, run_prediction
        case = create_case(
            db,
            user=user,
            payload={
                "title": args.get("title") or "诉讼预测",
                "case_type": args.get("case_type") or "trademark_infringement",
                "role": args.get("role") or "plaintiff",
                "jurisdiction": args.get("jurisdiction"),
                "summary": args.get("summary") or "",
                "evidence_score": args.get("evidence_score", 5),
                "claim_amount": args.get("claim_amount"),
                "opponent_scale": args.get("opponent_scale"),
                "has_expert_witness": args.get("has_expert_witness", False),
                "prior_negotiation": args.get("prior_negotiation", False),
            },
        )
        prediction = run_prediction(db, case=case, trace_id=trace_id)
        top_strategy = (prediction.strategies or [{}])[0]
        return {
            "action": "predict_litigation",
            "case_id": case.id,
            "prediction_id": prediction.id,
            "win_probability": round(prediction.win_probability, 3),
            "risk_level": prediction.risk_level,
            "headline": prediction.headline,
            "money_low": prediction.money_low,
            "money_high": prediction.money_high,
            "duration_days_low": prediction.duration_days_low,
            "duration_days_high": prediction.duration_days_high,
            "top_strategy": {
                "name": top_strategy.get("name"),
                "score": top_strategy.get("score"),
                "rationale": top_strategy.get("rationale"),
            } if top_strategy else None,
            "strategies_count": len(prediction.strategies or []),
            "precedents_count": len(prediction.precedents or []),
            "detail_url": f"/litigation?case_id={case.id}",
        }

    else:
        raise ValueError(f"Unknown action: {action}")
