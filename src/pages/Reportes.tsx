import { DollarSign, Download, Scissors, Settings, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Layout } from '../components/Layout'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/Pagination'
import { useBarberData } from '../hooks/useBarberData'
import { usePagination } from '../hooks/usePagination'
import { useAuth } from '../context/AuthContext'
import { cobroCuentaEnIngresos } from '../lib/cobros'
import {
  etiquetaTipoPlan,
  formatearFechaCorta,
  formatearMoneda,
  hoyISO,
} from '../lib/dates'
import { api } from '../lib/api'
import type { CobroConCliente, Barbero } from '../lib/types'

type FiltroFecha = 'dia' | 'rango' | 'mes'

export function Reportes() {
  const { clientes, planes, cobros, loading } = useBarberData()
  const { isAdmin, barbero } = useAuth()
  const [barberos, setBarberos] = useState<Barbero[]>([])
  const [barberoFiltro, setBarberoFiltro] = useState<string>('todos')
  const [filtro, setFiltro] = useState<FiltroFecha>('mes')
  const [dia, setDia] = useState(hoyISO())
  const [rangoInicio, setRangoInicio] = useState(hoyISO())
  const [rangoFin, setRangoFin] = useState(hoyISO())
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  
  // Total histórico (nunca baja)
  const [totalHistorico, setTotalHistorico] = useState(0)
  
  // Modal de configuración
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [diasRetencion, setDiasRetencion] = useState(() => {
    return parseInt(localStorage.getItem('reportes_dias_retencion') || '90', 10)
  })
  const [limpiando, setLimpiando] = useState(false)

  // Cargar barberos y total histórico
  useEffect(() => {
    api.getBarberos().then(setBarberos)
    api.getTotalHistorico().then((t) => setTotalHistorico(t.totalAcumulado))
  }, [])
  
  // Si es barbero, forzar filtro a su ID
  useEffect(() => {
    if (!isAdmin && barbero) {
      setBarberoFiltro(barbero.id)
    }
  }, [isAdmin, barbero])

  const filtrarFecha = (fecha: string): boolean => {
    if (filtro === 'dia') return fecha === dia
    if (filtro === 'rango') return fecha >= rangoInicio && fecha <= rangoFin
    return fecha.startsWith(mes)
  }

  const historialCobros = useMemo<CobroConCliente[]>(() => {
    return cobros
      .filter((c) => {
        const f = c.estado === 'pagado' && c.pagadoEn ? c.pagadoEn.slice(0, 10) : c.fecha
        if (!filtrarFecha(f)) return false
        
        // Filtro de barbero
        if (barberoFiltro === 'todos') return true
        if (barberoFiltro === 'sin-reserva') return !c.barberoId
        return c.barberoId === barberoFiltro
      })
      .map((c) => ({
        ...c,
        cliente: clientes.find((cl) => cl.id === c.clienteId),
        plan: planes.find((p) => p.id === c.planId),
      }))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)) // Más nuevos primero
  }, [cobros, clientes, planes, filtro, dia, rangoInicio, rangoFin, mes, barberoFiltro])

  // Paginación de 20 reportes
  const paginacion = usePagination(historialCobros, 20)

  // Total calculado sobre el filtro actual (todos los resultados, no solo la página)
  const totalCobrado = historialCobros
    .filter((c) => cobroCuentaEnIngresos(c))
    .reduce((s, c) => {
      if (c.tipo === 'egreso') return s - c.monto
      return s + c.monto
    }, 0)
  
  const pendientesFiltro = historialCobros.filter((c) => c.estado === 'pendiente').length

  // Función de limpieza de cobros antiguos
  const limpiarCobrosAntiguos = async () => {
    if (!confirm(`¿Eliminar todos los cobros con más de ${diasRetencion} días?\n\nEsto es IRREVERSIBLE y liberará espacio en la base de datos.`)) {
      return
    }

    setLimpiando(true)
    try {
      const fechaCorte = new Date()
      fechaCorte.setDate(fechaCorte.getDate() - diasRetencion)
      const fechaCorteISO = fechaCorte.toISOString().split('T')[0]

      // Obtener todos los cobros
      const todosCobros = await api.getAllCobros()
      
      // Filtrar los que son antiguos
      const cobrosAntiguos = todosCobros.filter((c) => {
        const fechaCobro = c.estado === 'pagado' && c.pagadoEn ? c.pagadoEn.slice(0, 10) : c.fecha
        return fechaCobro < fechaCorteISO
      })

      if (cobrosAntiguos.length === 0) {
        alert('No hay cobros antiguos para eliminar.')
        setLimpiando(false)
        return
      }

      // Eliminar en lotes
      let eliminados = 0
      for (const cobro of cobrosAntiguos) {
        await api.deleteCobro(cobro.id)
        eliminados++
      }

      alert(`✅ Se eliminaron ${eliminados} cobros antiguos.\n\nEspacio liberado: ~${(eliminados * 0.27 / 1024).toFixed(2)} MB`)
      
      // Recargar datos
      window.location.reload()
    } catch (error) {
      console.error('Error al limpiar cobros:', error)
      alert('Error al limpiar cobros antiguos. Intentá de nuevo.')
    } finally {
      setLimpiando(false)
    }
  }

  const guardarConfiguracion = () => {
    localStorage.setItem('reportes_dias_retencion', String(diasRetencion))
    setShowConfigModal(false)
    alert(`✅ Configuración guardada.\n\nSe conservarán cobros de los últimos ${diasRetencion} días.`)
  }


  const exportarExcel = () => {
    const fechaStr = new Date().toISOString().slice(0, 10)
    const data: (string | number)[][] = historialCobros.map((c) => [
      `${c.cliente?.nombre ?? ''} ${c.cliente?.apellido ?? ''}`.trim() || '—',
      c.plan ? etiquetaTipoPlan(c.plan.tipo) : (c.tipo === 'ingreso' ? 'Ingreso manual' : c.tipo === 'egreso' ? 'Egreso manual' : '—'),
      c.tipo === 'egreso' ? -c.monto : c.monto,
    ])
    const total = historialCobros.reduce((s, c) => s + (c.tipo === 'egreso' ? -c.monto : c.monto), 0)
    data.push(['', 'TOTAL', total])
    const ws = XLSX.utils.aoa_to_sheet([['Cliente', 'Plan', 'Monto'], ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cobros')
    XLSX.writeFile(wb, `cobros_${fechaStr}.xlsx`)
  }

  return (
    <Layout 
      title="Reportes"
      action={
        <button
          onClick={() => setShowConfigModal(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-barber-400 transition-colors"
          title="Configuración de limpieza"
        >
          <Settings size={18} />
        </button>
      }
    >
      <div className="mb-2 flex gap-1">
        {(['dia', 'rango', 'mes'] as FiltroFecha[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`flex-1 rounded-lg py-1 text-xs font-medium capitalize ${
              filtro === f ? 'bg-barber-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {f === 'dia' ? 'Día' : f === 'rango' ? 'Rango' : 'Mes'}
          </button>
        ))}
        <button
          type="button"
          onClick={exportarExcel}
          className="flex items-center gap-1 rounded-lg bg-barber-600 px-2.5 py-1 text-xs text-white hover:bg-barber-500"
          title="Exportar a Excel"
        >
          <Download size={14} />
        </button>
      </div>

      {/* Filtro de barbero */}
      <div className="mb-2">
        <label className="mb-1 block text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Filtrar por barbero
        </label>
        {!isAdmin && barbero && (
          <div className="mb-2 rounded-xl border border-barber-500/30 bg-barber-500/10 px-3 py-2 text-xs text-barber-300">
            📊 Mostrando solo datos de: <strong>{barbero.nombre}</strong>
          </div>
        )}
        <select
          value={barberoFiltro}
          onChange={(e) => setBarberoFiltro(e.target.value)}
          disabled={!isAdmin} // ← Deshabilitar para barberos
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-barber-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="todos">Todos los cobros</option>
          <option value="sin-reserva">Sin reserva (manuales)</option>
          {barberos.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2">
        {filtro === 'dia' ? (
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-barber-500 focus:outline-none"
          />
        ) : filtro === 'rango' ? (
          <div className="flex gap-2">
            <input
              type="date"
              value={rangoInicio}
              onChange={(e) => setRangoInicio(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-barber-500 focus:outline-none"
            />
            <span className="self-center text-xs text-slate-500">→</span>
            <input
              type="date"
              value={rangoFin}
              onChange={(e) => setRangoFin(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-barber-500 focus:outline-none"
            />
          </div>
        ) : (
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-barber-500 focus:outline-none"
          />
        )}
      </div>

      <div className="mb-2 flex gap-2">
        <MiniStat
          label="Cobrado"
          value={formatearMoneda(totalCobrado)}
        />
        <MiniStat label="Pendientes" value={String(pendientesFiltro)} />
      </div>

      {loading ? (
        <p className="text-center text-slate-400">Cargando...</p>
      ) : historialCobros.length === 0 ? (
        <EmptyState icon={DollarSign} title="Sin cobros" description="No hay registros en este período" />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Mostrando {paginacion.paginated.length} de {historialCobros.length} resultados
            </p>
          </div>
          
          <ul className="space-y-1">
            {paginacion.paginated.map((c) => {
              const barbero = barberos.find((b) => b.id === c.barberoId)
              return (
                <li
                  key={c.id}
                  className="list-item rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">
                        {c.tipo === 'ingreso' || c.tipo === 'egreso'
                          ? c.descripcion || (c.tipo === 'ingreso' ? 'Ingreso manual' : 'Egreso manual')
                          : `${c.cliente?.nombre ?? '—'} ${c.cliente?.apellido ?? ''}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.plan ? etiquetaTipoPlan(c.plan.tipo) : (c.tipo === 'ingreso' ? 'Ingreso manual' : c.tipo === 'egreso' ? 'Egreso manual' : '—')}
                        {' · '}{formatearFechaCorta(c.fecha)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={c.estado === 'pagado' ? 'success' : c.estado === 'anulado' ? 'danger' : 'warning'}>
                        {c.estado === 'pagado' ? 'Pagado' : c.estado === 'anulado' ? 'Anulado' : 'Pendiente'}
                      </Badge>
                      {cobroCuentaEnIngresos(c) ? (
                        <span className={`text-sm font-semibold ${c.tipo === 'egreso' ? 'text-red-400' : 'text-barber-400'}`}>
                          {c.tipo === 'egreso' ? '- ' : ''}{formatearMoneda(c.monto)}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-600">—</span>
                      )}
                    </div>
                  </div>
                  {barbero && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Scissors size={11} className="text-barber-400" />
                      <span>Facturado con {barbero.nombre}</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Paginación */}
          {historialCobros.length > 20 && (
            <div className="mt-3">
              <Pagination
                page={paginacion.page}
                totalPages={paginacion.totalPages}
                total={paginacion.total}
                pageSize={paginacion.pageSize}
                onPageChange={paginacion.setPage}
              />
            </div>
          )}

          {/* Total HISTÓRICO - NUNCA baja aunque elimines reportes */}
          <div className="mt-2 flex items-center justify-between rounded-lg border border-barber-500/20 bg-barber-500/5 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">TOTAL HISTÓRICO</span>
              <span className="text-[10px] text-slate-500">Acumulado (nunca baja)</span>
            </div>
            <span className="text-sm font-bold text-barber-400">
              {formatearMoneda(totalHistorico)} Gs
            </span>
          </div>
        </>
      )}

      {/* Modal de Configuración */}
      {showConfigModal && (
        <Modal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          title="⚙️ Configuración de Limpieza"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-300 mb-3">
                Configurá cuántos días de historial querés conservar. Los cobros más antiguos se pueden eliminar para optimizar el rendimiento y el almacenamiento.
              </p>
              
              <label className="mb-2 block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Días de retención
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={diasRetencion}
                onChange={(e) => setDiasRetencion(parseInt(e.target.value) || 90)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-barber-500 focus:outline-none"
                placeholder="Ej: 90"
              />
              <p className="mt-1 text-xs text-slate-500">
                Se conservarán los últimos {diasRetencion} días de cobros. Recomendado: 90-365 días.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-300 mb-1">
                ⚠️ Limpieza Manual
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Presioná el botón para realizar la limpieza. Los cobros eliminados NO afectan el total mostrado (el total solo calcula cobros existentes). Esta acción es irreversible.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={limpiarCobrosAntiguos}
                disabled={limpiando}
                className="w-full !bg-red-500/20 !text-red-400 hover:!bg-red-500/30 !border-red-500/30"
              >
                <Trash2 size={14} className="mr-1" />
                {limpiando ? 'Limpiando...' : `Presioná para eliminar cobros > ${diasRetencion} días`}
              </Button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setShowConfigModal(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={guardarConfiguracion}
                className="flex-1"
              >
                Guardar Configuración
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  )
}

function MiniStat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-center ${wide ? 'flex-1' : 'flex-1'}`}
    >
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  )
}
