import { CalendarDays, ClipboardList, CreditCard, Home, Users, Users2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const allLinks = [
  { to: '/', icon: Home, label: 'Inicio', permiso: 'inicio' as const },
  { to: '/asistencia', icon: CreditCard, label: 'Cobro', permiso: 'cobros' as const },
  { to: '/personas', icon: Users, label: 'Personas', permiso: 'personas' as const },
  { to: '/planes', icon: CalendarDays, label: 'Planes', permiso: 'planes' as const },
  { to: '/reportes', icon: ClipboardList, label: 'Reportes', permiso: 'reportes' as const },
  { to: '/barberos', icon: Users2, label: 'Barberos', permiso: 'barberos' as const },
]

export function BottomNav() {
  const { tienePermiso, isAdmin, barbero } = useAuth()
  
  // Filtrar links según permisos del usuario
  const links = allLinks.filter(link => {
    // Si es la sección de barberos, mostrarla siempre (tanto admin como barberos)
    if (link.permiso === 'barberos') {
      return isAdmin || !!barbero
    }
    return tienePermiso(link.permiso)
  })
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors ${
                isActive ? 'text-barber-400' : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            <Icon size={20} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
