import { useEffect, useRef, useState } from 'react'
import { Trash2, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { registrarCobroYClientePorReserva } from '../lib/reservasUtils'
import type { Barbero, JornadaReservas, OpcionCliente, TurnoSlot } from '../lib/types'
import { hoyISO } from '../lib/dates'
import { getLunesDeSemana, getDiasDeSemana, generarSlotsJornada } from '../lib/reservasUtils'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Select } from './ui/Select'

type FiltroTipo = 'reservados' | 'todos' | 'disponibles'

interface DiaSemana {
  nombre: string
  nombreCorto: string
  fecha: string
  diaSemana: number // 0=Domingo, 1=Lunes, etc.
  esHoy: boolean
}

export function VerAgendaModal({
  open,
  onClose,
  barberoInfo,
  soloLectura = false,
}: {
  open: boolean
  onClose: () => void
  barberoInfo?: Barbero
  soloLectura?: boolean
}) {
  const [semanaActual, setSemanaActual] = useState<Date>(getLunesDeSemana(new Date()))
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaSemana | null>(null)
  const [jornadas, setJornadas] = useState<JornadaReservas[]>([])
  const [jornadaDia, setJornadaDia] = useState<JornadaReservas | null>(null)
  const [filtro, setFiltro] = useState<FiltroTipo>('reservados')
  
  // Estados para reserva manual
  const [slotParaReservar, setSlotParaReservar] = useState<TurnoSlot | null>(null)
  const [nombreCliente, setNombreCliente] = useState('')
  const [opcionSeleccionada, setOpcionSeleccionada] = useState('')
  const [opciones, setOpciones] = useState<OpcionCliente[]>([])
  const [guardandoReserva, setGuardandoReserva] = useState(false)
  
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Generar días de la semana actual (Lun-Dom)
  function generarDiasSemana(): DiaSemana[] {
    const dias: DiaSemana[] = []
    const nombresCompletos = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const nombresCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const hoy = hoyISO()
    
    // Obtener los 7 días de la semana actual (Lun-Dom)
    const fechasSemana = getDiasDeSemana(semanaActual)
    
    for (let i = 0; i < 7; i++) {
      const fechaISO = fechasSemana[i]
      const fecha = new Date(fechaISO + 'T12:00:00')
      const diaSemana = fecha.getDay()
      
      dias.push({
        nombre: nombresCompletos[diaSemana],
        nombreCorto: nombresCortos[diaSemana],
        fecha: fechaISO,
        diaSemana,
        esHoy: fechaISO === hoy,
      })
    }
    
    return dias
  }

  const diasSemana = generarDiasSemana()

  // Funciones para navegar entre semanas
  const irSemanaSiguiente = () => {
    const nuevaSemana = new Date(semanaActual)
    nuevaSemana.setDate(nuevaSemana.getDate() + 7)
    nuevaSemana.setHours(0, 0, 0, 0)
    setSemanaActual(nuevaSemana)
    setDiaSeleccionado(null) // Limpiar selección al cambiar de semana
  }

  const irSemanaAnterior = () => {
    const hoy = new Date()
    const lunesHoy = getLunesDeSemana(hoy)
    const nuevaSemana = new Date(semanaActual)
    nuevaSemana.setDate(nuevaSemana.getDate() - 7)
    nuevaSemana.setHours(0, 0, 0, 0)
    // No permitir retroceder antes de la semana actual
    if (nuevaSemana.getTime() >= lunesHoy.getTime()) {
      setSemanaActual(nuevaSemana)
      setDiaSeleccionado(null) // Limpiar selección al cambiar de semana
    }
  }

  // Cargar jornadas del barbero
  const cargarJornadas = async () => {
    if (!barberoInfo) return
    
    try {
      const todas = await api.getTodasJornadas()
      
      // Incluir jornadas del barbero Y plantillas de su agenda
      const filtradas = todas.filter((j) => 
        j.barberoId === barberoInfo.id || 
        (!j.barberoId && j.grupoId === barberoInfo.agendaId)
      )
      
      setJornadas(filtradas)
    } catch (e) {
      console.error('Error cargando jornadas:', e)
    }
  }

  // Cargar opciones de cliente
  const cargarOpciones = async () => {
    try {
      const opts = await api.getOpcionesCliente()
      setOpciones(opts)
      if (opts.length > 0) {
        setOpcionSeleccionada(opts[0].id)
      }
    } catch (e) {
      console.error('Error cargando opciones:', e)
    }
  }

  useEffect(() => {
    if (!open) return
    cargarJornadas()
    cargarOpciones()
    
    // Auto-refresh cada 1 segundo para actualizaciones casi instantáneas
    refreshRef.current = setInterval(cargarJornadas, 1000)
    
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [open, barberoInfo, semanaActual])

  // Cuando se selecciona un día
  useEffect(() => {
    if (!diaSeleccionado || !barberoInfo) {
      setJornadaDia(null)
      return
    }
    
    // Buscar jornada de ese día
    let jornada = jornadas.find((j) => j.fecha === diaSeleccionado.fecha)
    
    // Si no existe jornada para este día, buscar la plantilla y generar slots
    if (!jornada) {
      const todasJornadas = jornadas
      // Buscar plantilla (sin barberoId, solo con grupoId que coincida con la agenda del barbero)
      const plantillas = todasJornadas.filter((j) => 
        !j.barberoId && 
        j.grupoId === barberoInfo.agendaId &&
        j.diaSemana === diaSeleccionado.diaSemana
      )
      
      if (plantillas.length > 0) {
        // Usar la primera plantilla encontrada
        const plantilla = plantillas[0]
        
        // Crear jornada temporal con los horarios de la plantilla
        jornada = {
          id: `temp-${diaSeleccionado.fecha}`,
          grupoId: plantilla.grupoId,
          nombreGrupo: plantilla.nombreGrupo,
          barberoId: barberoInfo.id,
          diaSemana: diaSeleccionado.diaSemana,
          fecha: diaSeleccionado.fecha,
          horaInicio: plantilla.horaInicio,
          horaFin: plantilla.horaFin,
          intervaloMinutos: plantilla.intervaloMinutos,
          permitirReservaPublica: plantilla.permitirReservaPublica,
          whatsappBarbero: barberoInfo.whatsapp,
          mensajeWhatsapp: barberoInfo.mensajeWhatsapp || plantilla.mensajeWhatsapp,
          slots: generarSlotsJornada(plantilla.horaInicio, plantilla.horaFin, plantilla.intervaloMinutos),
          creadoEn: new Date().toISOString(),
          configurado: true,
          whatsappConfigurado: true,
        }
      }
    }
    
    setJornadaDia(jornada || null)
  }, [diaSeleccionado, jornadas, barberoInfo])

  // Liberar turno (solo si no es soloLectura)
  const liberarTurno = async (slot: TurnoSlot) => {
    if (!jornadaDia) return
    if (soloLectura) return
    
    if (!confirm('¿Liberar este turno?')) return
    
    try {
      // Eliminar cobro asociado si existe
      if (slot.cobroId) {
        const cobros = await api.getCobros()
        const cobro = cobros.find((c) => c.id === slot.cobroId)
        if (cobro && cobro.estado === 'pendiente') {
          await api.deleteCobro(slot.cobroId)
        }
      }
      
      // Liberar el slot
      const nuevosSlots = jornadaDia.slots.map((s) => {
        if (s.id === slot.id) {
          return {
            id: s.id,
            horaInicio: s.horaInicio,
            horaFin: s.horaFin,
            estado: 'disponible',
          } as TurnoSlot
        }
        return s
      })
      
      const actualizada: JornadaReservas = {
        ...jornadaDia,
        slots: nuevosSlots,
      }
      
      await api.saveJornadaReservas(actualizada)
      await cargarJornadas()
      alert('Turno liberado')
    } catch (e) {
      console.error('Error liberando turno:', e)
      alert('Error al liberar turno')
    }
  }

  // Abrir modal de reserva manual
  const abrirModalReserva = (slot: TurnoSlot) => {
    setSlotParaReservar(slot)
    setNombreCliente('')
    if (opciones.length > 0) {
      setOpcionSeleccionada(opciones[0].id)
    }
  }

  // Confirmar reserva manual
  const confirmarReservaManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slotParaReservar || !jornadaDia || !nombreCliente.trim() || guardandoReserva || !diaSeleccionado) return

    setGuardandoReserva(true)

    try {
      const fechaISO = diaSeleccionado.fecha

      // Buscar la opción seleccionada
      const opcion = opciones.find((o) => o.id === opcionSeleccionada)

      // Registrar cobro pendiente y cliente
      const { cobro } = await registrarCobroYClientePorReserva({
        clienteNombre: nombreCliente.trim(),
        fecha: fechaISO,
        horaInicio: slotParaReservar.horaInicio,
        opcionNombre: opcion?.nombre,
        opcionPrecio: opcion?.precio,
        barberoId: barberoInfo?.id,
      })

      // Actualizar slots
      const nuevosSlots = jornadaDia.slots.map((s) => {
        if (s.id === slotParaReservar.id) {
          return {
            ...s,
            estado: 'reservado' as const,
            clienteNombre: nombreCliente.trim(),
            opcionNombre: opcion?.nombre,
            opcionPrecio: opcion?.precio,
            cobroId: cobro.id,
          }
        }
        return s
      })

      // Si la jornada es temporal (id empieza con "temp-"), crear una nueva real
      if (jornadaDia.id.startsWith('temp-')) {
        const nuevaJornada: JornadaReservas = {
          ...jornadaDia,
          id: crypto.randomUUID(),
          slots: nuevosSlots,
          creadoEn: new Date().toISOString(),
        }
        await api.saveJornadaReservas(nuevaJornada)
      } else {
        // Actualizar jornada existente
        const jornadaActualizada: JornadaReservas = {
          ...jornadaDia,
          slots: nuevosSlots,
        }
        await api.saveJornadaReservas(jornadaActualizada)
      }

      await cargarJornadas()

      setSlotParaReservar(null)
      setNombreCliente('')
      alert('✅ Reserva manual registrada exitosamente')
    } catch (error) {
      console.error('Error al crear reserva manual:', error)
      alert('❌ Error al crear la reserva manual')
    } finally {
      setGuardandoReserva(false)
    }
  }

  // Filtrar slots según el filtro seleccionado
  const slotsFiltrados = jornadaDia?.slots.filter((slot) => {
    if (filtro === 'reservados') return slot.estado === 'reservado'
    if (filtro === 'disponibles') return slot.estado === 'disponible'
    return true // 'todos'
  }) || []

  const reservadosDelDia = jornadaDia?.slots.filter((s) => s.estado === 'reservado').length || 0

  // Formatear fecha completa (ej: "Lunes, 03 de noviembre de 2026")
  const formatearFechaCompleta = (fecha: string) => {
    const d = new Date(fecha + 'T00:00:00')
    return d.toLocaleDateString('es-PY', { 
      weekday: 'long', 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={barberoInfo ? `👁️ Agenda de ${barberoInfo.nombre}` : '👁️ Ver Agenda'}
    >
      <div className="space-y-4">
        {/* NAVEGADOR DE SEMANAS */}
        <div className="flex items-center justify-between px-1">
          <p className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Semana del año:
          </p>
          <div className="flex items-center gap-2">
            {(() => {
              const hoy = new Date()
              const lunesHoy = getLunesDeSemana(hoy)
              const esLaSemanaActual = semanaActual.getTime() === lunesHoy.getTime()
              
              return (
                <>
                  <button
                    type="button"
                    onClick={irSemanaAnterior}
                    disabled={esLaSemanaActual}
                    className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Semana anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-[10px] font-semibold text-slate-300 min-w-[90px] text-center">
                    {semanaActual.toLocaleDateString('es-PY', { day: 'numeric', month: 'short' })}
                    {' - '}
                    {new Date(semanaActual.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('es-PY', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    type="button"
                    onClick={irSemanaSiguiente}
                    className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    title="Semana siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )
            })()}
          </div>
        </div>

        {/* DÍAS DE LA SEMANA - HORIZONTAL */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {diasSemana.map((dia) => {
            const jornada = jornadas.find((j) => j.barberoId === barberoInfo?.id && j.fecha === dia.fecha)
            const plantilla = jornadas.find((j) => !j.barberoId && j.grupoId === barberoInfo?.agendaId && j.diaSemana === dia.diaSemana)
            const tieneJornada = !!jornada || !!plantilla
            const esSeleccionado = diaSeleccionado?.fecha === dia.fecha
            const reservadosDelDia = jornada?.slots.filter((s) => s.estado === 'reservado').length || 0
            
            return (
              <button
                key={dia.fecha}
                onClick={() => setDiaSeleccionado(dia)}
                className={`flex-1 min-w-[80px] shrink-0 flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition-all ${
                  esSeleccionado
                    ? 'border-barber-500 bg-barber-500/25 ring-2 ring-barber-500 text-white shadow-lg'
                    : tieneJornada
                    ? 'border-slate-700 bg-slate-800 text-slate-300 hover:border-barber-500/50 hover:bg-slate-750'
                    : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700'
                }`}
              >
                <span className="text-[10px] font-extrabold mb-0.5">{dia.nombreCorto}</span>
                <span className="text-[9px] text-slate-400">{dia.fecha.slice(5)}</span>
                {dia.esHoy && (
                  <span className="text-[8px] font-black text-barber-400 uppercase tracking-wider mt-0.5">
                    HOY
                  </span>
                )}
                {reservadosDelDia > 0 && (
                  <span className="text-[9px] font-bold mt-0.5 text-red-400">
                    {reservadosDelDia} res.
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* CONTENIDO DEL DÍA SELECCIONADO */}
        {diaSeleccionado && jornadaDia && (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            {/* Fecha exacta - más compacta */}
            <div className="text-center">
              <h3 className="text-xs font-bold text-white capitalize">
                {formatearFechaCompleta(diaSeleccionado.fecha)}
              </h3>
            </div>

            {/* FILTROS - MÁS COMPACTOS */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setFiltro('reservados')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all ${
                  filtro === 'reservados'
                    ? 'bg-red-500 text-white shadow-lg scale-105'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Reservados ({reservadosDelDia})
              </button>
              
              <button
                onClick={() => setFiltro('todos')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all ${
                  filtro === 'todos'
                    ? 'bg-barber-500 text-white shadow-lg scale-105'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Todos ({jornadaDia.slots.length})
              </button>
              
              <button
                onClick={() => setFiltro('disponibles')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all ${
                  filtro === 'disponibles'
                    ? 'bg-emerald-500 text-white shadow-lg scale-105'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Disponibles ({jornadaDia.slots.filter((s) => s.estado === 'disponible').length})
              </button>
            </div>

            {/* LISTA DE SLOTS FILTRADOS - GRID COMPACTO */}
            {slotsFiltrados.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center">
                <p className="text-sm text-slate-400">
                  No hay slots {filtro === 'reservados' ? 'reservados' : filtro === 'disponibles' ? 'disponibles' : ''} para este día
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-96 overflow-y-auto pr-1">
                {slotsFiltrados.map((slot) => {
                  const esReservado = slot.estado === 'reservado'
                  const esBloqueado = slot.estado === 'bloqueado'
                  const esDisponible = slot.estado === 'disponible'
                  
                  return (
                    <div
                      key={slot.id}
                      className={`rounded-lg border p-2 space-y-1 ${
                        esReservado
                          ? 'border-red-500/30 bg-red-500/10'
                          : esBloqueado
                          ? 'border-slate-700 bg-slate-800/50'
                          : 'border-emerald-500/30 bg-emerald-500/10'
                      }`}
                    >
                      <div className="text-center">
                        <p className={`text-xs font-bold ${
                          esReservado ? 'text-red-300' : esBloqueado ? 'text-slate-500' : 'text-emerald-300'
                        }`}>
                          {slot.horaInicio} - {slot.horaFin}
                        </p>
                      </div>
                      
                      {esReservado && slot.clienteNombre && (
                        <div className="text-center border-t border-red-500/20 pt-1">
                          <p className="text-[10px] font-semibold text-white truncate">{slot.clienteNombre}</p>
                          {slot.opcionNombre && (
                            <p className="text-[9px] text-slate-400 truncate">{slot.opcionNombre}</p>
                          )}
                        </div>
                      )}
                      
                      {esBloqueado && (
                        <div className="text-center">
                          <span className="text-[10px] font-medium text-slate-400">🔒 Bloqueado</span>
                        </div>
                      )}
                      
                      {!soloLectura && (
                        <div className="flex flex-col gap-1">
                          {esDisponible && (
                            <button
                              onClick={() => abrirModalReserva(slot)}
                              className="w-full rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-1"
                            >
                              <Plus size={10} />
                              Reservar
                            </button>
                          )}
                          
                          {esReservado && (
                            <button
                              onClick={() => liberarTurno(slot)}
                              className="w-full rounded-lg bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-1"
                            >
                              <Trash2 size={10} />
                              Liberar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {diaSeleccionado && !jornadaDia && (
          <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center">
            <p className="text-sm text-slate-400">No hay horarios configurados para este día</p>
          </div>
        )}
        
        {!diaSeleccionado && (
          <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center">
            <p className="text-sm text-slate-300 font-medium">Seleccioná un día para ver sus reservas</p>
          </div>
        )}
      </div>

      {/* MODAL DE RESERVA MANUAL */}
      {slotParaReservar && (
        <Modal
          open={!!slotParaReservar}
          onClose={() => setSlotParaReservar(null)}
          title={`Reserva Manual - ${slotParaReservar.horaInicio} a ${slotParaReservar.horaFin}`}
        >
          <form onSubmit={confirmarReservaManual} className="space-y-4">
            <p className="text-xs text-slate-400">
              Ingresá el nombre del cliente y elegí el servicio para crear la reserva manual.
            </p>

            <Input
              label="Nombre del Cliente"
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Ej: Juan Pérez"
              required
            />

            <Select
              label="Servicio"
              value={opcionSeleccionada}
              onChange={(e) => setOpcionSeleccionada(e.target.value)}
              options={opciones.map((o) => ({ value: o.id, label: `${o.nombre} - ${o.precio}` }))}
              required
            />

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSlotParaReservar(null)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                disabled={guardandoReserva}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={guardandoReserva}
              >
                {guardandoReserva ? 'Guardando...' : 'Confirmar Reserva'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  )
}
