"""All SQLAlchemy models for the DHCP Dashboard."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Float, ForeignKey, Enum as SAEnum, JSON, Text
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    READONLY = "readonly"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.READONLY)
    is_active = Column(Boolean, default=True)
    password_change_required = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # relationships
    audit_logs = relationship("AuditLog", back_populates="user")


class DHCPLease(Base):
    __tablename__ = "dhcp_leases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ip_address = Column(String(15), nullable=False, index=True)
    mac_address = Column(String(17), nullable=False, index=True)
    hostname = Column(String(255), nullable=True)
    vendor = Column(String(100), nullable=True)
    lease_start = Column(DateTime, nullable=False)
    lease_end = Column(DateTime, nullable=False)
    state = Column(String(20), default="active")  # active, expired, released, abandoned
    is_static = Column(Boolean, default=False)
    subnet = Column(String(18), nullable=True)
    dhcp_server = Column(String(100), nullable=True)  # identifier for which server
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DNSRecord(Base):
    __tablename__ = "dns_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    zone = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(10), nullable=False)  # A, AAAA, CNAME, MX, TXT, SRV, PTR
    value = Column(String(1024), nullable=False)
    ttl = Column(Integer, default=3600)
    priority = Column(Integer, nullable=True)  # for MX, SRV
    dns_server = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ClientInventory(Base):
    __tablename__ = "client_inventory"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mac_address = Column(String(17), nullable=False, index=True, unique=True)
    hostname = Column(String(255), nullable=True)
    ip_address = Column(String(15), nullable=True)
    vendor = Column(String(100), nullable=True)
    os_info = Column(String(255), nullable=True)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    connection_count = Column(Integer, default=0)
    notes = Column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(50), nullable=False)  # LOGIN, LOGOUT, CREATE_LEASE, DELETE_LEASE, etc.
    resource_type = Column(String(50), nullable=True)  # dhcp_lease, dns_record, user
    resource_id = Column(String(36), nullable=True)
    details = Column(JSON, nullable=True)  # extra data
    ip_address = Column(String(45), nullable=True)

    user = relationship("User", back_populates="audit_logs")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String(50), nullable=False)  # pool_exhaustion, service_failure, high_cpu, unauthorized_device
    severity = Column(String(20), nullable=False)  # info, warning, critical
    message = Column(String(1024), nullable=False)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    source = Column(String(100), nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)


class AlertConfig(Base):
    __tablename__ = "alert_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    alert_type = Column(String(50), nullable=False, unique=True)
    enabled = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=False)
    notify_slack = Column(Boolean, default=False)
    notify_discord = Column(Boolean, default=False)
    notify_webhook = Column(Boolean, default=False)
    threshold_value = Column(Float, nullable=True)  # e.g., pool utilization threshold
    cooldown_minutes = Column(Integer, default=15)
