export type TipoPlan = string

export interface PlanTipoConfig {
  id: string
  nombre: string
  monto: number
  duracion: { tipo: 'meses' | 'dias'; valor: number } | null
  fechaInicioDefault?: string
  fechaFinDefault?: string
}


export type EstadoCobro = 'pendiente' | 'pagado' | 'anulado'
export type TipoMovimiento = 'plan' | 'ingreso' | 'egreso'

export interface Cliente {
  id: string
  nombre: string
  apellido: string
  telefono: string
  cedula?: string
  notas?: string
  creadoEn: string
}

export interface Plan {
  id: string
  clienteId: string
  tipo: TipoPlan
  fechaInicio: string
  fechaFin: string
  monto: number
  hora?: string
  cantidad?: number
  notas?: string
  creadoEn: string
}


export interface Cobro {
  id: string
  clienteId: string
  planId: string
  barberoId?: string // ID del barbero con quien se reservó
  fecha: string
  monto: number
  montoPlan: number
  estado: EstadoCobro
  tipo?: TipoMovimiento
  descripcion?: string
  pagadoEn?: string
  codigoCancelacion?: string
  creadoEn: string
}

export interface PlanConCliente extends Plan {
  cliente?: Cliente
}


export interface CobroConCliente extends Cobro {
  cliente?: Cliente
  plan?: Plan
}

// Total histórico acumulado que nunca baja
export interface TotalHistorico {
  id: string // 'total-historico'
  totalAcumulado: number // Total que NUNCA baja
  ultimaActualizacion: string
}

// Configuración de redes sociales
export interface RedesSociales {
  id: string // 'redes-sociales'
  instagram: string // URL completa de Instagram
  whatsapp: string // Número de teléfono
  tiktok: string // URL completa de TikTok
  ultimaActualizacion: string
}

export type EstadoSlot = 'disponible' | 'reservado' | 'bloqueado'

export interface OpcionCliente {
  id: string
  nombre: string
  precio: number
}

export interface TurnoSlot {
  id: string
  horaInicio: string
  horaFin: string
  estado: EstadoSlot
  clienteNombre?: string
  clienteTelefono?: string
  opcionNombre?: string
  opcionPrecio?: number
  notas?: string
  cobroId?: string
  // Bloqueo temporal para exclusión mutua
  bloqueadoTemporalmentePor?: string // ID de sesión del cliente que está reservando
  bloqueadoTemporalmenteHasta?: number // Timestamp cuando expira el bloqueo (30 segundos)
}

export interface Barbero {
  id: string
  uid?: string // UID de Firebase Authentication (se asigna al crear cuenta)
  nombre: string
  email: string // Email para login
  whatsapp: string        // Número de WhatsApp del barbero
  mensajeWhatsapp?: string // Ej: "Reservado para las {hora}" — si no está, se usa el default
  agendaId: string        // grupoId del grupo de jornadas (compatibilidad con agendas existentes)
  activo: boolean
  permisos?: {
    inicio?: boolean
    cobros?: boolean
    personas?: boolean
    planes?: boolean
    reportes?: boolean
    barberos?: boolean // Solo admin puede ver esto
  }
  creadoEn: string
}

export interface JornadaReservas {
  id: string // UUID único
  grupoId?: string // UUID para agrupar jornadas creadas en lote (semanales)
  nombreGrupo?: string // Ej: "Agenda Semanal"
  barberoId?: string // ID del barbero (para jornadas clonadas)
  alcanceDias?: number // Días de anticipación para reservar (ej: 10). Si no está o es 0, es ilimitado
  agendaActiva?: boolean // true por defecto, false para desactivar temporalmente la agenda
  
  // PLANTILLA: si es plantilla (sin barberoId), usa diaSemana (0=Dom, 1=Lun, ..., 6=Sáb)
  diaSemana?: number // 0-6: día de la semana para plantillas
  
  // JORNADA REAL: si tiene barberoId, usa fecha específica
  fecha: string // yyyy-MM-dd (usado solo cuando hay reservas reales o barberoId)
  
  horaInicio: string // ej: "12:00"
  horaFin: string // ej: "22:00"
  intervaloMinutos: number // ej: 60
  permitirReservaPublica: boolean
  whatsappBarbero?: string // ej: "0975 660591"
  mensajeWhatsapp?: string // ej: "Reservado para las {hora}"
  slots: TurnoSlot[]
  creadoEn?: string
  configurado?: boolean // true después de "Aplicar / Generar horario"
  whatsappConfigurado?: boolean // true después de "Guardar configuración WhatsApp"
}

