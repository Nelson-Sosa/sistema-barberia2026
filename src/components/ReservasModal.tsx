import { ArrowLeft, Calendar, Check, List, Lock, MessageCircle, Phone, Plus, Scissors, Share2, Unlock, User, UserCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useBarberData } from '../hooks/useBarberData'
import type { Barbero, EstadoSlot, JornadaReservas, OpcionCliente, TurnoSlot } from '../lib/types'
import {
  crearJornadaPorDefecto,
  generarSlotsJornada,
  DEFAULT_WHATSAPP_BARBERO,
  DEFAULT_MENSAJE_WHATSAPP,
  registrarCobroYClientePorReserva,
  obtenerDiasSemanaActual,
  obtenerNombreDiaConFecha,
  formatearTelefono,
} from '../lib/reservasUtils'
import { whatsappUrl } from '../lib/whatsapp'
import { formatearMoneda, hoyISO } from '../lib/dates'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { TimePicker } from './ui/TimePicker'
import { Modal } from './ui/Modal'

type Vista = 'lista' | 'detalle'
type VistaAgenda = 'calendario' | 'lista-reservas'

interface ConfigDia {
  fecha: string
  diaSemana: string
  fechaCorta: string
  esPasado: boolean
  esHoy: boolean
  seleccionado: boolean
  horaInicio: string
  horaFin: string
  intervaloMinutos: number
}

