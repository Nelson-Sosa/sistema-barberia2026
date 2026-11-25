import { Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Spinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
    </div>
  )
}

// Mapeo de rutas a permisos
const rutaPermiso: Record<string, 'inicio' | 'cobros' | 'personas' | 'planes' | 'reportes' | 'barberos'> = {
  '/': 'inicio',
  '/asistencia': 'cobros',
  '/personas': 'personas',
  '/planes': 'planes',
  '/reportes': 'reportes',
  '/barberos': 'barberos', // Solo admin
}

export function ProtectedRoute() {
  const { user, loading, tienePermiso, isAdmin, barbero } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-400">Verificando sesión...</p>
        </div>
      </div>
    )
  }

  if (!user || user.isAnonymous) {
    return <Navigate to="/login" replace />
  }

  // Verificar permisos para la ruta actual
  const permisoRequerido = rutaPermiso[location.pathname]
  
  if (permisoRequerido) {
    // Caso especial: /barberos permite acceso a admin Y barberos
    if (permisoRequerido === 'barberos' && (isAdmin || barbero)) {
      // Permitir acceso
    } else if (!tienePermiso(permisoRequerido)) {
      // No tiene permiso, buscar el primer módulo con permiso
      const rutasDisponibles = Object.entries(rutaPermiso)
        .filter(([_, permiso]) => tienePermiso(permiso))
      
      if (rutasDisponibles.length > 0) {
        console.log(`⚠️ Sin permiso para ${location.pathname}, redirigiendo a ${rutasDisponibles[0][0]}`)
        return <Navigate to={rutasDisponibles[0][0]} replace />
      }
      
      // Si no tiene permisos a ningún módulo, mostrar mensaje y permitir logout
      return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4">
          <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <div className="mb-4 text-red-400">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-bold text-white">Sin permisos asignados</h2>
            <p className="mb-4 text-sm text-slate-300">
              Tu cuenta no tiene permisos para acceder a ningún módulo del sistema.
              Por favor contactá con el administrador.
            </p>
            <button
              onClick={() => {
                import('../lib/firebase').then(({ signOut, auth }) => {
                  signOut(auth).then(() => {
                    window.location.href = '/login'
                  })
                })
              }}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      )
    }
  }

  return (
    <Suspense fallback={<Spinner />}>
      <Outlet />
    </Suspense>
  )
}
