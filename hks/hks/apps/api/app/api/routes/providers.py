from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import (
    LegalServiceProvider,
    ServiceOrder,
    ServiceProduct,
    User,
)
from apps.api.app.services.dependencies import get_current_user

router = APIRouter(prefix="/providers", tags=["providers"])


# ---------------------------------------------------------------------------
# Provider depth (T3) — quantifies how "deep" a provider is in each practice
# area, so the match UI can surface an at-a-glance "深耕 L3" badge.
# ---------------------------------------------------------------------------
_DEPTH_LEVELS = (
    (0.70, "L3", "深耕专家"),
    (0.40, "L2", "活跃服务"),
    (0.00, "L1", "新锐"),
)


def _depth_level(score: float) -> tuple[str, str]:
    for threshold, code, label in _DEPTH_LEVELS:
        if score >= threshold:
            return code, label
    return "L1", "新锐"


def _compute_provider_depth(
    db: Session, provider: LegalServiceProvider
) -> dict[str, object]:
    """Return per-area depth metrics + overall signal for ``provider``.

    Depth is a weighted blend of:
      * closed-order volume in that area (capped at 20 to avoid whale skew)
      * average user rating of delivered orders (5-star scale)
      * provider-wide win rate (floor signal for new areas)
    """

    areas = list(provider.practice_areas or [])
    if not areas:
        return {
            "providerId": provider.id,
            "overall": {"score": 0.0, "level": "L1", "label": "新锐"},
            "byArea": [],
            "primary": None,
        }

    # Aggregate closed orders + avg user rating per category in one pass.
    rows = (
        db.query(
            ServiceProduct.category.label("area"),
            func.count(ServiceOrder.id).label("closed"),
            func.avg(ServiceOrder.user_rating).label("avg_rating"),
        )
        .join(ServiceProduct, ServiceOrder.product_id == ServiceProduct.id)
        .filter(
            ServiceOrder.provider_id == provider.id,
            ServiceOrder.status == "closed",
        )
        .group_by(ServiceProduct.category)
        .all()
    )
    stats_by_area: dict[str, tuple[int, float | None]] = {
        r.area: (int(r.closed or 0), float(r.avg_rating) if r.avg_rating is not None else None)
        for r in rows
    }

    win_rate = float(provider.win_rate or 0.0)
    win_rate = max(0.0, min(1.0, win_rate))

    by_area: list[dict[str, object]] = []
    for area in areas:
        closed, avg_rating = stats_by_area.get(area, (0, None))
        volume = min(1.0, closed / 20.0)
        rating = (avg_rating or provider.rating_avg or 0.0) / 5.0
        rating = max(0.0, min(1.0, rating))
        score = round(0.55 * volume + 0.30 * rating + 0.15 * win_rate, 3)
        level, label = _depth_level(score)
        by_area.append(
            {
                "area": area,
                "ordersClosed": closed,
                "avgRating": round(avg_rating, 2) if avg_rating is not None else None,
                "score": score,
                "level": level,
                "label": label,
            }
        )

    primary = max(by_area, key=lambda x: x["score"]) if by_area else None
    overall_score = round(
        sum(x["score"] for x in by_area) / len(by_area), 3
    ) if by_area else 0.0
    overall_level, overall_label = _depth_level(overall_score)

    return {
        "providerId": provider.id,
        "overall": {
            "score": overall_score,
            "level": overall_level,
            "label": overall_label,
        },
        "byArea": by_area,
        "primary": primary,
    }


class ProviderUpsertBody(BaseModel):
    providerType: str = "lawyer"
    name: str
    shortIntro: str | None = None
    description: str | None = None
    regions: list[str] = []
    practiceAreas: list[str] = []
    languages: list[str] = []
    featuredTags: list[str] = []
    responseSlaMinutes: int = 180
    hourlyRateRange: str | None = None
    avatarUrl: str | None = None


class ProductUpsertBody(BaseModel):
    category: str
    name: str
    summary: str | None = None
    description: str | None = None
    price: int = 0
    priceMode: str = "fixed"
    deliveryDays: int = 7
    deliverables: list[str] = []
    spec: dict = {}


def _provider_to_dict(p: LegalServiceProvider) -> dict:
    return {
        "id": p.id,
        "userId": p.user_id,
        "providerType": p.provider_type,
        "name": p.name,
        "shortIntro": p.short_intro,
        "description": p.description,
        "regions": p.regions or [],
        "practiceAreas": p.practice_areas or [],
        "languages": p.languages or [],
        "featuredTags": p.featured_tags or [],
        "ratingAvg": p.rating_avg,
        "ordersCount": p.orders_count,
        "responseSlaMinutes": p.response_sla_minutes,
        "winRate": p.win_rate,
        "hourlyRateRange": p.hourly_rate_range,
        "verifiedAt": p.verified_at.isoformat() if p.verified_at else None,
        "status": p.status,
        "avatarUrl": p.avatar_url,
        "createdAt": p.created_at.isoformat(),
    }


