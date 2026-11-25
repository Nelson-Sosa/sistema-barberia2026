import { AlertTriangle, CheckCircle2, Clock, Loader2, Search, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../lib/api'
import type { Cobro, JornadaReservas, TurnoSlot } from '../lib/types'
import { APP_NAME } from '../lib/constants'
import { hoyISO, formatearFechaCorta } from '../lib/dates'
import { obtenerNombreDiaConFecha } from '../lib/reservasUtils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function CancelarReserva() {
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [cobroEncontrado, setCobroEncontrado] = useState<Cobro | null>(null)
  const [jornadaRelacionada, setJornadaRelacionada] = useState<JornadaReservas | null>(null)
  const [slotRelacionado, setSlotRelacionado] = useState<TurnoSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [cancelado, setCancelado] = useState(false)

  const buscarReserva = async () => {
    if (!codigo.trim()) {
      setError('Por favor ingresá tu código de cancelación')
      return
    }

    setBuscando(true)
    setError(null)
    setCobroEncontrado(null)
    setJornadaRelacionada(null)
    setSlotRelacionado(null)

    try {
      const codigoLimpio = codigo.trim().toUpperCase()
      const cobro = await api.buscarCobroPorCodigoCancelacion(codigoLimpio)

      if (!cobro) {
        setError('Código no encontrado o la reserva ya fue cancelada/pagada')
        setBuscando(false)
        return
      }

      // Validar que el turno no haya pasado
      const hoyStr = hoyISO()
      if (cobro.fecha < hoyStr) {
        setError('No se puede cancelar un turno que ya pasó')
        setBuscando(false)
        return
      }

      // Buscar la jornada y el slot relacionado
      const todasJornadas = await api.getTodasJornadas()
      let jornadaMatch: JornadaReservas | null = null
      let slotMatch: TurnoSlot | null = null

      for (const j of todasJornadas) {
        const slot = j.slots.find((s) => s.cobroId === cobro.id)
        if (slot) {
          jornadaMatch = j
          slotMatch = slot
          break
        }
      }

      setCobroEncontrado(cobro)
      setJornadaRelacionada(jornadaMatch)
      setSlotRelacionado(slotMatch)
    } catch (e) {
      console.error('Error al buscar reserva:', e)
      setError('Ocurrió un error al buscar tu reserva. Intentá de nuevo.')
    } finally {
      setBuscando(false)
    }
  }

  const confirmarCancelacion = async () => {
    if (!cobroEncontrado) return

    setCancelando(true)
    setError(null)

    try {
      // Si tenemos la jornada relacionada, liberar el turno primero
      if (jornadaRelacionada && slotRelacionado) {
        const nuevosSlots = jornadaRelacionada.slots.map((s) => {
          if (s.cobroId === cobroEncontrado.id) {
            return {
              ...s,
              estado: 'disponible' as const,
              clienteNombre: undefined,
              clienteTelefono: undefined,
              opcionNombre: undefined,
              opcionPrecio: undefined,
              notas: undefined,
              cobroId: undefined,
            }
          }
          return s
        })

        const jornadaActualizada: JornadaReservas = {
          ...jornadaRelacionada,
          slots: nuevosSlots,
        }

        // Actualizar la jornada primero
        await api.saveJornadaReservas(jornadaActualizada)
      }

      // Luego eliminar el cobro
      await api.deleteCobro(cobroEncontrado.id)
      setCancelado(true)
    } catch (e) {
      console.error('Error al cancelar reserva:', e)
      setError('Ocurrió un error al cancelar tu reserva. Intentá de nuevo.')
    } finally {
      setCancelando(false)
    }
  }

  const reiniciar = () => {
    setCodigo('')
    setCobroEncontrado(null)
    setJornadaRelacionada(null)
    setSlotRelacionado(null)
    setError(null)
    setCancelado(false)
  }

  if (cancelado) {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
        <div
          className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat opacity-30"
          style={{ backgroundImage: `url('/Icono_nuevo.png')` }}
        />
        <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/75 to-slate-950/95" />
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[350px] w-[500px] rounded-full bg-gradient-to-tr from-emerald-600/20 via-emerald-500/20 to-emerald-400/10 blur-[100px] opacity-70" />

        <div
          className="relative mx-auto min-h-dvh max-w-lg px-4 py-8 flex flex-col justify-center items-center"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="w-full rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center backdrop-blur-md shadow-xl">
            <CheckCircle2 size={64} className="mx-auto mb-4 text-emerald-400" />
            <h1 className="text-2xl font-black text-white mb-2">¡Turno Cancelado!</h1>
            <p className="text-sm text-slate-300 mb-6">
              Tu reserva fue cancelada exitosamente. El turno quedó disponible nuevamente.
            </p>
            {slotRelacionado && jornadaRelacionada && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 mb-6 text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Detalles de la cancelación:
                </p>
                <p className="text-sm text-white">
                  📅 {obtenerNombreDiaConFecha(jornadaRelacionada.fecha)}
                </p>
                <p className="text-sm text-white">
                  🕐 {slotRelacionado.horaInicio} - {slotRelacionado.horaFin}
                </p>
                {slotRelacionado.clienteNombre && (
                  <p className="text-sm text-white">👤 {slotRelacionado.clienteNombre}</p>
                )}
                {slotRelacionado.opcionNombre && (
                  <p className="text-sm text-barber-400">✂️ {slotRelacionado.opcionNombre}</p>
                )}
              </div>
            )}
            <Button onClick={reiniciar} className="w-full">
              Cancelar otra reserva
            </Button>
            <a
              href="/reservas"
              className="mt-3 block text-sm text-barber-400 hover:text-barber-300 underline"
            >
              Ir a reservar un nuevo turno
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100">
      {/* Fondo */}
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: `url('/Icono_nuevo.png')` }}
      />
      <div
        className="pointer-events-none fixed inset-0 bg-center bg-contain bg-no-repeat opacity-25 max-w-sm mx-auto my-auto h-[340px]"
        style={{ backgroundImage: `url('/Icono_nuevo.png')` }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/75 to-slate-950/95" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[350px] w-[500px] rounded-full bg-gradient-to-tr from-amber-600/20 via-red-500/20 to-red-400/10 blur-[100px] opacity-70" />

      <div
        className="relative mx-auto min-h-dvh max-w-lg px-4 py-8 flex flex-col justify-between"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div>
          {/* Header */}
          <div className="mb-6">
            {/* Botón Volver */}
            <a
              href="/reservas"
              className="inline-flex items-center gap-1.5 mb-4 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
              Volver a reservas
            </a>
            
            <div className="text-center">
              <h1 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-md">
                {APP_NAME}
              </h1>
              <p className="text-xs font-medium text-slate-400 tracking-wide mt-1">
                Cancelar Reserva de Turno
              </p>
            </div>
          </div>

          {/* Formulario de búsqueda */}
          {!cobroEncontrado && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 backdrop-blur-md shadow-xl">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                    <X size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Cancelar Turno</h2>
                    <p className="text-xs text-slate-400">
                      Ingresá tu código de cancelación
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Input
                    label="Código de Cancelación"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    placeholder="TIM-261102-A3F7B2"
                    className="text-center font-mono text-lg tracking-widest"
                    disabled={buscando}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') buscarReserva()
                    }}
                  />

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 animate-pulse">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
                      <p className="text-xs text-red-300">{error}</p>
                    </div>
                  )}

                  <Button
                    onClick={buscarReserva}
                    disabled={buscando || !codigo.trim()}
                    className="w-full font-bold"
                  >
                    {buscando ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search size={16} className="mr-2" />
                        Buscar Reserva
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Información de ayuda */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 backdrop-blur-sm">
                <p className="text-xs font-bold text-slate-300 mb-2">ℹ️ ¿Dónde está mi código?</p>
                <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li>Revisá el mensaje de WhatsApp de confirmación de tu turno</li>
                  <li>El código tiene el formato: TIM-XXXXXX-XXXXXX</li>
                  <li>Solo podés cancelar turnos que aún no hayan pasado</li>
                </ul>
              </div>
            </div>
          )}

          {/* Confirmación de cancelación */}
          {cobroEncontrado && !cancelado && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 backdrop-blur-md shadow-xl">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Confirmar Cancelación</h2>
                    <p className="text-xs text-slate-400">Revisá los datos antes de cancelar</p>
                  </div>
                </div>

                {jornadaRelacionada && slotRelacionado ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Detalles de tu reserva:
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-barber-400" />
                        <span className="text-sm text-white font-bold">
                          {obtenerNombreDiaConFecha(jornadaRelacionada.fecha)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-barber-400" />
                        <span className="text-sm text-white">
                          {slotRelacionado.horaInicio} - {slotRelacionado.horaFin}
                        </span>
                      </div>
                      {slotRelacionado.clienteNombre && (
                        <p className="text-sm text-white">
                          👤 Cliente: {slotRelacionado.clienteNombre}
                        </p>
                      )}
                      {slotRelacionado.opcionNombre && (
                        <p className="text-sm text-barber-400">
                          ✂️ Servicio: {slotRelacionado.opcionNombre}
                          {slotRelacionado.opcionPrecio
                            ? ` (${slotRelacionado.opcionPrecio.toLocaleString('es-PY')} Gs)`
                            : ''}
                        </p>
                      )}
                      {slotRelacionado.notas && (
                        <p className="text-xs text-slate-400 italic">
                          📝 Nota: {slotRelacionado.notas}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 mb-4">
                    <p className="text-sm text-white">
                      📅 Fecha: {formatearFechaCorta(cobroEncontrado.fecha)}
                    </p>
                    <p className="text-sm text-slate-300">{cobroEncontrado.descripcion}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={reiniciar}>
                    Volver
                  </Button>
                  <Button
                    onClick={confirmarCancelacion}
                    disabled={cancelando}
                    className="flex-1 bg-red-600 hover:bg-red-500 font-bold"
                  >
                    {cancelando ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      <>
                        <X size={16} className="mr-2" />
                        Cancelar Turno
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-600 text-[11px]">
          <p>
            © {new Date().getFullYear()} {APP_NAME} · Sistema de Reservas
          </p>
          <a href="/reservas" className="mt-2 block text-barber-400 hover:text-barber-300 underline">
            Ir a reservar un turno
          </a>
        </div>
      </div>
    </div>
  )
}

export default CancelarReserva
