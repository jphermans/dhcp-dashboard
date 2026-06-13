import { useCallback, useMemo, useState } from 'react'
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Bell,
  BellOff,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  Shield,
  Mail,
  Webhook,
  MessageCircle,
  Send,
  SlidersHorizontal,
} from 'lucide-react'

import { alertsApi } from '@/lib/api'
import type { Alert, AlertConfig, PaginatedResponse } from '@/types'
import { cn } from '@/lib/utils'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// ─── Types & Constants ───

type AlertSeverity = Alert['severity']
type AlertType = string // alert type key

interface AlertConfigUpdate {
  enabled?: boolean
  threshold_value?: number | null
  notify_email?: boolean
  notify_slack?: boolean
  notify_discord?: boolean
  notify_webhook?: boolean
  cooldown_minutes?: number
}

interface AlertRuleDescriptor {
  key: AlertType
  label: string
  description: string
  thresholdLabel: string
  defaultThreshold: number
  unit: string
}

const alertTypeRegistry: AlertRuleDescriptor[] = [
  {
    key: 'dhcp_pool',
    label: 'DHCP Pool',
    description: 'Triggers when DHCP pool reaches threshold utilization.',
    thresholdLabel: 'Pool utilization %',
    defaultThreshold: 80,
    unit: '%',
  },
  {
    key: 'service',
    label: 'Service',
    description: 'Triggers when a critical service becomes unavailable.',
    thresholdLabel: 'Consecutive failures',
    defaultThreshold: 3,
    unit: '',
  },
  {
    key: 'cpu',
    label: 'CPU',
    description: 'Triggers when CPU load exceeds threshold for sustained period.',
    thresholdLabel: 'CPU load %',
    defaultThreshold: 90,
    unit: '%',
  },
  {
    key: 'memory',
    label: 'Memory',
    description: 'Triggers when memory usage exceeds threshold.',
    thresholdLabel: 'Memory usage %',
    defaultThreshold: 90,
    unit: '%',
  },
  {
    key: 'dns',
    label: 'DNS',
    description: 'Triggers when DNS errors or resolution failures exceed threshold.',
    thresholdLabel: 'Error rate %',
    defaultThreshold: 10,
    unit: '%',
  },
  {
    key: 'unauthorized',
    label: 'Unauthorized',
    description: 'Triggers when an unauthorized device is detected on the network.',
    thresholdLabel: 'Detections per hour',
    defaultThreshold: 1,
    unit: '',
  },
]

// ─── Helpers ───

const severityBadgeVariant = (severity: AlertSeverity): 'destructive' | 'secondary' | 'outline' => {
  switch (severity) {
    case 'critical':
      return 'destructive'
    case 'warning':
      return 'secondary'
    case 'info':
      return 'outline'
  }
}

const severityIcon = (severity: AlertSeverity) => {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="h-4 w-4" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4" />
    case 'info':
      return <Info className="h-4 w-4" />
  }
}

const formatRelative = (iso: string): string => {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

const formatAbsolute = (iso: string): string => {
  try {
    return format(parseISO(iso), 'PPpp')
  } catch {
    return iso
  }
}

const typeLabel = (t: string): string =>
  t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

// Severity badge component
function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <Badge variant={severityBadgeVariant(severity)} className="gap-1 capitalize">
      {severityIcon(severity)}
      {severity}
    </Badge>
  )
}

// Skeleton row for table loading state
function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
    </TableRow>
  )
}

// ─── Detail Modal ───