def _product_to_dict(p: ServiceProduct) -> dict:
    return {
        "id": p.id,
        "providerId": p.provider_id,
        "category": p.category,
        "name": p.name,
        "summary": p.summary,
        "description": p.description,
        "price": p.price,
        "priceMode": p.price_mode,
        "deliveryDays": p.delivery_days,
        "deliverables": p.deliverables or [],
        "spec": p.spec or {},
        "status": p.status,
        "soldCount": p.sold_count,
        "ratingAvg": p.rating_avg,
        "createdAt": p.created_at.isoformat(),
    }


@router.get("")
def list_providers(
    intent: str | None = None,
    region: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(LegalServiceProvider).filter(LegalServiceProvider.status == "active")
    rows = q.order_by(LegalServiceProvider.rating_avg.desc()).all()

    def _match(p: LegalServiceProvider) -> bool:
        if intent and (not p.practice_areas or intent not in (p.practice_areas or [])):
            return False
        if region and region != "全国":
            if p.regions and region not in p.regions and "全国" not in p.regions:
                return False
        return True

    return [_provider_to_dict(p) for p in rows if _match(p)]


@router.get("/me")
def my_provider_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(LegalServiceProvider).filter(LegalServiceProvider.user_id == user.id).first()
    if not p:
        return None
    return _provider_to_dict(p)


@router.post("/me")
def upsert_provider_profile(
    body: ProviderUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(LegalServiceProvider).filter(LegalServiceProvider.user_id == user.id).first()
    if not p:
        p = LegalServiceProvider(user_id=user.id, name=body.name)
        db.add(p)

    p.provider_type = body.providerType
    p.name = body.name
    p.short_intro = body.shortIntro
    p.description = body.description
    p.regions = body.regions
    p.practice_areas = body.practiceAreas
    p.languages = body.languages
    p.featured_tags = body.featuredTags
    p.response_sla_minutes = body.responseSlaMinutes
    p.hourly_rate_range = body.hourlyRateRange
    p.avatar_url = body.avatarUrl

    # Refresh the persisted tag vector so the embedding recall path picks up
    # any change to practice_areas / featured_tags on the very next query.
    from apps.api.app.services.matching_engine import recompute_provider_tag_vec

    recompute_provider_tag_vec(db, p, commit=False)

    db.commit()
    db.refresh(p)
    return _provider_to_dict(p)


@router.get("/depth")
def providers_depth(
    providerIds: str | None = Query(default=None, description="Comma-separated provider ids"),
    intent: str | None = None,
    db: Session = Depends(get_db),
):
    """Batch endpoint returning depth breakdowns.

    Accepts either an explicit comma-separated ``providerIds`` list or falls
    back to the active roster optionally filtered by ``intent`` — mirrors the
    filter contract of ``GET /providers``.
    """
    q = db.query(LegalServiceProvider).filter(LegalServiceProvider.status == "active")
    if providerIds:
        ids = [p.strip() for p in providerIds.split(",") if p.strip()]
        q = q.filter(LegalServiceProvider.id.in_(ids))
    providers = q.all()
    if intent:
        providers = [
            p for p in providers
            if p.practice_areas and intent in (p.practice_areas or [])
        ]
    return [_compute_provider_depth(db, p) for p in providers]


@router.get("/{provider_id}")
def get_provider(provider_id: str, db: Session = Depends(get_db)):
    p = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == provider_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="律师不存在")
    return _provider_to_dict(p)


@router.get("/{provider_id}/depth")
def provider_depth(provider_id: str, db: Session = Depends(get_db)):
    p = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == provider_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="律师不存在")
    return _compute_provider_depth(db, p)


@router.get("/{provider_id}/products")
def list_provider_products(provider_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(ServiceProduct)
        .filter(ServiceProduct.provider_id == provider_id, ServiceProduct.status == "active")
        .order_by(ServiceProduct.sold_count.desc())
        .all()
    )
    return [_product_to_dict(p) for p in rows]


@router.post("/me/products")
def create_my_product(
    body: ProductUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.user_id == user.id).first()
    if not provider:
        raise HTTPException(status_code=400, detail="请先完善律师档案")
    p = ServiceProduct(
        provider_id=provider.id,
        category=body.category,
        name=body.name,
        summary=body.summary,
        description=body.description,
        price=body.price,
        price_mode=body.priceMode,
        delivery_days=body.deliveryDays,
        deliverables=body.deliverables,
        spec=body.spec,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _product_to_dict(p)
