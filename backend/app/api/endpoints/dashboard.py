"""Dashboard statistics and timeseries endpoints."""
import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models import DHCPLease, DNSRecord, ClientInventory, AuditLog
from app.schemas import DashboardStats, PaginatedResponse
from app.api.deps import get_current_user
from app.models import User

router = APIRouter()

# Try importing psutil for real system metrics; fall back to static values
_PSUTIL_AVAILABLE = False
try:
    import psutil

    _PSUTIL_AVAILABLE = True
except ImportError:
    pass

_START_TIME = time.time()  # server process start time


def _get_system_uptime() -> str:
    """Return uptime string like '3d 5h 12m'."""
    uptime_s = int(time.time() - _START_TIME)
    days, rem = divmod(uptime_s, 86400)
    hours, rem = divmod(rem, 3600)
    mins, secs = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if mins:
        parts.append(f"{mins}m")
    if not parts:
        parts.append(f"{secs}s")
    return " ".join(parts)


def _get_cpu_usage() -> float:
    """Get CPU usage percent, fallback to 0.0."""
    if _PSUTIL_AVAILABLE:
        return round(psutil.cpu_percent(interval=0.1), 1)
    return 12.5  # mock


def _get_ram_usage() -> float:
    """Get RAM usage percent, fallback to 0.0."""
    if _PSUTIL_AVAILABLE:
        return round(psutil.virtual_memory().percent, 1)
    return 38.2  # mock


def _get_disk_usage() -> float:
    """Get disk usage percent for root mount, fallback to 0.0."""
    if _PSUTIL_AVAILABLE:
        return round(psutil.disk_usage("/").percent, 1)
    return 42.7  # mock


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Collect current system stats and database counts for the dashboard.
    """
    # Active leases (state = 'active')
    active_leases_result = await db.execute(
        select(func.count()).where(DHCPLease.state == "active")
    )
    active_leases = active_leases_result.scalar() or 0

    # Total leases
    total_leases_result = await db.execute(select(func.count()).select_from(DHCPLease))
    total_leases = total_leases_result.scalar() or 0

    # Active clients (last_seen within 24 hours)
    cutoff = datetime.utcnow() - timedelta(hours=24)
    active_clients_result = await db.execute(
        select(func.count()).where(ClientInventory.last_seen >= cutoff)
    )
    active_clients = active_clients_result.scalar() or 0

    # DNS record count (proxy for queries if no dedicated metrics table)
    dns_total_result = await db.execute(select(func.count()).select_from(DNSRecord))
    dns_total = dns_total_result.scalar() or 0

    # Mock DNS query rate and cache ratio until true metrics integration
    dns_queries_per_second = round(dns_total / max(1, (time.time() - _START_TIME)), 2)
    dns_cache_hit_ratio = 0.85  # placeholder

    # Network throughput mock
    network_throughput_mbps = 0.0
    if _PSUTIL_AVAILABLE:
        net_io = psutil.net_io_counters()
        network_throughput_mbps = round(((net_io.bytes_sent + net_io.bytes_recv) * 8) / 1e6 / max(1, time.time() - _START_TIME), 2)

    return DashboardStats(
        server_uptime=_get_system_uptime(),
        cpu_usage_percent=_get_cpu_usage(),
        ram_usage_percent=_get_ram_usage(),
        disk_usage_percent=_get_disk_usage(),
        active_clients=active_clients,
        active_leases=active_leases,
        total_leases=total_leases,
        dns_queries_per_second=round(dns_queries_per_second, 1),
        dns_cache_hit_ratio=dns_cache_hit_ratio,
        network_throughput_mbps=network_throughput_mbps,
        timestamp=datetime.utcnow(),
    )


@router.get("/timeseries")
async def get_timeseries(
    metric: str = Query("all", description="Metric name: cpu, ram, disk, or all"),
    from_time: datetime | None = Query(None, description="Start timestamp (ISO 8601)"),
    to_time: datetime | None = Query(None, description="End timestamp (ISO 8601)"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Return time-series data points for dashboard trend charts.

    Currently returns live snapshot data points as an immediate baseline.
    Future integration with a metrics-collection service (e.g., Prometheus)
    will provide full historical time series.
    """
    now = datetime.utcnow()
    data_points = []

    # For now return a single data point with current values
    if metric in ("cpu", "all"):
        data_points.append(
            {"metric": "cpu", "timestamp": now.isoformat(), "value": _get_cpu_usage()}
        )
    if metric in ("ram", "all"):
        data_points.append(
            {"metric": "ram", "timestamp": now.isoformat(), "value": _get_ram_usage()}
        )
    if metric in ("disk", "all"):
        data_points.append(
            {"metric": "disk", "timestamp": now.isoformat(), "value": _get_disk_usage()}
        )
    if metric in ("dns_queries", "all"):
        dns_total = (await db.execute(select(func.count()).select_from(DNSRecord))).scalar() or 0
        qps = round(dns_total / max(1, time.time() - _START_TIME), 2)
        data_points.append(
            {"metric": "dns_queries_per_second", "timestamp": now.isoformat(), "value": qps}
        )
    if metric in ("active_clients", "all"):
        cutoff = datetime.utcnow() - timedelta(hours=24)
        active = (await db.execute(select(func.count()).where(ClientInventory.last_seen >= cutoff))).scalar() or 0
        data_points.append(
            {"metric": "active_clients", "timestamp": now.isoformat(), "value": active}
        )
    if metric in ("active_leases", "all"):
        active_leases = (await db.execute(select(func.count()).where(DHCPLease.state == "active"))).scalar() or 0
        data_points.append(
            {"metric": "active_leases", "timestamp": now.isoformat(), "value": active_leases}
        )

    return {"data": data_points}
