// ──── Auth ────
export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token?: string
  refresh_token?: string
  token_type: string
  require_password_change: boolean
  temp_token?: string
}

export interface ChangePasswordRequest {
  temp_token: string
  new_password: string
}
export interface TokenRefresh {
  refresh_token: string
}

export interface UserCreate {
  username: string
  email: string
  password: string
  full_name?: string
  role?: 'admin' | 'operator' | 'readonly'
}

export interface User {
  id: string
  username: string
  email: string
  full_name: string | null
  role: 'admin' | 'operator' | 'readonly'
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface UserUpdate {
  email?: string
  full_name?: string
  role?: string
  is_active?: boolean
}

// ──── Dashboard ────
export interface DashboardStats {
  server_uptime: string
  cpu_usage_percent: number
  ram_usage_percent: number
  disk_usage_percent: number
  active_clients: number
  active_leases: number
  total_leases: number
  dns_queries_per_second: number
  dns_cache_hit_ratio: number
  network_throughput_mbps: number
  timestamp: string
}

export interface TimeseriesPoint {
  metric: string
  timestamp: string
  value: number
}

export interface TimeseriesResponse {
  data: TimeseriesPoint[]
}

// ──── DHCP ────
export interface DHCPLease {
  id: string
  ip_address: string
  mac_address: string
  hostname: string | null
  vendor: string | null
  lease_start: string
  lease_end: string
  state: 'active' | 'expired' | 'released' | 'abandoned'
  is_static: boolean
  subnet: string | null
  dhcp_server: string | null
  created_at: string
  updated_at: string
}

export interface DHCPLeaseCreate {
  ip_address: string
  mac_address: string
  hostname?: string | null
  vendor?: string | null
  lease_start: string
  lease_end: string
  subnet?: string | null
  is_static?: boolean
  dhcp_server?: string | null
}

export interface DHCPLeaseUpdate {
  ip_address?: string
  hostname?: string
  vendor?: string
  lease_end?: string
  state?: string
  is_static?: boolean
}

export interface DHCPPool {
  id: string
  name: string
  subnet: string
  start_ip: string
  end_ip: string
  gateway: string | null
  dns_servers: string | null
  lease_time: number
  total: number
  used: number
  free: number
  utilization_percent: number
  dhcp_server: string | null
  created_at: string
  updated_at: string
}

// ──── DNS ────
export interface DNSRecord {
  id: string
  zone: string
  name: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'PTR'
  value: string
  ttl: number
  priority: number | null
  dns_server: string | null
  created_at: string
  updated_at: string
}

export interface DNSRecordCreate {
  zone: string
  name: string
  type: string
  value: string
  ttl?: number
  priority?: number | null
  dns_server?: string | null
}

export interface DNSRecordUpdate {
  zone?: string
  name?: string
  value?: string
  ttl?: number
  priority?: number | null
}

// ──── Client Inventory ────
export interface Client {
  id: string
  mac_address: string
  hostname: string | null
  ip_address: string | null
  vendor: string | null
  os_info: string | null
  first_seen: string
  last_seen: string
  connection_count: number
  notes: string | null
}

export interface ClientUpdate {
  hostname?: string
  ip_address?: string
  os_info?: string
  notes?: string
}

// ──── Alerts ────
export interface Alert {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  acknowledged: boolean
  acknowledged_by: string | null
  created_at: string
  resolved_at: string | null
  source: string | null
  metadata: Record<string, unknown> | null
}

export interface AlertConfig {
  id: string
  alert_type: string
  enabled: boolean
  notify_email: boolean
  notify_slack: boolean
  notify_discord: boolean
  notify_webhook: boolean
  threshold_value: number | null
  cooldown_minutes: number
}

export interface AlertConfigUpdate {
  enabled?: boolean
  notify_email?: boolean
  notify_slack?: boolean
  notify_discord?: boolean
  notify_webhook?: boolean
  threshold_value?: number | null
  cooldown_minutes?: number
}

// ──── Audit ────
export interface AuditLog {
  id: string
  timestamp: string
  user_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
}

// ──── DHCP Server Control ────
export interface DHCPStatusResponse {
  enabled: boolean
  dhcp_range: string | null
  config_file: string
  service_running: boolean
}

export interface DHCPToggleRequest {
  enabled: boolean
}

// ──── DHCP Static Reservations ────
export interface DHCPReservationCreate {
  ip_address: string
  mac_address: string
  hostname: string
  description?: string | null
  lease_time?: string | null
  enabled?: boolean
}

export interface DHCPReservationUpdate {
  ip_address?: string
  mac_address?: string
  hostname?: string
  description?: string | null
  lease_time?: string | null
  enabled?: boolean
}

export interface DHCPReservationResponse {
  id: string
  ip_address: string
  mac_address: string
  hostname: string
  description: string | null
  lease_time: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

// ──── Generic ────
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// ──── Two-Factor Authentication ────
export interface TwoFactorSetupResponse {
  secret: string
  qr_code: string
  uri: string
}

export interface TwoFactorVerifyRequest {
  temp_token: string
  code: string
}

export interface TwoFactorDisableRequest {
  password: string
}

export interface TwoFactorLoginRequest {
  temp_token: string
  code: string
}

// ──── Admin User Management ────
export interface AdminUserCreate {
  username: string
  email: string
  password: string
  full_name?: string
  role: 'admin' | 'operator' | 'readonly'
}

export interface AdminUserResponse {
  id: string
  username: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  totp_enabled: boolean
  created_at: string
  last_login: string | null
}
