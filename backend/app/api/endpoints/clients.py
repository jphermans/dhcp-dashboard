"""Client inventory endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.db.session import get_db
from app.models import ClientInventory, AuditLog
from app.schemas import ClientInventoryResponse, ClientInventoryUpdate, PaginatedResponse
from app.api.deps import get_current_user, role_required_any
from app.models import UserRole, User

router = APIRouter()
WRITE_ROLES = (UserRole.ADMIN, UserRole.OPERATOR)


@router.get("/inventory", response_model=PaginatedResponse)
async def list_clients(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="Search hostname, IP, MAC, vendor"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List client inventory with pagination and optional search."""
    stmt = select(ClientInventory)

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                ClientInventory.hostname.ilike(pattern),
                ClientInventory.ip_address.ilike(pattern),
                ClientInventory.mac_address.ilike(pattern),
                ClientInventory.vendor.ilike(pattern),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(ClientInventory.last_seen.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    clients = result.scalars().all()

    return PaginatedResponse(
        items=[ClientInventoryResponse.model_validate(c) for c in clients],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/inventory/{client_id}", response_model=ClientInventoryResponse)
async def get_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a single client by ID."""
    result = await db.execute(select(ClientInventory).where(ClientInventory.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return ClientInventoryResponse.model_validate(client)


@router.put("/inventory/{client_id}", response_model=ClientInventoryResponse)
async def update_client(
    client_id: str,
    payload: ClientInventoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Update client notes and metadata."""
    result = await db.execute(select(ClientInventory).where(ClientInventory.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(client, key, val)

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_CLIENT",
        resource_type="client_inventory",
        resource_id=client.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=client.ip_address,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(client)
    return ClientInventoryResponse.model_validate(client)
