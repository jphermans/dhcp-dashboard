"""Audit log endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, cast, String

from app.db.session import get_db
from app.models import AuditLog
from app.schemas import AuditLogResponse, PaginatedResponse
from app.api.deps import get_current_user
from app.models import User

router = APIRouter()


@router.get("", response_model=PaginatedResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = Query(None, description="Filter by action (e.g., CREATE_LEASE, DELETE_RECORD)"),
    resource_type: str | None = Query(None, description="Filter by resource type"),
    user_id: str | None = Query(None, description="Filter by user ID"),
    date_from: datetime | None = Query(None, description="Start date (ISO 8601)"),
    date_to: datetime | None = Query(None, description="End date (ISO 8601)"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List audit logs with filters and pagination."""
    stmt = select(AuditLog)
    conditions = []

    if action:
        conditions.append(AuditLog.action == action)
    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if date_from:
        # Ensure UTC-naive comparison; datetime stored as naive UTC
        if date_from.tzinfo:
            date_from = date_from.astimezone(timezone.utc).replace(tzinfo=None)
        conditions.append(AuditLog.created_at >= date_from)
    if date_to:
        if date_to.tzinfo:
            date_to = date_to.astimezone(timezone.utc).replace(tzinfo=None)
        conditions.append(AuditLog.created_at <= date_to)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[AuditLogResponse.model_validate(l) for l in logs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{log_id}", response_model=AuditLogResponse)
async def get_audit_log(
    log_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a single audit log entry."""
    result = await db.execute(select(AuditLog).where(AuditLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log not found")
    return AuditLogResponse.model_validate(log)
