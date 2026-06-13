import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Search, Monitor, RefreshCw, ChevronLeft, ChevronRight, Info, Wifi, WifiOff, Laptop, Smartphone, Server, HelpCircle } from 'lucide-react'

import { clientsApi } from '@/lib/api'
import type { Client, ClientUpdate, PaginatedResponse } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ─── Debounce Hook ───
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// ─── Utilities ───
const isActive = (lastSeen: string | null): boolean => {
  if (!lastSeen) return false
  const date = parseISO(lastSeen)
  const now = new Date()
  return now.getTime() - date.getTime() < 24 * 60 * 60 * 1000
}

const formatRelative = (dateStr: string | null): string => {
  if (!dateStr) return 'N/A'
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return 'Invalid date'
  }
}

const formatAbsolute = (dateStr: string | null): string => {
  if (!dateStr) return 'N/A'
  try {
    return format(parseISO(dateStr), 'PPpp')
  } catch {
    return 'Invalid date'
  }
}

const getDeviceIcon = (vendor: string | null, os: string | null) => {
  const vendorLower = (vendor ?? '').toLowerCase()
  const osLower = (os ?? '').toLowerCase()
  if (osLower.includes('android') || osLower.includes('ios') || osLower.includes('iphone') || osLower.includes('ipad')) {
    return <Smartphone className="h-4 w-4 text-muted-foreground" />
  }
  if (osLower.includes('windows') || osLower.includes('macos') || osLower.includes('linux')) {
    return <Laptop className="h-4 w-4 text-muted-foreground" />
  }
  if (vendorLower.includes('server') || vendorLower.includes('raspberry') || osLower.includes('server')) {
    return <Server className="h-4 w-4 text-muted-foreground" />
  }
  return <Monitor className="h-4 w-4 text-muted-foreground" />
}

// ─── Skeleton Row ───
function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32 font-mono" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
      <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
    </TableRow>
  )
}

// ─── Detail Modal ───
function ClientDetailModal({
  client,
  open,
  onClose,
}: {
  client: Client | null
  open: boolean
  onClose: () => void
}) {
  const [notes, setNotes] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (client) {
      setNotes(client.notes ?? '')
    }
  }, [client])

  const updateMutation = useMutation({
    mutationFn: (data: ClientUpdate) => clientsApi.updateClient(client!.id, data),
    onSuccess: () => {
      toast.success('Notes updated successfully')
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['all-clients'] })
      onClose()
    },
    onError: () => {
      toast.error('Failed to update notes')
    },
  })

  const handleSave = () => {
    if (!client) return
    updateMutation.mutate({ notes: notes || undefined })
  }

  if (!client) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getDeviceIcon(client.vendor, client.os_info)}
            {client.hostname || client.ip_address || client.mac_address}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Hostname</span>
              <p>{client.hostname || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">IP Address</span>
              <p>{client.ip_address || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">MAC Address</span>
              <p className="font-mono">{client.mac_address || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Vendor</span>
              <p>{client.vendor || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">OS</span>
              <p>{client.os_info || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Connection Count</span>
              <p>{client.connection_count}</p>
            </div>
            <div>
              <span className="text-muted-foreground">First Seen</span>
              <p>{formatAbsolute(client.first_seen)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Last Seen</span>
              <p>{formatAbsolute(client.last_seen)}</p>
            </div>
          </div>
          <Separator />
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this client..."
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Notes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───
export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 500)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [vendorFilter, setVendorFilter] = useState('all')
  const [osFilter, setOsFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const queryClient = useQueryClient()

  // Fetch paginated clients
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PaginatedResponse<Client>>({
    queryKey: ['clients', { search: debouncedSearch, vendor: vendorFilter, os: osFilter, page, page_size: pageSize }],
    queryFn: () =>
      clientsApi.getClients({
        search: debouncedSearch || undefined,
        vendor: vendorFilter !== 'all' ? vendorFilter : undefined,
        os: osFilter !== 'all' ? osFilter : undefined,
        page,
        page_size: pageSize,
      }).then((res) => res.data),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  // Fetch all clients for filter extraction (cached)
  const { data: allClientsData } = useQuery<PaginatedResponse<Client>>({
    queryKey: ['all-clients'],
    queryFn: () =>
      clientsApi.getClients({ page: 1, page_size: 9999 }).then((res) => res.data),
    staleTime: 5 * 60_000,
  })

  const uniqueVendors = useMemo(() => {
    if (!allClientsData?.items) return []
    const vendors = new Set<string>()
    allClientsData.items.forEach((c) => {
      if (c.vendor) vendors.add(c.vendor)
    })
    return Array.from(vendors).sort()
  }, [allClientsData])

  const uniqueOS = useMemo(() => {
    if (!allClientsData?.items) return []
    const osSet = new Set<string>()
    allClientsData.items.forEach((c) => {
      if (c.os_info) osSet.add(c.os_info)
    })
    return Array.from(osSet).sort()
  }, [allClientsData])

  // Apply client-side status filter (active/inactive)
  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    if (statusFilter === 'all') return data.items
    return data.items.filter((c) => {
      const active = isActive(c.last_seen)
      return statusFilter === 'active' ? active : !active
    })
  }, [data, statusFilter])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  const handlePrevPage = () => setPage((p) => Math.max(1, p - 1))
  const handleNextPage = () => setPage((p) => Math.min(totalPages, p + 1))

  const handleRowClick = async (client: Client) => {
    // Fetch fresh details
    try {
      const res = await clientsApi.getClient(client.id)
      setSelectedClient(res.data)
      setDetailOpen(true)
    } catch {
      // Fallback to shallow data
      setSelectedClient(client)
      setDetailOpen(true)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Client Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} client${data.total !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search hostname, IP, MAC, vendor..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>

            {/* Vendor filter */}
            <Select
              value={vendorFilter}
              onValueChange={(val) => {
                setVendorFilter(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {uniqueVendors.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* OS filter */}
            <Select
              value={osFilter}
              onValueChange={(val) => {
                setOsFilter(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All OS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All OS</SelectItem>
                {uniqueOS.map((os) => (
                  <SelectItem key={os} value={os}>
                    {os}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <div className="flex items-center gap-1 rounded-md border border-input bg-background p-1">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'active' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter('active')}
              >
                <Wifi className="mr-1 h-3 w-3" />
                Active
              </Button>
              <Button
                variant={statusFilter === 'inactive' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter('inactive')}
              >
                <WifiOff className="mr-1 h-3 w-3" />
                Inactive
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Clients</CardTitle>
          <CardDescription>
            {data ? `Showing ${filteredItems.length} of ${data.total} clients` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-red-500 mb-2">Failed to load clients</p>
              <p className="text-sm text-muted-foreground">
                {(error as Error)?.message || 'Unknown error'}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>MAC Address</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-center">Connections</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </TableBody>
            </Table>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Info className="h-10 w-10 mb-3" />
              <p>No clients found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>MAC Address</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-center">Connections</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRowClick(client)}
                  >
                    <TableCell className="font-medium">
                      {client.hostname || '—'}
                    </TableCell>
                    <TableCell>{client.ip_address || '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{client.mac_address}</TableCell>
                    <TableCell>{client.vendor || '—'}</TableCell>
                    <TableCell>{client.os_info || '—'}</TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted underline-offset-2">
                            {formatRelative(client.last_seen)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{formatAbsolute(client.last_seen)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-center">{client.connection_count}</TableCell>
                    <TableCell className="text-center">
                      {isActive(client.last_seen) ? (
                        <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {data && data.total > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Page {data.page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <ClientDetailModal
        client={selectedClient}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  )
}
