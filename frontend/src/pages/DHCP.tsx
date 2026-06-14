import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format, parseISO } from 'date-fns'
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Router,
  Monitor,
  Check,
  X,
  Link2,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Server,
  CircleDot,
  Power,
  PowerOff
} from 'lucide-react'

import type { DHCPLease, DHCPLeaseCreate, DHCPLeaseUpdate, DHCPStatusResponse, PaginatedResponse } from '@/types'
import { dhcpApi } from '@/lib/api'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from '@/components/ui/table'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

// ---------- types ----------
interface LeaseFormData {
  ip_address: string
  mac_address: string
  hostname: string
  vendor: string
  lease_start: string
  lease_end: string
  subnet: string
  is_static: boolean
}

type LeaseModalMode = 'create' | 'edit'

// ---------- validation schema ----------
const leaseFormSchema = z.object({
  ip_address: z
    .string()
    .min(1, 'IP address is required')
    .regex(
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      'Invalid IPv4 address'
    ),
  mac_address: z
    .string()
    .min(1, 'MAC address is required')
    .regex(
      /^([0-9A-Fa-f]{2}[:-.]){5}[0-9A-Fa-f]{2}$/,
      'Invalid MAC address'
    ),
  hostname: z.string().optional().or(z.literal('')),
  vendor: z.string().optional().or(z.literal('')),
  lease_start: z.string().optional().or(z.literal('')),
  lease_end: z.string().optional().or(z.literal('')),
  subnet: z.string().optional().or(z.literal('')),
  is_static: z.boolean().default(false)
})

// ---------- helpers ----------
const stateBadge = (state: DHCPLease['state']) => {
  switch (state) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">active</Badge>
    case 'expired':
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">expired</Badge>
    case 'released':
      return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">released</Badge>
    case 'abandoned':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">abandoned</Badge>
    default:
      return <Badge variant="secondary">{state}</Badge>
  }
}

const formatDate = (dateStr: string | undefined | null) => {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'MMM dd, yyyy HH:mm')
  } catch {
    return dateStr
  }
}

const emptyLeaseForm: LeaseFormData = {
  ip_address: '',
  mac_address: '',
  hostname: '',
  vendor: '',
  lease_start: '',
  lease_end: '',
  subnet: '',
  is_static: false
}

// ---------- skeleton row component ----------
function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ---------- confirm delete dialog ----------
function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  onConfirm: () => void
  isLoading: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Lease</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this lease? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- lease form modal ----------
