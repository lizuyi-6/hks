"""Litigation Intelligence service.

Drives the end-to-end flow:

    create_case -> run_prediction -> simulate_scenario
                        |
                        +-> emits `litigation.predicted` system event
                            (automation_engine picks it up for 高风险和解
                            / 高胜诉率匹配诉讼律师 场景化推送)
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import (
    LitigationCase,
    LitigationPrecedent,
    LitigationPrediction,
    LitigationScenario,
    User,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event

logger = logging.getLogger(__name__)


# ---------- payload helpers -------------------------------------------------


def case_to_dict(case: LitigationCase, prediction: LitigationPrediction | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": case.id,
        "title": case.title,
        "case_type": case.case_type,
        "role": case.role,
        "jurisdiction": case.jurisdiction,
        "summary": case.summary,
        "party_scale": case.party_scale,
        "evidence_score": case.evidence_score,
        "claim_amount": case.claim_amount,
        "extras": case.extras or {},
        "status": case.status,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
    }
    if prediction is not None:
        data["prediction"] = prediction_to_dict(prediction)
    return data


def prediction_to_dict(prediction: LitigationPrediction) -> dict[str, Any]:
    return {
        "id": prediction.id,
        "case_id": prediction.case_id,
        "win_probability": prediction.win_probability,
        "risk_level": prediction.risk_level,
        "headline": prediction.headline,
        "money_low": prediction.money_low,
        "money_high": prediction.money_high,
        "money_currency": prediction.money_currency,
        "duration_days_low": prediction.duration_days_low,
        "duration_days_high": prediction.duration_days_high,
        "strategies": prediction.strategies or [],
        "evidence_checklist": prediction.evidence_checklist or [],
        "probability_factors": prediction.probability_factors or [],
        "rationale": prediction.rationale,
        "source_mode": prediction.source_mode,
        "created_at": prediction.created_at.isoformat() if prediction.created_at else None,
        "precedents": [precedent_to_dict(p) for p in getattr(prediction, "precedents", []) or []],
    }


def precedent_to_dict(p: LitigationPrecedent) -> dict[str, Any]:
    return {
        "id": p.id,
        "title": p.title,
        "case_no": p.case_no,
        "court": p.court,
        "year": p.year,
        "outcome": p.outcome,
        "similarity": p.similarity,
        "takeaway": p.takeaway,
        "url": p.url,
    }


def scenario_to_dict(s: LitigationScenario) -> dict[str, Any]:
    return {
        "id": s.id,
        "prediction_id": s.prediction_id,
        "overrides": s.overrides or {},
        "adjusted_probability": s.adjusted_probability,
        "delta": s.delta,
        "note": s.note,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


# ---------- core flow -------------------------------------------------------


def create_case(db: Session, *, user: User, payload: dict[str, Any]) -> LitigationCase:
    case = LitigationCase(
        user_id=user.id,
        title=(payload.get("title") or "未命名案件").strip()[:255],
        case_type=(payload.get("case_type") or "trademark_infringement").strip(),
        role=(payload.get("role") or "plaintiff").strip(),
        jurisdiction=(payload.get("jurisdiction") or "").strip() or None,
        summary=(payload.get("summary") or "").strip(),
        party_scale=(payload.get("party_scale") or None),
        evidence_score=int(payload.get("evidence_score") or 5),
        claim_amount=int(payload.get("claim_amount") or 0) or None,
        extras={
            "opponent_scale": payload.get("opponent_scale"),
            "has_expert_witness": bool(payload.get("has_expert_witness")),
            "prior_negotiation": bool(payload.get("prior_negotiation")),
            **(payload.get("extras") or {}),
        },
        status="draft",
    )
    db.add(case)
    db.flush()
    try:
        emit_event(
            db,
            event_type=event_types.LITIGATION_CASE_CREATED,
            user_id=user.id,
            tenant_id=getattr(user, "tenant_id", None),
            source_entity_type="litigation_case",
            source_entity_id=case.id,
            payload={
                "title": "建立诉讼案件",
                "detail": f"{case.title}（{case.case_type} · {case.role}）",
                "case_type": case.case_type,
                "role": case.role,
            },
        )
    except Exception:  # pragma: no cover — defensive
        logger.exception("litigation.case_created emit failed case=%s", case.id)
    return case


def _case_to_model_input(case: LitigationCase) -> dict[str, Any]:
    extras = case.extras or {}
    return {
        "case_type": case.case_type,
        "role": case.role,
        "jurisdiction": case.jurisdiction,
        "summary": case.summary,
        "evidence_score": case.evidence_score,
        "claim_amount": case.claim_amount,
        "party_scale": case.party_scale,
        "opponent_scale": extras.get("opponent_scale") or case.party_scale,
        "has_expert_witness": bool(extras.get("has_expert_witness")),
        "prior_negotiation": bool(extras.get("prior_negotiation")),
    }


def run_prediction(
    db: Session,
    *,
    case: LitigationCase,
    trace_id: str = "litigation.predict",
) -> LitigationPrediction:
    predictor = provider_registry.get("litigationPredictor")
    envelope = predictor.predict(_case_to_model_input(case), trace_id)
    data = envelope.normalized_payload

    prediction = LitigationPrediction(
        case_id=case.id,
        win_probability=float(data.get("win_probability") or 0.0),
        risk_level=str(data.get("risk_level") or "medium"),
        headline=data.get("headline"),
        money_low=int(data.get("money_low") or 0),
        money_high=int(data.get("money_high") or 0),
        money_currency=str(data.get("money_currency") or "CNY"),
        duration_days_low=int(data.get("duration_days_low") or 0),
        duration_days_high=int(data.get("duration_days_high") or 0),
        strategies=list(data.get("strategies") or []),
        evidence_checklist=list(data.get("evidence_checklist") or []),
        probability_factors=list(data.get("probability_factors") or []),
        rationale=data.get("rationale"),
        source_mode=envelope.mode,
        trace_id=trace_id,
    )
    db.add(prediction)
    db.flush()

    for p in data.get("precedents") or []:
        db.add(LitigationPrecedent(
            prediction_id=prediction.id,
            title=p.get("title") or "",
            case_no=p.get("case_no"),
            court=p.get("court"),
            year=p.get("year"),
            outcome=p.get("outcome"),
            similarity=float(p.get("similarity") or 0.0),
            takeaway=p.get("takeaway"),
            url=p.get("url"),
        ))

    case.status = "predicted"
    db.flush()

    try:
        emit_event(
            db,
            event_type="litigation.predicted",
            user_id=case.user_id,
            source_entity_type="litigation_case",
            source_entity_id=case.id,
            payload={
                "case_id": case.id,
                "prediction_id": prediction.id,
                "win_probability": prediction.win_probability,
                "risk_level": prediction.risk_level,
                "case_type": case.case_type,
                "role": case.role,
            },
        )
    except Exception:  # pragma: no cover — event bus should not block main flow
        logger.exception("failed to emit litigation.predicted event")

    db.refresh(prediction)
    return prediction


def simulate_scenario(
    db: Session,
    *,
    prediction: LitigationPrediction,
    overrides: dict[str, Any],
    persist: bool = True,
    trace_id: str = "litigation.simulate",
) -> dict[str, Any]:
    predictor = provider_registry.get("litigationPredictor")
    case = prediction.case
    base_input = _case_to_model_input(case)
    base_input["win_probability"] = prediction.win_probability
    envelope = predictor.simulate(base_input, overrides or {}, trace_id)
    data = envelope.normalized_payload

    delta = float(data.get("delta") or (data.get("win_probability", 0.0) - prediction.win_probability))
    adjusted = float(data.get("win_probability") or 0.0)

    if persist:
        scenario = LitigationScenario(
            prediction_id=prediction.id,
            overrides=overrides or {},
            adjusted_probability=adjusted,
            delta=delta,
            note=(overrides or {}).get("note"),
        )
        db.add(scenario)
        db.flush()

    return {
        "prediction_id": prediction.id,
        "base_probability": prediction.win_probability,
        "adjusted_probability": adjusted,
        "delta": round(delta, 4),
        "risk_level": data.get("risk_level"),
        "headline": data.get("headline"),
        "money_low": data.get("money_low"),
        "money_high": data.get("money_high"),
        "duration_days_low": data.get("duration_days_low"),
        "duration_days_high": data.get("duration_days_high"),
        "strategies": data.get("strategies") or [],
        "probability_factors": data.get("probability_factors") or [],
        # 胜率页面的文字描述、证据清单、来源模式需随模拟同步刷新，
        # 否则前端只会一直复用持久化的 rationale，text 不会变。
        "rationale": data.get("rationale"),
        "evidence_checklist": data.get("evidence_checklist") or [],
        "precedents_source_count": data.get("precedents_source_count"),
        "source_mode": envelope.mode if hasattr(envelope, "mode") else data.get("source_mode"),
        "overrides": overrides or {},
    }


# ---------- queries ---------------------------------------------------------


def list_cases(db: Session, *, user: User, limit: int = 50) -> list[dict[str, Any]]:
    rows = (
        db.query(LitigationCase)
        .filter(LitigationCase.user_id == user.id)
        .order_by(LitigationCase.created_at.desc())
        .limit(limit)
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        latest = (
            db.query(LitigationPrediction)
            .filter(LitigationPrediction.case_id == row.id)
            .order_by(LitigationPrediction.created_at.desc())
            .first()
        )
        out.append(case_to_dict(row, latest))
    return out


def get_case_detail(db: Session, *, user: User, case_id: str) -> dict[str, Any] | None:
    case = (
        db.query(LitigationCase)
        .filter(LitigationCase.id == case_id, LitigationCase.user_id == user.id)
        .first()
    )
    if not case:
        return None
    prediction = (
        db.query(LitigationPrediction)
        .filter(LitigationPrediction.case_id == case.id)
        .order_by(LitigationPrediction.created_at.desc())
        .first()
    )
    data = case_to_dict(case, prediction)
    if prediction is not None:
        scenarios = (
            db.query(LitigationScenario)
            .filter(LitigationScenario.prediction_id == prediction.id)
            .order_by(LitigationScenario.created_at.desc())
            .limit(20)
            .all()
        )
        data["prediction"]["scenarios"] = [scenario_to_dict(s) for s in scenarios]
    return data


def quick_demo(db: Session, *, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    """Create a case and immediately run prediction — one-shot demo helper."""
    case = create_case(db, user=user, payload=payload)
    prediction = run_prediction(db, case=case)
    return case_to_dict(case, prediction)
