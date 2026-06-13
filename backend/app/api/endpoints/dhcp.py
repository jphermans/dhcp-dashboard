"""DHCP lease management endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.db.session import get_db
from app.models import DHCPLease, AuditLog
from app.schemas import (
    DHCPLeaseCreate,
    DHCPLeaseUpdate,
    DHCPLeaseResponse,
    PaginatedResponse,
)
from app.api.deps import get_current_user, role_required_any
from app.models import UserRole, User

router = APIRouter()

AUDIT_SOURCE = "dhcp"
WRITE_ROLES = (UserRole.ADMIN, UserRole.OPERATOR)


@router.get("/leases", response_model=PaginatedResponse)
async def list_leases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    state: str | None = Query(None, description="Filter by lease state (active, expired, released)"),
    is_static: bool | None = Query(None, description="Filter static reservations"),
    search: str | None = Query(None, description="Search hostname, IP, or MAC"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List DHCP leases with pagination and filters."""
    stmt = select(DHCPLease)
    conditions = []

    if state:
        conditions.append(DHCPLease.state == state)
    if is_static is not None:
        conditions.append(DHCPLease.is_static == is_static)
    if search:
        pattern = f"%{search}%"
        conditions.append(
            or_(
                DHCPLease.hostname.ilike(pattern),
                DHCPLease.ip_address.ilike(pattern),
                DHCPLease.mac_address.ilike(pattern),
            )
        )

    if conditions:
        stmt = stmt.where(*conditions)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    stmt = stmt.order_by(DHCPLease.lease_end.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    leases = result.scalars().all()

    return PaginatedResponse(
        items=[DHCPLeaseResponse.model_validate(lease) for lease in leases],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/leases/{lease_id}", response_model=DHCPLeaseResponse)
async def get_lease(
    lease_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a single DHCP lease by ID."""
    result = await db.execute(select(DHCPLease).where(DHCPLease.id == lease_id))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    return DHCPLeaseResponse.model_validate(lease)


@router.post("/leases", response_model=DHCPLeaseResponse, status_code=status.HTTP_201_CREATED)
async def create_lease(
    payload: DHCPLeaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Create a new DHCP lease (reservation)."""
    lease = DHCPLease(**payload.model_dump())
    db.add(lease)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE_LEASE",
        resource_type="dhcp_lease",
        resource_id=lease.id,
        details={"ip": lease.ip_address, "mac": lease.mac_address},
        ip_address=lease.ip_address,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(lease)
    return DHCPLeaseResponse.model_validate(lease)


@router.put("/leases/{lease_id}", response_model=DHCPLeaseResponse)
async def update_lease(
    lease_id: str,
    payload: DHCPLeaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Update a DHCP lease."""
    result = await db.execute(select(DHCPLease).where(DHCPLease.id == lease_id))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(lease, key, val)
    lease.updated_at = datetime.now(timezone.utc)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_LEASE",
        resource_type="dhcp_lease",
        resource_id=lease.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=lease.ip_address,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(lease)
    return DHCPLeaseResponse.model_validate(lease)


@router.delete("/leases/{lease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lease(
    lease_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Delete a DHCP lease."""
    result = await db.execute(select(DHCPLease).where(DHCPLease.id == lease_id))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="DELETE_LEASE",
        resource_type="dhcp_lease",
        resource_id=lease.id,
        details={"ip": lease.ip_address, "mac": lease.mac_address},
        ip_address=lease.ip_address,
    )
    db.add(audit)
    await db.delete(lease)
    await db.commit()
    return None
