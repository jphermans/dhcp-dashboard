import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/Layout'
import { Suspense, lazy } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy-load page components for code splitting
const Login = lazy(() => import('@/pages/Login'))
const ChangePassword = lazy(() => import('@/pages/ChangePassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const DHCP = lazy(() => import('@/pages/DHCP'))
const DNS = lazy(() => import('@/pages/DNS'))
const Clients = lazy(() => import('@/pages/Clients'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Audit = lazy(() => import('@/pages/Audit'))
const Settings = lazy(() => import('@/pages/Settings'))

function PageFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/change-password" element={<ChangePassword />} />

                  {/* Protected routes */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="dhcp" element={<DHCP />} />
                    <Route path="dns" element={<DNS />} />
                    <Route path="clients" element={<Clients />} />
                    <Route path="alerts" element={<Alerts />} />
                    <Route path="audit" element={<Audit />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                </Routes>
              </Suspense>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
