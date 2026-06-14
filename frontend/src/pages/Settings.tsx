import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings,
  User,
  Shield,
  Moon,
  Sun,
  Bell,
  Key,
  Mail,
  Save,
  X,
  UserPlus,
  Check,
} from 'lucide-react'

import { authApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import type { User as UserType, UserUpdate } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ─── Helpers ───
function getInitials(name: string | null, username: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    if (parts.length === 1 && parts[0].length >= 1) return parts[0][0].toUpperCase()
  }
  return username.slice(0, 2).toUpperCase()
}

function roleBadgeColor(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-red-500/10 text-red-500 border-red-500/20'
    case 'operator':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    case 'readonly':
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    default:
      return 'bg-primary/10 text-primary border-primary/20'
  }
}

// ─── Tab Button ───
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

// ─── Main Page ───
export default function SettingsPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'admin'>('profile')

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Not authenticated</p>
      </div>
    )
  }

  const isAdmin = user.role === 'admin'

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex flex-wrap gap-1">
        <TabButton
          active={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
          icon={User}
          label="Profile"
        />
        <TabButton
          active={activeTab === 'appearance'}
          onClick={() => setActiveTab('appearance')}
          icon={Sun}
          label="Appearance"
        />
        {isAdmin && (
          <TabButton
            active={activeTab === 'admin'}
            onClick={() => setActiveTab('admin')}
            icon={Shield}
            label="Admin"
          />
        )}
      </div>

      {/* ─── Tab Content ─── */}
      {activeTab === 'profile' && <ProfileTab user={user} />}
      {activeTab === 'appearance' && <AppearanceTab theme={theme} toggleTheme={toggleTheme} />}
      {activeTab === 'admin' && isAdmin && <AdminTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════
// ─── Profile Tab ───
// ═══════════════════════════════════════════════
function ProfileTab({ user }: { user: UserType }) {
  const { user: authUser } = useAuth()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(user.email)
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [editing, setEditing] = useState(false)

  const isDirty = email !== user.email || fullName !== (user.full_name ?? '')

  const updateMutation = useMutation({
    mutationFn: (data: UserUpdate) => authApi.updateCurrentUser(data),
    onSuccess: (res) => {
      toast.success('Profile updated successfully')
      // Update the auth context user and queries
      queryClient.setQueryData(['auth-user'], res.data)
      queryClient.invalidateQueries({ queryKey: ['auth-user'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setEditing(false)
    },
    onError: () => {
      toast.error('Failed to update profile')
    },
  })

  const handleSave = () => {
    const data: UserUpdate = {}
    if (email !== user.email) data.email = email
    if (fullName !== (user.full_name ?? '')) data.full_name = fullName || undefined
    if (Object.keys(data).length === 0) return
    updateMutation.mutate(data)
  }

  const handleCancel = () => {
    setEmail(user.email)
    setFullName(user.full_name ?? '')
    setEditing(false)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* ─── User Info Card ─── */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center text-center space-y-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src="" alt={user.username} />
            <AvatarFallback className="text-lg bg-primary/10 text-primary">
              {getInitials(user.full_name, user.username)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user.full_name || user.username}</p>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          </div>
          <Badge
            variant="outline"
            className={cn('text-xs font-medium capitalize', roleBadgeColor(user.role))}
          >
            <Shield className="mr-1 h-3 w-3" />
            {user.role}
          </Badge>
          {user.last_login && (
            <p className="text-xs text-muted-foreground">
              Last login: {new Date(user.last_login).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit Profile Card ─── */}
      <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Edit Profile</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </div>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input id="profile-username" value={user.username} disabled />
            <p className="text-xs text-muted-foreground">
              Username cannot be changed
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            {editing ? (
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{user.email || '—'}</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-fullname">Full Name</Label>
            {editing ? (
              <Input
                id="profile-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            ) : (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{user.full_name || '—'}</span>
              </div>
            )}
          </div>

          {editing && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={updateMutation.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}

          <Separator />

          {/* ─── Password Section ─── */}
          <div>
            <CardTitle className="text-base mb-1">Password</CardTitle>
            <CardDescription>
              Password change is not yet available via the API. Please contact your
              administrator.
            </CardDescription>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════
// ─── Appearance Tab ───
// ═══════════════════════════════════════════════
function AppearanceTab({
  theme,
  toggleTheme,
}: {
  theme: string
  toggleTheme: () => void
}) {
  return (
    <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Theme</CardTitle>
        <CardDescription>
          Customize the appearance of the dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Theme Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 text-primary" />
            ) : (
              <Sun className="h-5 w-5 text-amber-500" />
            )}
            <div>
              <p className="text-sm font-medium">
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </p>
              <p className="text-xs text-muted-foreground">
                {theme === 'dark'
                  ? 'Easier on the eyes in low light'
                  : 'Brighter and more vibrant'}
              </p>
            </div>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={toggleTheme}
            aria-label="Toggle theme"
          />
        </div>

        <Separator />

        {/* Quick Toggle Buttons */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quick Select</Label>
          <div className="flex gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (theme !== 'light') toggleTheme()
              }}
            >
              <Sun className="mr-2 h-4 w-4" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (theme !== 'dark') toggleTheme()
              }}
            >
              <Moon className="mr-2 h-4 w-4" />
              Dark
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════
// ─── Admin Tab ───
// ═══════════════════════════════════════════════
function AdminTab() {
  const queryClient = useQueryClient()

  const { data: users, isLoading, isError, refetch } = useQuery<UserType[]>({
    queryKey: ['admin-users'],
    queryFn: () => authApi.listUsers().then((res) => res.data),
    staleTime: 30_000,
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      authApi.updateUser(id, { role }),
    onSuccess: () => {
      toast.success('User role updated')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => {
      toast.error('Failed to update user role')
    },
  })

  const activeMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      authApi.updateUser(id, { is_active }),
    onSuccess: () => {
      toast.success('User status updated')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => {
      toast.error('Failed to update user status')
    },
  })

  const handleRoleChange = (userId: string, newRole: string) => {
    roleMutation.mutate({ id: userId, role: newRole })
  }

  const handleActiveToggle = (userId: string, currentActive: boolean) => {
    activeMutation.mutate({ id: userId, is_active: !currentActive })
  }

  return (
    <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-sm rounded-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">User Management</CardTitle>
            <CardDescription>
              Manage users, roles, and account status
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm text-destructive">
              Failed to load users
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && users && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <User className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              No users found
            </p>
          </div>
        )}

        {!isLoading && !isError && users && users.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(u.full_name, u.username)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {u.full_name || u.username}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            @{u.username}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u.id, v)}
                      >
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="readonly">Read-Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.is_active}
                        onCheckedChange={() => handleActiveToggle(u.id, u.is_active)}
                        aria-label={`Toggle active for ${u.username}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Separator className="my-4" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              User creation is available via the API at{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                POST /auth/register
              </code>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
