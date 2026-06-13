"""Pydantic schemas for request/response validation."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# --- Auth schemas ---
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    role: str = "readonly"


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class LoginRequest(BaseModel):
    username: str
    password: str


# --- DHCP schemas ---
class DHCPLeaseCreate(BaseModel):
    ip_address: str = Field(..., pattern=r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')
    mac_address: str = Field(..., pattern=r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$')
    hostname: Optional[str] = None
    vendor: Optional[str] = None
    lease_start: datetime
    lease_end: datetime
    subnet: Optional[str] = None
    is_static: bool = False
    dhcp_server: Optional[str] = None


class DHCPLeaseUpdate(BaseModel):
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    vendor: Optional[str] = None
    lease_end: Optional[datetime] = None
    state: Optional[str] = None
    is_static: Optional[bool] = None


class DHCPLeaseResponse(BaseModel):
    id: str
    ip_address: str
    mac_address: str
    hostname: Optional[str]
    vendor: Optional[str]
    lease_start: datetime
    lease_end: datetime
    state: str
    is_static: bool
    subnet: Optional[str]
    dhcp_server: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- DNS schemas ---
class DNSRecordCreate(BaseModel):
    zone: str
    name: str
    type: str = Field(..., pattern=r'^(A|AAAA|CNAME|MX|TXT|SRV|PTR)$')
    value: str
    ttl: int = 3600
    priority: Optional[int] = None
    dns_server: Optional[str] = None


class DNSRecordUpdate(BaseModel):
    zone: Optional[str] = None
    name: Optional[str] = None
    value: Optional[str] = None
    ttl: Optional[int] = None
    priority: Optional[int] = None


class DNSRecordResponse(BaseModel):
    id: str
    zone: str
    name: str
    type: str
    value: str
    ttl: int
    priority: Optional[int]
    dns_server: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Client Inventory schemas ---
class ClientInventoryResponse(BaseModel):
    id: str
    mac_address: str
    hostname: Optional[str]
    ip_address: Optional[str]
    vendor: Optional[str]
    os_info: Optional[str]
    first_seen: datetime
    last_seen: datetime
    connection_count: int
    notes: Optional[str]

    model_config = {"from_attributes": True}

class ClientInventoryUpdate(BaseModel):
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    os_info: Optional[str] = None
    notes: Optional[str] = None


# --- Audit log schemas ---
class AuditLogResponse(BaseModel):
    id: str
    timestamp: datetime
    user_id: Optional[str]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    details: Optional[dict]
    ip_address: Optional[str]

    model_config = {"from_attributes": True}


# --- Alert schemas ---
class AlertResponse(BaseModel):
    id: str
    type: str
    severity: str
    message: str
    acknowledged: bool
    acknowledged_by: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]
    source: Optional[str]
    metadata: Optional[dict]

    model_config = {"from_attributes": True}

class AcknowledgeAlert(BaseModel):
    acknowledged: bool = True

class AlertConfigResponse(BaseModel):
    id: str
    alert_type: str
    enabled: bool
    notify_email: bool
    notify_slack: bool
    notify_discord: bool
    notify_webhook: bool
    threshold_value: Optional[float]
    cooldown_minutes: int

    model_config = {"from_attributes": True}

class AlertConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_slack: Optional[bool] = None
    notify_discord: Optional[bool] = None
    notify_webhook: Optional[bool] = None
    threshold_value: Optional[float] = None
    cooldown_minutes: Optional[int] = None


# --- Dashboard schema ---
class DashboardStats(BaseModel):
    server_uptime: str
    cpu_usage_percent: float
    ram_usage_percent: float
    disk_usage_percent: float
    active_clients: int
    active_leases: int
    total_leases: int
    dns_queries_per_second: float
    dns_cache_hit_ratio: float
    network_throughput_mbps: float
    timestamp: datetime


# --- Generic paginated response ---
class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
