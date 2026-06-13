"""DNS record management endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.db.session import get_db
from app.models import DNSRecord, AuditLog
from app.schemas import (
    DNSRecordCreate,
    DNSRecordUpdate,
    DNSRecordResponse,
    PaginatedResponse,
)
from app.api.deps import get_current_user, role_required_any
from app.models import UserRole, User

router = APIRouter()
WRITE_ROLES = (UserRole.ADMIN, UserRole.OPERATOR)


@router.get("/records", response_model=PaginatedResponse)
async def list_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    zone: str | None = Query(None, description="Filter by zone"),
    type: str | None = Query(None, description="Filter by record type (A, AAAA, CNAME, MX, TXT, SRV, PTR)"),
    search: str | None = Query(None, description="Search name or value"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List DNS records with pagination and filters."""
    stmt = select(DNSRecord)
    conditions = []

    if zone:
        conditions.append(DNSRecord.zone.ilike(f"%{zone}%"))
    if type:
        conditions.append(DNSRecord.type == type.upper())
    if search:
        pattern = f"%{search}%"
        conditions.append(
            or_(
                DNSRecord.name.ilike(pattern),
                DNSRecord.value.ilike(pattern),
            )
        )

    if conditions:
        stmt = stmt.where(*conditions)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(DNSRecord.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    records = result.scalars().all()

    return PaginatedResponse(
        items=[DNSRecordResponse.model_validate(r) for r in records],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/records/{record_id}", response_model=DNSRecordResponse)
async def get_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a single DNS record by ID."""
    result = await db.execute(select(DNSRecord).where(DNSRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DNS record not found")
    return DNSRecordResponse.model_validate(record)


@router.post("/records", response_model=DNSRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_record(
    payload: DNSRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Create a new DNS record."""
    record = DNSRecord(**payload.model_dump())
    db.add(record)

    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE_DNS_RECORD",
        resource_type="dns_record",
        resource_id=record.id,
        details={"name": record.name, "type": record.type, "value": record.value},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(record)
    return DNSRecordResponse.model_validate(record)


@router.put("/records/{record_id}", response_model=DNSRecordResponse)
async def update_record(
    record_id: str,
    payload: DNSRecordUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Update a DNS record."""
    result = await db.execute(select(DNSRecord).where(DNSRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DNS record not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(record, key, val)
    record.updated_at = datetime.now(timezone.utc)

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_DNS_RECORD",
        resource_type="dns_record",
        resource_id=record.id,
        details={"updated_fields": list(update_data.keys())},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(record)
    return DNSRecordResponse.model_validate(record)


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Delete a DNS record."""
    result = await db.execute(select(DNSRecord).where(DNSRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DNS record not found")

    audit = AuditLog(
        user_id=current_user.id,
        action="DELETE_DNS_RECORD",
        resource_type="dns_record",
        resource_id=record.id,
        details={"name": record.name, "type": record.type, "value": record.value},
    )
    db.add(audit)
    await db.delete(record)
    await db.commit()
    return None
