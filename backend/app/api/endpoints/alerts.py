"""Alert management and configuration endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models import Alert, AlertConfig, AuditLog
from app.schemas import (
    AlertResponse,
    AcknowledgeAlert,
    AlertConfigResponse,
    AlertConfigUpdate,
    PaginatedResponse,
)
from app.api.deps import get_current_user, role_required_any
from app.models import UserRole, User

router = APIRouter()
WRITE_ROLES = (UserRole.ADMIN, UserRole.OPERATOR)


# ── Alert list and detail ──────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse)
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None, description="Filter by severity (info, warning, critical)"),
    type: str | None = Query(None, description="Filter by alert type"),
    acknowledged: bool | None = Query(None, description="Filter acknowledged/unacknowledged"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List alerts with pagination and filters."""
    stmt = select(Alert)
    conditions = []

    if severity:
        conditions.append(Alert.severity == severity)
    if type:
        conditions.append(Alert.type == type)
    if acknowledged is not None:
        conditions.append(Alert.acknowledged == acknowledged)

    if conditions:
        stmt = stmt.where(*conditions)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Alert.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    alerts = result.scalars().all()

    return PaginatedResponse(
        items=[AlertResponse.model_validate(a) for a in alerts],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a single alert by ID."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return AlertResponse.model_validate(alert)


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: str,
    payload: AcknowledgeAlert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Acknowledge (or un-acknowledge) an alert."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.acknowledged = payload.acknowledged
    alert.acknowledged_by = current_user.id

    audit = AuditLog(
        user_id=current_user.id,
        action="ACKNOWLEDGE_ALERT" if payload.acknowledged else "UNACKNOWLEDGE_ALERT",
        resource_type="alert",
        resource_id=alert.id,
        details={"alert_type": alert.type, "severity": alert.severity},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(alert)
    return AlertResponse.model_validate(alert)


# ── Alert configuration ────────────────────────────────────────────────

@router.get("/config", response_model=AlertConfigResponse)
async def get_alert_config(
    alert_type: str = Query(..., description="Alert type key"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get alert configuration for a specific alert type."""
    result = await db.execute(select(AlertConfig).where(AlertConfig.alert_type == alert_type))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert config not found")
    return AlertConfigResponse.model_validate(config)


@router.put("/config", response_model=AlertConfigResponse)
async def update_alert_config(
    alert_type: str = Query(..., description="Alert type key to update"),
    payload: AlertConfigUpdate = ...,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(UserRole.ADMIN)),
):
    """Update alert configuration (admin only)."""
    result = await db.execute(select(AlertConfig).where(AlertConfig.alert_type == alert_type))
    config = result.scalar_one_or_none()
    if not config:
        # Create if not exists
        config = AlertConfig(alert_type=alert_type)
        db.add(config)
        await db.flush()

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(config, key, val)

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_ALERT_CONFIG",
        resource_type="alert_config",
        resource_id=config.id,
        details={"alert_type": alert_type, "updated_fields": list(update_data.keys())},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(config)
    return AlertConfigResponse.model_validate(config)
