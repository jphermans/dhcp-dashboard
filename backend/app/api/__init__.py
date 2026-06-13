"""Aggregate all API routers."""
from fastapi import APIRouter
from .endpoints import auth, dhcp, dns, clients, alerts, audit, dashboard

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(dhcp.router, prefix="/dhcp", tags=["DHCP"])
api_router.include_router(dns.router, prefix="/dns", tags=["DNS"])
api_router.include_router(clients.router, prefix="/clients", tags=["Client Inventory"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["Alerts"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
