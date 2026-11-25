import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Instagram, MessageCircle, Scissors, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Barbero, JornadaReservas, OpcionCliente, TurnoSlot } from '../lib/types'
import { hoyISO } from '../lib/dates'
import { APP_NAME } from '../lib/constants'
import {
  DEFAULT_WHATSAPP_BARBERO,
  construirMensajeWhatsapp,
  formatearWaMe,
  registrarCobroYClientePorReserva,
  obtenerNombreDiaConFecha,
  getLunesDeSemana,
  getDiasDeSemana,
  getDiaSemanaIndex,
  estaEnAlcance,
  esTurnoPasado,
  generarSlotsJornada,
  obtenerIdSesionCliente,
  slotEstaDisponibleParaMi,
  limpiarBloqueosExpirados,
} from '../lib/reservasUtils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'

const REFRESH_INTERVAL_MS = 1000 // 1 segundo para actualizaciones casi instantáneas

export function ReservaPublica() {
  const [searchParams] = useSearchParams()

  const [barberos, setBarberos] = useState<Barbero[]>([])
  const [barberoSeleccionado, setBarberoSeleccionado] = useState<Barbero | null>(null)
  const [todasJornadas, setTodasJornadas] = useState<JornadaReservas[]>([])
  const [semanaActual, setSemanaActual] = useState<Date>(getLunesDeSemana(new Date()))
  const [jornadaSeleccionadaId, setJornadaSeleccionadaId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [opciones, setOpciones] = useState<OpcionCliente[]>([])
  
  // Redes sociales
  const [redesSociales, setRedesSociales] = useState<{ instagram: string; whatsapp: string; tiktok: string } | null>(null)

  // Modal de reserva
  const [slotTarget, setSlotTarget] = useState<TurnoSlot | null>(null)
  const [nombre, setNombre] = useState('')
  const [opcionSeleccionada, setOpcionSeleccionada] = useState<OpcionCliente | null>(null)
  const [nota, setNota] = useState('')
  const [errorConflicto, setErrorConflicto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [confirmado, setConfirmado] = useState<{
    slot: TurnoSlot
    fecha: string
    cliente: string
    opcionNombre?: string
    opcionPrecio?: number
    nota?: string
    codigoCancelacion?: string
    waUrl: string
  } | null>(null)

  // ID de sesión único para este cliente (para exclusión mutua)
  const miSessionId = useRef(obtenerIdSesionCliente()).current

  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Función para liberar el bloqueo temporal cuando se cancela
  const liberarBloqueoTemporal = async () => {
    if (!slotTarget || !jornadaActiva) return

    try {
      const jornadaFresca = await api.getJornadaReservasRemota(jornadaActiva.id)
      if (!jornadaFresca) return

      // Buscar el slot y quitar el bloqueo si es mío
      const slotsActualizados = jornadaFresca.slots.map((s) => {
        if (s.id === slotTarget.id && s.bloqueadoTemporalmentePor === miSessionId) {
          // Quitar el bloqueo temporal
          const { bloqueadoTemporalmentePor, bloqueadoTemporalmenteHasta, ...slotLimpio } = s
          return slotLimpio as TurnoSlot
        }
        return s
      })

      const jornadaActualizada: JornadaReservas = {
        ...jornadaFresca,
        slots: slotsActualizados,
      }

      await api.saveJornadaReservas(jornadaActualizada)
    } catch (error) {
      console.error('Error al liberar bloqueo temporal:', error)
    }
  }

  // Cerrar modal y liberar bloqueo
  const cerrarModalReserva = async () => {
    await liberarBloqueoTemporal()
    setSlotTarget(null)
  }

  // Cargar barberos
  useEffect(() => {
    const cargarBarberos = async () => {
      const lista = await api.getBarberos()
      // Filtrar solo barberos activos Y con agenda asignada
      const activos = lista.filter((b) => b.activo && b.agendaId)
      setBarberos(activos)
      if (activos.length > 0 && !barberoSeleccionado) {
        setBarberoSeleccionado(activos[0])
      }
    }
    cargarBarberos()
  }, [])

  // Cargar opciones del cliente (servicios)
  useEffect(() => {
    api.getOpcionesClienteRemota().then((opcs) => {
      setOpciones(opcs)
    })
  }, [])
  
  // Cargar redes sociales
  useEffect(() => {
    const cargarRedes = async () => {
      const redes = await api.getRedesSociales()
      if (redes) {
        setRedesSociales({
          instagram: redes.instagram || '',
          whatsapp: redes.whatsapp || '',
          tiktok: redes.tiktok || '',
        })
      }
    }
    
    // Cargar inmediatamente
    cargarRedes()
    
    // Recargar cada 30 segundos para obtener cambios de configuración
    const interval = setInterval(cargarRedes, 30000)
    
    return () => clearInterval(interval)
  }, [])

  /** Carga todas las jornadas activas del barbero seleccionado y genera dinámicamente las faltantes */
  const cargarJornadas = useCallback(async () => {
    if (!barberoSeleccionado) {
      setCargando(false)
      return
    }

    try {
      const list = await api.getTodasJornadas()
      const hoyStr = hoyISO()

      // 1. Cargar jornadas plantilla (las originales de la agenda sin barberoId)
      const grupoIdBuscado = `agenda-${barberoSeleccionado.id}`
      console.log('🔍 Buscando plantillas con grupoId:', grupoIdBuscado)
      console.log('👤 Barbero seleccionado:', { id: barberoSeleccionado.id, nombre: barberoSeleccionado.nombre, agendaId: barberoSeleccionado.agendaId })
      console.log('📋 Todas las jornadas cargadas:', list.length)
      
      const todasPlantillas = list.filter(j => !j.barberoId)
      console.log('📋 Total plantillas (sin barberoId):', todasPlantillas.length)
      console.log('📋 Detalle de TODAS las plantillas:')
      todasPlantillas.forEach((j, index) => {
        console.log(`  Plantilla ${index + 1}:`, {
          id: j.id,
          grupoId: j.grupoId,
          diaSemana: j.diaSemana,
          nombreGrupo: j.nombreGrupo,
          horaInicio: j.horaInicio,
          horaFin: j.horaFin
        })
      })
      
      const plantilla = list.filter((j) => 
        !j.barberoId && 
        barberoSeleccionado.agendaId && 
        // Buscar por el grupoId específico del barbero: agenda-{barberoId}
        j.grupoId === grupoIdBuscado &&
        j.diaSemana !== undefined // Solo plantillas con diaSemana definido
      )
      
      console.log('✅ Plantillas encontradas para este barbero:', plantilla.length)
      
      // FALLBACK: Si no encontramos plantillas con el nuevo formato, buscar con el agendaId antiguo
      if (plantilla.length === 0 && barberoSeleccionado.agendaId) {
        console.log('⚠️ No se encontraron plantillas con grupoId nuevo, intentando con agendaId antiguo:', barberoSeleccionado.agendaId)
        const plantillaFallback = list.filter((j) => 
          !j.barberoId && 
          (j.grupoId === barberoSeleccionado.agendaId || j.id === barberoSeleccionado.agendaId) &&
          j.diaSemana !== undefined
        )
        console.log('✅ Plantillas encontradas con fallback:', plantillaFallback.length)
        plantilla.push(...plantillaFallback)
      }

      // 2. Cargar jornadas existentes del barbero (ya guardadas en BD)
      let jornadasExistentes = list.filter((j) => {
        if (j.barberoId === barberoSeleccionado.id) return true
        return false
      })

      // 3. Generar jornadas virtuales para la semana actual basadas en la plantilla
      const diasSemana = getDiasDeSemana(semanaActual)
      const jornadasGeneradas: JornadaReservas[] = []

      for (const fecha of diasSemana) {
        // Si ya existe una jornada guardada para esta fecha, saltarla
        const existente = jornadasExistentes.find((j) => j.fecha === fecha)
        if (existente) continue

        // Buscar plantilla para este día de la semana usando diaSemana
        const diaSemanaIdx = getDiaSemanaIndex(fecha)
        const plantillaDelDia = plantilla.find((p) => p.diaSemana === diaSemanaIdx)

        if (plantillaDelDia) {
          // Generar jornada virtual basada en la plantilla
          const jornadaVirtual: JornadaReservas = {
            id: `virtual-${barberoSeleccionado.id}-${fecha}`, // ID temporal único
            grupoId: plantillaDelDia.grupoId,
            nombreGrupo: plantillaDelDia.nombreGrupo,
            barberoId: barberoSeleccionado.id,
            alcanceDias: plantillaDelDia.alcanceDias || 0,
            diaSemana: plantillaDelDia.diaSemana,
            fecha: fecha,
            horaInicio: plantillaDelDia.horaInicio,
            horaFin: plantillaDelDia.horaFin,
            intervaloMinutos: plantillaDelDia.intervaloMinutos,
            permitirReservaPublica: plantillaDelDia.permitirReservaPublica,
            whatsappBarbero: barberoSeleccionado.whatsapp,
            mensajeWhatsapp: barberoSeleccionado.mensajeWhatsapp || plantillaDelDia.mensajeWhatsapp,
            slots: generarSlotsJornada(
              plantillaDelDia.horaInicio,
              plantillaDelDia.horaFin,
              plantillaDelDia.intervaloMinutos,
              plantillaDelDia.slots // ✅ Pasar los slots de la plantilla para preservar bloqueos
            ),
            creadoEn: new Date().toISOString(),
            configurado: true,
            whatsappConfigurado: true,
          }
          jornadasGeneradas.push(jornadaVirtual)
        }
      }

      // 4. Combinar jornadas existentes + generadas
      const todasLasJornadas = [...jornadasExistentes, ...jornadasGeneradas]

      // 5. Filtrar SOLO jornadas de la semana actual seleccionada
      const diasSemanaActual = getDiasDeSemana(semanaActual)
      let filtradas = todasLasJornadas.filter((j) => diasSemanaActual.includes(j.fecha))

      // 6. Filtrar por parámetros de URL si existen
      const grupoParam = searchParams.get('grupo')
      const idParam = searchParams.get('id')
      const fechaParam = searchParams.get('fecha')

      if (grupoParam) {
        filtradas = filtradas.filter((j) => (j.grupoId || j.id) === grupoParam)
      } else if (idParam) {
        filtradas = filtradas.filter((j) => j.id === idParam)
      } else if (fechaParam) {
        filtradas = filtradas.filter((j) => j.fecha === fechaParam)
      }

      // 7. Solo mostrar jornadas de hoy en adelante
      filtradas = filtradas.filter((j) => j.fecha >= hoyStr)

      // 8. Ordenar cronológicamente por fecha
      const ordenadas = filtradas.sort((a, b) => a.fecha.localeCompare(b.fecha))
      
      setTodasJornadas(ordenadas)

      if (ordenadas.length > 0) {
        setJornadaSeleccionadaId((currentId) => {
          if (currentId && ordenadas.some((j) => j.id === currentId)) return currentId
          return ordenadas[0].id
        })
      } else {
        setJornadaSeleccionadaId(null)
      }

      setCargando(false)
    } catch (e) {
      console.error('Error al cargar jornadas públicas:', e)
      setCargando(false)
    }
  }, [searchParams, barberoSeleccionado, semanaActual])

  // Carga inicial + auto-refresh cuando cambia el barbero o la semana
  useEffect(() => {
    if (barberoSeleccionado) {
      cargarJornadas()
      refreshRef.current = setInterval(cargarJornadas, REFRESH_INTERVAL_MS)
      return () => {
        if (refreshRef.current) clearInterval(refreshRef.current)
      }
    }
  }, [cargarJornadas, barberoSeleccionado, semanaActual])

  // Funciones para navegar entre semanas
  const irSemanaSiguiente = () => {
    const nuevaSemana = new Date(semanaActual)
    nuevaSemana.setDate(nuevaSemana.getDate() + 7)
    nuevaSemana.setHours(0, 0, 0, 0)
    setSemanaActual(nuevaSemana)
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
    }
  }

  // Bloquear prompt PWA en vista pública de reservas
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      if ('stopImmediatePropagation' in e) {
        ;(e as any).stopImmediatePropagation()
      }
      return false
    }
    window.addEventListener('beforeinstallprompt', handler, true)
    document.addEventListener('beforeinstallprompt', handler, true)

    const manifests = document.querySelectorAll('link[rel="manifest"]')
    manifests.forEach((m) => m.remove())

    return () => {
      window.removeEventListener('beforeinstallprompt', handler, true)
      document.removeEventListener('beforeinstallprompt', handler, true)
    }
  }, [])

  const jornadaActiva = todasJornadas.find((j) => j.id === jornadaSeleccionadaId) || todasJornadas[0] || null
  const fechaActiva = jornadaActiva?.fecha || hoyISO()
  
  // Usar el WhatsApp del barbero seleccionado
  const barberPhoneClean = formatearWaMe(
    barberoSeleccionado?.whatsapp || jornadaActiva?.whatsappBarbero || DEFAULT_WHATSAPP_BARBERO
  )

  const handleSeleccionarSlot = async (slot: TurnoSlot) => {
    if (!jornadaActiva) return

    // VALIDACIÓN: Verificar que el turno no haya pasado
    if (esTurnoPasado(jornadaActiva.fecha, slot.horaInicio)) {
      setErrorConflicto(true)
      await cargarJornadas()
      return
    }

    // Validar alcance de la agenda (jornada)
    if (jornadaActiva.alcanceDias && jornadaActiva.alcanceDias > 0) {
      if (!estaEnAlcance(jornadaActiva.fecha, jornadaActiva.alcanceDias)) {
        alert(`Solo puedes reservar con hasta ${jornadaActiva.alcanceDias} días de anticipación.`)
        return
      }
    }

    if (!jornadaActiva.permitirReservaPublica) {
      const msgText = construirMensajeWhatsapp(
        jornadaActiva.mensajeWhatsapp,
        slot.horaInicio,
        fechaActiva,
        '',
      )
      window.location.href = `https://wa.me/${barberPhoneClean}?text=${encodeURIComponent(msgText)}`
      return
    }

    // Si es una jornada virtual, persistirla primero
    if (jornadaActiva.id.startsWith('virtual-')) {
      const jornadaPersistida: JornadaReservas = {
        ...jornadaActiva,
        id: crypto.randomUUID(), // Generar ID real
      }
      await api.saveJornadaReservas(jornadaPersistida)
      // Recargar para obtener la jornada persistida
      await cargarJornadas()
      // Actualizar la referencia
      setJornadaSeleccionadaId(jornadaPersistida.id)
      return
    }

    // ═══════════════════════════════════════════════════════════════
    // VALIDACIÓN #1: Verificar disponibilidad Y aplicar bloqueo temporal
    // ═══════════════════════════════════════════════════════════════
    const jFresca = await api.getJornadaReservasRemota(jornadaActiva.id)
    if (!jFresca) {
      alert('Error al cargar la agenda. Intentá de nuevo.')
      return
    }

    // Limpiar bloqueos expirados
    const slotsLimpios = limpiarBloqueosExpirados(jFresca.slots)
    const slotActual = slotsLimpios.find((s) => s.id === slot.id)

    if (!slotActual) {
      setErrorConflicto(true)
      await cargarJornadas()
      return
    }

    // Verificar si está disponible para MÍ
    if (!slotEstaDisponibleParaMi(slotActual, miSessionId)) {
      setErrorConflicto(true)
      await cargarJornadas()
      return
    }

    // ═══════════════════════════════════════════════════════════════
    // BLOQUEO TEMPORAL: Marcar slot como "en proceso" por 30 segundos
    // ═══════════════════════════════════════════════════════════════
    const BLOQUEO_DURACION_MS = 30000 // 30 segundos
    const ahora = Date.now()
    const bloqueadoHasta = ahora + BLOQUEO_DURACION_MS

    const slotsConBloqueo = slotsLimpios.map((s) => {
      if (s.id === slot.id) {
        return {
          ...s,
          bloqueadoTemporalmentePor: miSessionId,
          bloqueadoTemporalmenteHasta: bloqueadoHasta,
        }
      }
      return s
    })

    const jornadaConBloqueo: JornadaReservas = {
      ...jFresca,
      slots: slotsConBloqueo,
    }

    // Guardar el bloqueo temporal en Firebase
    try {
      await api.saveJornadaReservas(jornadaConBloqueo)
    } catch (error) {
      console.error('Error al aplicar bloqueo temporal:', error)
      alert('Otro cliente está reservando este turno. Elegí otro horario.')
      await cargarJornadas()
      return
    }

    // Abrir el formulario de reserva
    setSlotTarget(slotActual)
    setNombre('')
    setNota('')
    setOpcionSeleccionada(opciones.length > 0 ? opciones[0] : null)
    setErrorConflicto(false)
  }

  const handleConfirmarReserva = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jornadaActiva || !slotTarget || !nombre.trim() || guardando) return

    setGuardando(true)
    setErrorConflicto(false)

    try {
      // ═══════════════════════════════════════════════════════════════
      // VALIDACIÓN #2: Re-verificar disponibilidad antes de confirmar
      // ═══════════════════════════════════════════════════════════════
      const jornadaFresca = await api.getJornadaReservasRemota(jornadaActiva.id)
      if (!jornadaFresca) {
        alert('Error al cargar la agenda. Intentá de nuevo.')
        setGuardando(false)
        return
      }

      // Limpiar bloqueos expirados
      const slotsLimpios = limpiarBloqueosExpirados(jornadaFresca.slots)
      const slotActual = slotsLimpios.find((s) => s.id === slotTarget.id)

      if (!slotActual) {
        setErrorConflicto(true)
        setGuardando(false)
        setSlotTarget(null)
        await cargarJornadas()
        return
      }

      // ═══════════════════════════════════════════════════════════════
      // VALIDACIÓN #3: Verificar que el slot esté disponible para MÍ
      // ═══════════════════════════════════════════════════════════════
      if (!slotEstaDisponibleParaMi(slotActual, miSessionId)) {
        setErrorConflicto(true)
        setGuardando(false)
        setSlotTarget(null)
        await cargarJornadas()
        return
      }

      // ═══════════════════════════════════════════════════════════════
      // TODO OK: Proceder con la reserva
      // ═══════════════════════════════════════════════════════════════

      // Registrar cobro pendiente y asociar cliente
      const { cobro } = await registrarCobroYClientePorReserva({
        clienteNombre: nombre.trim(),
        fecha: fechaActiva,
        horaInicio: slotTarget.horaInicio,
        opcionNombre: opcionSeleccionada?.nombre,
        opcionPrecio: opcionSeleccionada?.precio,
        notas: nota.trim() || undefined,
        barberoId: barberoSeleccionado?.id,
      })

      // Actualizar el slot: marcarlo como reservado y QUITAR el bloqueo temporal
      const nuevosSlots = slotsLimpios.map((s) => {
        if (s.id === slotTarget.id) {
          // Quitar campos de bloqueo temporal
          const { bloqueadoTemporalmentePor, bloqueadoTemporalmenteHasta, ...slotBase } = s
          
          return {
            ...slotBase,
            estado: 'reservado' as const,
            clienteNombre: nombre.trim(),
            opcionNombre: opcionSeleccionada?.nombre,
            opcionPrecio: opcionSeleccionada?.precio,
            notas: nota.trim() || undefined,
            cobroId: cobro.id,
          }
        }
        return s
      })

      const jornadaActualizada: JornadaReservas = {
        ...jornadaFresca,
        slots: nuevosSlots,
      }

      await api.saveJornadaReservas(jornadaActualizada)
      await cargarJornadas()

      const mensajeText = construirMensajeWhatsapp(
        barberoSeleccionado?.mensajeWhatsapp || jornadaFresca.mensajeWhatsapp,
        slotTarget.horaInicio,
        fechaActiva,
        nombre.trim(),
        opcionSeleccionada?.nombre,
        opcionSeleccionada?.precio,
        nota.trim() || undefined,
        cobro.codigoCancelacion,
      )
      const waUrl = `https://wa.me/${barberPhoneClean}?text=${encodeURIComponent(mensajeText)}`

      window.open(waUrl, '_blank')

      setConfirmado({
        slot: slotTarget,
        fecha: fechaActiva,
        cliente: nombre.trim(),
        opcionNombre: opcionSeleccionada?.nombre,
        opcionPrecio: opcionSeleccionada?.precio,
        nota: nota.trim() || undefined,
        codigoCancelacion: cobro.codigoCancelacion,
        waUrl,
      })
      setSlotTarget(null)
    } catch (e) {
      console.error('Error al confirmar reserva:', e)
      alert('Ocurrió un error al confirmar la reserva. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-slate-100 selection:bg-barber-500 selection:text-white">
      {/* Capa de imagen de fondo fija con el logo */}
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat opacity-30 transition-opacity duration-500"
        style={{ backgroundImage: `url('/Icono_nuevo.png')` }}
      />

      {/* Marca de agua del logo centrada */}
      <div
        className="pointer-events-none fixed inset-0 bg-center bg-contain bg-no-repeat opacity-25 transition-opacity duration-500 max-w-sm mx-auto my-auto h-[340px]"
        style={{ backgroundImage: `url('/Icono_nuevo.png')` }}
      />

      {/* Degradado oscuro para máxima legibilidad */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/75 to-slate-950/95" />

      {/* Luces decorativas */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[350px] w-[500px] rounded-full bg-gradient-to-tr from-amber-600/20 via-barber-500/20 to-emerald-500/10 blur-[100px] opacity-70" />

      <div
        className="relative mx-auto min-h-dvh max-w-lg px-4 py-8 flex flex-col justify-between"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div>
          {/* Encabezado */}
          <div className="mb-6">
            <h1 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-md text-center">
              {APP_NAME}
            </h1>
            
            {/* Íconos de Redes Sociales */}
            {redesSociales && (redesSociales.instagram?.trim() || redesSociales.whatsapp?.trim() || redesSociales.tiktok?.trim()) && (
              <div className="mt-3 flex items-center justify-center gap-2.5">
                {redesSociales.instagram?.trim() && (
                  <a
                    href={redesSociales.instagram.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white transition-all hover:scale-110 active:scale-95 shadow-lg"
                    title="Instagram"
                  >
                    <Instagram size={18} strokeWidth={2.5} className="transition-transform group-hover:scale-110" />
                  </a>
                )}
                {redesSociales.whatsapp?.trim() && redesSociales.whatsapp.replace(/\D/g, '').length >= 10 && (
                  <a
                    href={`https://wa.me/${redesSociales.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white transition-all hover:scale-110 active:scale-95 shadow-lg"
                    title="WhatsApp"
                  >
                    <MessageCircle size={18} strokeWidth={2.5} fill="currentColor" className="transition-transform group-hover:scale-110" />
                  </a>
                )}
                {redesSociales.tiktok?.trim() && (
                  <a
                    href={redesSociales.tiktok.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-all hover:scale-110 active:scale-95 shadow-lg border border-slate-700"
                    title="TikTok"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 transition-transform group-hover:scale-110"
                      fill="currentColor"
                    >
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  </a>
                )}
              </div>
            )}
            
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-barber-400 uppercase tracking-wide">
                Reservar
              </span>
              <a
                href="/cancelar"
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-300 transition-all hover:bg-red-500/20 hover:border-red-500/50 active:scale-95"
              >
                <X size={14} />
                Cancelar Turno
              </a>
            </div>
          </div>

          {/* ── SELECTOR DE BARBEROS (SCROLL HORIZONTAL) ── */}
          {barberos.length > 1 && (
            <div className="mb-4">
              <p className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                Elegí tu barbero:
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {barberos.map((b) => {
                  const esSeleccionado = barberoSeleccionado?.id === b.id
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setBarberoSeleccionado(b)
                        setTodasJornadas([])
                        setJornadaSeleccionadaId(null)
                      }}
                      className={`flex-1 min-w-[120px] shrink-0 flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all ${
                        esSeleccionado
                          ? 'border-barber-500 bg-barber-500/25 ring-1 ring-barber-500 text-white shadow-lg'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <Scissors
                        size={20}
                        className={esSeleccionado ? 'text-barber-400 mb-1' : 'text-slate-500 mb-1'}
                      />
                      <span className="text-sm font-extrabold truncate max-w-full px-1">
                        {b.nombre}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {barberos.length === 0 && (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <Scissors size={24} className="mx-auto mb-2 text-amber-400" />
              <p className="text-xs font-semibold text-amber-300">No hay barberos disponibles</p>
              <p className="mt-1 text-[11px] text-slate-400">
                La barbería aún no ha configurado los barberos.
              </p>
            </div>
          )}

          {/* ── SELECTOR MULTIDÍA (SI HAY VARIAS JORNADAS PUBLICADAS) ── */}
          {todasJornadas.length > 0 && (
            <div className="mb-4">
              {/* Navegador de Semanas */}
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Elegí la fecha de tu turno:
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
                        <span className="text-[10px] font-semibold text-slate-500 min-w-[80px] text-center">
                          {semanaActual.toLocaleDateString('es-PY', { month: 'short', day: 'numeric' })}
                          {' - '}
                          {new Date(semanaActual.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('es-PY', { month: 'short', day: 'numeric' })}
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

              {/* Días de la semana */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {todasJornadas.map((j) => {
                  const esSeleccionado = j.id === jornadaSeleccionadaId
                  const libres = j.slots.filter((s) => 
                    s.estado === 'disponible' && !esTurnoPasado(j.fecha, s.horaInicio)
                  ).length
                  const esHoy = j.fecha === hoyISO()
                  
                  // Validar alcance desde la jornada (agenda)
                  const fueraDeAlcance = j.alcanceDias 
                    ? !estaEnAlcance(j.fecha, j.alcanceDias)
                    : false

                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setJornadaSeleccionadaId(j.id)}
                      disabled={fueraDeAlcance}
                      className={`flex-1 min-w-[110px] shrink-0 flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition-all ${
                        fueraDeAlcance
                          ? 'border-slate-800 bg-slate-900/30 text-slate-600 cursor-not-allowed opacity-40'
                          : esSeleccionado
                          ? 'border-barber-500 bg-barber-500/25 ring-1 ring-barber-500 text-white shadow-lg'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <span className="text-xs font-extrabold truncate">
                        {obtenerNombreDiaConFecha(j.fecha)}
                      </span>
                      {esHoy && (
                        <span className="text-[9px] font-black text-barber-400 uppercase tracking-wider mt-0.5">
                          HOY
                        </span>
                      )}
                      {fueraDeAlcance ? (
                        <span className="text-[10px] font-bold mt-1 text-red-400">
                          Fuera alcance
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-bold mt-1 ${
                            libres > 0 ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          {libres > 0 ? `${libres} libres` : 'Sin lugar'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Lista de Turnos del Día Seleccionado */}
          {!jornadaActiva || jornadaActiva.slots.length === 0 ? (
            <div className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-8 text-center backdrop-blur-md shadow-xl">
              {cargando ? (
                <>
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
                  <p className="text-sm font-bold text-slate-300">Cargando horarios...</p>
                </>
              ) : (
                <>
                  <Clock size={36} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">No hay horarios disponibles</p>
                  <p className="text-xs text-slate-500 mt-1">
                    El barbero aún no ha publicado la agenda para este día.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Horarios disponibles ({obtenerNombreDiaConFecha(fechaActiva)})
                </h2>
                <span className="text-xs text-emerald-400 font-bold">
                  {jornadaActiva.slots.filter((s) => 
                    s.estado === 'disponible' && !esTurnoPasado(fechaActiva, s.horaInicio)
                  ).length} libres
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {jornadaActiva.slots
                  .filter((slot) => {
                    // Mantener siempre slots reservados/bloqueados para dar contexto
                    if (slot.estado === 'reservado' || slot.estado === 'bloqueado') {
                      return true
                    }
                    // Filtrar slots disponibles que ya pasaron
                    return !esTurnoPasado(fechaActiva, slot.horaInicio)
                  })
                  .map((slot) => {
                  const esReservado = slot.estado === 'reservado'
                  const esBloqueado = slot.estado === 'bloqueado'
                  const esDisponible = slot.estado === 'disponible'

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!esDisponible}
                      onClick={() => handleSeleccionarSlot(slot)}
                      className={`group relative flex flex-col items-center justify-center rounded-2xl border p-3.5 text-center transition-all ${
                        esReservado
                          ? 'border-slate-800 bg-slate-900/50 text-slate-500 cursor-not-allowed opacity-60'
                          : esBloqueado
                          ? 'border-slate-800 bg-slate-900/30 text-slate-600 cursor-not-allowed opacity-40'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500 hover:bg-emerald-500/20 active:scale-[0.98]'
                      }`}
                    >
                      <span
                        className={`text-base font-extrabold tracking-tight ${
                          esReservado ? 'line-through decoration-red-500/60' : ''
                        }`}
                      >
                        {slot.horaInicio} - {slot.horaFin}
                      </span>

                      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider">
                        {esReservado ? (
                          <span className="text-red-400">Reservado</span>
                        ) : esBloqueado ? (
                          'No disponible'
                        ) : (
                          <span className="text-emerald-400">Tocar para reservar</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              {jornadaActiva && !jornadaActiva.permitirReservaPublica && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                  <MessageCircle size={24} className="mx-auto mb-2 text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-300">Reservas por WhatsApp</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Tocá un horario disponible para enviar un mensaje al barbero
                  </p>
                  <a
                    href={`https://wa.me/${barberPhoneClean}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    <MessageCircle size={14} />
                    {jornadaActiva.whatsappBarbero || DEFAULT_WHATSAPP_BARBERO}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Aviso de conflicto */}
        {errorConflicto && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 animate-pulse">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              <strong>Este turno ya está siendo reservado</strong> por otra persona. La página se actualizó
              con los turnos disponibles.
            </p>
          </div>
        )}

        {/* Modal para completar datos de reserva */}
        {slotTarget && (
          <Modal
            open={!!slotTarget}
            onClose={cerrarModalReserva}
            title={`Reservar turno ${slotTarget.horaInicio} - ${
              slotTarget.horaFin
            } (${obtenerNombreDiaConFecha(fechaActiva)})`}
          >
            <form onSubmit={handleConfirmarReserva} className="space-y-4">
              <p className="text-xs text-slate-400">
                Ingresá tu nombre y elegí qué te querés hacer para reservar tu lugar.
              </p>

              <Input
                label="Tu Nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                required
              />

              {opciones.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    ¿Qué deseas hacerte?
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {opciones.map((op) => {
                      const esSeleccionado = opcionSeleccionada?.id === op.id
                      return (
                        <button
                          key={op.id}
                          type="button"
                          onClick={() => setOpcionSeleccionada(op)}
                          className={`w-full flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition-all ${
                            esSeleccionado
                              ? 'border-barber-500 bg-barber-500/15 text-white ring-1 ring-barber-500 shadow-md'
                              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Scissors
                              size={16}
                              className={esSeleccionado ? 'text-barber-400' : 'text-slate-500'}
                            />
                            <span className="text-sm font-semibold truncate">{op.nombre}</span>
                          </div>
                          <span
                            className={`text-xs font-bold shrink-0 ${
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
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej: Llego 5 min antes / Algún detalle especial"
                  rows={2}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-barber-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={cerrarModalReserva}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold"
                  disabled={guardando}
                >
                  <MessageCircle size={16} className="mr-1.5 inline" />
                  {guardando ? 'Reservando...' : 'Confirmar Reserva'}
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal de Éxito / WhatsApp */}
        {confirmado && (
          <Modal
            open={!!confirmado}
            onClose={() => setConfirmado(null)}
            title="¡Turno Reservado! 🎉"
          >
            <div className="text-center space-y-4 py-2">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-white">
                  {confirmado.cliente}, tu turno fue registrado para:
                </p>
                <p className="mt-1 text-lg font-bold text-barber-400">
                  {confirmado.slot.horaInicio} - {confirmado.slot.horaFin} (
                  {obtenerNombreDiaConFecha(confirmado.fecha)})
                </p>
                {confirmado.opcionNombre && (
                  <p className="mt-2 text-xs font-semibold text-amber-300 bg-amber-500/10 py-1.5 px-3 rounded-lg inline-block border border-amber-500/20">
                    ✂️ {confirmado.opcionNombre}{' '}
                    {confirmado.opcionPrecio
                      ? `(${confirmado.opcionPrecio.toLocaleString('es-PY')} Gs)`
                      : ''}
                  </p>
                )}
                {confirmado.nota && (
                  <p className="mt-1 text-xs text-slate-300 italic">
                    📝 Nota: {confirmado.nota}
                  </p>
                )}
              </div>

              {confirmado.codigoCancelacion && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-xs font-bold text-amber-300 mb-2">🔑 Código de Cancelación</p>
                  <p className="text-lg font-black text-amber-400 tracking-wider text-center bg-slate-950/60 py-2 rounded-lg border border-amber-500/20">
                    {confirmado.codigoCancelacion}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2 text-center">
                    Guardá este código. Lo necesitarás para cancelar tu turno.
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-400">
                Se abrió WhatsApp para notificar al barbero. Si no se abrió automáticamente, tocá el
                botón de abajo:
              </p>

              <a
                href={confirmado.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:bg-emerald-500 active:scale-95"
              >
                <MessageCircle size={20} />
                Enviar mensaje a WhatsApp
              </a>
            </div>
          </Modal>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-slate-600 text-[11px]">
          <p>
            © {new Date().getFullYear()} {APP_NAME} · Sistema de Reservas
          </p>
        </div>
      </div>
    </div>
  )
}
export default ReservaPublica
