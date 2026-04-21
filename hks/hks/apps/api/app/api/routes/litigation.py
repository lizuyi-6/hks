"""Routes for Litigation Intelligence.

All endpoints return a plain dict (BFF-consumable) plus a `mode` field so the
web app can render the "real / mock" badge consistently with other modules.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import LitigationCase, LitigationPrediction, User
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.litigation_service import (
    case_to_dict,
    create_case,
    get_case_detail,
    list_cases,
    quick_demo,
    run_prediction,
    simulate_scenario,
)

router = APIRouter(prefix="/litigation", tags=["litigation"])


class CasePayload(BaseModel):
    title: str = Field(default="未命名案件")
    case_type: str = Field(default="trademark_infringement")
    role: str = Field(default="plaintiff")
    jurisdiction: str | None = None
    summary: str
    party_scale: str | None = None
    opponent_scale: str | None = None
    evidence_score: int = Field(default=5, ge=0, le=10)
    claim_amount: int | None = None
    has_expert_witness: bool = False
    prior_negotiation: bool = False
    extras: dict | None = None


class SimulateBody(BaseModel):
    overrides: dict
    persist: bool = False
    note: str | None = None


@router.post("/cases")
def create_case_route(
    payload: CasePayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = create_case(db, user=user, payload=payload.model_dump())
    db.commit()
    return {"case": case_to_dict(case)}


@router.get("/cases")
def list_cases_route(
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"cases": list_cases(db, user=user, limit=limit)}


@router.get("/cases/{case_id}")
def get_case_route(
    case_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    detail = get_case_detail(db, user=user, case_id=case_id)
    if not detail:
        raise HTTPException(status_code=404, detail="case not found")
    return {"case": detail}


@router.post("/cases/{case_id}/predict")
def predict_case_route(
    case_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = (
        db.query(LitigationCase)
        .filter(LitigationCase.id == case_id, LitigationCase.user_id == user.id)
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    prediction = run_prediction(db, case=case)
    db.commit()
    db.refresh(prediction)
    return {"case": case_to_dict(case, prediction)}


@router.post("/cases/{case_id}/simulate")
def simulate_case_route(
    case_id: str,
    body: SimulateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = (
        db.query(LitigationCase)
        .filter(LitigationCase.id == case_id, LitigationCase.user_id == user.id)
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    prediction = (
        db.query(LitigationPrediction)
        .filter(LitigationPrediction.case_id == case.id)
        .order_by(LitigationPrediction.created_at.desc())
        .first()
    )
    if not prediction:
        raise HTTPException(status_code=400, detail="prediction not yet available; call /predict first")
    overrides = dict(body.overrides or {})
    if body.note:
        overrides["note"] = body.note
    result = simulate_scenario(
        db,
        prediction=prediction,
        overrides=overrides,
        persist=body.persist,
    )
    if body.persist:
        db.commit()
    return result


@router.post("/quick")
def quick_demo_route(
    payload: CasePayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = quick_demo(db, user=user, payload=payload.model_dump())
    db.commit()
    return {"case": data}