function AlertDetailModal({
  alert,
  open,
  onClose,
}: {
  alert: Alert | null
  open: boolean
  onClose: () => void
}) {
  if (!alert) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {severityIcon(alert.severity)}
            Alert Details
          </DialogTitle>
          <DialogDescription>
            Full information for alert <code className="text-xs bg-muted px-1 rounded">{alert.id}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Severity</span>
            <SeverityBadge severity={alert.severity} />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Type</span>
            <Badge variant="outline">{typeLabel(alert.type)}</Badge>
          </div>
          <div>
            <h4 className="font-medium text-muted-foreground mb-1">Message</h4>
            <p className="rounded-md bg-muted px-3 py-2">{alert.message}</p>
          </div>
          {alert.source && (
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Source</span>
              <span className="font-mono text-xs">{alert.source}</span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Status</span>
            {alert.acknowledged ? (
              <Badge variant="success" className="gap-1">
                <Check className="h-3 w-3" />
                Acknowledged
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                <AlertCircle className="h-3 w-3" />
                Pending
              </Badge>
            )}
          </div>
          {alert.acknowledged && alert.acknowledged_by && (
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Acknowledged by</span>
              <span className="font-mono text-xs">{alert.acknowledged_by}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Created</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">{formatRelative(alert.created_at)}</span>
              </TooltipTrigger>
              <TooltipContent>{formatAbsolute(alert.created_at)}</TooltipContent>
            </Tooltip>
          </div>
          {alert.acknowledged && alert.acknowledged_at && (
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Acknowledged at</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{formatRelative(alert.acknowledged_at)}</span>
                </TooltipTrigger>
                <TooltipContent>{formatAbsolute(alert.acknowledged_at)}</TooltipContent>
              </Tooltip>
            </div>
          )}
          {alert.resolved_at && (
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Resolved at</span>
              <span>{formatAbsolute(alert.resolved_at)}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Alert Rule Card ───

function AlertRuleCard({
  rule,
}: {
  rule: AlertRuleDescriptor
}) {
  const queryClient = useQueryClient()
  const configKey = ['alertConfig', rule.key]

  const { data: config, isLoading } = useQuery<AlertConfig>({
    queryKey: configKey,
    queryFn: () => alertsApi.getAlertConfig(rule.key).then((res) => res.data),
    staleTime: 60_000,
  })

  const [thresholdValue, setThresholdValue] = useState<number | undefined>()
  const [thresholdDirty, setThresholdDirty] = useState(false)

  // Sync local threshold when config loads
  const currentThreshold = useMemo(() => {
    if (thresholdDirty) return thresholdValue
    if (config?.threshold_value != null) return config.threshold_value
    return rule.defaultThreshold
  }, [config, thresholdValue, thresholdDirty, rule.defaultThreshold])

  const updateConfig = useMutation({
    mutationFn: (data: AlertConfigUpdate) =>
      alertsApi.updateAlertConfig(rule.key, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configKey })
      toast.success(`${rule.label} rule updated`)
      setThresholdDirty(false)
    },
    onError: () => {
      toast.error(`Failed to update ${rule.label} rule`)
    },
  })

  const handleToggle = (enabled: boolean) => {
    updateConfig.mutate({ enabled })
  }

  const handleThresholdSave = () => {
    if (currentThreshold == null) return
    updateConfig.mutate({ threshold_value: currentThreshold })
  }

  const handleThresholdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleThresholdSave()
    }
  }

  if (isLoading) {
    return (
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-10 w-28" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const isEnabled = config?.enabled ?? true

  return (
    <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl transition-colors">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">{rule.label}</h3>
          <div className="flex items-center gap-2">
            <Label htmlFor={`toggle-${rule.key}`} className="text-xs text-muted-foreground">
              {isEnabled ? 'On' : 'Off'}
            </Label>
            <Switch
              id={`toggle-${rule.key}`}
              checked={isEnabled}
              onCheckedChange={handleToggle}
              disabled={updateConfig.isPending}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{rule.description}</p>
        <div className="flex items-end gap-3">
          <div className="space-y-1 flex-1">
            <Label htmlFor={`threshold-${rule.key}`} className="text-xs">
              {rule.thresholdLabel}
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id={`threshold-${rule.key}`}
                type="number"
                value={currentThreshold ?? ''}
                onChange={(e) => {
                  setThresholdValue(e.target.value === '' ? undefined : Number(e.target.value))
                  setThresholdDirty(true)
                }}
                onBlur={handleThresholdSave}
                onKeyDown={handleThresholdKeyDown}
                className="w-28 h-9"
                disabled={!isEnabled || updateConfig.isPending}
              />
              {rule.unit && (
                <span className="text-xs text-muted-foreground">{rule.unit}</span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleThresholdSave}
            disabled={!isEnabled || updateConfig.isPending}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Alert List Tab ───

function AlertListTab() {
  const queryClient = useQueryClient()
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [ackFilter, setAckFilter] = useState<string>('all') // 'all' | 'true' | 'false'
  const [page, setPage] = useState(1)
  const pageSize = 15
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Build API params: only severity and acknowledged are backend params
  const apiParams = useMemo(() => {
    const params: any = {
      page,
      page_size: pageSize,
    }
    if (severityFilter !== 'all') params.severity = severityFilter
    if (ackFilter === 'true') params.acknowledged = true
    else if (ackFilter === 'false') params.acknowledged = false
    return params
  }, [severityFilter, ackFilter, page])

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<PaginatedResponse<Alert>>({
    queryKey: ['alerts', apiParams],
    queryFn: () => alertsApi.getAlerts(apiParams).then((r) => r.data),
    placeholderData: (prev) => prev,
    refetchInterval: 15_000,
  })

  // Client-side filter by type because backend doesn't support type filter
  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    if (typeFilter === 'all') return data.items
    return data.items.filter((a) => a.type === typeFilter)
  }, [data, typeFilter])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledgeAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      toast.success('Alert acknowledged')
      if (selectedAlert) {
        setSelectedAlert((prev) => prev ? { ...prev, acknowledged: true } : prev)
      }
    },
    onError: () => toast.error('Failed to acknowledge alert'),
  })

  const handleRowClick = useCallback((alert: Alert) => {
    setSelectedAlert(alert)
    setDetailOpen(true)
  }, [])

  const handleAcknowledge = useCallback(
    (e: React.MouseEvent, alert: Alert) => {
      e.stopPropagation()
      acknowledgeMutation.mutate(alert.id)
    },
    [acknowledgeMutation],
  )

  // Available type options from the registry for filter dropdown
  const typeOptions = useMemo(
    () => Array.from(new Set(alertTypeRegistry.map((r) => r.key))),
    [],
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Severity */}
            <div className="space-y-1">
              <Label htmlFor="severity-filter" className="text-xs">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger id="severity-filter" className="w-36 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-1">
              <Label htmlFor="type-filter" className="text-xs">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="type-filter" className="w-44 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Acknowledged */}
            <div className="space-y-1">
              <Label htmlFor="ack-filter" className="text-xs">Acknowledged</Label>
              <Select value={ackFilter} onValueChange={setAckFilter}>
                <SelectTrigger id="ack-filter" className="w-44 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Acknowledged</SelectItem>
                  <SelectItem value="false">Unacknowledged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Severity</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead className="w-[140px]">Source</TableHead>
                <TableHead className="w-[140px]">Created</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
              {isError && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <p>Failed to load alerts</p>
                      <Button variant="outline" size="sm" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !isError && filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <BellOff className="h-8 w-8" />
                      <p>No alerts matching filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                !isError &&
                filteredItems.map((alert) => (
                  <TableRow
                    key={alert.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRowClick(alert)}
                  >
                    <TableCell>
                      <SeverityBadge severity={alert.severity} />
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate font-medium">
                      {alert.message}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {typeLabel(alert.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {alert.source || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground cursor-help">
                            {formatRelative(alert.created_at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatAbsolute(alert.created_at)}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {alert.acknowledged ? (
                        <Badge variant="success" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                          <Check className="h-3 w-3" />
                          Ack'd
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                        >
                          <AlertCircle className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!alert.acknowledged && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleAcknowledge(e, alert)}
                          disabled={acknowledgeMutation.isPending}
                          className="gap-1"
                        >
                          <Check className="h-4 w-4" />
                          Ack
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {data.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
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

      {/* Detail Modal */}
      <AlertDetailModal
        alert={selectedAlert}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  )
}

// ─── Alert Rules Tab ───

function AlertRulesTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {alertTypeRegistry.map((rule) => (
        <AlertRuleCard key={rule.key} rule={rule} />
      ))}
    </div>
  )
}

// ─── Main Page ───

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and configure alert notifications
          </p>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Alert List
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" />
            Alert Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <AlertListTab />
        </TabsContent>

        <TabsContent value="rules">
          <AlertRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