export function ReservasModal({
  open,
  onClose,
  fechaInicial,
  barberoInfo,
  modoCreacion = false,
}: {
  open: boolean
  onClose: () => void
  fechaInicial?: string
  barberoInfo?: Barbero
  modoCreacion?: boolean
}) {
  const { opcionesCliente, cobros, deleteCobro, refresh } = useBarberData()
  const [vista, setVista] = useState<Vista>('lista')
  const [vistaAgenda, setVistaAgenda] = useState<VistaAgenda>('calendario')
  const [jornadas, setJornadas] = useState<JornadaReservas[]>([])
  const [jornadaActiva, setJornadaActiva] = useState<JornadaReservas | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendientes' | 'pagados'>('todos')
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [filtroFecha, setFiltroFecha] = useState<'todas' | 'hoy' | 'semana' | 'rango'>('todas')
  const [fechaRangoInicio, setFechaRangoInicio] = useState('')
  const [fechaRangoFin, setFechaRangoFin] = useState('')

  // ── ESTADOS DE CREACIÓN MULTIDÍA / SEMANAL ──
  const [nombreAgenda, setNombreAgenda] = useState('')
  const [alcanceDias, setAlcanceDias] = useState<number>(0)
  const [diasConfig, setDiasConfig] = useState<ConfigDia[]>([])
  const [horarioUnico, setHorarioUnico] = useState(false)
  const [horaInicioGlobal, setHoraInicioGlobal] = useState('12:00')
  const [horaFinGlobal, setHoraFinGlobal] = useState('22:00')
  const [intervaloGlobal, setIntervaloGlobal] = useState(60)

  const [permitirPublicoGlobal, setPermitirPublicoGlobal] = useState(true)

  // Estados de reserva manual / edición
  const [slotSeleccionado, setSlotSeleccionado] = useState<TurnoSlot | null>(null)
  const [jornadaDelSlot, setJornadaDelSlot] = useState<JornadaReservas | null>(null)
  const [nombreCliente, setNombreCliente] = useState('')
  const [telefonoCliente, setTelefonoCliente] = useState('')
  const [opcionSeleccionada, setOpcionSeleccionada] = useState<OpcionCliente | null>(null)
  const [notasCliente, setNotasCliente] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editandoConfig, setEditandoConfig] = useState(false)

  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Inicializar días de la semana actual
  const inicializarDiasSemana = () => {
    const semana = obtenerDiasSemanaActual()
    const config: ConfigDia[] = semana.map((d) => ({
      ...d,
      seleccionado: true,
      horaInicio: '12:00',
      horaFin: '22:00',
      intervaloMinutos: 60,
    }))
    setDiasConfig(config)
  }

  const recargarJornadas = async () => {
    try {
      const todas = await api.getTodasJornadas()
      
      // Si hay barberoInfo (barbero específico), filtrar solo sus jornadas
      let filtradas = todas
      if (barberoInfo) {
        filtradas = todas.filter((j) => j.barberoId === barberoInfo.id)
      }
      
      setJornadas(
        filtradas.sort((a, b) => {
          if (a.creadoEn && b.creadoEn) {
            return b.creadoEn.localeCompare(a.creadoEn)
          }
          return b.fecha.localeCompare(a.fecha)
        }),
      )
    } catch (e) {
      console.error('Error al recargar jornadas:', e)
    }
  }

  useEffect(() => {
    if (!open) return
    recargarJornadas()
    inicializarDiasSemana()

    // Si modoCreacion está activo, forzar vista lista para crear nueva agenda
    if (modoCreacion) {
      setVista('lista')
      setJornadaActiva(null)
      return
    }

    if (fechaInicial) {
      ;(async () => {
        try {
          if (fechaInicial.length === 36) {
            const j = await api.getJornadaReservas(fechaInicial)
            if (j) {
              setJornadaActiva(j)
              setVista('detalle')
              return
            }
          }
        } catch (e) {
          console.error('Error al cargar jornada:', e)
        }
        const nueva = crearJornadaPorDefecto(fechaInicial)
        setJornadaActiva(nueva)
        setVista('detalle')
      })()
    } else {
      setVista('lista')
      setJornadaActiva(null)
    }
  }, [open, fechaInicial, modoCreacion])

  // Auto-refresh cada 5 seg en vista detalle
  useEffect(() => {
    if (!open || vista !== 'detalle' || !jornadaActiva || editandoConfig) {
      if (refreshRef.current) { clearInterval(refreshRef.current); refreshRef.current = null }
      return
    }
    const fetchRemota = async () => {
      if (document.hidden) return
      try {
        const fresca = await api.getJornadaReservasRemota(jornadaActiva.id)
        if (fresca) {
          setJornadaActiva(fresca)
          recargarJornadas()
        }
      } catch (e) {
        console.error('Error al refrescar jornada:', e)
      }
    }
    refreshRef.current = setInterval(fetchRemota, 5000)
    return () => {
      if (refreshRef.current) { clearInterval(refreshRef.current); refreshRef.current = null }
    }
  }, [open, vista, jornadaActiva?.id, editandoConfig])

  // ── TOGGLE DE DÍAS SELECCIONADOS ──
  const toggleDiaSeleccionado = (fechaTarget: string) => {
    setDiasConfig((prev) =>
      prev.map((d) => (d.fecha === fechaTarget ? { ...d, seleccionado: !d.seleccionado } : d)),
    )
  }

  const actualizarHorarioDia = (
    fechaTarget: string,
    field: 'horaInicio' | 'horaFin' | 'intervaloMinutos',
    val: any,
  ) => {
    setDiasConfig((prev) =>
      prev.map((d) => (d.fecha === fechaTarget ? { ...d, [field]: val } : d)),
    )
  }

  // ── CREAR / GENERAR JORNADAS EN LOTE (AGRUPADAS BAJO UN MISMO GRUPO) ──
  const guardarGeneracionAgenda = async () => {
    // Validar que haya al menos un día seleccionado
    const seleccionados = diasConfig.filter((d) => d.seleccionado)
    if (seleccionados.length === 0) {
      alert('Por favor elegí al menos un día para crear la agenda.')
      return
    }

    // Validar que tenga nombre
    if (!nombreAgenda.trim()) {
      alert('Por favor ingresá un nombre para la agenda.')
      return
    }

    // Validar nombre duplicado contra jornadas existentes
    try {
      const todasJornadas = await api.getTodasJornadas()
      const gruposExistentes = new Set(
        todasJornadas
          .filter(j => j.grupoId && j.nombreGrupo)
          .map(j => j.nombreGrupo!.toLowerCase())
      )
      
      if (gruposExistentes.has(nombreAgenda.trim().toLowerCase())) {
        alert('Ya existe una agenda con este nombre. Elegí otro nombre diferente.')
        return
      }
    } catch (error) {
      console.error('Error validando nombre:', error)
    }

    setGuardando(true)
    try {
      const nuevoGrupoId = crypto.randomUUID()
      const nombreGrupoFinal = nombreAgenda.trim()

      // Crear plantillas SOLO con diaSemana, SIN fecha específica
      for (const d of seleccionados) {
        const diaIndex = new Date(d.fecha + 'T12:00:00').getDay() // 0=Dom, 1=Lun, ..., 6=Sáb
        
        const hIni = horarioUnico ? horaInicioGlobal : d.horaInicio
        const hFin = horarioUnico ? horaFinGlobal : d.horaFin
        const interval = horarioUnico ? intervaloGlobal : d.intervaloMinutos
        
        const nuevosSlots = generarSlotsJornada(hIni, hFin, interval, [])

        const plantilla: JornadaReservas = {
          id: crypto.randomUUID(),
          grupoId: nuevoGrupoId,
          nombreGrupo: nombreGrupoFinal,
          alcanceDias: alcanceDias || 0,
          diaSemana: diaIndex, // ← CLAVE: día de la semana (0-6)
          fecha: '2000-01-01', // ← Fecha genérica de referencia (no se usa para lógica)
          horaInicio: hIni,
          horaFin: hFin,
          intervaloMinutos: interval,
          permitirReservaPublica: permitirPublicoGlobal,
          whatsappBarbero: DEFAULT_WHATSAPP_BARBERO,
          mensajeWhatsapp: DEFAULT_MENSAJE_WHATSAPP,
          slots: nuevosSlots,
          creadoEn: new Date().toISOString(),
          configurado: true,
          whatsappConfigurado: true,
        }

        await api.saveJornadaReservas(plantilla)
      }

      await recargarJornadas()
      setNombreAgenda('')
      setAlcanceDias(0)
      alert('¡Agenda creada! Ahora asignala a los barberos desde el ícono 👤 en el header.')
      
      // Cerrar el modal después de guardar exitosamente
      onClose()
    } catch (e) {
      console.error('Error al guardar jornadas:', e)
      alert('Ocurrió un error al guardar las jornadas. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const guardarJornada = async (j: JornadaReservas) => {
    try {
      await api.saveJornadaReservas(j)
      setJornadaActiva(j)
      await recargarJornadas()
    } catch (e) {
      console.error('Error al guardar jornada:', e)
      alert('Error al guardar los cambios. Revisá tu conexión.')
    }
  }

  const handleRegenerar = async () => {
    if (!jornadaActiva) return
    setEditandoConfig(false)
    const nuevosSlots = generarSlotsJornada(
      jornadaActiva.horaInicio,
      jornadaActiva.horaFin,
      jornadaActiva.intervaloMinutos,
      jornadaActiva.slots,
    )
    await guardarJornada({ ...jornadaActiva, slots: nuevosSlots, configurado: true })
  }

  const togglePublico = async () => {
    if (!jornadaActiva) return
    await guardarJornada({
      ...jornadaActiva,
      permitirReservaPublica: !jornadaActiva.permitirReservaPublica,
    })
  }

  const copiarEnlaceEnlaceGeneral = () => {
    const url = `${window.location.origin}/reservas`
    navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3500)
  }

  const abrirReservaManual = (slot: TurnoSlot, jContext: JornadaReservas) => {
    setSlotSeleccionado(slot)
    setJornadaDelSlot(jContext)
    setNombreCliente(slot.clienteNombre ?? '')
    setTelefonoCliente(slot.clienteTelefono ?? '')
    setNotasCliente(slot.notas ?? '')
    const op = opcionesCliente.find((o) => o.nombre === slot.opcionNombre)
    setOpcionSeleccionada(op || (opcionesCliente.length > 0 ? opcionesCliente[0] : null))
  }

  const confirmarReservaManual = async () => {
    const targetJornada = jornadaDelSlot || jornadaActiva
    if (!slotSeleccionado || !nombreCliente.trim() || !targetJornada || guardando) return
    setGuardando(true)
    try {
      let finalCobroId = slotSeleccionado.cobroId

      if (finalCobroId) {
        // Actualizar cobro existente
        try {
          const cobrosExistentes = await api.getCobros()
          const match = cobrosExistentes.find((c) => c.id === finalCobroId)
          if (match) {
            const nuevoMonto = opcionSeleccionada?.precio ?? match.monto
            const servicioDetalle = opcionSeleccionada?.nombre
              ? `${opcionSeleccionada.nombre} (${targetJornada.fecha} ${slotSeleccionado.horaInicio})`
              : `Reserva (${targetJornada.fecha} ${slotSeleccionado.horaInicio})`
            await api.saveCobro({
              ...match,
              monto: nuevoMonto,
              montoPlan: nuevoMonto,
              descripcion: `${nombreCliente.trim()} · ${servicioDetalle}`,
            })
          }
        } catch (err) {
          console.error('Error al actualizar cobro existente:', err)
        }
      } else {
        const { cobro } = await registrarCobroYClientePorReserva({
          clienteNombre: nombreCliente.trim(),
          clienteTelefono: telefonoCliente.trim() || undefined,
          fecha: targetJornada.fecha,
          horaInicio: slotSeleccionado.horaInicio,
          opcionNombre: opcionSeleccionada?.nombre,
          opcionPrecio: opcionSeleccionada?.precio,
          notas: notasCliente.trim() || undefined,
          barberoId: targetJornada.barberoId, // ← NUEVO: ID del barbero
        })
        finalCobroId = cobro.id
      }

      const nuevosSlots = targetJornada.slots.map((s) =>
        s.id === slotSeleccionado.id
          ? {
              ...s,
              estado: 'reservado' as EstadoSlot,
              clienteNombre: nombreCliente.trim(),
              clienteTelefono: telefonoCliente.trim() || undefined,
              opcionNombre: opcionSeleccionada?.nombre,
              opcionPrecio: opcionSeleccionada?.precio,
              notas: notasCliente.trim() || undefined,
              cobroId: finalCobroId,
            }
          : s,
      )

      const jornadaActualizada = { ...targetJornada, slots: nuevosSlots }
      await api.saveJornadaReservas(jornadaActualizada)
      if (jornadaActiva?.id === targetJornada.id) {
        setJornadaActiva(jornadaActualizada)
      }
      await recargarJornadas()
      await refresh().catch(() => {})

      setSlotSeleccionado(null)
      setJornadaDelSlot(null)
      setNombreCliente('')
      setTelefonoCliente('')
      setNotasCliente('')
      setOpcionSeleccionada(null)
    } catch (e) {
      console.error('Error al reservar turno:', e)
      alert('Error al guardar la reserva. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const liberarSlot = async (slotId: string, jContext?: JornadaReservas) => {
    const targetJornada = jContext || jornadaActiva
    if (!targetJornada) return

    const targetSlot = targetJornada.slots.find((s) => s.id === slotId)
    const nuevosSlots = targetJornada.slots.map((s) =>
      s.id === slotId
        ? {
            ...s,
            estado: 'disponible' as EstadoSlot,
            clienteNombre: undefined,
            clienteTelefono: undefined,
            opcionNombre: undefined,
            opcionPrecio: undefined,
            notas: undefined,
            cobroId: undefined,
          }
        : s,
    )
    const jornadaActualizada = { ...targetJornada, slots: nuevosSlots }
    await api.saveJornadaReservas(jornadaActualizada)
    if (jornadaActiva?.id === targetJornada.id) {
      setJornadaActiva(jornadaActualizada)
    }
    await recargarJornadas()

    if (targetSlot?.cobroId) {
      await deleteCobro(targetSlot.cobroId).catch(() => {})
    } else if (targetSlot?.clienteNombre) {
      const qNombre = targetSlot.clienteNombre.toLowerCase()
      const cobroPendiente = cobros.find(
        (c) =>
          c.estado === 'pendiente' &&
          c.fecha === targetJornada.fecha &&
          (c.descripcion?.toLowerCase().includes(qNombre) ||
            c.descripcion?.toLowerCase().includes(targetSlot.horaInicio)),
      )
      if (cobroPendiente) {
        await deleteCobro(cobroPendiente.id).catch(() => {})
      }
    }

    await refresh().catch(() => {})
    setSlotSeleccionado(null)
  }

  const toggleBloqueoSlot = async (slotId: string) => {
    if (!jornadaActiva) return
    const nuevosSlots = jornadaActiva.slots.map((s) => {
      if (s.id !== slotId) return s
      const nEstado: EstadoSlot = s.estado === 'bloqueado' ? 'disponible' : 'bloqueado'
      return {
        ...s,
        estado: nEstado,
        clienteNombre: undefined,
        clienteTelefono: undefined,
        opcionNombre: undefined,
        opcionPrecio: undefined,
        notas: undefined,
      }
    })
    await guardarJornada({ ...jornadaActiva, slots: nuevosSlots })
    await refresh().catch(() => {})
  }

  // Jornadas del grupo activo en detalle
  const jornadasDelGrupoActivo = useMemo(() => {
    if (!jornadaActiva) return []
    const key = jornadaActiva.grupoId || jornadaActiva.id
    return jornadas
      .filter((j) => (j.grupoId || j.id) === key)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [jornadas, jornadaActiva])

  const reservadasCountDetalle =
    jornadaActiva?.slots.filter((s) => s.estado === 'reservado').length ?? 0
  const disponiblesCountDetalle =
    jornadaActiva?.slots.filter((s) => s.estado === 'disponible').length ?? 0

  // Obtener todas las reservas de todas las jornadas
  const todasLasReservas = useMemo(() => {
    const reservas: Array<{
      slot: TurnoSlot
      jornada: JornadaReservas
      cobro?: any
    }> = []

    jornadas.forEach((jornada) => {
      jornada.slots
        .filter((s) => s.estado === 'reservado')
        .forEach((slot) => {
          const cobro = slot.cobroId ? cobros.find((c) => c.id === slot.cobroId) : undefined
          reservas.push({ slot, jornada, cobro })
        })
    })

    // Ordenar por fecha y hora
    return reservas.sort((a, b) => {
      const fechaA = `${a.jornada.fecha} ${a.slot.horaInicio}`
      const fechaB = `${b.jornada.fecha} ${b.slot.horaInicio}`
      return fechaA.localeCompare(fechaB)
    })
  }, [jornadas, cobros])

  // Filtrar reservas según búsqueda, estado y fecha
  const reservasFiltradas = useMemo(() => {
    return todasLasReservas.filter((r) => {
      // Filtro por búsqueda
      if (busquedaCliente.trim()) {
        const query = busquedaCliente.toLowerCase()
        const nombre = r.slot.clienteNombre?.toLowerCase() || ''
        const telefono = r.slot.clienteTelefono?.toLowerCase() || ''
        if (!nombre.includes(query) && !telefono.includes(query)) {
          return false
        }
      }

      // Filtro por estado de pago
      if (filtroEstado !== 'todos') {
        if (filtroEstado === 'pendientes' && r.cobro?.estado !== 'pendiente') {
          return false
        }
        if (filtroEstado === 'pagados' && r.cobro?.estado !== 'pagado') {
          return false
        }
      }

      // Filtro por fecha
      if (filtroFecha !== 'todas') {
        const fechaReserva = r.jornada.fecha
        const hoy = hoyISO()
        
        if (filtroFecha === 'hoy') {
          if (fechaReserva !== hoy) return false
        } else if (filtroFecha === 'semana') {
          // Obtener fecha de hoy y 7 días adelante
          const fecha7Dias = new Date()
          fecha7Dias.setDate(fecha7Dias.getDate() + 7)
          const fecha7DiasISO = fecha7Dias.toISOString().split('T')[0]
          
          if (fechaReserva < hoy || fechaReserva > fecha7DiasISO) {
            return false
          }
        } else if (filtroFecha === 'rango') {
          if (fechaRangoInicio && fechaReserva < fechaRangoInicio) return false
          if (fechaRangoFin && fechaReserva > fechaRangoFin) return false
        }
      }

      return true
    })
  }, [todasLasReservas, busquedaCliente, filtroEstado, filtroFecha, fechaRangoInicio, fechaRangoFin])

  // Estadísticas
  const estadisticas = useMemo(() => {
    const total = todasLasReservas.length
    const pendientes = todasLasReservas.filter((r) => r.cobro?.estado === 'pendiente').length
    const pagados = todasLasReservas.filter((r) => r.cobro?.estado === 'pagado').length
    return { total, pendientes, pagados }
  }, [todasLasReservas])

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        setVista('lista')
        setVistaAgenda('calendario')
      }}
      title={
        vista === 'detalle' && jornadaActiva
          ? `Agenda — ${jornadaActiva.nombreGrupo || obtenerNombreDiaConFecha(jornadaActiva.fecha)}`
          : barberoInfo
          ? `📅 Agenda de ${barberoInfo.nombre}`
          : '📅 Agenda de Reservas'
      }
    >
      {/* HEADER CON INFO DEL BARBERO */}
      {barberoInfo && (
        <div className="mb-4 rounded-xl border border-barber-500/30 bg-gradient-to-r from-barber-500/10 to-barber-600/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-barber-500/20 text-barber-400 shrink-0">
              <Scissors size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white mb-1">{barberoInfo.nombre}</h3>
              <div className="space-y-1">
                {barberoInfo.whatsapp && (
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Phone size={14} className="text-barber-400 shrink-0" />
                    <span className="font-medium">{formatearTelefono(barberoInfo.whatsapp)}</span>
                    <a
                      href={whatsappUrl(barberoInfo.whatsapp, '¡Hola! Te contacto desde la agenda.')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 rounded-lg bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                )}
                {barberoInfo.email && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <User size={14} className="text-barber-400/70 shrink-0" />
                    <span className="truncate">{barberoInfo.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOGGLE ENTRE VISTA CALENDARIO Y VISTA LISTA */}
      {vista === 'detalle' && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setVistaAgenda('calendario')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              vistaAgenda === 'calendario'
                ? 'bg-barber-500 text-white shadow-lg shadow-barber-500/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Calendar size={16} />
            Vista Calendario
          </button>
          <button
            onClick={() => setVistaAgenda('lista-reservas')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              vistaAgenda === 'lista-reservas'
                ? 'bg-barber-500 text-white shadow-lg shadow-barber-500/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <List size={16} />
            Vista Lista
          </button>
        </div>
      )}

      {/* VISTA LISTA DE RESERVAS */}
      {vista === 'detalle' && vistaAgenda === 'lista-reservas' && (
        <div className="space-y-4">
          {/* Filtros y búsqueda */}
          <div className="space-y-3">
            <Input
              label="Buscar cliente"
              placeholder="🔍 Buscar por nombre o teléfono..."
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
            />
            
            {/* Filtro por fecha */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-300">
                Filtrar por Fecha
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => setFiltroFecha('todas')}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroFecha === 'todas'
                      ? 'bg-barber-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  📅 Todas
                </button>
                <button
                  onClick={() => setFiltroFecha('hoy')}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroFecha === 'hoy'
                      ? 'bg-barber-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  🕐 Hoy
                </button>
                <button
                  onClick={() => setFiltroFecha('semana')}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroFecha === 'semana'
                      ? 'bg-barber-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  📆 Esta Semana
                </button>
                <button
                  onClick={() => setFiltroFecha('rango')}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroFecha === 'rango'
                      ? 'bg-barber-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  📊 Rango
                </button>
              </div>

              {/* Selector de rango de fechas */}
              {filtroFecha === 'rango' && (
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={fechaRangoInicio}
                      onChange={(e) => setFechaRangoInicio(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-barber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={fechaRangoFin}
                      onChange={(e) => setFechaRangoFin(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-barber-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Filtro por estado de pago */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-300">
                Filtrar por Estado de Pago
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFiltroEstado('todos')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroEstado === 'todos'
                      ? 'bg-barber-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroEstado('pendientes')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroEstado === 'pendientes'
                      ? 'bg-red-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Pendientes
                </button>
                <button
                  onClick={() => setFiltroEstado('pagados')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    filtroEstado === 'pagados'
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Pagados
                </button>
              </div>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{estadisticas.total}</p>
                <p className="text-xs text-slate-400">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{estadisticas.pendientes}</p>
                <p className="text-xs text-slate-400">Pendientes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{estadisticas.pagados}</p>
                <p className="text-xs text-slate-400">Pagados</p>
              </div>
            </div>
          </div>

          {/* Lista de reservas */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {reservasFiltradas.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
                <p className="text-sm text-slate-400">
                  {busquedaCliente || filtroEstado !== 'todos'
                    ? 'No se encontraron reservas con los filtros aplicados'
                    : 'No hay reservas registradas'}
                </p>
              </div>
            ) : (
              reservasFiltradas.map(({ slot, jornada, cobro }) => (
                <div
                  key={`${jornada.id}-${slot.id}`}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-700 transition-colors"
                >
                  {/* Header: Fecha y estado */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs font-bold text-white">
                        {obtenerNombreDiaConFecha(jornada.fecha)} • {slot.horaInicio}
                      </p>
                      <p className="text-[10px] text-slate-500">{jornada.fecha}</p>
                    </div>
                    <span
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                        cobro?.estado === 'pagado'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {cobro?.estado === 'pagado' ? '✅ Pagado' : '🔴 Pendiente'}
                    </span>
                  </div>

                  {/* Información del cliente */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-barber-400 shrink-0" />
                      <span className="text-sm font-bold text-white">
                        {slot.clienteNombre || 'Sin nombre'}
                      </span>
                    </div>
                    
                    {slot.clienteTelefono && (
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-barber-400 shrink-0" />
                        <span className="text-xs text-slate-300">
                          {formatearTelefono(slot.clienteTelefono)}
                        </span>
                        <a
                          href={whatsappUrl(
                            slot.clienteTelefono,
                            `Hola ${slot.clienteNombre}, te contacto sobre tu reserva del ${jornada.fecha} a las ${slot.horaInicio}.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto rounded-lg bg-green-500/20 px-2 py-1 text-[10px] font-bold text-green-400 hover:bg-green-500/30 transition-colors"
                        >
                          💬 WhatsApp
                        </a>
                      </div>
                    )}

                    {slot.opcionNombre && (
                      <div className="flex items-center gap-2">
                        <Scissors size={14} className="text-barber-400 shrink-0" />
                        <span className="text-xs text-slate-300">{slot.opcionNombre}</span>
                        {slot.opcionPrecio && (
                          <span className="ml-auto text-xs font-bold text-barber-400">
                            {formatearMoneda(slot.opcionPrecio)}
                          </span>
                        )}
                      </div>
                    )}

                    {slot.notas && (
                      <div className="rounded-lg bg-slate-950 p-2 mt-2">
                        <p className="text-xs text-slate-400">
                          <span className="font-semibold text-slate-300">📝 Notas:</span> {slot.notas}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setJornadaActiva(jornada)
                        setVistaAgenda('calendario')
                        abrirReservaManual(slot, jornada)
                      }}
                      className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `¿Eliminar la reserva de ${slot.clienteNombre || 'este turno'}?`
                          )
                        ) {
                          liberarSlot(slot.id, jornada)
                        }
                      }}
                      className="flex-1 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      🗑️ Cancelar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VISTA CALENDARIO (ORIGINAL) */}
      {vista === 'detalle' && vistaAgenda === 'calendario' && jornadaActiva && (
        <div className="space-y-4">
          {/* Contenido del calendario se renderiza más abajo */}
        </div>
      )}

      {/* ── NAVEGACIÓN DE VISTAS (ADMIN) ── */}
      {vista === 'lista' && (
        <div className="space-y-4">
          {/* ── SECCIÓN DE CREAR AGENDA ── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
              {/* NOMBRE DE LA AGENDA */}
              <div>
                <Input
                  label="Nombre de la Agenda"
                  placeholder="Ej: Agenda Tarde, Agenda Completa, etc."
                  value={nombreAgenda}
                  onChange={(e) => setNombreAgenda(e.target.value)}
                />
              </div>

              {/* ALCANCE DE RESERVA */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Alcance de Reserva (días de anticipación)
                </label>
                <input
                  type="number"
                  min="0"
                  value={alcanceDias}
                  onChange={(e) => setAlcanceDias(parseInt(e.target.value) || 0)}
                  placeholder="0 = ilimitado"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-barber-500 focus:outline-none focus:ring-2 focus:ring-barber-500/30 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Ej: Si ponés <span className="text-barber-400 font-semibold">10</span>, los clientes solo pueden reservar hasta <span className="text-barber-400 font-semibold">10 días</span> en el futuro. 
                  <span className="text-amber-400 font-semibold"> 0 = ilimitado</span>.
                </p>
              </div>

              {/* ── PARRILLA DE DÍAS SEMANAL ── */}
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">
                  Seleccioná qué días de esta semana incluir. Los días pasados aparecen desmarcados por defecto:
                </p>
                    <div className="flex flex-col gap-2">
                      {diasConfig.map((item) => (
                        <div
                          key={item.fecha}
                          className={`rounded-xl border p-2.5 transition-all ${
                            item.seleccionado
                              ? 'border-barber-500/60 bg-barber-500/10 text-white'
                              : 'border-slate-800 bg-slate-950/60 text-slate-500'
                          }`}
                        >
                          <label className="flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={item.seleccionado}
                                onChange={() => toggleDiaSeleccionado(item.fecha)}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-barber-500 focus:ring-barber-500 shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold block text-slate-200">
                                  {item.diaSemana} {item.fechaCorta}
                                </span>
                                {item.esHoy && (
                                  <span className="text-[10px] font-extrabold text-barber-400">HOY</span>
                                )}
                                {item.esPasado && (
                                  <span className="text-[10px] text-slate-500 italic">(Día pasado)</span>
                                )}
                              </div>
                            </div>
                          </label>

                          {!horarioUnico && item.seleccionado && (
                            <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                              <TimePicker
                                label="Desde:"
                                value={item.horaInicio}
                                onChange={(v) => actualizarHorarioDia(item.fecha, 'horaInicio', v)}
                              />
                              <TimePicker
                                label="Hasta:"
                                value={item.horaFin}
                                onChange={(v) => actualizarHorarioDia(item.fecha, 'horaFin', v)}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                {/* ── SELECCIÓN DE HORARIOS (GLOBAL VS MANUAL POR DÍA) ── */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Configuración de Horario
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-amber-300">
                      <input
                        type="checkbox"
                        checked={horarioUnico}
                        onChange={(e) => setHorarioUnico(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-barber-500"
                      />
                      Misma hora inicio/fin para todos
                    </label>
                  </div>

                  {horarioUnico && (
                    <div className="space-y-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="grid grid-cols-2 gap-2">
                        <TimePicker
                          label="Desde"
                          value={horaInicioGlobal}
                          onChange={setHoraInicioGlobal}
                        />
                        <TimePicker
                          label="Hasta"
                          value={horaFinGlobal}
                          onChange={setHoraFinGlobal}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── DURACIÓN / INTERVALO DE TURNO (SIEMPRE VISIBLE CON CAMPO MANUAL) ── */}
                  <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <label className="block text-xs font-bold text-slate-200">
                      ⏱️ Duración / Intervalo por Turno
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '30m', val: 30 },
                        { label: '45m', val: 45 },
                        { label: '1 hora', val: 60 },
                        { label: '1h 30m', val: 90 },
                        { label: '2 horas', val: 120 },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setIntervaloGlobal(item.val)}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                            intervaloGlobal === item.val
                              ? 'bg-barber-500 text-white ring-1 ring-barber-400'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-900">
                      <span className="text-xs font-medium text-slate-300 shrink-0">
                        O cargar duración manual:
                      </span>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={intervaloGlobal}
                        onChange={(e) =>
                          setIntervaloGlobal(Math.max(1, parseInt(e.target.value) || 0))
                        }
                        placeholder="Ej: 40"
                        className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-emerald-400 focus:border-barber-500 focus:outline-none"
                      />
                      <span className="text-xs font-semibold text-slate-400">minutos</span>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Permitir reserva pública</p>
                      <p className="text-[11px] text-slate-400">
                        Los clientes reservan directamente online
                      </p>
                    </div>
                    <div
                      onClick={() => setPermitirPublicoGlobal(!permitirPublicoGlobal)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        permitirPublicoGlobal ? 'bg-barber-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          permitirPublicoGlobal ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </div>
                  </label>

                  <Button
                    className="w-full font-bold text-sm py-3 bg-barber-500 hover:bg-barber-600 shadow-lg"
                    onClick={guardarGeneracionAgenda}
                    disabled={guardando}
                  >
                    {guardando ? 'Generando agenda...' : '⚡ Generar y Guardar Agenda Semanal'}
                  </Button>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* ── DETALLE DE UNA JORNADA ESPECÍFICA DE LA AGENDA ── */}
      {vista === 'detalle' && jornadaActiva && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVista('lista')}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
            >
              <ArrowLeft size={14} /> Volver a Lista de Agendas
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={copiarEnlaceEnlaceGeneral}
              className="flex items-center gap-1.5 rounded-xl bg-barber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-barber-600 shadow"
            >
              {copiado ? <Check size={14} /> : <Share2 size={14} />}
              {copiado ? '¡Enlace Copiado!' : 'Copiar enlace público'}
            </button>
          </div>

          {/* ── SELECTOR DE DÍAS DE ESTA AGENDA ── */}
          {jornadasDelGrupoActivo.length > 1 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Días incluidos en esta agenda:
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {jornadasDelGrupoActivo.map((jItem) => {
                  const esActivo = jItem.id === jornadaActiva.id
                  const libresCount = jItem.slots.filter((s) => s.estado === 'disponible').length
                  return (
                    <button
                      key={jItem.id}
                      type="button"
                      onClick={() => setJornadaActiva(jItem)}
                      className={`flex-1 min-w-[90px] shrink-0 rounded-xl py-2 px-2 text-center transition-all border ${
                        esActivo
                          ? 'bg-barber-500 text-white border-barber-400 ring-1 ring-barber-400 font-bold shadow'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs block">{obtenerNombreDiaConFecha(jItem.fecha)}</span>
                      <span
                        className={`text-[10px] ${
                          esActivo ? 'text-emerald-300 font-extrabold' : 'text-emerald-400'
                        }`}
                      >
                        {libresCount} libres
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Horario del día ({obtenerNombreDiaConFecha(jornadaActiva.fecha)})
            </p>
            <div className="grid grid-cols-2 gap-2">
              <TimePicker
                label="Desde"
                value={jornadaActiva.horaInicio}
                onChange={(v) => {
                  setEditandoConfig(true)
                  setJornadaActiva({ ...jornadaActiva, horaInicio: v })
                }}
              />
              <TimePicker
                label="Hasta"
                value={jornadaActiva.horaFin}
                onChange={(v) => {
                  setEditandoConfig(true)
                  setJornadaActiva({ ...jornadaActiva, horaFin: v })
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Duración del turno (minutos)
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  { label: '30 min', val: 30 },
                  { label: '45 min', val: 45 },
                  { label: '1 hora', val: 60 },
                  { label: '1h 30m', val: 90 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => {
                      setEditandoConfig(true)
                      setJornadaActiva({ ...jornadaActiva, intervaloMinutos: item.val })
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                      jornadaActiva.intervaloMinutos === item.val
                        ? 'bg-barber-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 shrink-0">O ingresá manual:</span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={jornadaActiva.intervaloMinutos}
                  onChange={(e) => {
                    setEditandoConfig(true)
                    setJornadaActiva({
                      ...jornadaActiva,
                      intervaloMinutos: Math.max(5, parseInt(e.target.value) || 30),
                    })
                  }}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-barber-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400">minutos</span>
              </div>
            </div>

            <Button size="sm" className="w-full text-xs font-bold" onClick={handleRegenerar}>
              Actualizar / Aplicar Horarios
            </Button>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div>
              <p className="text-sm font-medium text-white">Permitir reserva pública</p>
              <p className="text-xs text-slate-400">
                {jornadaActiva.permitirReservaPublica
                  ? 'Clientes pueden reservar directamente'
                  : 'Solo ver horarios (reserva por WhatsApp)'}
              </p>
            </div>
            <div
              onClick={togglePublico}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                jornadaActiva.permitirReservaPublica ? 'bg-barber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  jornadaActiva.permitirReservaPublica ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>

          <div className="flex items-center justify-between px-1 text-xs">
            <span className="text-emerald-400 font-medium">
              {disponiblesCountDetalle} disponibles
            </span>
            <span className="text-red-400 font-medium">{reservadasCountDetalle} reservados</span>
          </div>

          {/* ── LISTA DE RESERVADOS DEL DÍA ACTIVO ── */}
          {reservadasCountDetalle > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                <UserCheck size={13} /> Turnos Reservados — {obtenerNombreDiaConFecha(jornadaActiva.fecha)}
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {jornadaActiva.slots
                  .filter((s) => s.estado === 'reservado')
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-slate-900 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">
                          {s.horaInicio}–{s.horaFin} · {s.clienteNombre || 'Reservado'}
                        </p>
                        {s.opcionNombre && (
                          <p className="text-amber-300 text-[10px] truncate mt-0.5">
                            ✂️ {s.opcionNombre}{s.opcionPrecio ? ` — ${s.opcionPrecio.toLocaleString('es-PY')} Gs` : ''}
                          </p>
                        )}
                        {s.clienteTelefono && (
                          <a
                            href={whatsappUrl(s.clienteTelefono, '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 text-[10px] hover:text-emerald-300 flex items-center gap-1 mt-0.5"
                          >
                            <MessageCircle size={10} /> {s.clienteTelefono}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => abrirReservaManual(s, jornadaActiva)}
                          className="rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-700"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Liberar turno de ${s.clienteNombre || 'este cliente'}?`)) {
                              liberarSlot(s.id, jornadaActiva)
                            }
                          }}
                          className="rounded-lg bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/20"
                        >
                          Liberar
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {jornadaActiva.slots.map((slot) => {
              const esReservado = slot.estado === 'reservado'
              const esBloqueado = slot.estado === 'bloqueado'
              return (
                <div
                  key={slot.id}
                  className={`relative flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
                    esReservado
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : esBloqueado
                      ? 'border-amber-600/40 bg-amber-600/10 text-amber-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold tracking-tight">
                      {slot.horaInicio} - {slot.horaFin}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleBloqueoSlot(slot.id)}
                      title={
                        esBloqueado ? 'Desbloquear este horario' : 'Bloquear este horario'
                      }
                      className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                        esBloqueado
                          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-amber-300'
                      }`}
                    >
                      {esBloqueado ? (
                        <>
                          <Unlock size={11} /> Desbloquear
                        </>
                      ) : (
                        <>
                          <Lock size={11} /> Bloquear
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-2">
                    {esReservado ? (
                      <div>
                        <p className="text-xs font-semibold truncate text-red-300">
                          {slot.clienteNombre || 'Reservado'}
                        </p>
                        {slot.opcionNombre && (
                          <p className="text-[10px] text-amber-300 font-medium truncate mt-0.5">
                            ✂️ {slot.opcionNombre}{' '}
                            {slot.opcionPrecio
                              ? `(${slot.opcionPrecio.toLocaleString('es-PY')} Gs)`
                              : ''}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirReservaManual(slot, jornadaActiva)}
                            className="rounded bg-slate-700/80 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-600"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Eliminar la reserva de ${
                                    slot.clienteNombre || 'este turno'
                                  }?`,
                                )
                              ) {
                                liberarSlot(slot.id, jornadaActiva)
                              }
                            }}
                            className="flex items-center gap-0.5 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400 hover:bg-red-500/30"
                          >
                            <X size={10} /> Liberar
                          </button>
                        </div>
                      </div>
                    ) : esBloqueado ? (
                      <div>
                        <span className="text-[11px] font-semibold text-amber-400">
                          🔒 Bloqueado
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => abrirReservaManual(slot, jornadaActiva)}
                        className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                      >
                        <Plus size={12} /> Reservar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODAL RESERVA MANUAL / EDICIÓN (CREA COBRO PENDIENTE AL RESERVAR) ── */}
      {slotSeleccionado && (
        <Modal
          open={!!slotSeleccionado}
          onClose={() => setSlotSeleccionado(null)}
          title={`Turno ${slotSeleccionado.horaInicio} - ${slotSeleccionado.horaFin}`}
        >
          <div className="space-y-3">
            <Input
              label="Nombre del cliente"
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Ej: Carlos"
              required
            />
            <Input
              label="Teléfono / WhatsApp (opcional)"
              value={telefonoCliente}
              onChange={(e) => setTelefonoCliente(e.target.value)}
              placeholder="Ej: 0981 123 456"
            />

            {opcionesCliente.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  ¿Qué desea hacerse?
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {opcionesCliente.map((op) => {
                    const esSeleccionado = opcionSeleccionada?.id === op.id
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => setOpcionSeleccionada(op)}
                        className={`w-full flex items-center justify-between gap-2 rounded-lg border p-2 text-left text-xs transition-all ${
                          esSeleccionado
                            ? 'border-barber-500 bg-barber-500/15 text-white ring-1 ring-barber-500'
                            : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Scissors
                            size={14}
                            className={esSeleccionado ? 'text-barber-400' : 'text-slate-500'}
                          />
                          <span className="font-semibold truncate">{op.nombre}</span>
                        </div>
                        <span
                          className={`font-bold shrink-0 ${
                            esSeleccionado ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {op.precio > 0 ? `${op.precio.toLocaleString('es-PY')} Gs` : 'Sin costo'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nota u observación (opcional)
              </label>
              <textarea
                value={notasCliente}
                onChange={(e) => setNotasCliente(e.target.value)}
                placeholder="Ej: Cliente preferencial"
                rows={2}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-barber-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              {slotSeleccionado.estado === 'reservado' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-400"
                  onClick={() => liberarSlot(slotSeleccionado.id)}
                >
                  Liberar turno
                </Button>
              )}
              <Button
                type="button"
                className="flex-1 bg-barber-500 hover:bg-barber-600 font-bold"
                onClick={confirmarReservaManual}
                disabled={!nombreCliente.trim() || guardando}
              >
                {guardando ? 'Guardando...' : 'Guardar Reserva y Factura Pendiente'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
