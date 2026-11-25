import { Calendar, Check, Edit2, Trash2, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { api } from '../lib/api'
import type { Barbero } from '../lib/types'

interface ResumenAgenda {
  grupoId: string
  nombreGrupo: string
  diasConfigurados: number
  activa: boolean
  barberosAsignados: string[]
  creadoEn: string
}

export function GestionAgendas() {
  const navigate = useNavigate()
  const [agendas, setAgendas] = useState<ResumenAgenda[]>([])
  const [barberos, setBarberos] = useState<Barbero[]>([])
  const [cargando, setCargando] = useState(true)
  
  // Modal de edición de nombre
  const [agendaEditando, setAgendaEditando] = useState<ResumenAgenda | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargarDatos = async () => {
    setCargando(true)
    try {
      const [resumenAgendas, listaBarberos] = await Promise.all([
        api.obtenerResumenAgendas(),
        api.getBarberos()
      ])
      setAgendas(resumenAgendas)
      setBarberos(listaBarberos)
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const abrirEdicion = (agenda: ResumenAgenda) => {
    setAgendaEditando(agenda)
    setNuevoNombre(agenda.nombreGrupo)
  }

  const cerrarEdicion = () => {
    setAgendaEditando(null)
    setNuevoNombre('')
  }

  const guardarNombre = async () => {
    if (!agendaEditando || !nuevoNombre.trim()) return
    
    // Validar nombre duplicado
    const nombreExiste = agendas.some(
      a => a.grupoId !== agendaEditando.grupoId && 
           a.nombreGrupo.toLowerCase() === nuevoNombre.trim().toLowerCase()
    )
    
    if (nombreExiste) {
      alert('Ya existe una agenda con este nombre. Elegí otro nombre.')
      return
    }
    
    setGuardando(true)
    try {
      await api.actualizarNombreAgenda(agendaEditando.grupoId, nuevoNombre.trim())
      await cargarDatos()
      cerrarEdicion()
      alert('✅ Nombre actualizado correctamente')
    } catch (error) {
      console.error('Error actualizando nombre:', error)
      alert('Error al actualizar el nombre. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const toggleEstado = async (agenda: ResumenAgenda) => {
    const nuevoEstado = !agenda.activa
    const mensaje = nuevoEstado 
      ? `¿Activar la agenda "${agenda.nombreGrupo}"?`
      : `¿Desactivar la agenda "${agenda.nombreGrupo}"? Los barberos asignados no podrán usarla hasta que la actives nuevamente.`
    
    if (!confirm(mensaje)) return
    
    try {
      await api.toggleEstadoAgenda(agenda.grupoId, nuevoEstado)
      await cargarDatos()
      alert(`✅ Agenda ${nuevoEstado ? 'activada' : 'desactivada'} correctamente`)
    } catch (error) {
      console.error('Error cambiando estado:', error)
      alert('Error al cambiar el estado. Intentá de nuevo.')
    }
  }

  const eliminarAgenda = async (agenda: ResumenAgenda) => {
    const mensaje = agenda.barberosAsignados.length > 0
      ? `La agenda "${agenda.nombreGrupo}" tiene ${agenda.barberosAsignados.length} barbero(s) asignado(s). ¿Eliminar de todas formas?`
      : `¿Eliminar la agenda "${agenda.nombreGrupo}"?`
    
    if (!confirm(mensaje)) return
    
    try {
      const todasJornadas = await api.getTodasJornadas()
      const jornadasAEliminar = todasJornadas.filter(j => j.grupoId === agenda.grupoId)
      
      await Promise.all(jornadasAEliminar.map(j => api.deleteJornadaReservas(j.id)))
      await cargarDatos()
      alert('✅ Agenda eliminada correctamente')
    } catch (error) {
      console.error('Error eliminando agenda:', error)
      alert('Error al eliminar la agenda. Intentá de nuevo.')
    }
  }

  const obtenerNombresBarberos = (ids: string[]): string => {
    if (ids.length === 0) return 'Sin asignar'
    return ids
      .map(id => barberos.find(b => b.id === id)?.nombre || 'Desconocido')
      .join(', ')
  }

  const irACrearAgenda = () => {
    navigate('/planes?tab=reservas')
  }

  return (
    <Layout 
      title="Gestión de Agendas"
      action={
        <Button size="sm" onClick={irACrearAgenda}>
          <Calendar size={16} className="mr-1" /> Nueva Agenda
        </Button>
      }
    >
      <p className="mb-4 text-xs text-slate-400">
        Administrá todas las agendas de horarios. Podés crear múltiples agendas con diferentes configuraciones
        y asignarlas a los barberos.
      </p>

      {cargando ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-barber-500 border-t-transparent" />
        </div>
      ) : agendas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
          <Calendar size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-medium text-slate-300">No hay agendas creadas</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Creá tu primera agenda con los horarios de atención de la barbería
          </p>
          <Button size="sm" onClick={irACrearAgenda}>
            <Calendar size={16} className="mr-1" /> Crear Primera Agenda
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {agendas.map((agenda) => (
            <div
              key={agenda.grupoId}
              className={`rounded-2xl border p-4 transition-all ${
                agenda.activa
                  ? 'border-slate-800 bg-slate-900'
                  : 'border-slate-800/50 bg-slate-900/50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-white truncate">
                      📅 {agenda.nombreGrupo}
                    </h3>
                    {!agenda.activa && (
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        INACTIVA
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Calendar size={14} className="shrink-0" />
                      <span>
                        {agenda.diasConfigurados} día{agenda.diasConfigurados !== 1 ? 's' : ''} configurado{agenda.diasConfigurados !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      <Users size={14} className="shrink-0" />
                      <span className="truncate">
                        {agenda.barberosAsignados.length > 0 ? (
                          <>
                            {agenda.barberosAsignados.length} barbero{agenda.barberosAsignados.length !== 1 ? 's' : ''}: {obtenerNombresBarberos(agenda.barberosAsignados)}
                          </>
                        ) : (
                          <span className="text-slate-500 italic">Sin barberos asignados</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => abrirEdicion(agenda)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                    title="Editar nombre"
                  >
                    <Edit2 size={16} />
                  </button>

                  <button
                    onClick={() => toggleEstado(agenda)}
                    className={`rounded-lg p-2 transition-colors ${
                      agenda.activa
                        ? 'text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-slate-500 hover:bg-slate-800'
                    }`}
                    title={agenda.activa ? 'Desactivar' : 'Activar'}
                  >
                    {agenda.activa ? <Check size={16} /> : <X size={16} />}
                  </button>

                  <button
                    onClick={() => eliminarAgenda(agenda)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Edición de Nombre */}
      {agendaEditando && (
        <Modal
          open={!!agendaEditando}
          onClose={cerrarEdicion}
          title="Editar Nombre de Agenda"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Nombre actual:
              </label>
              <p className="text-sm font-medium text-slate-300">
                "{agendaEditando.nombreGrupo}"
              </p>
            </div>

            <Input
              label="Nuevo nombre"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej: Horario de Verano"
              required
            />

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={cerrarEdicion}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={guardarNombre}
                disabled={!nuevoNombre.trim() || guardando}
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  )
}