function LeaseFormModal({
  open,
  onOpenChange,
  mode,
  lease,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: LeaseModalMode
  lease?: DHCPLease
  onSubmit: (data: LeaseFormData) => void
}) {
  const [isPending, setIsPending] = useState(false)

  const defaultValues = useMemo(() => {
    if (mode === 'edit' && lease) {
      return {
        ip_address: lease.ip_address || '',
        mac_address: lease.mac_address || '',
        hostname: lease.hostname || '',
        vendor: lease.vendor || '',
        lease_start: lease.lease_start || '',
        lease_end: lease.lease_end || '',
        subnet: lease.subnet || '',
        is_static: lease.is_static || false
      }
    }
    return { ...emptyLeaseForm }
  }, [mode, lease])

  const form = useForm<LeaseFormData>({
    resolver: zodResolver(leaseFormSchema),
    defaultValues,
    values: defaultValues
  })

  // reset form when opening/closing
  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, form, defaultValues])

  const handleSubmit = async (data: LeaseFormData) => {
    setIsPending(true)
    try {
      onSubmit(data)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Lease' : 'Edit Lease'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Fill in the details to create a new lease reservation.'
              : 'Modify the lease fields below.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {/* IP Address */}
            <div>
              <label htmlFor="ip_address" className="block text-sm font-medium mb-1">
                IP Address <span className="text-destructive">*</span>
              </label>
              <Input
                id="ip_address"
                placeholder="192.168.1.100"
                {...form.register('ip_address')}
              />
              {form.formState.errors.ip_address && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.ip_address.message}</p>
              )}
            </div>

            {/* MAC Address */}
            <div>
              <label htmlFor="mac_address" className="block text-sm font-medium mb-1">
                MAC Address <span className="text-destructive">*</span>
              </label>
              <Input
                id="mac_address"
                placeholder="aa:bb:cc:dd:ee:ff"
                {...form.register('mac_address')}
              />
              {form.formState.errors.mac_address && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.mac_address.message}</p>
              )}
            </div>

            {/* Hostname */}
            <div>
              <label htmlFor="hostname" className="block text-sm font-medium mb-1">
                Hostname
              </label>
              <Input
                id="hostname"
                placeholder="device-name"
                {...form.register('hostname')}
              />
            </div>

            {/* Vendor */}
            <div>
              <label htmlFor="vendor" className="block text-sm font-medium mb-1">
                Vendor
              </label>
              <Input
                id="vendor"
                placeholder="Apple, Inc."
                {...form.register('vendor')}
              />
            </div>

            {/* Lease Start */}
            <div>
              <label htmlFor="lease_start" className="block text-sm font-medium mb-1">
                Lease Start
              </label>
              <Input
                id="lease_start"
                type="datetime-local"
                {...form.register('lease_start')}
              />
            </div>

            {/* Lease End */}
            <div>
              <label htmlFor="lease_end" className="block text-sm font-medium mb-1">
                Lease End
              </label>
              <Input
                id="lease_end"
                type="datetime-local"
                {...form.register('lease_end')}
              />
            </div>

            {/* Subnet */}
            <div>
              <label htmlFor="subnet" className="block text-sm font-medium mb-1">
                Subnet
              </label>
              <Input
                id="subnet"
                placeholder="192.168.1.0/24"
                {...form.register('subnet')}
              />
            </div>

            {/* Static */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_static"
                {...form.register('is_static')}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="is_static" className="text-sm font-medium">
                Static Reservation
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : mode === 'create' ? 'Create Lease' : 'Update Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- main component ----------
export default function DHCPPage() {
  const queryClient = useQueryClient()

  // state
  const [tab, setTab] = useState('active')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<LeaseModalMode>('create')
  const [editingLease, setEditingLease] = useState<DHCPLease | undefined>(undefined)

  // delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingLease, setDeletingLease] = useState<DHCPLease | undefined>(undefined)

  // debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  // reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [stateFilter, tab])

  // ---------- queries ----------
  const isReservation = tab === 'reservations'

  const leasesQuery = useQuery<PaginatedResponse<DHCPLease>>({
    queryKey: [
      'dhcp-leases',
      {
        state: tab === 'active' ? stateFilter || undefined : undefined,
        is_static: isReservation ? true : undefined,
        search: debouncedSearch || undefined,
        page,
        page_size: pageSize
      }
    ],
    queryFn: () =>
      dhcpApi.getLeases({
        state: tab === 'active' ? (stateFilter || undefined) : undefined,
        is_static: isReservation ? true : undefined,
        search: debouncedSearch || undefined,
        page,
        page_size: pageSize
      }),
    refetchInterval: 15_000 // auto-refresh every 15s
  })

  const leasesData = leasesQuery.data

  // ---------- mutations ----------
  const releaseMutation = useMutation({
    mutationFn: (id: number) => dhcpApi.releaseLease(id),
    onSuccess: () => {
      toast.success('Lease released')
      queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })
    },
    onError: () => toast.error('Failed to release lease')
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => dhcpApi.deleteLease(id),
    onSuccess: () => {
      toast.success('Lease deleted')
      setDeleteOpen(false)
      queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })
    },
    onError: () => toast.error('Failed to delete lease')
  })

  const createMutation = useMutation({
    mutationFn: (data: DHCPLeaseCreate) => dhcpApi.createLease(data),
    onSuccess: () => {
      toast.success('Lease created')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })
    },
    onError: () => toast.error('Failed to create lease')
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: DHCPLeaseUpdate }) =>
      dhcpApi.updateLease(id, data),
    onSuccess: () => {
      toast.success('Lease updated')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })
    },
    onError: () => toast.error('Failed to update lease')
  })

  // ---------- DHCP toggle status query ----------
  const dhcpStatusQuery = useQuery<DHCPStatusResponse>({
    queryKey: ['dhcp-status'],
    queryFn: () => dhcpApi.getStatus(),
    refetchInterval: 30_000,
  })

  const dhcpEnabled = dhcpStatusQuery.data?.enabled ?? false

  // ---------- DHCP toggle mutation ----------
  const toggleMutation = useMutation({
    mutationFn: (enable: boolean) => dhcpApi.toggleDhcp({ enabled: enable }),
    onSuccess: (data) => {
      toast.success(`DHCP server ${data.enabled ? 'enabled' : 'disabled'}`)
      queryClient.invalidateQueries({ queryKey: ['dhcp-status'] })
    },
    onError: () => toast.error('Failed to toggle DHCP server'),
  })

  const handleToggleDhcp = () => {
    toggleMutation.mutate(!dhcpEnabled)
  }

  // ---------- handlers ----------
  const handleRelease = (lease: DHCPLease) => {
    releaseMutation.mutate(lease.id)
  }

  const handleDelete = (lease: DHCPLease) => {
    setDeletingLease(lease)
    setDeleteOpen(true)
  }

  const confirmDelete = () => {
    if (deletingLease) {
      deleteMutation.mutate(deletingLease.id)
    }
  }

  const openCreateModal = () => {
    setModalMode('create')
    setEditingLease(undefined)
    setModalOpen(true)
  }

  const openEditModal = (lease: DHCPLease) => {
    setModalMode('edit')
    setEditingLease(lease)
    setModalOpen(true)
  }

  const handleFormSubmit = (data: LeaseFormData) => {
    const payload: DHCPLeaseCreate = {
      ip_address: data.ip_address,
      mac_address: data.mac_address,
      hostname: data.hostname || undefined,
      vendor: data.vendor || undefined,
      lease_start: data.lease_start || undefined,
      lease_end: data.lease_end || undefined,
      subnet: data.subnet || undefined,
      is_static: data.is_static
    }

    if (modalMode === 'create') {
      createMutation.mutate(payload)
    } else if (editingLease) {
      updateMutation.mutate({ id: editingLease.id, data: payload })
    }
  }

  const totalPages = leasesData ? Math.ceil(leasesData.total / leasesData.page_size) : 0

  // ---------- render ----------
  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DHCP Management</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage DHCP leases and reservations</p>
        </div>
        <Button onClick={openCreateModal} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Lease
        </Button>
      </div>

      <Separator />

      {/* tabs */}
      <Tabs value={tab} onValueChange={(v: string) => setTab(v)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="active">
              <Monitor className="mr-2 h-4 w-4" />
              Active Leases
            </TabsTrigger>
            <TabsTrigger value="reservations">
              <Link2 className="mr-2 h-4 w-4" />
              Reservations
            </TabsTrigger>
            <TabsTrigger value="ranges">
              <Server className="mr-2 h-4 w-4" />
              IP Ranges
            </TabsTrigger>
          </TabsList>

          {/* search + filter bar (only for leases/reservations) */}
          {tab !== 'ranges' && (
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search IP, MAC, hostname…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {tab === 'active' && (
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">All States</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="released">Released</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              )}
              <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Active Leases tab */}
        <TabsContent value="active" className="mt-0">
          <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
            <CardContent className="p-0 overflow-x-auto">
              {leasesQuery.isLoading ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Lease Start</TableHead>
                      <TableHead>Lease End</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </TableBody>
                </Table>
              ) : leasesQuery.isError ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Failed to load leases.</p>
                  <Button variant="outline" className="mt-2" onClick={() => queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })}>
                    Retry
                  </Button>
                </div>
              ) : leasesData && leasesData.items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CircleDot className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No leases found</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP Address</TableHead>
                        <TableHead>MAC Address</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Lease Start</TableHead>
                        <TableHead>Lease End</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leasesData!.items.map((lease) => (
                        <TableRow key={lease.id}>
                          <TableCell className="font-mono text-sm">{lease.ip_address}</TableCell>
                          <TableCell className="font-mono text-sm">{lease.mac_address}</TableCell>
                          <TableCell>{lease.hostname || '—'}</TableCell>
                          <TableCell>{lease.vendor || '—'}</TableCell>
                          <TableCell className="text-sm">{formatDate(lease.lease_start)}</TableCell>
                          <TableCell className="text-sm">{formatDate(lease.lease_end)}</TableCell>
                          <TableCell>{stateBadge(lease.state)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {lease.state === 'active' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                                  onClick={() => handleRelease(lease)}
                                  disabled={releaseMutation.isPending}
                                >
                                  <X className="mr-1 h-3 w-3" />
                                  Release
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditModal(lease)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(lease)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t p-4">
                      <p className="text-sm text-muted-foreground">
                        Page {leasesData!.page} of {totalPages} ({leasesData!.total} total)
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={page >= totalPages}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reservations tab */}
        <TabsContent value="reservations" className="mt-0">
          <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
            <CardContent className="p-0 overflow-x-auto">
              {leasesQuery.isLoading ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Lease Start</TableHead>
                      <TableHead>Lease End</TableHead>
                      <TableHead>Static</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </TableBody>
                </Table>
              ) : leasesQuery.isError ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Failed to load reservations.</p>
                  <Button variant="outline" className="mt-2" onClick={() => queryClient.invalidateQueries({ queryKey: ['dhcp-leases'] })}>
                    Retry
                  </Button>
                </div>
              ) : leasesData && leasesData.items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CircleDot className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No reservations found</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP Address</TableHead>
                        <TableHead>MAC Address</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Lease Start</TableHead>
                        <TableHead>Lease End</TableHead>
                        <TableHead>Static</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leasesData!.items.map((lease) => (
                        <TableRow key={lease.id}>
                          <TableCell className="font-mono text-sm">{lease.ip_address}</TableCell>
                          <TableCell className="font-mono text-sm">{lease.mac_address}</TableCell>
                          <TableCell>{lease.hostname || '—'}</TableCell>
                          <TableCell>{lease.vendor || '—'}</TableCell>
                          <TableCell className="text-sm">{formatDate(lease.lease_start)}</TableCell>
                          <TableCell className="text-sm">{formatDate(lease.lease_end)}</TableCell>
                          <TableCell>
                            <Badge variant={lease.is_static ? 'default' : 'secondary'}>
                              {lease.is_static ? 'Static' : 'Dynamic'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditModal(lease)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(lease)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t p-4">
                      <p className="text-sm text-muted-foreground">
                        Page {leasesData!.page} of {totalPages} ({leasesData!.total} total)
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={page >= totalPages}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IP Ranges tab */}
        <TabsContent value="ranges" className="mt-0">
          <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
            <CardHeader>
              <CardTitle className="text-lg">IP Range Management</CardTitle>
              <CardDescription>
                IP Range management will be available in a future update.
                Configure your DHCP pools via the backend configuration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Server className="h-12 w-12 opacity-30 mr-4" />
                <p className="text-lg">Coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CRUD Modal */}
      <LeaseFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        lease={editingLease}
        onSubmit={handleFormSubmit}
      />

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
