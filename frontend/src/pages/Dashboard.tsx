import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Server, Cpu, HardDrive, Activity, Users, Database, Wifi, Zap } from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { DashboardStats, TimeseriesResponse } from '@/types'

// ─── Helpers ───

function usageColor(percent: number): string {
  if (percent < 50) return 'text-emerald-500'
  if (percent < 80) return 'text-amber-500'
  return 'text-red-500'
}

function usageBg(percent: number): string {
  if (percent < 50) return 'bg-emerald-500/10'
  if (percent < 80) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

function formatPercent(val: number): string {
  return `${val.toFixed(1)}%`
}

function formatMbps(val: number): string {
  return `${val.toFixed(1)} Mbps`
}

function formatCacheRatio(val: number): string {
  return `${(val * 100).toFixed(1)}%`
}

type StatCardProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  accentClass: string
}

function StatCard({ icon: Icon, label, value, accentClass }: StatCardProps) {
  return (
    <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`p-2 rounded-lg ${accentClass}`}>
          <Icon className="size-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

// ─── Time-Series Chart ───

type TimeseriesChartProps = {
  metric: string
  hours: number
  chartType: 'area' | 'line'
  label: string
  color?: string
  unitLabel?: string
}

function TimeseriesChart({
  metric,
  hours,
  chartType,
  label,
  color = 'hsl(var(--chart-1))',
  unitLabel = '',
}: TimeseriesChartProps) {
  const { data, isLoading, isError, error } = useQuery<TimeseriesResponse>({
    queryKey: ['dashboard-timeseries', metric, hours],
    queryFn: () => dashboardApi.getTimeseries({ metric, hours }).then((res) => res.data),
    refetchInterval: 60_000, // refresh charts every minute
  })

  const chartData = useMemo(() => {
    if (!data?.data) return []
    return data.data.map((p) => ({
      timestamp: new Date(p.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      value: p.value,
    }))
  }, [data])

  const chartConfig: ChartConfig = useMemo(
    () => ({
      value: {
        label,
        color,
      },
    }),
    [label, color]
  )

  if (isLoading) {
    return (
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full rounded-md" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-sm text-muted-foreground">Failed to load chart data</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            {chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={60}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <defs>
                  <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="value"
                  stroke={color}
                  fill={`url(#fill-${metric})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={60}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Line
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ───

export default function Dashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
    refetch: refetchStats,
  } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getStats().then((res) => res.data),
    refetchInterval: 5_000,
  })

  if (statsLoading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="size-10 rounded-lg" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl">
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[200px] w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (statsError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="text-destructive text-lg font-medium">Failed to load dashboard</div>
          <p className="text-muted-foreground text-sm">
            {statsErr instanceof Error ? statsErr.message : 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => refetchStats()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const s = stats!

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Server}
          label="Server Uptime"
          value={s.server_uptime}
          accentClass="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={Cpu}
          label="CPU Usage"
          value={formatPercent(s.cpu_usage_percent)}
          accentClass={usageBg(s.cpu_usage_percent)}
        />
        <StatCard
          icon={Activity}
          label="RAM Usage"
          value={formatPercent(s.ram_usage_percent)}
          accentClass={usageBg(s.ram_usage_percent)}
        />
        <StatCard
          icon={HardDrive}
          label="Disk Usage"
          value={formatPercent(s.disk_usage_percent)}
          accentClass={usageBg(s.disk_usage_percent)}
        />
        <StatCard
          icon={Users}
          label="Active Clients"
          value={s.active_clients}
          accentClass="bg-violet-500/10 text-violet-500"
        />
        <StatCard
          icon={Database}
          label="Active Leases"
          value={`${s.active_leases} / ${s.total_leases}`}
          accentClass="bg-cyan-500/10 text-cyan-500"
        />
        <StatCard
          icon={Wifi}
          label="DNS Queries/sec"
          value={s.dns_queries_per_second.toFixed(1)}
          accentClass="bg-indigo-500/10 text-indigo-500"
        />
        <StatCard
          icon={Zap}
          label="Cache Hit Ratio"
          value={formatCacheRatio(s.dns_cache_hit_ratio)}
          accentClass="bg-amber-500/10 text-amber-500"
        />
        <StatCard
          icon={Activity}
          label="Network Throughput"
          value={formatMbps(s.network_throughput_mbps)}
          accentClass="bg-teal-500/10 text-teal-500"
        />
      </div>

      {/* ─── Charts ─── */}
      <h2 className="text-lg font-semibold tracking-tight">Performance</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeseriesChart
          metric="cpu_usage_percent"
          hours={1}
          chartType="area"
          label="CPU Usage"
          color="var(--chart-1, hsl(220 70% 50%))"
        />
        <TimeseriesChart
          metric="ram_usage_percent"
          hours={1}
          chartType="area"
          label="RAM Usage"
          color="var(--chart-2, hsl(160 60% 45%))"
        />
        <TimeseriesChart
          metric="dns_queries_per_second"
          hours={1}
          chartType="line"
          label="DNS Queries/sec"
          color="var(--chart-3, hsl(30 80% 55%))"
        />
        <TimeseriesChart
          metric="network_throughput_mbps"
          hours={1}
          chartType="area"
          label="Network Throughput"
          color="var(--chart-4, hsl(280 65% 60%))"
        />
      </div>
    </div>
  )
}
