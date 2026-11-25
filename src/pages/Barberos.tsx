import { ArrowLeft, Calendar, Eye, EyeOff, MessageCircle, Plus, Scissors, Trash2, Users2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { VerAgendaModal } from '../components/VerAgendaModal'
// ✅ ELIMINADO: import AgendaSemanalModal - Ya no se usa desde Barberos
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { agruparJornadas, type GrupoJornada, formatearTelefono } from '../lib/reservasUtils'
import type { Barbero, JornadaReservas } from '../lib/types'
import { secondaryAuth } from '../lib/firebase'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'

export function Barberos() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [barberos, setBarberos] = useState<Barbero[]>([])
  const [grupos, setGrupos] = useState<GrupoJornada[]>([])
  const [todasJornadas, setTodasJornadas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  // Modal de Barbero
  const [showModal, setShowModal] = useState(false)
  const [barberoEditando, setBarberoEditando] = useState<Barbero | null>(null)
  const [nombre, setNombre] = useState('')
  const [nombreAgenda, setNombreAgenda] = useState('') // ✅ NUEVO: Nombre personalizado para la agenda
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [mensajeWa, setMensajeWa] = useState('Reservado para las {hora}')
  // ✅ ELIMINADO: const [grupoId, setGrupoId] = useState('') - Ya no se necesita
  
  // Permisos
  const [permisoInicio, setPermisoInicio] = useState(true)
  const [permisoCobros, setPermisoCobros] = useState(true)
  const [permisoPersonas, setPermisoPersonas] = useState(true)
  const [permisoPlanes, setPermisoPlanes] = useState(true)
  const [permisoReportes, setPermisoReportes] = useState(true)
  
  // Mostrar/ocultar contraseña
  const [mostrarPassword, setMostrarPassword] = useState(false)

  // Modal de Agenda (ver reservas del barbero)
  const [agendaModalOpen, setAgendaModalOpen] = useState(false)
  const [barberoSeleccionado, setBarberoSeleccionado] = useState<Barbero | undefined>(undefined)
  
  // ✅ ELIMINADO: Modal de Configuración de Agenda Semanal (ya no se usa, se accede desde Planes)

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    setCargando(true)
    const [barbs, jornadas] = await Promise.all([
      api.getBarberos(),
      api.getTodasJornadas(),
    ])
    setBarberos(barbs)
    
    // Filtrar solo plantillas (sin barberoId) para el selector de agendas
    const plantillas = jornadas.filter((j) => !j.barberoId)
    const gs = agruparJornadas(plantillas)
    setGrupos(gs)
    
    // Guardar todas las jornadas por si se necesitan después
    setTodasJornadas(jornadas)
    setCargando(false)
  }

  const abrirModal = (barbero?: Barbero) => {
    if (barbero) {
      setBarberoEditando(barbero)
      setNombre(barbero.nombre)
      setNombreAgenda('') // No permitimos cambiar el nombre de agenda al editar
      setEmail(barbero.email || '')
      setPassword('') // No mostramos la contraseña por seguridad
      setWhatsapp(barbero.whatsapp)
      setMensajeWa(barbero.mensajeWhatsapp || 'Reservado para las {hora}')
      // Cargar permisos
      setPermisoInicio(barbero.permisos?.inicio ?? true)
      setPermisoCobros(barbero.permisos?.cobros ?? true)
      setPermisoPersonas(barbero.permisos?.personas ?? true)
      setPermisoPlanes(barbero.permisos?.planes ?? true)
      setPermisoReportes(barbero.permisos?.reportes ?? true)
    } else {
      setBarberoEditando(null)
      setNombre('')
      setNombreAgenda('') // ✅ Limpiar nombre de agenda
      setEmail('')
      setPassword('')
      setWhatsapp('')
      setMensajeWa('Reservado para las {hora}')
      // Permisos por defecto: todos activados
      setPermisoInicio(true)
      setPermisoCobros(true)
      setPermisoPersonas(true)
      setPermisoPlanes(true)
      setPermisoReportes(true)
    }
    setShowModal(true)
  }

  const cerrarModal = () => {
    setShowModal(false)
    setBarberoEditando(null)
  }

  // Función auxiliar para generar slots vacíos
  const generarSlotsVaciosParaBarbero = (inicio: string, fin: string, intervalo: number) => {
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

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || !whatsapp.trim()) {
      alert('Por favor, completá nombre y WhatsApp.')
      return
    }

    if (!email.trim()) {
      alert('Por favor, ingresá un email para el barbero.')
      return
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      alert('Por favor, ingresá un email válido.')
      return
    }

    // Si es nuevo barbero, requiere contraseña
    if (!barberoEditando && !password.trim()) {
      alert('Por favor, ingresá una contraseña para el nuevo barbero.')
      return
    }

    // Validar longitud de contraseña
    if (password.trim() && password.trim().length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    // Generar ID del barbero (nuevo o existente)
    const barberoId = barberoEditando?.id || crypto.randomUUID()
    
    // ✅ CAMBIO: Siempre usar grupoId único por barbero (agenda independiente)
    const agendaIndependiente = `agenda-${barberoId}`

    const barbero: Barbero = {
      id: barberoId,
      uid: barberoEditando?.uid, // Mantener UID existente si está editando
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      whatsapp: whatsapp.trim(),
      mensajeWhatsapp: mensajeWa.trim() || 'Reservado para las {hora}',
      agendaId: agendaIndependiente, // ✅ Agenda única e independiente
      activo: barberoEditando?.activo ?? true,
      permisos: {
        inicio: permisoInicio,
        cobros: permisoCobros,
        personas: permisoPersonas,
        planes: permisoPlanes,
        reportes: permisoReportes,
        barberos: false, // Solo el admin puede gestionar barberos
      },
      creadoEn: barberoEditando?.creadoEn || new Date().toISOString(),
    }

    console.log('🔵 [Barberos] Iniciando guardado. Es nuevo:', !barberoEditando, 'Tiene password:', !!password.trim())
    console.log('🔵 [Barberos] Agenda asignada (independiente):', agendaIndependiente)
    
    try {
      // Si es nuevo barbero, intentar crear cuenta Firebase Auth primero
      if (!barberoEditando && password.trim()) {
        console.log('🔵 [Barberos] Creando usuario en Firebase Auth...')
        console.log('🔵 [Barberos] Email:', email.trim().toLowerCase())
        console.log('🔵 [Barberos] Password length:', password.trim().length)
        
        try {
          // Usar secondaryAuth para no cerrar sesión del admin
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth, 
            email.trim().toLowerCase(), 
            password.trim()
          )
          
          // ✅ CAPTURAR EL UID
          const uid = userCredential.user.uid
          console.log('✅ [Barberos] Usuario creado en Firebase Auth. UID:', uid)
          console.log('✅ [Barberos] Email confirmado:', userCredential.user.email)
          
          // Cerrar sesión de la app secundaria inmediatamente
          await signOut(secondaryAuth)
          console.log('✅ [Barberos] Sesión secundaria cerrada')
          
          // Asignar UID al barbero antes de guardar
          barbero.uid = uid
          console.log('🔵 [Barberos] UID asignado al objeto barbero')
          
          // Guardar en Firestore con UID asociado
          console.log('🔵 [Barberos] Guardando en Firestore...')
          await api.saveBarbero(barbero)
          console.log('✅ [Barberos] Guardado en Firestore exitoso')
          
          // ✅ NUEVO: Crear plantilla inicial con nombre personalizado
          const nombreAgendaFinal = nombreAgenda.trim() || `Agenda de ${nombre.trim()}`
          console.log('📅 [Barberos] Creando plantilla inicial con nombre:', nombreAgendaFinal)
          
          // Crear una plantilla base vacía para Viernes (día 5)
          const plantillaInicial: JornadaReservas = {
            id: crypto.randomUUID(),
            grupoId: agendaIndependiente,
            nombreGrupo: nombreAgendaFinal,
            barberoId: undefined, // Sin barberoId = plantilla
            diaSemana: 5, // Viernes
            fecha: '', // Plantillas no tienen fecha específica
            horaInicio: '12:00',
            horaFin: '22:00',
            intervaloMinutos: 60,
            permitirReservaPublica: true,
            whatsappBarbero: whatsapp.trim(),
            mensajeWhatsapp: mensajeWa.trim() || 'Reservado para las {hora}',
            slots: generarSlotsVaciosParaBarbero('12:00', '22:00', 60),
            creadoEn: new Date().toISOString(),
            configurado: true,
            whatsappConfigurado: false,
          }
          
          await api.saveJornadaReservas(plantillaInicial)
          console.log('✅ [Barberos] Plantilla inicial creada')
          
          alert(
            `✅ Barbero creado exitosamente.\n\n` +
            `Email: ${email}\n` +
            `Contraseña: ${password}\n\n` +
            `📅 Se creó la agenda: "${nombreAgendaFinal}".\n` +
            `Configurá sus horarios desde el botón ⚙️ en la lista de barberos.\n\n` +
            `El barbero puede iniciar sesión ahora.`
          )
          
        } catch (authError: any) {
          console.error('❌ [Barberos] Error al crear usuario en Firebase Auth:', authError)
          console.error('❌ [Barberos] Código de error:', authError.code)
          console.error('❌ [Barberos] Mensaje de error:', authError.message)
          
          if (authError.code === 'auth/email-already-in-use') {
            alert(`❌ Ya existe una cuenta con el email ${email}.\n\nPor favor:\n1. Usa otro email, O\n2. Elimina el usuario existente desde Firebase Console → Authentication`)
            return
          } else {
            alert(`❌ Error al crear cuenta de autenticación.\n\nCódigo: ${authError.code}\nMensaje: ${authError.message}\n\nRevisa la consola para más detalles.`)
            return
          }
        }
      } else if (barberoEditando) {
        // Si está editando, solo actualizar Firestore (no modificar Auth)
        console.log('🔵 [Barberos] Actualizando barbero existente')
        await api.saveBarbero(barbero)
        console.log('✅ [Barberos] Actualización exitosa')
        alert('✅ Información del barbero actualizada.')
        
        if (password.trim()) {
          alert('⚠️ La contraseña no se puede actualizar desde aquí.\n\nEl barbero debe usar "Recuperar contraseña" desde la pantalla de login.')
        }
      } else {
        console.warn('⚠️ [Barberos] Guardando sin crear usuario en Auth (no hay contraseña)')
        await api.saveBarbero(barbero)
        alert('✅ Barbero guardado en Firestore (sin cuenta de autenticación).')
      }
      
      console.log('🔵 [Barberos] Recargando datos...')
      await cargarDatos()
      console.log('✅ [Barberos] Datos recargados')
      cerrarModal()
    } catch (error) {
      console.error('❌ Error al guardar barbero:', error)
      alert('❌ Error al guardar el barbero. Intentá de nuevo.')
    }
  }

  const eliminar = async (barbero: Barbero) => {
    if (!confirm(`¿Eliminar a ${barbero.nombre}? Las reservas existentes no se borrarán.`)) return
    await api.deleteBarbero(barbero.id)
    await cargarDatos()
  }

  const verAgenda = async (barbero: Barbero) => {
    if (!barbero.agendaId) {
      alert('Este barbero no tiene una agenda asignada.')
      return
    }
    
    // Buscar las plantillas de la agenda asignada
    const todasJornadas = await api.getTodasJornadas()
    const plantillas = todasJornadas.filter((j) => 
      !j.barberoId && 
      (j.grupoId === barbero.agendaId || j.id === barbero.agendaId)
    )
    
    if (plantillas.length === 0) {
      alert('No se encontraron jornadas para la agenda asignada.')
      return
    }
    
    // Guardar el barbero seleccionado
    setBarberoSeleccionado(barbero)
    
    // Abrir modal con el barbero
    setAgendaModalOpen(true)
  }
  
  // ✅ ELIMINADO: función configurarAgenda - Ya no se usa, se accede desde Planes → Ver/Administrar

  const getNombreAgenda = (agendaId: string) => {
    const g = grupos.find((gr) => gr.grupoId === agendaId)
    return g ? g.nombreGrupo : 'Sin agenda asignada'
  }

  if (cargando) {
    return (
      <Layout title="Barberos">
        <p className="text-center text-slate-400">Cargando...</p>
      </Layout>
    )
  }

  // Vista unificada - barberos y admin ven lo mismo, pero barberos no pueden crear/editar
  return (
    <Layout
      title="Barberos"
      action={
        isAdmin ? (
          <button
            onClick={() => abrirModal()}
            className="flex items-center gap-1.5 rounded-xl bg-barber-500 px-3 py-2 text-sm font-bold text-white hover:bg-barber-600 active:scale-95 transition-transform"
          >
            <Plus size={16} />
            Barbero
          </button>
        ) : undefined
      }
    >
      {/* Botón volver */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      {/* Botón Copiar Link Público */}
      <div className="mb-4">
        <button
          onClick={() => {
            const url = `${window.location.origin}/reservas`
            navigator.clipboard.writeText(url)
            alert('¡Link copiado! Ahora podés compartirlo con tus clientes.')
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-barber-500/30 bg-barber-500/10 px-4 py-3 text-sm font-bold text-barber-300 hover:bg-barber-500/20 hover:border-barber-500/50 active:scale-[0.98] transition-all"
        >
          <Calendar size={18} />
          <span>Copiar Link Público de Reservas</span>
        </button>
      </div>

      {/* Info de agendas - YA NO SE NECESITA */}
      {/* Cada barbero tiene su agenda independiente automáticamente */}

      {/* Lista de Barberos */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Equipo de Barberos
        </h2>
        <span className="text-xs text-barber-400">{barberos.length} registrados</span>
      </div>

      {barberos.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
          <Users2 size={36} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-bold text-slate-400">No hay barberos registrados</p>
          <p className="mt-1 text-xs text-slate-500">
            Tocá en "+ Barbero" arriba para agregar el primero
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {barberos.map((b) => {
            // Calcular reservas y libres de las jornadas de ESTE barbero (no del grupo compartido)
            const jornadasDelBarbero = todasJornadas.filter((j: any) =>
              j.barberoId === b.id ||
              (!j.barberoId && b.agendaId && (j.grupoId || j.id) === b.agendaId)
            )
            const totalReservados = jornadasDelBarbero.reduce(
              (acc: number, j: any) => acc + j.slots.filter((s: any) => s.estado === 'reservado').length, 0
            )
            const totalLibres = jornadasDelBarbero.reduce(
              (acc: number, j: any) => acc + j.slots.filter((s: any) => s.estado === 'disponible').length, 0
            )
            const tieneJornadas = jornadasDelBarbero.length > 0

            return (
              <div
                key={b.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-3.5 space-y-3"
              >
                {/* Fila principal */}
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-barber-500/20 text-barber-400 border border-barber-500/30">
                    <Scissors size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{b.nombre}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MessageCircle size={12} className="text-emerald-400" />
                        {formatearTelefono(b.whatsapp)}
                      </span>
                      {b.agendaId && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="text-barber-400" />
                          <span className="truncate max-w-[140px]">{getNombreAgenda(b.agendaId)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {/* Ver agenda - disponible para todos */}
                    {tieneJornadas && (
                      <button
                        onClick={() => verAgenda(b)}
                        className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-barber-500/20 hover:text-barber-400 transition-colors"
                        title="Ver agenda"
                      >
                        <Eye size={15} />
                      </button>
                    )}
                    {/* Editar y eliminar - solo para admin */}
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => abrirModal(b)}
                          className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                          title="Editar barbero"
                        >
                          <Scissors size={15} />
                        </button>
                        <button
                          onClick={() => eliminar(b)}
                          className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                          title="Eliminar barbero"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats de reservas */}
                {tieneJornadas && (
                  <div className="flex items-center gap-2 text-xs">
                    {totalReservados > 0 && (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 font-bold text-red-400 border border-red-500/20">
                        {totalReservados} reserv.
                      </span>
                    )}
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-500/20">
                      {totalLibres} libres
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Crear / Editar Barbero */}
      {showModal && (
        <Modal
          open={showModal}
          onClose={cerrarModal}
          title={barberoEditando ? 'Editar Barbero' : 'Nuevo Barbero'}
        >
          <form onSubmit={guardar} className="space-y-3">
            <Input
              label="Nombre del Barbero"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Carlos Rodríguez"
              required
            />
            
            {/* ✅ NUEVO: Campo de nombre de agenda (solo al crear) */}
            {!barberoEditando && (
              <Input
                label="Nombre de la Agenda (opcional)"
                value={nombreAgenda}
                onChange={(e) => setNombreAgenda(e.target.value)}
                placeholder={`Ej: Agenda de ${nombre || 'barbero'}`}
              />
            )}
            
            <Input
              label="Email (para iniciar sesión)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="barbero@ejemplo.com"
              required
            />
            
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                {barberoEditando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
              </label>
              <div className="relative">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required={!barberoEditando}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-barber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {mostrarPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Input
              label="WhatsApp (para confirmaciones de reserva)"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ej: 0981 123 456"
              required
            />

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Mensaje personalizado de WhatsApp
              </label>
              <textarea
                value={mensajeWa}
                onChange={(e) => setMensajeWa(e.target.value)}
                placeholder="Ej: Hola {nombre}, tu turno está confirmado para las {hora} el {fecha}"
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-barber-500 focus:outline-none"
              />
              <p className="mt-0.5 text-[11px] text-slate-500">
                Variables: {'{hora}'}, {'{fecha}'}, {'{nombre}'}
              </p>
            </div>

            {/* ✅ Mensaje informativo sobre agenda automática */}
            {!barberoEditando && (
              <div className="rounded-xl border border-barber-500/30 bg-barber-500/5 p-3">
                <p className="text-xs font-bold text-barber-300">📅 Agenda Independiente</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Se creará automáticamente una agenda única para este barbero. 
                  Podrás configurar sus horarios desde el botón ⚙️ en la lista de barberos.
                </p>
              </div>
            )}

            {/* Permisos de módulos */}
            <div className="rounded-xl border border-barber-500/30 bg-barber-500/5 p-3">
              <p className="mb-2 text-xs font-bold text-barber-300 uppercase tracking-wide">
                Permisos de Módulos
              </p>
              <p className="mb-3 text-[11px] text-slate-400">
                Seleccioná qué módulos puede ver este barbero:
              </p>
              
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permisoInicio}
                    onChange={(e) => setPermisoInicio(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-barber-500 focus:ring-barber-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-200">Inicio</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permisoCobros}
                    onChange={(e) => setPermisoCobros(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-barber-500 focus:ring-barber-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-200">Cobros</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permisoPersonas}
                    onChange={(e) => setPermisoPersonas(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-barber-500 focus:ring-barber-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-200">Personas</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permisoPlanes}
                    onChange={(e) => setPermisoPlanes(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-barber-500 focus:ring-barber-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-200">Planes y Reservas</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permisoReportes}
                    onChange={(e) => setPermisoReportes(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-barber-500 focus:ring-barber-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-200">Reportes</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={cerrarModal} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                {barberoEditando ? 'Guardar Cambios' : 'Crear Barbero'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Ver Agenda del Barbero (con filtros) */}
      <VerAgendaModal
        open={agendaModalOpen}
        onClose={() => {
          setAgendaModalOpen(false)
          setBarberoSeleccionado(undefined)
          cargarDatos()
        }}
        barberoInfo={barberoSeleccionado}
        soloLectura={false}
      />
      
      {/* ✅ ELIMINADO: Modal Configurar Agenda Semanal - Ya no se usa desde Barberos, se accede desde Planes */}
    </Layout>
  )
}
