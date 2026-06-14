import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Request Interceptor ───
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response Interceptor: 401 → logout ───
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      // Use window.location for hard redirect to avoid circular deps
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// ─── Auth ───
export const authApi = {
  login: (data: { username: string; password: string }) =>
    api.post<import('@/types').LoginResponse>('/auth/login', data),
  changePassword: (data: import('@/types').ChangePasswordRequest) =>
    api.post<import('@/types').LoginResponse>('/auth/change-password', data),
  me: () => api.get<import('@/types').User>('/auth/me'),
  register: (data: import('@/types').UserCreate) =>
    api.post<import('@/types').User>('/auth/register', data),
  refresh: (data: import('@/types').TokenRefresh) =>
    api.post<import('@/types').LoginResponse>('/auth/refresh', data),
  updateCurrentUser: (data: import('@/types').UserUpdate) =>
    api.patch<import('@/types').User>('/auth/me', data),
  listUsers: () =>
    api.get<import('@/types').User[]>('/auth/users'),
  getUser: (id: string) =>
    api.get<import('@/types').User>(`/auth/users/${id}`),
  updateUser: (id: string, data: import('@/types').UserUpdate) =>
    api.patch<import('@/types').User>(`/auth/users/${id}`, data),

  // Admin user management
  createUser: (data: import('@/types').AdminUserCreate) =>
    api.post<import('@/types').AdminUserResponse>('/auth/users', data),
  deleteUser: (id: string) =>
    api.delete(`/auth/users/${id}`),
  listAdminUsers: () =>
    api.get<import('@/types').AdminUserResponse[]>('/auth/users'),

  // 2FA
  setup2FA: () =>
    api.post<import('@/types').TwoFactorSetupResponse>('/auth/2fa/setup'),
  verify2FA: (data: import('@/types').TwoFactorVerifyRequest) =>
    api.post<import('@/types').LoginResponse>('/auth/2fa/verify', data),
  disable2FA: (data: import('@/types').TwoFactorDisableRequest) =>
    api.post<import('@/types').LoginResponse>('/auth/2fa/disable', data),
  login2FA: (data: import('@/types').TwoFactorLoginRequest) =>
    api.post<import('@/types').LoginResponse>('/auth/2fa/login', data),
}

// ─── Dashboard ───
export const dashboardApi = {
  getStats: () =>
    api.get<import('@/types').DashboardStats>('/dashboard/stats'),
  getTimeseries: (params?: { metric?: string; hours?: number }) =>
    api.get<import('@/types').TimeseriesResponse>('/dashboard/timeseries', { params }),
}

// ─── DHCP ───
export const dhcpApi = {
  getLeases: (params?: { state?: string; search?: string; page?: number; page_size?: number }) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').DHCPLease>>('/dhcp/leases', { params }),
  getLease: (id: string) =>
    api.get<import('@/types').DHCPLease>(`/dhcp/leases/${id}`),
  createLease: (data: import('@/types').DHCPLeaseCreate) =>
    api.post<import('@/types').DHCPLease>('/dhcp/leases', data),
  updateLease: (id: string, data: import('@/types').DHCPLeaseUpdate) =>
    api.put<import('@/types').DHCPLease>(`/dhcp/leases/${id}`, data),
  deleteLease: (id: string) =>
    api.delete(`/dhcp/leases/${id}`),
  releaseLease: (id: string) =>
    api.patch<import('@/types').DHCPLease>(`/dhcp/leases/${id}/release`),
  getStatus: () =>
    api.get<import('@/types').DHCPStatusResponse>('/dhcp/status'),
  toggleDhcp: (data: import('@/types').DHCPToggleRequest) =>
    api.post<import('@/types').DHCPStatusResponse>('/dhcp/toggle', data),

  // Static IP Reservations
  listReservations: () =>
    api.get<import('@/types').DHCPReservationResponse[]>('/dhcp/reservations'),
  createReservation: (data: import('@/types').DHCPReservationCreate) =>
    api.post<import('@/types').DHCPReservationResponse>('/dhcp/reservations', data),
  updateReservation: (id: string, data: import('@/types').DHCPReservationUpdate) =>
    api.put<import('@/types').DHCPReservationResponse>(`/dhcp/reservations/${id}`, data),
  deleteReservation: (id: string) =>
    api.delete(`/dhcp/reservations/${id}`),
}

// ─── DNS ───
export const dnsApi = {
  getRecords: (params: { zone: string; type?: string; search?: string; page?: number; page_size?: number }) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').DNSRecord>>('/dns/records', { params }),
  getRecord: (id: string) =>
    api.get<import('@/types').DNSRecord>(`/dns/records/${id}`),
  createRecord: (data: import('@/types').DNSRecordCreate) =>
    api.post<import('@/types').DNSRecord>('/dns/records', data),
  updateRecord: (id: string, data: import('@/types').DNSRecordUpdate) =>
    api.put<import('@/types').DNSRecord>(`/dns/records/${id}`, data),
  deleteRecord: (id: string) =>
    api.delete(`/dns/records/${id}`),
}

// ─── Clients ───
export const clientsApi = {
  getClients: (params?: { vendor?: string; os?: string; search?: string; page?: number; page_size?: number }) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').Client>>('/clients/inventory', { params }),
  getClient: (id: string) =>
    api.get<import('@/types').Client>(`/clients/inventory/${id}`),
  updateClient: (id: string, data: import('@/types').ClientUpdate) =>
    api.put<import('@/types').Client>(`/clients/inventory/${id}`, data),
}

// ─── Alerts ───
export const alertsApi = {
  getAlerts: (params?: { severity?: string; acknowledged?: boolean; page?: number; page_size?: number }) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').Alert>>('/alerts', { params }),
  acknowledgeAlert: (id: string) =>
    api.patch<import('@/types').Alert>(`/alerts/${id}/acknowledge`),
  getAlertConfig: (alertType: string) =>
    api.get<import('@/types').AlertConfig>('/alerts/config', { params: { alert_type: alertType } }),
  updateAlertConfig: (alertType: string, data: import('@/types').AlertConfigUpdate) =>
    api.put<import('@/types').AlertConfig>('/alerts/config', data, { params: { alert_type: alertType } }),
}

// ─── Audit ───
export const auditApi = {
  getAuditLogs: (params?: { action?: string; resource_type?: string; user_id?: string; date_from?: string; date_to?: string; page?: number; page_size?: number }) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').AuditLog>>('/audit', { params }),
}
