import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BarberProvider } from './context/BarberContext'
import { ProtectedRoute } from './components/ProtectedRoute'

const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const Asistencia = lazy(() => import('./pages/Asistencia').then(m => ({ default: m.Asistencia })))
const Personas = lazy(() => import('./pages/Personas').then(m => ({ default: m.Personas })))
const Planes = lazy(() => import('./pages/Planes').then(m => ({ default: m.Planes })))
const Reportes = lazy(() => import('./pages/Reportes').then(m => ({ default: m.Reportes })))
const Barberos = lazy(() => import('./pages/Barberos').then(m => ({ default: m.Barberos })))
const ReservaPublica = lazy(() => import('./pages/ReservaPublica'))
const CancelarReserva = lazy(() => import('./pages/CancelarReserva'))

export default function App() {
  return (
    <AuthProvider>
      <BarberProvider>
        <Routes>
          {/* Ruta pública de Login */}
          <Route
            path="/login"
            element={
              <Suspense
                fallback={
                  <div className="flex min-h-dvh items-center justify-center bg-slate-950">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
                  </div>
                }
              >
                <Login />
              </Suspense>
            }
          />

          {/* Ruta pública de Reservas para clientes */}
          <Route
            path="/reservas"
            element={
              <Suspense
                fallback={
                  <div className="flex min-h-dvh items-center justify-center bg-slate-950">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
                  </div>
                }
              >
                <ReservaPublica />
              </Suspense>
            }
          />

          {/* Ruta pública de Cancelación de Reservas */}
          <Route
            path="/cancelar"
            element={
              <Suspense
                fallback={
                  <div className="flex min-h-dvh items-center justify-center bg-slate-950">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
                  </div>
                }
              >
                <CancelarReserva />
              </Suspense>
            }
          />

          {/* Rutas administrativas protegidas por autenticación con Correo y Contraseña */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/asistencia" element={<Asistencia />} />
            <Route path="/personas" element={<Personas />} />
            <Route path="/planes" element={<Planes />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/barberos" element={<Barberos />} />
          </Route>
        </Routes>
      </BarberProvider>
    </AuthProvider>
  )
}
