import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { BottomNav } from './BottomNav'
import { APP_NAME } from '../lib/constants'
import { useAuth } from '../context/AuthContext'

export function Layout({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  const { logout, isAdmin, barbero } = useAuth()

  const handleLogout = async () => {
    if (window.confirm('¿Deseas cerrar sesión?')) {
      await logout()
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-barber-500">
              {APP_NAME}
            </p>
            <h1 className="truncate text-xl font-bold text-white">{title}</h1>
            {!isAdmin && barbero && (
              <p className="text-xs text-slate-500 mt-0.5">👤 {barbero.nombre}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  )
}

