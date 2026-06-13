import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authApi } from '@/lib/api'
import type { LoginRequest, LoginResponse, ChangePasswordRequest, User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (data: LoginRequest) => Promise<boolean>
  changePassword: (data: ChangePasswordRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async () => false,
  changePassword: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('access_token')
  )
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const clearAuth = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('temp_token')
    setToken(null)
    setUser(null)
    setIsLoading(false)
  }, [])

  // Validate token on mount / when token changes
  useEffect(() => {
    if (!token) {
      clearAuth()
      return
    }
    setIsLoading(true)
    authApi
      .me()
      .then((res) => {
        setUser(res.data)
        setIsLoading(false)
        setError(null)
      })
      .catch((err: unknown) => {
        console.error('Token validation failed:', err)
        clearAuth()
      })
  }, [token, clearAuth])

  const login = useCallback(async (data: LoginRequest): Promise<boolean> => {
    setError(null)
    const res = await authApi.login(data)
    const payload: LoginResponse = res.data
    
    // Check if password change is required
    if (payload.require_password_change) {
      localStorage.setItem('temp_token', payload.temp_token!)
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      setToken(null)
      setUser(null)
      setIsLoading(false)
      return true  // Signal that password change is needed
    }
    
    // Normal login flow
    localStorage.setItem('access_token', payload.access_token!)
    if (payload.refresh_token) {
      localStorage.setItem('refresh_token', payload.refresh_token)
    }
    localStorage.removeItem('temp_token')
    setToken(payload.access_token!)
    try {
      const userRes = await authApi.me()
      setUser(userRes.data)
    } catch {
      setUser(null)
    }
    return false
  }, [])

  const changePassword = useCallback(async (data: ChangePasswordRequest) => {
    setError(null)
    const res = await authApi.changePassword(data)
    const payload: LoginResponse = res.data
    
    // Store new tokens
    localStorage.setItem('access_token', payload.access_token!)
    if (payload.refresh_token) {
      localStorage.setItem('refresh_token', payload.refresh_token)
    }
    localStorage.removeItem('temp_token')
    setToken(payload.access_token!)
    
    try {
      const userRes = await authApi.me()
      setUser(userRes.data)
    } catch {
      setUser(null)
    }
  }, [])

  const logout = useCallback(() => {
    clearAuth()
  }, [clearAuth])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
