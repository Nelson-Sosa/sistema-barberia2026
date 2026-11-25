import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import type { Cliente, Cobro, JornadaReservas, TurnoSlot } from './types'
import { api } from './api'
import { hoyISO } from './dates'

export const DEFAULT_WHATSAPP_BARBERO = '0975 660591'
export const DEFAULT_MENSAJE_WHATSAPP = 'Reservado para las {hora}'

export interface DiaSemanaItem {
  fecha: string // "yyyy-MM-dd"
  diaSemana: string // "Lunes"
  diaCorto: string // "Lun"
  fechaCorta: string // "03/08"
  esPasado: boolean
  esHoy: boolean
}

export function obtenerDiasSemanaActual(fechaRef = hoyISO()): DiaSemanaItem[] {
  const hoyStr = hoyISO()
  const base = parseISO(fechaRef)
  const monday = startOfWeek(base, { weekStartsOn: 1 })
  const NOMBRES_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const NOMBRES_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const result: DiaSemanaItem[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    const fStr = format(d, 'yyyy-MM-dd')
    result.push({
      fecha: fStr,
      diaSemana: NOMBRES_DIAS[i],
      diaCorto: NOMBRES_CORTOS[i],
      fechaCorta: format(d, 'dd/MM'),
      esPasado: fStr < hoyStr,
      esHoy: fStr === hoyStr,
    })
  }
  return result
}

export function obtenerNombreDiaConFecha(fechaISO: string): string {
  try {
    const d = parseISO(fechaISO)
    const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const diaNombre = NOMBRES_DIAS[d.getDay()]
    const fechaCorta = format(d, 'dd/MM')
    return `${diaNombre} ${fechaCorta}`
  } catch {
    return fechaISO
  }
}

export interface GrupoJornada {
  grupoId: string
  nombreGrupo: string
  rangoFechas: string
  jornadas: JornadaReservas[]
  creadoEn: string
}

export function agruparJornadas(list: JornadaReservas[]): GrupoJornada[] {
  const map = new Map<string, JornadaReservas[]>()
  const sorted = [...list].sort((a, b) => a.fecha.localeCompare(b.fecha))

  sorted.forEach((j) => {
    const key = j.grupoId || j.id
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)!.push(j)
  })

  const grupos: GrupoJornada[] = []

  map.forEach((jornadasGrupo, key) => {
    // Ordenar por día de semana si son plantillas, sino por fecha
    const esPlantilla = jornadasGrupo[0] && !jornadasGrupo[0].barberoId && jornadasGrupo[0].diaSemana !== undefined
    
    if (esPlantilla) {
      // Ordenar por día de semana: Lunes=1, Martes=2, ..., Domingo=0
      jornadasGrupo.sort((a, b) => {
        const diaA = a.diaSemana === 0 ? 7 : a.diaSemana // Domingo al final
        const diaB = b.diaSemana === 0 ? 7 : b.diaSemana
        return (diaA || 0) - (diaB || 0)
      })
    } else {
      // Ordenar por fecha
      jornadasGrupo.sort((a, b) => a.fecha.localeCompare(b.fecha))
    }
    
    const primera = jornadasGrupo[0]
    const ultima = jornadasGrupo[jornadasGrupo.length - 1]

    let nombre = primera.nombreGrupo
    if (!nombre) {
      if (jornadasGrupo.length === 1) {
        nombre = `Agenda ${obtenerNombreDiaConFecha(primera.fecha)}`
      } else {
        nombre = `Agenda Semanal (${primera.fecha.slice(8, 10)}/${primera.fecha.slice(5, 7)} al ${ultima.fecha.slice(8, 10)}/${ultima.fecha.slice(5, 7)})`
      }
    }

    let rango = ''
    if (jornadasGrupo.length === 1) {
      rango = obtenerNombreDiaConFecha(primera.fecha)
    } else {
      rango = `${primera.fecha.slice(8, 10)}/${primera.fecha.slice(5, 7)} al ${ultima.fecha.slice(8, 10)}/${ultima.fecha.slice(5, 7)}`
    }

    const maxCreado = jornadasGrupo.reduce(
      (acc, curr) => (curr.creadoEn && curr.creadoEn > acc ? curr.creadoEn : acc),
      '',
    )

    grupos.push({
      grupoId: key,
      nombreGrupo: nombre,
      rangoFechas: rango,
      jornadas: jornadasGrupo,
      creadoEn: maxCreado || primera.creadoEn || primera.fecha,
    })
  })

  return grupos.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}


