import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** 目前的登入狀態：{ user, loading, signIn, signOut } */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}
