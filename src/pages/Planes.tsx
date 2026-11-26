import { ArrowLeft, CalendarPlus, Clock, Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { addMonths, format, parseISO } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { PlanCard } from '../components/PlanCard'
import { PlanForm } from '../components/PlanForm'
import { ReservasModal } from '../components/ReservasModal'
import { AgendaSemanalModal } from '../components/AgendaSemanalModal'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { SearchInput } from '../components/ui/SearchInput'
import { Pagination } from '../components/ui/Pagination'
import { useBarberData } from '../hooks/useBarberData'
import { usePagination } from '../hooks/usePagination'
import { api } from '../lib/api'
import { crearCobroDesdePlan } from '../lib/cobros'
import { formatearMoneda, hoyISO, planEstaActivo, planSinDuracion } from '../lib/dates'
import { agruparJornadas, type GrupoJornada, obtenerNombreDiaConFecha } from '../lib/reservasUtils'
import type { Cobro, JornadaReservas, OpcionCliente, Plan, PlanConCliente, PlanTipoConfig, TurnoSlot, Barbero } from '../lib/types'

function formatearNumero(val: string): string {
  const num = val.replace(/\D/g, '')
  if (!num) return ''
  return Number(num).toLocaleString('es-PY')
}

function parsearNumero(val: string): number {
  return parseFloat(val.replace(/\./g, '').replace(/,/g, '')) || 0
}

export function Planes() {
  const { clientes, planes, cobros, planTipos, opcionesCliente, loading, refresh, saveCliente, savePlan, deletePlan, saveCobro, savePlanTipos, saveOpcionesCliente } = useBarberData()
  const [searchParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const busquedaDiferida = useDeferredValue(busqueda)
  const [modalOpen, setModalOpen] = useState(false)
  const [reservasModalOpen, setReservasModalOpen] = useState(false)
  const [agendaSemanalModalOpen, setAgendaSemanalModalOpen] = useState(false)
  const [barberoParaConfigurar, setBarberoParaConfigurar] = useState<Barbero | undefined>(undefined)

  // ⚠️ FUNCIONALIDAD DE PLANES DESHABILITADA
  // La pestaña "Planes activos" está oculta para simplificar la interfaz
  // Para rehabilitarla, descomentar la línea siguiente y cambiar el valor inicial
  // const tabParam = searchParams.get('tab')
  const [filtroTab, setFiltroTab] = useState<'activos' | 'reservas'>(
    'reservas' // Forzar siempre a 'reservas'
  )
  const [refreshTick, setRefreshTick] = useState(0)

  const [nuevaOpcionNombre, setNuevaOpcionNombre] = useState('')
  const [nuevaOpcionPrecio, setNuevaOpcionPrecio] = useState('')

  const handleAgregarOpcionCliente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevaOpcionNombre.trim()) return
    const precioNum = parsearNumero(nuevaOpcionPrecio)
    const nuevaOpcion: OpcionCliente = {
      id: crypto.randomUUID(),
      nombre: nuevaOpcionNombre.trim(),
      precio: precioNum,
    }
    const nuevas = [...opcionesCliente, nuevaOpcion]
    await saveOpcionesCliente(nuevas)
    setNuevaOpcionNombre('')
    setNuevaOpcionPrecio('')
  }

  const handleEliminarOpcionCliente = async (id: string) => {
    const nuevas = opcionesCliente.filter((o) => o.id !== id)
    await saveOpcionesCliente(nuevas)
  }

  const [editando, setEditando] = useState<Plan | null>(null)
  const [vistaConfig, setVistaConfig] = useState(false)
  const [editandoTipo, setEditandoTipo] = useState<PlanTipoConfig | null>(null)
  const [tipoNombre, setTipoNombre] = useState('')
  const [tipoMonto, setTipoMonto] = useState('')
  const [tieneDuracion, setTieneDuracion] = useState(false)
  const [tipoFechaInicio, setTipoFechaInicio] = useState(hoyISO())
  const [tipoFechaFin, setTipoFechaFin] = useState(() =>
    format(addMonths(parseISO(hoyISO()), 1), 'yyyy-MM-dd'),
  )
  const [creandoTipo, setCreandoTipo] = useState(false)

  const [jornadasReservas, setJornadasReservas] = useState<JornadaReservas[]>([])
  
  // Estados para configuración de redes sociales
  const [redesSociales, setRedesSociales] = useState({ instagram: '', whatsapp: '', tiktok: '' })
  const [guardandoRedes, setGuardandoRedes] = useState(false)
  const [modalRedesOpen, setModalRedesOpen] = useState(false)

  // Cargar redes sociales existentes
  useEffect(() => {
    api.getRedesSociales().then((redes) => {
      if (redes) {
        setRedesSociales({
          instagram: redes.instagram || '',
          whatsapp: redes.whatsapp || '',
          tiktok: redes.tiktok || '',
        })
      }
    })
  }, [])

  // Activar automáticamente el tab de "reservas" cuando viene desde la URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'reservas') {
      setFiltroTab('reservas')
    }
  }, [searchParams])

  useEffect(() => {
    const cargarJornadasYBarberos = async () => {
      const [todas, barberos] = await Promise.all([
        api.getTodasJornadas(),
        api.getBarberos()
      ])
      
      // Filtrar solo plantillas (jornadas sin barberoId)
      const plantillas = todas.filter((j) => !j.barberoId)
      
      // ✅ CAMBIO: Filtrar solo las agendas que pertenecen a barberos (formato: agenda-{barberoId})
      // Excluir agendas globales antiguas que no tienen un barbero asignado
      const agendasDeBarberos = plantillas.filter((j) => {
        if (!j.grupoId) return false
        
        // Verificar si el grupoId tiene el formato agenda-{id}
        if (j.grupoId.startsWith('agenda-')) {
          const barberoId = j.grupoId.replace('agenda-', '')
          // Verificar que existe un barbero con ese ID
          return barberos.some(b => b.id === barberoId)
        }
        
        return false
      })
      
      console.log('📅 Total plantillas:', plantillas.length)
      console.log('📅 Agendas de barberos (independientes):', agendasDeBarberos.length)
      console.log('👥 Barberos activos:', barberos.length)
      
      const ordenadas = agendasDeBarberos.sort((a, b) => {
        if (a.creadoEn && b.creadoEn) {
          return b.creadoEn.localeCompare(a.creadoEn)
        }
        return b.fecha.localeCompare(a.fecha)
      })
      setJornadasReservas(ordenadas)
    }
    
    cargarJornadasYBarberos()
  }, [reservasModalOpen, filtroTab, refreshTick])

  const gruposJornadas = useMemo(() => agruparJornadas(jornadasReservas), [jornadasReservas])

  const planesConCliente = useMemo<PlanConCliente[]>(
    () =>
      planes.map((p) => ({
        ...p,
        cliente: clientes.find((c) => c.id === p.clienteId),
      })),
    [planes, clientes],
  )

  // ⚠️ VARIABLE DESHABILITADA (alertas de planes por vencer)
  // Para rehabilitar, descomentar las siguientes líneas:
  /*
  const alertas = planesConCliente.filter((p) => {
    const tipoConfig = planTipos.find((t) => t.id === p.tipo)
    const sinDuracion = tipoConfig !== undefined ? tipoConfig.duracion === null : planSinDuracion(p)
    if (sinDuracion) return false
    return planEstaActivo(p) && (planVenceHoy(p) || planPorVencer(p, 3))
  })
  */

  const filtrados = useMemo(() => {
    const list = planesConCliente.filter((p) => {
      const tipoConfig = planTipos.find((t) => t.id === p.tipo)
      const sinDuracion = tipoConfig !== undefined ? tipoConfig.duracion === null : planSinDuracion(p)
      if (sinDuracion) {
        return cobros.some((c) => c.planId === p.id && c.estado === 'pendiente')
      }
      return planEstaActivo(p)
    })
    const q = busquedaDiferida.toLowerCase().trim()
    if (!q) return list
    return list.filter((p) => {
      const nombre = `${p.cliente?.nombre ?? ''} ${p.cliente?.apellido ?? ''}`.toLowerCase()
      return nombre.includes(q)
    })
  }, [planesConCliente, busquedaDiferida, planTipos, cobros])

  const { paginated, page, setPage, totalPages, total, pageSize } = usePagination(filtrados)

  const eliminarGrupoJornada = async (grupo: GrupoJornada) => {
    const totalReservados = grupo.jornadas.reduce(
      (acc, j) => acc + j.slots.filter((s) => s.estado === 'reservado').length,
      0,
    )
    const msg =
      totalReservados > 0
        ? `Esta agenda "${grupo.nombreGrupo}" contiene ${totalReservados} turno(s) reservado(s). ¿Eliminar toda la agenda?`
        : `¿Eliminar la agenda "${grupo.nombreGrupo}"?`
    if (!confirm(msg)) return
    
    try {
      // 1. Obtener TODAS las jornadas de Firestore para asegurar que no perdemos ninguna
      const todasLasJornadas = await api.getTodasJornadas()
      
      // 2. Encontrar TODAS las jornadas relacionadas con este grupo:
      //    - Las plantillas originales (sin barberoId, con este grupoId)
      //    - Las clonadas (con barberoId, con este grupoId)
      //    - Las que tienen el mismo nombreGrupo (por si quedaron inconsistencias)
      const jornadasAEliminar = todasLasJornadas.filter((j) => {
        return (
          (j.grupoId === grupo.grupoId) ||
          (j.nombreGrupo === grupo.nombreGrupo) ||
          (j.id === grupo.grupoId)
        )
      })
      
      if (jornadasAEliminar.length > 0) {
        console.log(`🗑️ Eliminando ${jornadasAEliminar.length} jornada(s) del grupo "${grupo.nombreGrupo}"...`)
        // Eliminar todas en paralelo
        await Promise.all(jornadasAEliminar.map((j) => api.deleteJornadaReservas(j.id)))
        console.log(`✅ Grupo "${grupo.nombreGrupo}" eliminado completamente`)
      }
      
      // 3. Actualizar estados locales
      setJornadasReservas((prev) => 
        prev.filter((j) => !jornadasAEliminar.find((eliminada) => eliminada.id === j.id))
      )
      
      alert(`Agenda "${grupo.nombreGrupo}" eliminada exitosamente.`)
    } catch (e) {
      console.error('Error al eliminar grupo de jornadas:', e)
      alert('Error al eliminar la agenda. Intentá de nuevo.')
    }
    
    setRefreshTick((t) => t + 1)
    refresh()
  }

  const abrirReservaDetalle = async (grupoId: string) => {
    // Identificar el barbero basándose en el grupoId (formato: agenda-{barberoId})
    if (grupoId.startsWith('agenda-')) {
      const barberoId = grupoId.replace('agenda-', '')
      
      // Buscar el barbero
      const barberos = await api.getBarberos()
      const barbero = barberos.find(b => b.id === barberoId)
      
      if (barbero) {
        console.log('📅 Abriendo configuración de agenda para:', barbero.nombre)
        setBarberoParaConfigurar(barbero)
        setAgendaSemanalModalOpen(true)
      } else {
        alert('No se encontró el barbero asociado a esta agenda.')
      }
    } else {
      // Agenda antigua sin formato correcto
      alert('Esta agenda tiene un formato antiguo. Por favor, usa el botón "Ver / Administrar" para configurarla.')
    }
  }

  const guardar = async (
    data: { id?: string; creadoEn?: string; clienteId: string; tipo: string; fechaInicio: string; fechaFin: string; monto: number; facturarAhora: boolean; cantidad?: number; hora?: string },
  ) => {
    try {
      const isNew = !data.id
      const plan: Plan = {
        id: data.id ?? crypto.randomUUID(),
        creadoEn: data.creadoEn ?? new Date().toISOString(),
        clienteId: data.clienteId,
        tipo: data.tipo,
        fechaInicio: data.fechaInicio,
        fechaFin: data.fechaFin,
        monto: data.monto,
        cantidad: data.cantidad,
        hora: data.hora,
      }
      await savePlan(plan)

      if (isNew) {
        const activoExistente = planes.find((p) => {
          if (p.clienteId !== plan.clienteId || p.id === plan.id) return false
          if (!planEstaActivo(p)) return false
          const tipoCfg = planTipos.find((t) => t.id === p.tipo)
          const sinDuracion = tipoCfg !== undefined ? tipoCfg.duracion === null : planSinDuracion(p)
          return !sinDuracion
        })
        if (activoExistente) {
          const nombre = clientes.find((c) => c.id === plan.clienteId)
          const msg = `"${nombre?.nombre ?? ''} ${nombre?.apellido ?? ''}" ya tiene un plan activo.\n¿Crear otro de todas formas?`
          if (!confirm(msg)) return
        }
        const cobro: Cobro = {
          ...crearCobroDesdePlan(plan),
        }
        if (data.facturarAhora) {
          cobro.estado = 'pagado'
          cobro.pagadoEn = new Date().toISOString()
        }
        await saveCobro(cobro)
      } else if (!isNew) {
        const pendiente = cobros.find(
          (c) => c.planId === plan.id && c.estado === 'pendiente',
        )
        if (pendiente) {
          await saveCobro({
            ...pendiente,
            monto: plan.monto,
            montoPlan: plan.monto,
          })
        }
      }

      setModalOpen(false)
      setEditando(null)
    } catch (e) {
      alert('Error al guardar el plan: ' + (e instanceof Error ? e.message : 'desconocido'))
    }
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este plan?')) return
    await deletePlan(id)
  }

  const abrirNuevoTipo = () => {
    setEditandoTipo(null)
    setTipoNombre('')
    setTipoMonto('')
    setTieneDuracion(false)
    setTipoFechaInicio(hoyISO())
    setTipoFechaFin(format(addMonths(parseISO(hoyISO()), 1), 'yyyy-MM-dd'))
    setCreandoTipo(true)
  }

  const abrirEditarTipo = (t: PlanTipoConfig) => {
    setEditandoTipo(t)
    setTipoNombre(t.nombre)
    setTipoMonto(formatearNumero(t.monto.toString()))
    setTieneDuracion(!!t.duracion)
    setTipoFechaInicio(t.fechaInicioDefault ?? hoyISO())
    setTipoFechaFin(
      t.fechaFinDefault ?? format(addMonths(parseISO(hoyISO()), 1), 'yyyy-MM-dd'),
    )
    setCreandoTipo(true)
  }

  const guardarTipo = async () => {
    if (!tipoNombre.trim()) return
    const monto = parsearNumero(tipoMonto)
    if (monto <= 0) return
    const duracion: PlanTipoConfig['duracion'] = tieneDuracion
      ? { tipo: 'meses', valor: 1 }
      : null
    let nuevos: PlanTipoConfig[]
    if (editandoTipo) {
      nuevos = planTipos.map((t) =>
        t.id === editandoTipo.id
          ? {
              ...t,
              nombre: tipoNombre.trim(),
              monto,
              duracion,
              ...(tieneDuracion ? { fechaInicioDefault: tipoFechaInicio, fechaFinDefault: tipoFechaFin } : {}),
            }
          : t,
      )
    } else {
      const id = tipoNombre.trim().toLowerCase().replace(/\s+/g, '_')
      nuevos = [
        ...planTipos,
        {
          id,
          nombre: tipoNombre.trim(),
          monto,
          duracion,
          ...(tieneDuracion ? { fechaInicioDefault: tipoFechaInicio, fechaFinDefault: tipoFechaFin } : {}),
        },
      ]
    }
    setCreandoTipo(false)
    setEditandoTipo(null)
    await savePlanTipos(nuevos)
  }

  const eliminarTipo = (id: string) => {
    if (planTipos.length <= 1) {
      alert('Debe haber al menos un tipo de plan.')
      return
    }
    if (!confirm('¿Eliminar este tipo de plan?')) return
    const nuevos = planTipos.filter((t) => t.id !== id)
    savePlanTipos(nuevos)
  }

  const formatearWhatsApp = (valor: string): string => {
    // Eliminar todo lo que no sea dígito
    const numeros = valor.replace(/\D/g, '')
    // Formatear: 0982 362 830
    if (numeros.length <= 4) return numeros
    if (numeros.length <= 7) return `${numeros.slice(0, 4)} ${numeros.slice(4)}`
    return `${numeros.slice(0, 4)} ${numeros.slice(4, 7)} ${numeros.slice(7, 10)}`
  }

  const guardarRedesSociales = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoRedes(true)
    try {
      await api.guardarRedesSociales({
        id: 'configuracion-redes',
        instagram: redesSociales.instagram.trim(),
        whatsapp: redesSociales.whatsapp.replace(/\s/g, ''), // Guardar sin espacios
        tiktok: redesSociales.tiktok.trim(),
        ultimaActualizacion: new Date().toISOString(),
      })
      alert('Redes sociales guardadas exitosamente')
      setModalRedesOpen(false)
    } catch (e) {
      alert('Error al guardar redes sociales: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setGuardandoRedes(false)
    }
  }

  if (vistaConfig) {
    return (
      <Layout
        title="Tipos de plan"
        action={
          <Button size="sm" variant="secondary" onClick={() => setVistaConfig(false)}>
            <ArrowLeft size={16} className="inline" /> Volver
          </Button>
        }
      >
        <p className="mb-4 text-xs text-slate-400">
          Definí los tipos de plan disponibles y sus montos por defecto.
        </p>

        <Button size="sm" onClick={abrirNuevoTipo} className="mb-4 w-full">
          <Plus size={16} className="inline" /> Nuevo tipo
        </Button>

        {creandoTipo && (
          <div className="mb-4 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {editandoTipo ? 'Editar tipo' : 'Nuevo tipo'}
            </p>

            <Input
              label="Nombre"
              value={tipoNombre}
              onChange={(e) => setTipoNombre(e.target.value)}
              placeholder="Ej: Mensual VIP"
              required
            />

            <Input
              label="Monto por defecto"
              value={tipoMonto}
              onChange={(e) => setTipoMonto(formatearNumero(e.target.value))}
              placeholder="Ej: 150.000"
              required
            />

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div>
                <p className="text-sm font-medium text-white">¿Tiene fecha de vencimiento?</p>
                <p className="text-xs text-slate-400">
                  {tieneDuracion
                    ? 'Es un plan periódico (ej: mensual/diario)'
                    : 'Es un servicio o paquete sin vencimiento'}
                </p>
              </div>
              <div
                onClick={() => setTieneDuracion(!tieneDuracion)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  tieneDuracion ? 'bg-barber-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    tieneDuracion ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
            </label>

            {tieneDuracion && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Input
                  label="Fecha inicio por defecto"
                  type="date"
                  value={tipoFechaInicio}
                  onChange={(e) => setTipoFechaInicio(e.target.value)}
                />
                <Input
                  label="Fecha fin por defecto"
                  type="date"
                  value={tipoFechaFin}
                  onChange={(e) => setTipoFechaFin(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setCreandoTipo(false)
                  setEditandoTipo(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={guardarTipo}
                disabled={!tipoNombre.trim() || !tipoMonto}
              >
                Guardar
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {planTipos.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm font-medium text-white">{t.nombre}</span>
              <span className="shrink-0 text-xs text-slate-500">
                {t.duracion ? 'Con duración' : 'Sin duración'}
              </span>
              <span className="shrink-0 text-sm text-barber-400">{formatearMoneda(t.monto)}</span>
              <button
                type="button"
                onClick={() => abrirEditarTipo(t)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => eliminarTipo(t.id)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      title="Agendas y Reservas"
      action={
        <div className="flex gap-1.5">
          {/* ⚠️ BOTONES DE PLANES DESHABILITADOS - Para rehabilitar, descomentar estas líneas
          <Button size="sm" variant="secondary" onClick={() => setVistaConfig(true)}>
            <Settings size={16} />
          </Button>
          <Button size="sm" onClick={() => { setEditando(null); setModalOpen(true) }}>
            <CalendarPlus size={18} className="inline" /> Nuevo plan
          </Button>
          */}
        </div>
      }
    >
      {/* ⚠️ ALERTA DE PLANES POR VENCER - DESHABILITADA
      {alertas.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle size={16} />
            <span className="text-sm font-semibold">Atención: {alertas.length} plan(es) por vencer</span>
          </div>
          <div className="mt-1 space-y-0.5">
            {alertas.slice(0, 3).map((p) => (
              <p key={p.id} className="text-xs text-amber-200/80">
                {p.cliente?.nombre} {p.cliente?.apellido} — vence {p.fechaFin}
              </p>
            ))}
          </div>
        </div>
      )}
      */}

      {/* ⚠️ PESTAÑAS DESHABILITADAS - Solo se muestra "Lista de Agendas"
      <div className="mb-4 flex rounded-xl bg-slate-900 p-1 border border-slate-800">
        <button
          type="button"
          onClick={() => setFiltroTab('activos')}
          className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
            filtroTab === 'activos'
              ? 'bg-barber-500 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Planes activos ({filtrados.length})
        </button>
        <button
          type="button"
          onClick={() => setFiltroTab('reservas')}
          className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
            filtroTab === 'reservas'
              ? 'bg-barber-500 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          📅 Lista de Agendas ({gruposJornadas.length})
        </button>
      </div>
      */}

      {/* VISTA 1: PLANES ACTIVOS - COMPLETAMENTE OCULTA */}
      {filtroTab === 'activos' && false && (
        <>
          <div className="mb-4">
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar plan por cliente..."
            />
          </div>

          {loading ? (
            <p className="text-center text-slate-400">Cargando...</p>
          ) : filtrados.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title="No hay planes activos"
              description="Creá un plan para un cliente para hacer seguimiento de sus cortes."
            />
          ) : (
            <div className="space-y-3">
              {paginated.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={() => {
                    setEditando(plan)
                    setModalOpen(true)
                  }}
                  onDelete={() => eliminar(plan.id)}
                />
              ))}
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* VISTA 2: LISTA DE AGENDAS (1 TARJETA POR CADA AGENDA SEMANAL) */}
      {filtroTab === 'reservas' && (
        <div className="space-y-3">
          {/* Card de creación y gestión de agenda multidía */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-barber-400">
                📅 Agendas Independientes por Barbero
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Cada barbero tiene su propia agenda independiente. Configuralas con el botón Ver / Administrar.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                alert(
                  '📅 Las agendas ahora son automáticas e independientes\n\n' +
                  'Cada barbero tiene su propia agenda que se crea automáticamente.\n\n' +
                  '✅ Para configurar horarios:\n' +
                  '1. Usa el botón "Ver / Administrar" de cada agenda\n' +
                  '2. Configura los horarios por día de la semana\n' +
                  '3. Los cambios solo afectan a ese barbero específico\n\n' +
                  '💡 Los cambios en cada agenda son independientes y no afectan a otros barberos.'
                )
              }}
              className="w-full sm:w-auto font-bold bg-barber-500 hover:bg-barber-600 shadow-md shrink-0 py-2.5 px-4"
            >
              <CalendarPlus size={16} className="mr-1.5 inline" /> ℹ️ Sobre Agendas
            </Button>
          </div>

          {/* Selector horizontal de Redes Sociales (más compacto) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🌐</span>
              <div>
                <p className="text-xs font-bold text-slate-300">Redes Sociales</p>
                <p className="text-[10px] text-slate-500">Configurá tus enlaces</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setModalRedesOpen(true)}
              className="shrink-0 text-xs font-bold"
            >
              Configurar
            </Button>
          </div>

          {/* Card de Opciones del cliente */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Opciones del cliente (servicios / cortes)
              </p>
              <span className="text-[11px] font-medium text-barber-400">
                {opcionesCliente.length} disponibles
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {opcionesCliente.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-1">No hay opciones cargadas aún</p>
              ) : (
                opcionesCliente.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Scissors size={14} className="text-barber-400 shrink-0" />
                      <span className="font-semibold text-white truncate">{op.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-emerald-400">
                        {op.precio > 0 ? `${op.precio.toLocaleString('es-PY')} Gs` : 'Sin costo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEliminarOpcionCliente(op.id)}
                        className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                        title="Eliminar opción"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Formulario para agregar nueva opción */}
            <form onSubmit={handleAgregarOpcionCliente} className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <p className="text-[11px] font-medium text-slate-400">Cargar nueva opción:</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Nombre del corte o servicio"
                  value={nuevaOpcionNombre}
                  onChange={(e) => setNuevaOpcionNombre(e.target.value)}
                  className="min-w-0 flex-1 basis-[120px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-barber-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Precio Gs"
                  value={nuevaOpcionPrecio}
                  onChange={(e) => setNuevaOpcionPrecio(formatearNumero(e.target.value))}
                  className="min-w-0 w-28 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-barber-500 focus:outline-none"
                />
                <Button size="sm" type="submit" disabled={!nuevaOpcionNombre.trim()}>
                  <Plus size={14} className="mr-1 inline" /> Cargar
                </Button>
              </div>
            </form>
          </div>

          {/* LISTA DE AGENDAS AGRUPADAS */}
          {gruposJornadas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
              <Clock size={32} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No hay agendas configuradas</p>
              <p className="text-xs text-slate-500 mt-1">
                Las agendas se crean automáticamente al agregar barberos.<br/>
                Usa el botón "Ver / Administrar" para configurar los horarios de cada barbero.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {gruposJornadas.map((grupo) => {
                const totalLibres = grupo.jornadas.reduce(
                  (acc, j) => acc + j.slots.filter((s: TurnoSlot) => s.estado === 'disponible').length,
                  0,
                )
                const totalReservados = grupo.jornadas.reduce(
                  (acc, j) => acc + j.slots.filter((s: TurnoSlot) => s.estado === 'reservado').length,
                  0,
                )

                return (
                  <div
                    key={grupo.grupoId}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-md hover:border-slate-700 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => abrirReservaDetalle(grupo.grupoId)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="text-base font-extrabold text-white">
                          📅 {grupo.nombreGrupo}
                        </span>
                        <p className="text-xs text-slate-400 mt-1">
                          {grupo.jornadas.length} día(s) en esta agenda ·{' '}
                          <span className="text-emerald-400 font-semibold">{totalLibres} libres</span>
                          {totalReservados > 0 && (
                            <span className="font-bold text-red-400 ml-2">{totalReservados} reservados</span>
                          )}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => abrirReservaDetalle(grupo.grupoId)}
                          className="!text-xs font-bold"
                        >
                          Ver / Administrar
                        </Button>
                        <button
                          type="button"
                          onClick={() => eliminarGrupoJornada(grupo)}
                          className="rounded-lg p-2 text-slate-600 hover:bg-red-500/10 hover:text-red-400"
                          title="Eliminar agenda"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80">
                      {grupo.jornadas.map((j) => {
                        // Para plantillas (jornadas sin barberoId), mostrar el nombre del día de semana
                        const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
                        const esPlantilla = !j.barberoId && j.diaSemana !== undefined
                        const textoBoton = esPlantilla && typeof j.diaSemana === 'number'
                          ? NOMBRES_DIAS[j.diaSemana] 
                          : obtenerNombreDiaConFecha(j.fecha)
                        
                        return (
                          <button
                            key={j.id}
                            type="button"
                            onClick={() => j.grupoId && abrirReservaDetalle(j.grupoId)}
                            className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white"
                          >
                            {textoBoton}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Nuevo/Editar Plan */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar plan' : 'Nuevo plan'}
      >
        <PlanForm
          initial={editando ?? undefined}
          clientes={clientes}
          tiposConfig={planTipos}
          onSubmit={guardar}
          onCancel={() => setModalOpen(false)}
          onSaveCliente={async (nuevoCliente) => {
            await saveCliente(nuevoCliente)
            await refresh()
          }}
        />
      </Modal>

      {/* Modal de Reservas - Crear Nueva Agenda */}
      <ReservasModal
        open={reservasModalOpen}
        onClose={() => { setReservasModalOpen(false) }}
        modoCreacion={true}
      />

      {/* Modal de Redes Sociales */}
      <Modal
        open={modalRedesOpen}
        onClose={() => setModalRedesOpen(false)}
        title="🌐 Redes Sociales"
      >
        <p className="text-xs text-slate-400 mb-4">
          Configurá tus redes sociales para que aparezcan en la página de reservas públicas.
        </p>

        <form onSubmit={guardarRedesSociales} className="space-y-4">
          <Input
            label="Enlace de Instagram"
            type="url"
            placeholder="https://www.instagram.com/tu_usuario/"
            value={redesSociales.instagram}
            onChange={(e) => setRedesSociales({ ...redesSociales, instagram: e.target.value })}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Número de WhatsApp
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="0982 362 830"
                value={redesSociales.whatsapp}
                onChange={(e) => setRedesSociales({ ...redesSociales, whatsapp: formatearWhatsApp(e.target.value) })}
                maxLength={12}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-barber-500 focus:outline-none"
              />
              {!redesSociales.whatsapp && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-end px-3">
                  <span className="text-[10px] text-slate-700 font-mono">0982 362 830</span>
                </div>
              )}
            </div>
          </div>

          <Input
            label="Enlace de TikTok"
            type="url"
            placeholder="https://www.tiktok.com/@tu_usuario"
            value={redesSociales.tiktok}
            onChange={(e) => setRedesSociales({ ...redesSociales, tiktok: e.target.value })}
          />

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setModalRedesOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={guardandoRedes}
            >
              {guardandoRedes ? 'Guardando...' : 'Guardar Redes Sociales'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Gestión Semanal - Ver/Administrar Agenda */}
      <AgendaSemanalModal
        open={agendaSemanalModalOpen}
        onClose={() => {
          setAgendaSemanalModalOpen(false)
          setBarberoParaConfigurar(undefined)
          setRefreshTick((t) => t + 1)
        }}
        barberoInfo={barberoParaConfigurar}
        soloLectura={false}
      />
    </Layout>
  )
}
