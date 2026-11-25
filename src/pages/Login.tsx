import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Scissors, Mail, Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { APP_NAME } from '../lib/constants'

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Si ya está autenticado, redirigir al Inicio
  if (user && !user.isAnonymous) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Por favor completa todos los campos.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      console.error('[Login] Error al iniciar sesión:', err)
      const firebaseError = err as { code?: string }
      
      switch (firebaseError.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          setError('Correo o contraseña incorrectos.')
          break
        case 'auth/invalid-email':
          setError('El formato del correo no es válido.')
          break
        case 'auth/too-many-requests':
          setError('Demasiados intentos fallidos. Intenta más tarde.')
          break
        case 'auth/network-request-failed':
          setError('Error de conexión a internet.')
          break
        default:
          setError('No se pudo iniciar sesión. Verifica tus datos.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-4 py-8 text-white">
      <div className="w-full max-w-sm space-y-8">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-500/10 text-barber-500 ring-1 ring-barber-500/30">
            <Scissors className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            {APP_NAME}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Ingresa tus credenciales para acceder al sistema
          </p>
        </div>

        {/* Card Form */}
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Campo Correo */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Correo Electrónico
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-600 transition-colors focus:border-barber-500 focus:outline-none focus:ring-1 focus:ring-barber-500"
              />
            </div>
          </div>

          {/* Campo Contraseña */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Contraseña
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-10 text-sm text-white placeholder-slate-600 transition-colors focus:border-barber-500 focus:outline-none focus:ring-1 focus:ring-barber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Botón Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-barber-500 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-barber-500/20 transition-all hover:bg-barber-400 active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Iniciar Sesión</span>
              </>
            )}
          </button>
        </form>


      </div>
    </div>
  )
}
