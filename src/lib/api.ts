import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { localStore } from './storage'
import { hoyISO } from './dates'
import { regenerarSlotsConReservas } from './reservasUtils'
import type { Barbero, Cliente, Cobro, JornadaReservas, OpcionCliente, Plan, PlanTipoConfig, RedesSociales, TotalHistorico } from './types'

const C = {
  clientes: 'clientes',
  planes: 'planes',
  cobros: 'cobros',
  planTipos: 'planTipos',
  jornadas: 'jornadasReservas',
  opcionesCliente: 'opcionesCliente',
  barberos: 'barberos',
}

export const api = {
  async getClientes(): Promise<Cliente[]> {
    try {
      const q = query(collection(db, C.clientes), orderBy('creadoEn', 'desc'))
      const snap = await getDocs(q)
      const list = snap.docs.map((d) => d.data() as Cliente)
      localStore.saveClientes(list)
      return list
    } catch {
      return localStore.getClientes()
    }
  },

  async saveCliente(cliente: Cliente): Promise<void> {
    const sanitized = Object.fromEntries(
      Object.entries(cliente).filter(([_, v]) => v !== undefined),
    ) as Cliente
    localStore.saveCliente(sanitized)
    await setDoc(doc(db, C.clientes, cliente.id), sanitized)
  },

  async deleteCliente(id: string): Promise<void> {
    localStore.deleteCliente(id)
    await deleteDoc(doc(db, C.clientes, id))
  },

  async getPlanes(): Promise<Plan[]> {
    try {
      const q = query(collection(db, C.planes), orderBy('creadoEn', 'desc'))
      const snap = await getDocs(q)
      const list = snap.docs.map((d) => d.data() as Plan)
      localStore.savePlanes(list)
      return list
    } catch {
      return localStore.getPlanes()
    }
  },

  async savePlan(plan: Plan): Promise<void> {
    const sanitized = Object.fromEntries(
      Object.entries(plan).filter(([_, v]) => v !== undefined),
    ) as Plan
    localStore.savePlan(sanitized)
    await setDoc(doc(db, C.planes, plan.id), sanitized)
  },

  async deletePlan(id: string): Promise<void> {
    localStore.deletePlan(id)
    await deleteDoc(doc(db, C.planes, id))
    const q = query(collection(db, C.cobros), where('planId', '==', id))
    const snap = await getDocs(q)
    const deletes = snap.docs
      .filter((d) => (d.data() as Cobro).estado !== 'pagado')
      .map((d) => deleteDoc(doc(db, C.cobros, d.id)))
    await Promise.all(deletes)
  },

  async getCobros(): Promise<Cobro[]> {
    try {
      const q = query(collection(db, C.cobros), orderBy('creadoEn', 'desc'))
      const snap = await getDocs(q)
      const list = snap.docs.map((d) => d.data() as Cobro)
      localStore.saveCobros(list)
      return list
    } catch {
      return localStore.getCobros()
    }
  },

  async getAllCobros(): Promise<Cobro[]> {
    // Método para obtener TODOS los cobros sin cache (usado para limpieza)
    const snap = await getDocs(collection(db, C.cobros))
    return snap.docs.map((d) => d.data() as Cobro)
  },

  async saveCobro(cobro: Cobro): Promise<void> {
    const sanitized = Object.fromEntries(
      Object.entries(cobro).filter(([_, v]) => v !== undefined),
    ) as Cobro
    
    // Verificar si es un cobro NUEVO y PAGADO
    const esNuevoCobro = !localStore.getCobros().find((c) => c.id === cobro.id)
    const esPagado = cobro.estado === 'pagado'
    
    // Si es nuevo y pagado, actualizar el total histórico
    if (esNuevoCobro && esPagado) {
      const monto = cobro.tipo === 'egreso' ? -cobro.monto : cobro.monto
      await this.actualizarTotalHistorico(monto)
    }
    
    localStore.saveCobro(sanitized)
    await setDoc(doc(db, C.cobros, cobro.id), sanitized)
  },

  async deleteCobro(id: string): Promise<void> {
    localStore.deleteCobro(id)
    await deleteDoc(doc(db, C.cobros, id))

    // Si este cobro provenía de una reserva, liberar el turno en la agenda
    try {
      const snap = await getDocs(collection(db, C.jornadas))
      for (const d of snap.docs) {
        const j = d.data() as JornadaReservas
        if (j.slots && j.slots.some((s) => s.cobroId === id)) {
          const nuevosSlots = j.slots.map((s) => {
            if (s.cobroId === id) {
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
          const jAct: JornadaReservas = { ...j, slots: nuevosSlots }
          localStore.saveJornadaReservas(jAct)
          await setDoc(doc(db, C.jornadas, j.id), jAct)
        }
      }
    } catch (e) {
      console.warn('Aviso: no se pudo sincronizar el turno al eliminar cobro:', e)
    }
  },

  async getPlanTipos(): Promise<PlanTipoConfig[]> {
    try {
      const ref = doc(db, C.planTipos, 'config')
      console.log('[getPlanTipos] Consultando Firebase...')
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const tipos = (snap.data().tipos as PlanTipoConfig[]).map((t: any) => {
          if (t.duracion !== undefined) return t as PlanTipoConfig
          if (t.id === 'personalizado') return { ...t, duracion: null }
          if (t.id === 'diario') return { ...t, duracion: { tipo: 'dias', valor: 1 } }
          return { ...t, duracion: { tipo: 'meses', valor: 1 } }
        })
        console.log('[getPlanTipos] Leído de Firebase:', tipos.length, 'tipos')
        localStore.savePlanTipos(tipos)
        return tipos
      }
      console.warn('[getPlanTipos] No existe documento en Firebase, usando local')
    } catch (e) {
      console.error('[getPlanTipos] ERROR al leer Firebase:', e)
    }
    return localStore.getPlanTipos()
  },

  async savePlanTipos(tipos: PlanTipoConfig[]): Promise<void> {
    localStore.savePlanTipos(tipos)
    const sanitized = tipos.map((t) =>
      Object.fromEntries(Object.entries(t).filter(([_, v]) => v !== undefined)),
    )
    console.log('[savePlanTipos] Guardando en Firebase:', sanitized)
    await setDoc(doc(db, C.planTipos, 'config'), { tipos: sanitized })
    console.log('[savePlanTipos] Guardado exitoso en Firebase')
  },

  async getTodasJornadas(): Promise<JornadaReservas[]> {
    const snap = await getDocs(collection(db, C.jornadas))
    const list = snap.docs.map((d) => d.data() as JornadaReservas)
    localStore.saveJornadaReservasMulti(list)
    return list
  },

  async getJornadaReservas(id: string): Promise<JornadaReservas | null> {
    const ref = doc(db, C.jornadas, id)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const j = snap.data() as JornadaReservas
      localStore.saveJornadaReservas(j)
      return j
    }
    localStore.deleteJornadaReservas(id)
    return null
  },

  /** Busca por fecha (para compatibilidad con links viejos y datos antiguos) */
  async getJornadaReservasPorFecha(fecha: string): Promise<JornadaReservas | null> {
    try {
      const q = query(collection(db, C.jornadas), where('fecha', '==', fecha))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const docs = snap.docs.map((d) => d.data() as JornadaReservas)
        docs.sort((a, b) => ((b.creadoEn ?? '') > (a.creadoEn ?? '') ? 1 : -1))
        localStore.saveJornadaReservas(docs[0])
        return docs[0]
      }
    } catch (e) {
      console.error('Error al buscar jornada por fecha:', e)
    }
    return null
  },

  /** Para vista pública y tiempo real */
  async getJornadaReservasRemota(id: string): Promise<JornadaReservas | null> {
    const ref = doc(db, C.jornadas, id)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const j = snap.data() as JornadaReservas
      localStore.saveJornadaReservas(j)
      return j
    }
    localStore.deleteJornadaReservas(id)
    return null
  },

  async saveJornadaReservas(jornada: JornadaReservas): Promise<void> {
    if (!jornada.creadoEn) {
      jornada.creadoEn = new Date().toISOString()
    }
    const sanitized = Object.fromEntries(
      Object.entries(jornada).filter(([_, v]) => v !== undefined),
    ) as JornadaReservas
    if (sanitized.slots) {
      sanitized.slots = sanitized.slots.map((s) =>
        Object.fromEntries(Object.entries(s).filter(([_, v]) => v !== undefined)),
      ) as JornadaReservas['slots']
    }
    await setDoc(doc(db, C.jornadas, jornada.id), sanitized)
    localStore.saveJornadaReservas(sanitized)
  },

  async deleteJornadaReservas(id: string): Promise<void> {
    await deleteDoc(doc(db, C.jornadas, id))
    localStore.deleteJornadaReservas(id)
  },

  async getOpcionesCliente(): Promise<OpcionCliente[]> {
    try {
      const ref = doc(db, C.opcionesCliente, 'config')
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const opciones = snap.data().opciones as OpcionCliente[]
        localStore.saveOpcionesCliente(opciones)
        return opciones
      }
    } catch {}
    return localStore.getOpcionesCliente()
  },

  async getOpcionesClienteRemota(): Promise<OpcionCliente[]> {
    try {
      const ref = doc(db, C.opcionesCliente, 'config')
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const opciones = snap.data().opciones as OpcionCliente[]
        localStore.saveOpcionesCliente(opciones)
        return opciones
      }
    } catch {}
    return localStore.getOpcionesCliente()
  },

  async saveOpcionesCliente(opciones: OpcionCliente[]): Promise<void> {
    const sanitized = opciones.map((o) =>
      Object.fromEntries(Object.entries(o).filter(([_, v]) => v !== undefined)),
    )
    localStore.saveOpcionesCliente(sanitized as OpcionCliente[])
    try {
      await setDoc(doc(db, C.opcionesCliente, 'config'), { opciones: sanitized })
    } catch (e) {
      console.error('Error guardando opciones del cliente en Firebase:', e)
    }
  },

  async buscarCobroPorCodigoCancelacion(codigo: string): Promise<Cobro | null> {
    try {
      const q = query(
        collection(db, C.cobros),
        where('codigoCancelacion', '==', codigo),
        where('estado', '==', 'pendiente'),
      )
      const snap = await getDocs(q)

      if (!snap.empty) {
        const cobro = snap.docs[0].data() as Cobro
        return cobro
      }
      return null
    } catch (e) {
      console.error('Error buscando código de cancelación:', e)
      return null
    }
  },

  // ============================================================
  // BARBEROS
  // ============================================================

  async getBarberos(): Promise<Barbero[]> {
    try {
      const q = query(collection(db, C.barberos), orderBy('creadoEn', 'asc'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data() as Barbero)
    } catch (e) {
      console.error('Error al obtener barberos:', e)
      return []
    }
  },

  async saveBarbero(barbero: Barbero): Promise<void> {
    const sanitized = Object.fromEntries(
      Object.entries(barbero).filter(([_, v]) => v !== undefined),
    ) as Barbero
    await setDoc(doc(db, C.barberos, barbero.id), sanitized)
  },

  async deleteBarbero(id: string): Promise<void> {
    await deleteDoc(doc(db, C.barberos, id))
  },

  // === TOTAL HISTÓRICO (nunca baja) ===
  async getTotalHistorico(): Promise<TotalHistorico> {
    try {
      const docRef = doc(db, 'configuracion', 'total-historico')
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        return snap.data() as TotalHistorico
      }
      // Si no existe, crear con 0
      const inicial: TotalHistorico = {
        id: 'total-historico',
        totalAcumulado: 0,
        ultimaActualizacion: new Date().toISOString(),
      }
      await setDoc(docRef, inicial)
      return inicial
    } catch (error) {
      console.error('Error al obtener total histórico:', error)
      return {
        id: 'total-historico',
        totalAcumulado: 0,
        ultimaActualizacion: new Date().toISOString(),
      }
    }
  },

  async actualizarTotalHistorico(nuevoMonto: number): Promise<void> {
    try {
      const docRef = doc(db, 'configuracion', 'total-historico')
      const actual = await this.getTotalHistorico()
      
      const actualizado: TotalHistorico = {
        id: 'total-historico',
        totalAcumulado: actual.totalAcumulado + nuevoMonto,
        ultimaActualizacion: new Date().toISOString(),
      }
      
      await setDoc(docRef, actualizado)
    } catch (error) {
      console.error('Error al actualizar total histórico:', error)
    }
  },

  // === REDES SOCIALES ===
  async getRedesSociales(): Promise<RedesSociales> {
    try {
      const docRef = doc(db, 'configuracion', 'redes-sociales')
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        return snap.data() as RedesSociales
      }
      const inicial: RedesSociales = {
        id: 'redes-sociales',
        instagram: '',
        whatsapp: '',
        tiktok: '',
        ultimaActualizacion: new Date().toISOString(),
      }
      await setDoc(docRef, inicial)
      return inicial
    } catch (error) {
      console.error('Error al obtener redes sociales:', error)
      return {
        id: 'redes-sociales',
        instagram: '',
        whatsapp: '',
        tiktok: '',
        ultimaActualizacion: new Date().toISOString(),
      }
    }
  },

  async guardarRedesSociales(redes: RedesSociales): Promise<void> {
    try {
      const docRef = doc(db, 'configuracion', 'redes-sociales')
      const actualizado: RedesSociales = {
        ...redes,
        ultimaActualizacion: new Date().toISOString(),
      }
      await setDoc(docRef, actualizado)
    } catch (error) {
      console.error('Error al guardar redes sociales:', error)
    }
  },

  /**
   * Actualiza automáticamente las jornadas futuras cuando se modifica una plantilla
   * Preserva las reservas existentes y solo actualiza horarios y slots disponibles
   */
  async actualizarJornadasFuturasDesdePlantilla(plantilla: JornadaReservas): Promise<number> {
    try {
      console.log(`[actualizarJornadasFuturas] Iniciando actualización para plantilla día ${plantilla.diaSemana}`)
      
      const hoy = hoyISO()
      const todasJornadas = await this.getTodasJornadas()
      
      // Buscar jornadas futuras que coincidan con este día de la semana
      const jornadasAfectadas = todasJornadas.filter((j) => {
        // Debe tener el mismo día de la semana
        if (j.diaSemana !== plantilla.diaSemana) return false
        
        // Debe ser del mismo grupo (misma agenda)
        if (j.grupoId !== plantilla.grupoId && j.id !== plantilla.id) return false
        
        // Debe ser de hoy en adelante
        if (j.fecha < hoy) return false
        
        // No debe ser la plantilla misma (sin barberoId o sin fecha específica)
        if (!j.barberoId) return false
        
        return true
      })
      
      console.log(`[actualizarJornadasFuturas] Encontradas ${jornadasAfectadas.length} jornadas para actualizar`)
      
      // Actualizar cada jornada preservando reservas
      let actualizadas = 0
      for (const jornada of jornadasAfectadas) {
        try {
          const jornadaActualizada = regenerarSlotsConReservas(jornada, {
            horaInicio: plantilla.horaInicio,
            horaFin: plantilla.horaFin,
            intervaloMinutos: plantilla.intervaloMinutos,
          })
          
          await this.saveJornadaReservas(jornadaActualizada)
          actualizadas++
          console.log(`[actualizarJornadasFuturas] ✅ Actualizada jornada ${jornada.fecha}`)
        } catch (error) {
          console.error(`[actualizarJornadasFuturas] ❌ Error actualizando jornada ${jornada.fecha}:`, error)
        }
      }
      
      console.log(`[actualizarJornadasFuturas] Completado: ${actualizadas} jornadas actualizadas`)
      return actualizadas
    } catch (error) {
      console.error('[actualizarJornadasFuturas] Error general:', error)
      return 0
    }
  },

  /**
   * Actualiza el nombre de una agenda en todas sus jornadas
   */
  async actualizarNombreAgenda(grupoId: string, nuevoNombre: string): Promise<number> {
    try {
      console.log(`[actualizarNombreAgenda] Actualizando nombre de agenda ${grupoId} a "${nuevoNombre}"`)
      
      const todasJornadas = await this.getTodasJornadas()
      const jornadasDelGrupo = todasJornadas.filter(j => j.grupoId === grupoId)
      
      let actualizadas = 0
      for (const jornada of jornadasDelGrupo) {
        await this.saveJornadaReservas({
          ...jornada,
          nombreGrupo: nuevoNombre.trim()
        })
        actualizadas++
      }
      
      console.log(`[actualizarNombreAgenda] ✅ Actualizadas ${actualizadas} jornadas`)
      return actualizadas
    } catch (error) {
      console.error('[actualizarNombreAgenda] Error:', error)
      return 0
    }
  },

  /**
   * Activa o desactiva una agenda completa
   */
  async toggleEstadoAgenda(grupoId: string, activa: boolean): Promise<number> {
    try {
      console.log(`[toggleEstadoAgenda] ${activa ? 'Activando' : 'Desactivando'} agenda ${grupoId}`)
      
      const todasJornadas = await this.getTodasJornadas()
      const jornadasDelGrupo = todasJornadas.filter(j => j.grupoId === grupoId)
      
      let actualizadas = 0
      for (const jornada of jornadasDelGrupo) {
        await this.saveJornadaReservas({
          ...jornada,
          agendaActiva: activa
        })
        actualizadas++
      }
      
      console.log(`[toggleEstadoAgenda] ✅ Actualizadas ${actualizadas} jornadas`)
      return actualizadas
    } catch (error) {
      console.error('[toggleEstadoAgenda] Error:', error)
      return 0
    }
  },

  /**
   * Obtiene resumen de todas las agendas existentes
   */
  async obtenerResumenAgendas(): Promise<Array<{
    grupoId: string
    nombreGrupo: string
    diasConfigurados: number
    activa: boolean
    barberosAsignados: string[]
    creadoEn: string
  }>> {
    try {
      const todasJornadas = await this.getTodasJornadas()
      const barberos = await this.getBarberos()
      
      // Agrupar plantillas por grupoId
      const grupos = new Map<string, JornadaReservas[]>()
      
      todasJornadas
        .filter(j => !j.barberoId && j.grupoId) // Solo plantillas con grupoId
        .forEach(j => {
          const key = j.grupoId!
          if (!grupos.has(key)) grupos.set(key, [])
          grupos.get(key)!.push(j)
        })
      
      // Crear resumen de cada grupo
      const resumen: Array<any> = []
      
      grupos.forEach((jornadas, grupoId) => {
        const primera = jornadas[0]
        const barberosConAgenda = barberos
          .filter(b => b.agendaId === grupoId)
          .map(b => b.id)
        
        // Ordenar por creadoEn más reciente
        jornadas.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''))
        
        resumen.push({
          grupoId,
          nombreGrupo: primera.nombreGrupo || 'Sin nombre',
          diasConfigurados: jornadas.length,
          activa: primera.agendaActiva !== false,
          barberosAsignados: barberosConAgenda,
          creadoEn: primera.creadoEn || new Date().toISOString()
        })
      })
      
      // Ordenar por fecha de creación (más recientes primero)
      resumen.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      
      return resumen
    } catch (error) {
      console.error('[obtenerResumenAgendas] Error:', error)
      return []
    }
  },
}
