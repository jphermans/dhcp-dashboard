import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import {
  Search,
  Filter,
  Download,
  User,
  Clock,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react'

import { auditApi } from '@/lib/api'
import type { AuditLog, PaginatedResponse } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ─── Constants ───
const ACTION_OPTIONS = ['all', 'create', 'update', 'delete', 'login', 'logout', 'acknowledge'] as const
const RESOURCE_OPTIONS = ['all', 'lease', 'reservation', 'record', 'user', 'alert', 'config'] as const

const ACTION_BADGE_MAP: Record<string, { label: string; className: string }> = {
  create: { label: 'Create', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  update: { label: 'Update', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  delete: { label: 'Delete', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  login: { label: 'Login', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  logout: { label: 'Logout', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
  acknowledge: { label: 'Acknowledge', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
}

// ─── Helpers ───
function formatTimestamp(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy HH:mm:ss')
  } catch {
    return dateStr
  }
}

function truncate(str: string | null | undefined, maxLen: number): string {
  if (!str) return '—'
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

function getUsername(log: AuditLog): string {
  // Some API responses may include username as a non-typed field
  return (log as Record<string, unknown>).username as string || log.user_id || 'System'
}

// ─── CSV Export ───
function exportCSV(logs: AuditLog[]) {
  const headers = ['ID', 'Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address']
  const rows = logs.map((log) => [
    log.id,
    log.timestamp,
    getUsername(log),
    log.action,
    log.resource_type ?? '',
    log.resource_id ?? '',
    typeof log.details === 'string' ? log.details : JSON.stringify(log.details ?? ''),
    log.ip_address ?? '',
  ])
  // Escape CSV fields
  const escapeCSV = (v: string) => {
    if (/[",\n\r]/ .test(v)) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }
  const csvContent = [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Skeleton Row ───
function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16 font-mono" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24 font-mono" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Main Page ───
export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [resourceFilter, setResourceFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchUser, setSearchUser] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Build query parameters
  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, page_size: pageSize }
    if (actionFilter !== 'all') p.action = actionFilter
    if (resourceFilter !== 'all') p.resource_type = resourceFilter
    if (dateFrom) p.date_from = dateFrom
    if (dateTo) p.date_to = dateTo
    if (searchUser.trim()) p.user_id = searchUser.trim()
    return p
  }, [actionFilter, resourceFilter, dateFrom, dateTo, searchUser, page])

  const { data, isLoading, isError, refetch } = useQuery<PaginatedResponse<AuditLog>>({
    queryKey: ['audit-logs', params],
    queryFn: () => auditApi.getAuditLogs(params).then((res) => res.data),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const totalPages = useMemo(() => {
    if (!data) return 0
    return Math.max(1, Math.ceil(data.total / data.page_size))
  }, [data])

  // Export handler
  const handleExport = async () => {
    try {
      const exportParams: Record<string, string | number> = { page_size: 9999 }
      if (actionFilter !== 'all') exportParams.action = actionFilter
      if (resourceFilter !== 'all') exportParams.resource_type = resourceFilter
      if (dateFrom) exportParams.date_from = dateFrom
      if (dateTo) exportParams.date_to = dateTo
      if (searchUser.trim()) exportParams.user_id = searchUser.trim()
      const res = await auditApi.getAuditLogs(exportParams)
      exportCSV(res.data.items)
      toast.success(`Exported ${res.data.items.length} audit log entries`)
    } catch {
      toast.error('Failed to export audit logs')
    }
  }

  // Reset page when filters change
  const resetPage = () => setPage(1)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Track all system events and configuration changes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ─── Filter Card ─── */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Action Filter */}
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); resetPage() }}>
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === 'all' ? 'All Actions' : a.charAt(0).toUpperCase() + a.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Resource Filter */}
            <Select value={resourceFilter} onValueChange={(v) => { setResourceFilter(v); resetPage() }}>
              <SelectTrigger>
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === 'all' ? 'All Resources' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date From */}
            <div>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); resetPage() }}
                placeholder="From date"
              />
            </div>

            {/* Date To */}
            <div>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); resetPage() }}
                placeholder="To date"
              />
            </div>

            {/* User Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search user…"
                className="pl-8"
                value={searchUser}
                onChange={(e) => { setSearchUser(e.target.value); resetPage() }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Table Card ─── */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Events</CardTitle>
            {data && (
              <span className="text-xs text-muted-foreground">
                {data.total} total · Page {data.page} of {totalPages}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Timestamp
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      User
                    </div>
                  </TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      Resource ID
                    </div>
                  </TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Loading state */}
                {isLoading && <TableSkeleton />}

                {/* Error state */}
                {isError && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Shield className="h-8 w-8 text-destructive" />
                        <p className="mt-2 text-sm text-destructive">
                          Failed to load audit logs
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => refetch()}
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* Empty state */}
                {!isLoading && !isError && data && data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          No audit events found matching filters.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => {
                            setActionFilter('all')
                            setResourceFilter('all')
                            setDateFrom('')
                            setDateTo('')
                            setSearchUser('')
                            setPage(1)
                          }}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* Data rows */}
                {!isLoading &&
                  !isError &&
                  data?.items.map((log) => {
                    const actionBadge = ACTION_BADGE_MAP[log.action] ?? { label: log.action, className: 'bg-primary/10 text-primary border-primary/20' }
                    const detailsStr =
                      typeof log.details === 'string'
                        ? log.details
                        : log.details
                          ? JSON.stringify(log.details)
                          : null
                    return (
                      <TableRow key={log.id} className="group">
                        <TableCell className="whitespace-nowrap text-xs font-mono text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{getUsername(log)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs font-medium capitalize',
                              actionBadge.className
                            )}
                          >
                            {actionBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">
                            {log.resource_type ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {truncate(log.resource_id, 18)}
                        </TableCell>
                        <TableCell>
                          {detailsStr ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default text-xs text-muted-foreground max-w-[180px] block truncate">
                                  {detailsStr}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-[320px] break-all text-xs font-mono"
                              >
                                {detailsStr}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {log.ip_address ?? '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </TooltipProvider>

          {/* Pagination */}
          {!isLoading && !isError && data && data.total > 0 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-muted-foreground">
                Showing {data.items.length} of {data.total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
