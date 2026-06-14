import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Server,
  Info,
} from 'lucide-react';

import { dnsApi } from '@/lib/api';
import type { DNSRecord, DNSRecordCreate, DNSRecordUpdate, PaginatedResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// --- Zod Schema ---
const dnsRecordSchema = z.object({
  zone: z.string().min(1, 'Zone is required'),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(253, 'Name must be 253 characters or less')
    .regex(/^[^ ]+$/, 'Name cannot contain spaces'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'PTR']),
  value: z.string().min(1, 'Value is required'),
  ttl: z.coerce.number().int().positive('TTL must be positive').default(3600),
  priority: z.coerce.number().int().nullable().optional(),
}).superRefine((data, ctx) => {
  // Type-specific value validation
  const { type, value, priority } = data;

  if (type === 'A') {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a valid IPv4 address', path: ['value'] });
    }
  } else if (type === 'AAAA') {
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    if (!ipv6Regex.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a valid IPv6 address', path: ['value'] });
    }
  } else if (type === 'CNAME' || type === 'MX' || type === 'SRV') {
    // Simple hostname validation
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/;
    if (!hostnameRegex.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a valid hostname', path: ['value'] });
    }
  }

  if ((type === 'MX' || type === 'SRV') && (priority === null || priority === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Priority is required for MX and SRV records', path: ['priority'] });
  }
});

type DNSFormData = z.infer<typeof dnsRecordSchema>;

