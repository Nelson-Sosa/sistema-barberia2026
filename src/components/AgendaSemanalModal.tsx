import { Lock, Unlock, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Barbero, JornadaReservas, TurnoSlot } from '../lib/types'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

export function AgendaSemanalModal({
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
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null) // 0=Dom, 1=Lun, etc.
  const [jornadas, setJornadas] = useState<JornadaReservas[]>([])
  const [jornadaDia, setJornadaDia] = useState<JornadaReservas | null>(null)
  
  // Estados de edición de horarios
  const [horaInicio, setHoraInicio] = useState('12:00')
  const [horaFin, setHoraFin] = useState('22:00')
  const [intervaloMinutos, setIntervaloMinutos] = useState(60)
  const [guardando, setGuardando] = useState(false)
  
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Nombres de días de la semana
  const nombresDias = [
    { nombre: 'Lunes', corto: 'Lun', diaSemana: 1 },
    { nombre: 'Martes', corto: 'Mar', diaSemana: 2 },
    { nombre: 'Miércoles', corto: 'Mié', diaSemana: 3 },
    { nombre: 'Jueves', corto: 'Jue', diaSemana: 4 },
    { nombre: 'Viernes', corto: 'Vie', diaSemana: 5 },
    { nombre: 'Sábado', corto: 'Sáb', diaSemana: 6 },
    { nombre: 'Domingo', corto: 'Dom', diaSemana: 0 },
  ]

  // Cargar jornadas
  const cargarJornadas = async () => {
    try {
      const todas = await api.getTodasJornadas()
      
      // Determinar el grupoId único que debería buscar este barbero
      const grupoIdBuscado = barberoInfo ? `agenda-${barberoInfo.id}` : undefined
      
      console.log('📥 Cargando jornadas en AgendaSemanalModal')
      console.log('🔍 GrupoId buscado:', grupoIdBuscado)
      console.log('👤 BarberoInfo:', barberoInfo ? { id: barberoInfo.id, nombre: barberoInfo.nombre } : 'Sin barbero (admin)')
      
      // Si es barbero específico, filtrar sus plantillas
      let filtradas = todas
      if (barberoInfo) {
        // Filtrar plantillas del barbero (sin barberoId, con su grupoId específico)
        filtradas = todas.filter((j) => 
          !j.barberoId && j.grupoId === grupoIdBuscado
        )
        console.log('✅ Plantillas filtradas para barbero:', filtradas.length)
      } else {
        // Admin ve plantillas globales (sin barberoId, sin grupoId específico de barbero)
        filtradas = todas.filter((j) => 
          !j.barberoId && !j.grupoId?.startsWith('agenda-')
        )
        console.log('✅ Plantillas globales (admin):', filtradas.length)
      }
      
      setJornadas(filtradas)
    } catch (e) {
      console.error('Error cargando jornadas:', e)
    }
  }

  useEffect(() => {
    if (!open) return
    cargarJornadas()
    
    // Auto-refresh cada 1 segundo para actualizaciones casi instantáneas
    refreshRef.current = setInterval(cargarJornadas, 1000)
    
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [open, barberoInfo])

  // Cuando se selecciona un día de la semana (solo al cambiar de día)
  useEffect(() => {
    if (diaSeleccionado === null) {
      setJornadaDia(null)
      setHoraInicio('12:00')
      setHoraFin('22:00')
      setIntervaloMinutos(60)
      return
    }
    
    // Buscar plantilla de ese día de la semana
    const jornada = jornadas.find((j) => j.diaSemana === diaSeleccionado)
    
    if (jornada) {
      setJornadaDia(jornada)
      setHoraInicio(jornada.horaInicio)
      setHoraFin(jornada.horaFin)
      setIntervaloMinutos(jornada.intervaloMinutos)
    } else {
      // No hay plantilla para este día
      setJornadaDia(null)
      setHoraInicio('12:00')
      setHoraFin('22:00')
      setIntervaloMinutos(60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaSeleccionado]) // Solo cuando cambia el día seleccionado

  // Actualizar jornadaDia cuando se actualizan las jornadas (sin tocar los inputs)
  useEffect(() => {
    if (diaSeleccionado === null) return
    
    const jornada = jornadas.find((j) => j.diaSemana === diaSeleccionado)
    if (jornada) {
      setJornadaDia(jornada)
    }
  }, [jornadas, diaSeleccionado])

  // Guardar/actualizar plantilla del día de la semana
  const guardarHorarios = async () => {
    if (diaSeleccionado === null) return
    
    setGuardando(true)
    try {
      // Generar slots preservando bloqueos y reservas existentes
      const slotsExistentes = jornadaDia?.slots || []
      const slots = generarSlotsVacios(horaInicio, horaFin, intervaloMinutos)
      
      // Preservar bloqueos y reservas de los slots existentes
      const slotsConEstados = slots.map((nuevoSlot) => {
        const slotExistente = slotsExistentes.find(
          (s) => s.horaInicio === nuevoSlot.horaInicio && s.horaFin === nuevoSlot.horaFin
        )
        
        if (slotExistente && (slotExistente.estado === 'bloqueado' || slotExistente.estado === 'reservado')) {
          // Preservar slot bloqueado o reservado
          return slotExistente
        }
        
        return nuevoSlot
      })
      
      let plantillaGuardada: JornadaReservas
      
      // Determinar el grupoId único para este barbero (si es barbero específico)
      const grupoIdUnico = barberoInfo 
        ? `agenda-${barberoInfo.id}` // ✅ Grupo único por barbero
        : 'agenda-principal' // Agenda global para admin
      
      console.log('💾 Guardando plantilla con grupoId:', grupoIdUnico)
      console.log('👤 BarberoInfo:', barberoInfo ? { id: barberoInfo.id, nombre: barberoInfo.nombre } : 'Sin barbero (admin)')
      
      if (jornadaDia) {
        // Actualizar plantilla existente
        const actualizada: JornadaReservas = {
          ...jornadaDia,
          horaInicio,
          horaFin,
          intervaloMinutos,
          slots: slotsConEstados,
        }
        
        await api.saveJornadaReservas(actualizada)
        plantillaGuardada = actualizada
      } else {
        // Crear nueva plantilla
        const nueva: JornadaReservas = {
          id: crypto.randomUUID(),
          grupoId: grupoIdUnico, // ✅ Grupo único por barbero
          nombreGrupo: barberoInfo ? `Agenda de ${barberoInfo.nombre}` : 'Agenda Principal',
          barberoId: undefined, // Sin barberoId = plantilla
          diaSemana: diaSeleccionado,
          fecha: '', // Plantillas no tienen fecha específica
          horaInicio,
          horaFin,
          intervaloMinutos,
          permitirReservaPublica: true,
          whatsappBarbero: barberoInfo?.whatsapp || '',
          mensajeWhatsapp: barberoInfo?.mensajeWhatsapp || '',
          slots: slotsConEstados,
          creadoEn: new Date().toISOString(),
          configurado: true,
          whatsappConfigurado: false,
        }
        
        await api.saveJornadaReservas(nueva)
        plantillaGuardada = nueva
      }
      
      // Actualizar automáticamente jornadas futuras
      if (barberoInfo) {
        console.log(`🔄 Actualizando jornadas futuras de ${barberoInfo.nombre}...`)
      } else {
        console.log('🔄 Actualizando jornadas futuras (plantilla global)...')
      }
      
      const jornadasActualizadas = await api.actualizarJornadasFuturasDesdePlantilla(plantillaGuardada)
      
      await cargarJornadas()
      
      const nombreBarbero = barberoInfo ? ` de ${barberoInfo.nombre}` : ''
      if (jornadasActualizadas > 0) {
        alert(`✅ Horarios${nombreBarbero} actualizados. Se regeneraron ${jornadasActualizadas} jornada(s) futura(s).`)
      } else {
        alert(`✅ Horarios${nombreBarbero} actualizados correctamente.`)
      }
    } catch (e) {
      console.error('Error guardando plantilla:', e)
      alert('Error al guardar plantilla')
    } finally {
      setGuardando(false)
    }
  }

  // Generar slots vacíos
  function generarSlotsVacios(inicio: string, fin: string, intervalo: number): any[] {
    const slots: any[] = []
    const [horaIni, minIni] = inicio.split(':').map(Number)
    const [horaFn, minFn] = fin.split(':').map(Number)
    
    let minutosActuales = horaIni * 60 + minIni
    const minutosFinales = horaFn * 60 + minFn
    
    while (minutosActuales < minutosFinales) {
      const siguientesMinutos = minutosActuales + intervalo
      
      const horaInicioSlot = Math.floor(minutosActuales / 60)
      const minInicioSlot = minutosActuales % 60
      const horaFinSlot = Math.floor(siguientesMinutos / 60)
      const minFinSlot = siguientesMinutos % 60
      
      slots.push({
        id: crypto.randomUUID(),
        horaInicio: `${String(horaInicioSlot).padStart(2, '0')}:${String(minInicioSlot).padStart(2, '0')}`,
        horaFin: `${String(horaFinSlot).padStart(2, '0')}:${String(minFinSlot).padStart(2, '0')}`,
        estado: 'disponible',
      })
      
      minutosActuales = siguientesMinutos
    }
    
    return slots
  }

  // Bloquear/desbloquear slot individual
  const toggleBloqueoSlot = async (slot: TurnoSlot) => {
    if (!jornadaDia) return
    if (soloLectura) return
    
    const nuevosSlots = jornadaDia.slots.map((s) => {
      if (s.id === slot.id) {
        return {
          ...s,
          estado: s.estado === 'bloqueado' ? 'disponible' : 'bloqueado',
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
  }

  // Bloquear TODOS los slots
  const bloquearTodos = async () => {
    if (!jornadaDia) return
    if (soloLectura) return
    
    if (!confirm('¿Bloquear TODOS los turnos de este día?')) return
    
    const nuevosSlots = jornadaDia.slots.map((s) => ({
      ...s,
      estado: s.estado === 'reservado' ? 'reservado' : 'bloqueado',
    } as TurnoSlot))
    
    const actualizada: JornadaReservas = {
      ...jornadaDia,
      slots: nuevosSlots,
    }
    
    await api.saveJornadaReservas(actualizada)
    await cargarJornadas()
  }

  // Desbloquear TODOS los slots
  const desbloquearTodos = async () => {
    if (!jornadaDia) return
    if (soloLectura) return
    
    if (!confirm('¿Desbloquear TODOS los turnos bloqueados de este día?')) return
    
    const nuevosSlots = jornadaDia.slots.map((s) => ({
      ...s,
      estado: s.estado === 'bloqueado' ? 'disponible' : s.estado,
    } as TurnoSlot))
    
    const actualizada: JornadaReservas = {
      ...jornadaDia,
      slots: nuevosSlots,
    }
    
    await api.saveJornadaReservas(actualizada)
    await cargarJornadas()
  }

  // Liberar turno (eliminar reserva)
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

  const libresDelDia = jornadaDia?.slots.filter((s) => s.estado === 'disponible').length || 0
  const reservadosDelDia = jornadaDia?.slots.filter((s) => s.estado === 'reservado').length || 0
  const bloqueadosDelDia = jornadaDia?.slots.filter((s) => s.estado === 'bloqueado').length || 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={barberoInfo ? `📅 Agenda de ${barberoInfo.nombre}` : '📅 Gestión de Agenda'}
    >
      <div className="space-y-4">
        {/* DÍAS DE LA SEMANA - HORIZONTAL */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {nombresDias.map((dia) => {
            const esSeleccionado = diaSeleccionado === dia.diaSemana
            
            return (
              <button
                key={dia.diaSemana}
                onClick={() => setDiaSeleccionado(dia.diaSemana)}
                className={`flex-1 min-w-[80px] shrink-0 flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all ${
                  esSeleccionado
                    ? 'border-barber-500 bg-barber-500/25 ring-2 ring-barber-500 text-white shadow-lg'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-xs font-extrabold">{dia.nombre}</span>
              </button>
            )
          })}
        </div>

        {/* CONTENIDO DEL DÍA SELECCIONADO */}
        {diaSeleccionado !== null && (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
            <h3 className="text-sm font-bold text-white text-center">
              {nombresDias.find((d) => d.diaSemana === diaSeleccionado)?.nombre}
            </h3>

            {/* CONFIGURACIÓN DE HORARIOS (SIEMPRE VISIBLE - COMPACTA) */}
            {!soloLectura && (
              <div className="space-y-2 rounded-lg border border-barber-500/30 bg-barber-500/5 p-2">
                <p className="text-[11px] font-semibold text-barber-300">Configurar horario de este día</p>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-300 mb-0.5">Desde</label>
                    <input
                      type="time"
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:border-barber-500 focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-medium text-slate-300 mb-0.5">Hasta</label>
                    <input
                      type="time"
                      value={horaFin}
                      onChange={(e) => setHoraFin(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:border-barber-500 focus:outline-none"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-[10px] font-medium text-slate-300 mb-0.5">Duración del turno (minutos)</label>
                  <div className="flex gap-1">
                    {[30, 45, 60, 90].map((min) => (
                      <button
                        key={min}
                        onClick={() => setIntervaloMinutos(min)}
                        className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                          intervaloMinutos === min
                            ? 'bg-barber-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input manual de minutos */}
                <div>
                  <label className="block text-[10px] font-medium text-slate-300 mb-0.5">O ingresá manualmente:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={intervaloMinutos}
                      onChange={(e) => setIntervaloMinutos(Number(e.target.value))}
                      min="1"
                      max="240"
                      className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:border-barber-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400">minutos</span>
                  </div>
                </div>
                
                <Button
                  onClick={guardarHorarios}
                  disabled={guardando}
                  className="w-full py-1.5 text-xs"
                >
                  {guardando ? 'Guardando...' : 'Actualizar / Aplicar Horarios'}
                </Button>
              </div>
            )}

            {/* CUADRITOS DE SLOTS EN GRID */}
            {jornadaDia && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-bold">{libresDelDia} disponibles</span>
                  <span className="text-red-400 font-bold">{reservadosDelDia} reservados</span>
                  {bloqueadosDelDia > 0 && (
                    <span className="text-slate-400 font-bold">{bloqueadosDelDia} bloqueados</span>
                  )}
                </div>

                {/* Botones para bloquear/desbloquear TODOS */}
                {!soloLectura && (
                  <div className="flex gap-2">
                    <button
                      onClick={bloquearTodos}
                      className="flex-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600 transition-colors flex items-center justify-center gap-1"
                    >
                      <Lock size={12} />
                      Bloquear Todos
                    </button>
                    <button
                      onClick={desbloquearTodos}
                      className="flex-1 rounded-lg bg-barber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-barber-600 transition-colors flex items-center justify-center gap-1"
                    >
                      <Unlock size={12} />
                      Desbloquear Todos
                    </button>
                  </div>
                )}
                
                {/* GRID DE SLOTS (como antes - 3 columnas) */}
                <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                  {jornadaDia.slots.map((slot) => {
                    const esDisponible = slot.estado === 'disponible'
                    const esReservado = slot.estado === 'reservado'
                    const esBloqueado = slot.estado === 'bloqueado'
                    
                    return (
                      <div
                        key={slot.id}
                        className={`rounded-xl border p-3 space-y-2 ${
                          esReservado
                            ? 'border-red-500/30 bg-red-500/10'
                            : esBloqueado
                            ? 'border-slate-700 bg-slate-800/50'
                            : 'border-emerald-500/30 bg-emerald-500/10'
                        }`}
                      >
                        {/* Hora del slot */}
                        <div className="text-center">
                          <p className={`text-sm font-bold ${
                            esReservado ? 'text-red-300' : esBloqueado ? 'text-slate-500' : 'text-emerald-300'
                          }`}>
                            {slot.horaInicio}
                          </p>
                          <p className={`text-xs ${
                            esReservado ? 'text-red-400' : esBloqueado ? 'text-slate-600' : 'text-emerald-400'
                          }`}>
                            {slot.horaFin}
                          </p>
                        </div>

                        {/* Info de reserva */}
                        {esReservado && slot.clienteNombre && (
                          <div className="text-center border-t border-red-500/20 pt-2">
                            <p className="text-[10px] font-semibold text-white truncate">{slot.clienteNombre}</p>
                            {slot.opcionNombre && (
                              <p className="text-[9px] text-slate-400 truncate">{slot.opcionNombre}</p>
                            )}
                          </div>
                        )}

                        {/* Botones */}
                        {!soloLectura && (
                          <div className="flex flex-col gap-1">
                            {esDisponible && (
                              <button
                                onClick={() => toggleBloqueoSlot(slot)}
                                className="w-full rounded-lg bg-slate-700/50 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-600 transition-colors flex items-center justify-center gap-1"
                              >
                                <Lock size={10} />
                                Bloquear
                              </button>
                            )}
                            
                            {esBloqueado && (
                              <button
                                onClick={() => toggleBloqueoSlot(slot)}
                                className="w-full rounded-lg bg-barber-500/20 px-2 py-1 text-[10px] font-bold text-barber-300 hover:bg-barber-500/30 transition-colors flex items-center justify-center gap-1"
                              >
                                <Unlock size={10} />
                                Desbloquear
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
              </div>
            )}
          </div>
        )}
        
        {diaSeleccionado === null && (
          <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center">
            <p className="text-sm text-slate-300 font-medium">Seleccioná un día de la semana</p>
            <p className="text-xs text-slate-500 mt-1">para configurar su plantilla de horarios</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
