from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import LegalServiceProvider, ServiceOrder, User
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.order_service import (
    accept_and_release,
    begin_delivery,
    complete_delivery,
    create_order_from_match,
    escrow_hold,
    issue_quote,
    order_to_dict,
    sign_contract,
)

router = APIRouter(prefix="/orders", tags=["orders"])


class CreateOrderBody(BaseModel):
    """Create-order request; accepts camelCase or snake_case payloads."""

    model_config = ConfigDict(populate_by_name=True)

    providerId: str = Field(alias="provider_id")
    productId: str | None = Field(default=None, alias="product_id")
    matchingRequestId: str | None = Field(default=None, alias="matching_request_id")
    consultationId: str | None = Field(default=None, alias="consultation_id")
    note: str | None = None


class QuoteBody(BaseModel):
    amount: int
    note: str | None = None


class DeliverableBody(BaseModel):
    deliverables: list[dict]


class AcceptBody(BaseModel):
    rating: int | None = None
    review: str | None = None


def _fetch_order(db: Session, order_id: str, user: User, allow_provider: bool = False) -> ServiceOrder:
    order = db.query(ServiceOrder).filter(ServiceOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.user_id != user.id:
        if not allow_provider:
            raise HTTPException(status_code=403, detail="无权访问该订单")
        provider = db.query(LegalServiceProvider).filter(
            LegalServiceProvider.id == order.provider_id,
            LegalServiceProvider.user_id == user.id,
        ).first()
        if not provider:
            raise HTTPException(status_code=403, detail="无权访问该订单")
    return order


@router.post("")
def create_order(
    body: CreateOrderBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = create_order_from_match(
        db,
        user_id=user.id,
        provider_id=body.providerId,
        product_id=body.productId,
        matching_request_id=body.matchingRequestId,
        consultation_id=body.consultationId,
        note=body.note,
    )
    return order_to_dict(db, order)


@router.get("")
def list_orders(
    role: str = "user",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(ServiceOrder)
    if role == "provider":
        providers = db.query(LegalServiceProvider).filter(LegalServiceProvider.user_id == user.id).all()
        provider_ids = [p.id for p in providers]
        q = q.filter(ServiceOrder.provider_id.in_(provider_ids or ["__none__"]))
    else:
        q = q.filter(ServiceOrder.user_id == user.id)
    rows = q.order_by(ServiceOrder.created_at.desc()).limit(50).all()
    return [order_to_dict(db, o) for o in rows]


@router.get("/{order_id}")
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = _fetch_order(db, order_id, user, allow_provider=True)
    return order_to_dict(db, order)


@router.post("/{order_id}/quote")
def quote_order(
    order_id: str,
    body: QuoteBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = _fetch_order(db, order_id, user, allow_provider=True)
    try:
        issue_quote(db, order, body.amount, note=body.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return order_to_dict(db, order)


@router.post("/{order_id}/sign")
def sign_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = _fetch_order(db, order_id, user)
    try:
        envelope = sign_contract(db, order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"order": order_to_dict(db, order), "signEnvelope": envelope}


@router.post("/{order_id}/pay")
def pay_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = _fetch_order(db, order_id, user)
    try:
        receipt = escrow_hold(db, order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    begin_delivery(db, order)
    return {"order": order_to_dict(db, order), "escrow": receipt}


@router.post("/{order_id}/deliver")
def deliver_order(
    order_id: str,
    body: DeliverableBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = _fetch_order(db, order_id, user, allow_provider=True)
    try:
        complete_delivery(db, order, deliverables=body.deliverables)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return order_to_dict(db, order)


@router.post("/{order_id}/accept")
def accept_order(
    order_id: str,
    body: AcceptBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = _fetch_order(db, order_id, user)
    try:
        accept_and_release(db, order, rating=body.rating, review=body.review)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return order_to_dict(db, order)