// --- Helpers ---
const typeBadgeColors: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  AAAA: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  CNAME: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  MX: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  TXT: 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300',
  SRV: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  PTR: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
};

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${typeBadgeColors[type] || ''}`}>
      {type}
    </Badge>
  );
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '—';
  try {
    return format(parseISO(dateString), 'MMM d, yyyy HH:mm');
  } catch {
    return '—';
  }
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Skeleton rows
function TableSkeleton({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// --- Delete Confirmation Dialog ---
function DeleteConfirmDialog({
  open,
  onOpenChange,
  record,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DNSRecord | null;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (!record) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete DNS Record</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the record <strong>{record.name}</strong> ({record.type})? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Create/Edit Modal ---
function DNSRecordFormModal({
  open,
  onOpenChange,
  record,
  zones,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DNSRecord | null;
  zones: string[];
}) {
  const isEditing = !!record;
  const queryClient = useQueryClient();

  const form = useForm<DNSFormData>({
    resolver: zodResolver(dnsRecordSchema),
    defaultValues: record
      ? {
          zone: record.zone,
          name: record.name,
          type: record.type,
          value: record.value,
          ttl: record.ttl,
          priority: record.priority ?? undefined,
        }
      : {
          zone: '',
          name: '',
          type: 'A',
          value: '',
          ttl: 3600,
          priority: undefined,
        },
  });

  // Reset form when record changes
  useEffect(() => {
    if (open) {
      form.reset(
        record
          ? {
              zone: record.zone,
              name: record.name,
              type: record.type,
              value: record.value,
              ttl: record.ttl,
              priority: record.priority ?? undefined,
            }
          : {
              zone: '',
              name: '',
              type: 'A',
              value: '',
              ttl: 3600,
              priority: undefined,
            }
      );
    }
  }, [open, record, form]);

  const createMutation = useMutation({
    mutationFn: (data: DNSRecordCreate) => dnsApi.createRecord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      queryClient.invalidateQueries({ queryKey: ['dns-zones'] });
      toast.success('DNS record created');
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create record');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DNSRecordUpdate }) => dnsApi.updateRecord(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      toast.success('DNS record updated');
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update record');
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const selectedType = form.watch('type');
  const showPriority = selectedType === 'MX' || selectedType === 'SRV';

  const onSubmit = (data: DNSFormData) => {
    const formatted = {
      ...data,
      priority: showPriority ? data.priority ?? 0 : null,
    };
    if (isEditing && record) {
      updateMutation.mutate({ id: record.id, data: formatted as DNSRecordUpdate });
    } else {
      createMutation.mutate(formatted as DNSRecordCreate);
    }
  };

  const zoneOptions = isEditing ? [record?.zone || ''] : zones;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit DNS Record' : 'Create DNS Record'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the record fields below.'
              : 'Add a new DNS record to the zone.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="zone">Zone</Label>
            {isEditing ? (
              <Input id="zone" disabled value={form.watch('zone')} className="mt-1" />
            ) : (
              <Select
                value={form.watch('zone')}
                onValueChange={(value: string) => form.setValue('zone', value, { shouldValidate: true })}
              >
                <SelectTrigger id="zone" className="mt-1">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {zoneOptions.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {form.formState.errors.zone && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.zone.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              className="mt-1"
              placeholder="e.g., www"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select
              value={form.watch('type')}
              onValueChange={(value: DNSFormData['type']) => form.setValue('type', value, { shouldValidate: true })}
            >
              <SelectTrigger id="type" className="mt-1">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'PTR'].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.type && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.type.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              className="mt-1"
              placeholder="e.g., 192.168.1.10"
              {...form.register('value')}
            />
            {form.formState.errors.value && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.value.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ttl">TTL (seconds)</Label>
              <Input
                id="ttl"
                className="mt-1"
                type="number"
                {...form.register('ttl')}
              />
              {form.formState.errors.ttl && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.ttl.message}</p>
              )}
            </div>

            {showPriority && (
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  className="mt-1"
                  type="number"
                  {...form.register('priority')}
                />
                {form.formState.errors.priority && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.priority.message}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Update Record' : 'Create Record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Page Component ---
export default function DNSPage() {
  const queryClient = useQueryClient();

  // Filters state
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Debounced search
  const debouncedSearch = useDebounce(search, 500);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedZone, typeFilter, debouncedSearch]);

  // Dialog states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DNSRecord | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch distinct zones
  const zonesQuery = useQuery({
    queryKey: ['dns-zones'],
    queryFn: async () => {
      const res: PaginatedResponse<DNSRecord> = await dnsApi.getRecords({ page_size: 9999 });
      const zones = [...new Set(res.items.map((r: DNSRecord) => r.zone))].sort();
      return zones;
    },
    staleTime: 5 * 60 * 1000,
  });

  const zones = zonesQuery.data || [];

  // Fetch records
  const recordsQuery = useQuery({
    queryKey: ['dns-records', selectedZone, typeFilter, debouncedSearch, page, pageSize],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize };
      if (selectedZone) params.zone = selectedZone;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      return dnsApi.getRecords(params);
    },
    refetchInterval: 30_000, // 30s polling
    placeholderData: (prev) => prev,
  });

  const records = recordsQuery.data?.items || [];
  const total = recordsQuery.data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => dnsApi.deleteRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      queryClient.invalidateQueries({ queryKey: ['dns-zones'] });
      toast.success('DNS record deleted');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete record');
    },
  });

  // Handlers
  const handleCreate = () => {
    setEditingRecord(null);
    setFormModalOpen(true);
  };

  const handleEdit = (record: DNSRecord) => {
    setEditingRecord(record);
    setFormModalOpen(true);
  };

  const handleDelete = (record: DNSRecord) => {
    setDeleteTarget(record);
    setDeleteDialogOpen(true);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dns-records'] });
    toast.info('Refreshing data...');
  };

  // Error toast
  useEffect(() => {
    if (recordsQuery.error) {
      toast.error('Failed to load DNS records');
    }
  }, [recordsQuery.error]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">DNS Management</h1>
          <p className="text-muted-foreground mt-1">Manage DNS zones and records</p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label className="text-sm mb-1.5 block">Zone</Label>
              <Select value={selectedZone} onValueChange={setSelectedZone}>
                <SelectTrigger>
                  <SelectValue placeholder="All zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All zones</SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Label className="text-sm mb-1.5 block">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'PTR'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-[2]">
              <Label className="text-sm mb-1.5 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or value..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-0">
          <CardTitle>DNS Records</CardTitle>
          <CardDescription>
            {recordsQuery.isSuccess
              ? `${total} record${total !== 1 ? 's' : ''} found`
              : 'Loading records...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 overflow-x-auto">
          {recordsQuery.isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[15%]">Zone</TableHead>
                  <TableHead className="w-[20%]">Name</TableHead>
                  <TableHead className="w-[10%]">Type</TableHead>
                  <TableHead className="w-[20%]">Value</TableHead>
                  <TableHead className="w-[10%]">TTL</TableHead>
                  <TableHead className="w-[10%]">Priority</TableHead>
                  <TableHead className="w-[15%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableSkeleton rows={8} cols={7} />
              </TableBody>
            </Table>
          ) : recordsQuery.isError ? (
            <div className="py-12 text-center">
              <Server className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">Failed to load records</p>
              <Button variant="outline" className="mt-4" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center">
              <Info className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">
                {selectedZone ? 'No records found in this zone' : 'No records found'}
              </p>
              <Button variant="outline" className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Record
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zone</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>TTL</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record: DNSRecord) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.zone}</TableCell>
                        <TableCell>{record.name}</TableCell>
                        <TableCell>
                          <TypeBadge type={record.type} />
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-mono text-sm" title={record.value}>
                          {record.value}
                        </TableCell>
                        <TableCell>{record.ttl}</TableCell>
                        <TableCell>
                          {record.priority !== null && record.priority !== undefined ? record.priority : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEdit(record)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleDelete(record)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <DNSRecordFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        record={editingRecord}
        zones={zones}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        record={deleteTarget}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