/** Formatea un número paraguayo con espacios: 0982362830 → 0982 362 830 */
export function formatearTelefono(num: string): string {
  const digits = num.replace(/\D/g, '')
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`
}

export function formatearWaMe(num: string): string {
  let clean = num.replace(/\D/g, '')
  if (clean.startsWith('0')) {
    clean = '595' + clean.slice(1)
  } else if (!clean.startsWith('595') && clean.length <= 9) {
    clean = '595' + clean
  }
  return clean
}

export function construirMensajeWhatsapp(
  template: string | undefined,
  hora: string,
  fecha: string,
  nombre: string,
  opcionNombre?: string,
  opcionPrecio?: number,
  notas?: string,
  codigoCancelacion?: string,
): string {
  const tpl = template?.trim() || DEFAULT_MENSAJE_WHATSAPP
  let msg = tpl
    .replace(/\{hora\}/g, hora)
    .replace(/\{fecha\}/g, fecha)
    .replace(/\{nombre\}/g, nombre)

  if (opcionNombre) {
    const precioStr = opcionPrecio ? ` (${opcionPrecio.toLocaleString('es-PY')} Gs)` : ''
    msg += `\n*Servicio:* ${opcionNombre}${precioStr}`
  }
  if (notas?.trim()) {
    msg += `\n*Nota:* ${notas.trim()}`
  }
  if (codigoCancelacion) {
    msg += `\n\n🔑 *Código de cancelación:* ${codigoCancelacion}`
    msg += `\n📱 Para cancelar tu turno: ${window.location.origin}/cancelar`
  }
  return msg
}

/** Genera un código único de cancelación para una reserva */
export function generarCodigoCancelacion(cobroId: string, fecha: string): string {
  const prefijo = 'TIM'
  const fechaLimpia = fecha.replace(/-/g, '').slice(2) // 2026-11-02 → 261102
  const hashCorto = cobroId.slice(0, 6).toUpperCase()
  return `${prefijo}-${fechaLimpia}-${hashCorto}`
}

export function generarSlotsJornada(
  horaInicioStr: string, // "12:00"
  horaFinStr: string, // "22:00"
  intervaloMinutos: number, // 60, 45, 30
  existingSlots: TurnoSlot[] = [],
): TurnoSlot[] {
  const parseMinutos = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }

  const formatMinutos = (totalMin: number) => {
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const startMin = parseMinutos(horaInicioStr)
  const endMin = parseMinutos(horaFinStr)
  const slots: TurnoSlot[] = []

  let curr = startMin
  while (curr + intervaloMinutos <= endMin) {
    const hInicio = formatMinutos(curr)
    const hFin = formatMinutos(curr + intervaloMinutos)
    const slotId = `${hInicio}-${hFin}`

    const found = existingSlots.find((s) => s.id === slotId || s.horaInicio === hInicio)

    if (found) {
      slots.push({
        ...found,
        horaInicio: hInicio,
        horaFin: hFin,
      })
    } else {
      slots.push({
        id: slotId,
        horaInicio: hInicio,
        horaFin: hFin,
        estado: 'disponible',
      })
    }

    curr += intervaloMinutos
  }

  return slots
}

/**
 * Regenera los slots de una jornada preservando las reservas existentes
 * @param jornadaActual - Jornada con slots actuales
 * @param nuevaPlantilla - Plantilla con nuevos horarios
 * @returns Jornada actualizada con nuevos horarios y reservas preservadas
 */
export function regenerarSlotsConReservas(
  jornadaActual: JornadaReservas,
  nuevaPlantilla: { horaInicio: string; horaFin: string; intervaloMinutos: number }
): JornadaReservas {
  // Extraer solo los slots que tienen reservas o están bloqueados
  const slotsReservados = jornadaActual.slots.filter(
    (s) => s.estado === 'reservado' || s.estado === 'bloqueado'
  )

  // Generar nuevos slots con el nuevo horario, preservando los reservados
  const nuevosSlots = generarSlotsJornada(
    nuevaPlantilla.horaInicio,
    nuevaPlantilla.horaFin,
    nuevaPlantilla.intervaloMinutos,
    slotsReservados
  )

  // Retornar jornada actualizada
  return {
    ...jornadaActual,
    horaInicio: nuevaPlantilla.horaInicio,
    horaFin: nuevaPlantilla.horaFin,
    intervaloMinutos: nuevaPlantilla.intervaloMinutos,
    slots: nuevosSlots,
  }
}

export function crearJornadaPorDefecto(fecha: string): JornadaReservas {
  const hInicio = '12:00'
  const hFin = '22:00'
  const intervalo = 60
  return {
    id: crypto.randomUUID(),
    fecha,
    horaInicio: hInicio,
    horaFin: hFin,
    intervaloMinutos: intervalo,
    permitirReservaPublica: true,
    whatsappBarbero: DEFAULT_WHATSAPP_BARBERO,
    mensajeWhatsapp: DEFAULT_MENSAJE_WHATSAPP,
    slots: generarSlotsJornada(hInicio, hFin, intervalo),
    creadoEn: new Date().toISOString(),
    configurado: false,
    whatsappConfigurado: false,
  }
}

export async function registrarCobroYClientePorReserva({
  clienteNombre,
  clienteTelefono,
  fecha,
  horaInicio,
  opcionNombre,
  opcionPrecio,
  notas,
  barberoId,
}: {
  clienteNombre: string
  clienteTelefono?: string
  fecha: string
  horaInicio: string
  opcionNombre?: string
  opcionPrecio?: number
  notas?: string
  barberoId?: string
}): Promise<{ cliente: Cliente; cobro: Cobro }> {
  const qNombre = clienteNombre.trim().toLowerCase()
  const qTel = clienteTelefono?.trim() || ''

  let clientesExistentes: Cliente[] = []
  try {
    clientesExistentes = await api.getClientes()
  } catch {}

  let cliente = clientesExistentes.find((c) => {
    const nombreCompleto = `${c.nombre} ${c.apellido}`.trim().toLowerCase()
    if (nombreCompleto === qNombre || c.nombre.trim().toLowerCase() === qNombre) return true
    if (qTel && c.telefono && c.telefono.replace(/\D/g, '') === qTel.replace(/\D/g, '')) return true
    return false
  })

  if (!cliente) {
    const partes = clienteNombre.trim().split(' ')
    const nombre = partes[0] || clienteNombre.trim()
    const apellido = partes.slice(1).join(' ') || ''
    cliente = {
      id: crypto.randomUUID(),
      nombre,
      apellido,
      telefono: clienteTelefono?.trim() || '',
      notas: notas?.trim() || undefined,
      creadoEn: new Date().toISOString(),
    }
  }

  // No guardamos el cliente en la colección "Personas" para que solo aparezcan los clientes agregados manualmente.
  // Si ya existía en Personas, conservamos sus datos para asociarlo al cobro.

  let monto = opcionPrecio ?? 0
  if (!monto && opcionNombre) {
    const opciones = await api.getOpcionesCliente()
    const match = opciones.find((o) => o.nombre.toLowerCase() === opcionNombre.toLowerCase())
    if (match) monto = match.precio
  }

  const servicioDetalle = opcionNombre
    ? `${opcionNombre} (${fecha} ${horaInicio})`
    : `Reserva (${fecha} ${horaInicio})`

  const clienteNombreCompleto = `${cliente.nombre} ${cliente.apellido}`.trim()

  const cobroId = crypto.randomUUID()
  const cobro: Cobro = {
    id: cobroId,
    clienteId: cliente.id,
    planId: '',
    barberoId: barberoId, // ← NUEVO: ID del barbero
    fecha: fecha,
    monto: monto,
    montoPlan: monto,
    estado: 'pendiente',
    tipo: 'ingreso',
    descripcion: `${clienteNombreCompleto} · ${servicioDetalle}`,
    codigoCancelacion: generarCodigoCancelacion(cobroId, fecha),
    creadoEn: new Date().toISOString(),
  }

  await api.saveCobro(cobro)

  return { cliente, cobro }
}




/**
 * Obtiene el lunes de la semana de una fecha dada
 */
export function getLunesDeSemana(fecha: Date): Date {
  const d = new Date(fecha)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Si es domingo (0), retroceder 6 días
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Genera un array de 7 fechas (Lun-Dom) para una semana específica
 */
export function getDiasDeSemana(lunes: Date): string[] {
  const dias: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    dias.push(d.toISOString().split('T')[0])
  }
  return dias
}

/**
 * Obtiene el nombre del día de la semana (0=Dom, 1=Lun, ..., 6=Sáb)
 */
export function getDiaSemanaIndex(fecha: string): number {
  const d = new Date(fecha + 'T12:00:00')
  return d.getDay()
}

/**
 * Verifica si una fecha está dentro del alcance permitido
 * @param fecha - Fecha a verificar (yyyy-MM-dd)
 * @param alcanceDias - Días de anticipación permitidos (0 = ilimitado)
 * @returns true si está dentro del alcance
 */
export function estaEnAlcance(fecha: string, alcanceDias: number): boolean {
  if (!alcanceDias || alcanceDias === 0) return true
  
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  
  const fechaObj = new Date(fecha + 'T12:00:00')
  fechaObj.setHours(0, 0, 0, 0)
  
  const diffTime = fechaObj.getTime() - hoy.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  return diffDays >= 0 && diffDays <= alcanceDias
}

/**
 * Genera un ID único de sesión para el cliente (se guarda en sessionStorage)
 */
export function obtenerIdSesionCliente(): string {
  const STORAGE_KEY = 'timontti_session_id'
  let sessionId = sessionStorage.getItem(STORAGE_KEY)
  
  if (!sessionId) {
    sessionId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    sessionStorage.setItem(STORAGE_KEY, sessionId)
  }
  
  return sessionId
}

/**
 * Verifica si un slot está disponible para reservar (no está ocupado ni bloqueado por otro)
 */
export function slotEstaDisponibleParaMi(slot: TurnoSlot, miSessionId: string): boolean {
  // Si está reservado, no está disponible
  if (slot.estado !== 'disponible') return false
  
  // Si no hay bloqueo temporal, está disponible
  if (!slot.bloqueadoTemporalmentePor || !slot.bloqueadoTemporalmenteHasta) return true
  
  // Si el bloqueo es mío, está disponible para mí
  if (slot.bloqueadoTemporalmentePor === miSessionId) return true
  
  // Si el bloqueo expiró (30 segundos), está disponible
  const ahora = Date.now()
  if (slot.bloqueadoTemporalmenteHasta < ahora) return true
  
  // Si está bloqueado por otro y no expiró, NO está disponible
  return false
}

/**
 * Limpia los bloqueos temporales expirados de un array de slots
 */
export function limpiarBloqueosExpirados(slots: TurnoSlot[]): TurnoSlot[] {
  const ahora = Date.now()
  
  return slots.map((slot) => {
    // Si tiene bloqueo temporal y ya expiró, quitarlo
    if (
      slot.bloqueadoTemporalmentePor &&
      slot.bloqueadoTemporalmenteHasta &&
      slot.bloqueadoTemporalmenteHasta < ahora
    ) {
      const { bloqueadoTemporalmentePor, bloqueadoTemporalmenteHasta, ...slotLimpio } = slot
      return slotLimpio as TurnoSlot
    }
    
    return slot
  })
}


/**
 * Verifica si un turno ya pasó (para filtrar turnos no disponibles del día actual)
 * @param fecha - Fecha del turno (yyyy-MM-dd)
 * @param horaInicio - Hora de inicio del turno (HH:mm)
 * @returns true si el turno ya comenzó o pasó
 */
export function esTurnoPasado(fecha: string, horaInicio: string): boolean {
  const hoyStr = hoyISO()
  
  // Si es un día futuro, nunca está pasado
  if (fecha > hoyStr) return false
  
  // Si es un día pasado, siempre está pasado
  if (fecha < hoyStr) return true
  
  // Si es hoy, comparar la hora actual con la hora del turno
  const ahora = new Date()
  const [hora, minutos] = horaInicio.split(':').map(Number)
  
  const horaActual = ahora.getHours()
  const minutosActuales = ahora.getMinutes()
  
  // Convertir todo a minutos desde medianoche para comparar
  const minutosDelSlot = (hora || 0) * 60 + (minutos || 0)
  const minutosAhora = horaActual * 60 + minutosActuales
  
  // El turno está pasado solo si la hora actual ya superó completamente la hora de inicio
  // Usamos > en lugar de >= para permitir reservar hasta el último minuto del turno anterior
  return minutosAhora > minutosDelSlot
}
