import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from '../lib/firebase'
import { api } from '../lib/api'
import type { Barbero } from '../lib/types'

interface AuthContextType {
  user: User | null
  barbero: Barbero | null // Barbero logueado (si no es admin)
  isAdmin: boolean // true si es el admin oficial
  loading: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => Promise<void>
  tienePermiso: (modulo: 'inicio' | 'cobros' | 'personas' | 'planes' | 'reportes' | 'barberos') => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [barbero, setBarbero] = useState<Barbero | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser || currentUser.isAnonymous) {
        setUser(null)
        setBarbero(null)
        setIsAdmin(false)
        setLoading(false)
        return
      }

      const email = currentUser.email?.toLowerCase().trim() || ''
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.toLowerCase().trim()

      // Validar que existe configuración de admin
      if (!adminEmail) {
        console.error('⚠️ VITE_ADMIN_EMAIL no está configurado en variables de entorno')
        setLoading(false)
        return
      }

      // Verificar si es el admin (comparación normalizada)
      if (email === adminEmail) {
        console.log('✅ Administrador identificado:', email)
        setUser(currentUser)
        setBarbero(null)
        setIsAdmin(true)
        setLoading(false)
        return
      }

      // Si no es admin, buscar si es un barbero registrado
      try {
        const barberos = await api.getBarberos()
        
        // Buscar primero por UID (más confiable)
        let barberoEncontrado = barberos.find(
          (b) => b.uid === currentUser.uid && b.activo
        )
        
        // Fallback: buscar por email (compatibilidad con barberos sin UID)
        if (!barberoEncontrado) {
          barberoEncontrado = barberos.find(
            (b) => b.email.toLowerCase().trim() === email && b.activo
          )
          
          if (barberoEncontrado && !barberoEncontrado.uid) {
            console.warn('⚠️ Barbero encontrado por email sin UID asociado:', barberoEncontrado.nombre)
          }
        }
        
        if (barberoEncontrado) {
          console.log('✅ Barbero identificado:', barberoEncontrado.nombre)
          setUser(currentUser)
          setBarbero(barberoEncontrado)
          setIsAdmin(false)
        } else {
          // Usuario no autorizado
          console.warn('❌ Usuario no autorizado:', email)
          await signOut(auth)
          setUser(null)
          setBarbero(null)
          setIsAdmin(false)
        }
      } catch (error) {
        console.error('❌ Error al verificar barbero:', error)
        await signOut(auth)
        setUser(null)
        setBarbero(null)
        setIsAdmin(false)
      }
      
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email: string, pass: string) => {
    console.log('🔐 [Login] Intentando login con email:', email.toLowerCase().trim())
    console.log('🔐 [Login] Longitud de contraseña:', pass.length)
    try {
      const result = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), pass)
      console.log('✅ [Login] Login exitoso. UID:', result.user.uid)
      console.log('✅ [Login] Email del usuario:', result.user.email)
    } catch (error: any) {
      console.error('❌ [Login] Error en signInWithEmailAndPassword:', error.code, error.message)
      throw error
    }
  }

  const logout = async () => {
    await signOut(auth)
    setBarbero(null)
    setIsAdmin(false)
  }

  const tienePermiso = (modulo: 'inicio' | 'cobros' | 'personas' | 'planes' | 'reportes' | 'barberos'): boolean => {
    // El admin tiene todos los permisos
    if (isAdmin) return true
    
    // Si no hay barbero logueado, no tiene permisos
    if (!barbero) return false
    
    // Revisar permisos del barbero
    return barbero.permisos?.[modulo] ?? false
  }

  return (
    <AuthContext.Provider value={{ user, barbero, isAdmin, loading, login, logout, tienePermiso }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider')
  }
  return context
}
