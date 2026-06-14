"""DHCP lease management endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.db.session import get_db
from app.models import DHCPLease, DHCPReservation, AuditLog
from app.schemas import (
    DHCPLeaseCreate,
    DHCPLeaseUpdate,
    DHCPLeaseResponse,
    PaginatedResponse,
)
from app.api.deps import get_current_user, role_required_any
from app.models import UserRole, User

router = APIRouter()

import os
import subprocess
import re
from app.schemas import (
    DHCPStatusResponse,
    DHCPToggleRequest,
    DHCPReservationCreate,
    DHCPReservationUpdate,
    DHCPReservationResponse,
)

AUDIT_SOURCE = "dhcp"
WRITE_ROLES = (UserRole.ADMIN, UserRole.OPERATOR)

CONFIG_FILE = "/etc/dnsmasq.conf"


def _parse_dhcp_range(config_path: str = CONFIG_FILE) -> str | None:
    """Parse the dhcp-range line from the config file."""
    try:
        with open(config_path) as f:
            for line in f:
                if line.startswith("dhcp-range=") or line.startswith("#dhcp-range="):
                    # Check if commented out
                    stripped = line.lstrip()
                    if stripped.startswith("#"):
                        return None  # disabled
                    return stripped.split("=", 1)[1].strip()
    except FileNotFoundError:
        return None
    return None


def _service_running(service: str = "dnsmasq") -> bool:
    """Check if a systemd service is active."""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", service],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


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


@router.get("/status", response_model=DHCPStatusResponse)
async def get_dhcp_status(
    _: User = Depends(get_current_user),
):
    """Get current DHCP server status."""
    dhcp_range = _parse_dhcp_range()
    running = _service_running()
    return DHCPStatusResponse(
        enabled=dhcp_range is not None,
        dhcp_range=dhcp_range,
        service_running=running,
    )


@router.post("/toggle", response_model=DHCPStatusResponse)
async def toggle_dhcp(
    payload: DHCPToggleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Enable or disable the DHCP server."""
    current_state = _parse_dhcp_range() is not None

    if payload.enabled == current_state:
        return DHCPStatusResponse(
            enabled=current_state,
            dhcp_range=_parse_dhcp_range(),
            service_running=_service_running(),
        )

    if not os.path.exists(CONFIG_FILE):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Configuration file {CONFIG_FILE} not found",
        )

    # Build new config lines
    lines = []
    with open(CONFIG_FILE) as f:
        for line in f:
            stripped = line.lstrip()
            if stripped.startswith("dhcp-range=") or stripped.startswith("dhcp-option="):
                if payload.enabled:
                    # Enable: remove leading # and whitespace
                    lines.append(re.sub(r"^\s*#\s*", "", line.rstrip()) + "\n")
                else:
                    # Disable: comment out if not already
                    if not stripped.startswith("#"):
                        lines.append("#" + line.lstrip())
                    else:
                        lines.append(line)
            else:
                lines.append(line)

    with open(CONFIG_FILE, "w") as f:
        f.writelines(lines)

    # Restart dnsmasq
    subprocess.run(
        ["systemctl", "restart", "dnsmasq"],
        capture_output=True,
        timeout=10,
    )

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="TOGGLE_DHCP",
        resource_type="dhcp_server",
        details={
            "previous_state": "enabled" if current_state else "disabled",
            "new_state": "enabled" if payload.enabled else "disabled",
        },
        ip_address=current_user.username,
    )
    db.add(audit)
    await db.commit()

    return DHCPStatusResponse(
        enabled=payload.enabled,
        dhcp_range=_parse_dhcp_range(),
        service_running=_service_running(),
    )


RESERVATIONS_START = "# --- DHCP Reservations (managed by dashboard) ---"
RESERVATIONS_END = "# --- End DHCP Reservations ---"


async def _sync_reservations_config(db: AsyncSession):
    """Write DHCP host reservations to dnsmasq config file."""
    result = await db.execute(
        select(DHCPReservation).where(DHCPReservation.enabled == True)
    )
    reservations = result.scalars().all()

    lines_to_add = []
    for res in reservations:
        line = f"dhcp-host={res.mac_address},{res.ip_address},{res.hostname}"
        if res.lease_time:
            line += f",{res.lease_time}"
        lines_to_add.append(line + "\n")

    if not os.path.exists(CONFIG_FILE):
        raise RuntimeError(f"Config file {CONFIG_FILE} not found")

    with open(CONFIG_FILE, "r") as f:
        content = f.readlines()

    # Remove existing reservation block
    start_idx = None
    end_idx = None
    for i, line in enumerate(content):
        if line.strip() == RESERVATIONS_START:
            start_idx = i
        elif line.strip() == RESERVATIONS_END and start_idx is not None:
            end_idx = i
            break

    if start_idx is not None and end_idx is not None:
        del content[start_idx:end_idx + 1]

    # Append new block
    content.append("\n" + RESERVATIONS_START + "\n")
    content.extend(lines_to_add)
    content.append(RESERVATIONS_END + "\n")

    with open(CONFIG_FILE, "w") as f:
        f.writelines(content)


@router.get("/reservations", response_model=list[DHCPReservationResponse])
async def list_reservations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all static DHCP reservations."""
    result = await db.execute(select(DHCPReservation).order_by(DHCPReservation.hostname))
    reservations = result.scalars().all()
    return [DHCPReservationResponse.model_validate(r) for r in reservations]


@router.post("/reservations", response_model=DHCPReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    payload: DHCPReservationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Create a static DHCP reservation."""
    reservation = DHCPReservation(**payload.model_dump())
    db.add(reservation)

    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE_RESERVATION",
        resource_type="dhcp_reservation",
        resource_id=reservation.id,
        details={"ip": reservation.ip_address, "mac": reservation.mac_address},
        ip_address=reservation.ip_address,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(reservation)

    await _sync_reservations_config(db)
    return DHCPReservationResponse.model_validate(reservation)


@router.put("/reservations/{reservation_id}", response_model=DHCPReservationResponse)
async def update_reservation(
    reservation_id: str,
    payload: DHCPReservationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Update a static DHCP reservation."""
    result = await db.execute(
        select(DHCPReservation).where(DHCPReservation.id == reservation_id)
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(reservation, key, val)
    reservation.updated_at = datetime.now(timezone.utc)

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_RESERVATION",
        resource_type="dhcp_reservation",
        resource_id=reservation.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=reservation.ip_address,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(reservation)

    await _sync_reservations_config(db)
    return DHCPReservationResponse.model_validate(reservation)


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reservation(
    reservation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required_any(*WRITE_ROLES)),
):
    """Delete a static DHCP reservation."""
    result = await db.execute(
        select(DHCPReservation).where(DHCPReservation.id == reservation_id)
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    audit = AuditLog(
        user_id=current_user.id,
        action="DELETE_RESERVATION",
        resource_type="dhcp_reservation",
        resource_id=reservation.id,
        details={"ip": reservation.ip_address, "mac": reservation.mac_address},
        ip_address=reservation.ip_address,
    )
    db.add(audit)
    await db.delete(reservation)
    await db.commit()

    await _sync_reservations_config(db)
    return None
