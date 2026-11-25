# 💈 Timontti Barber

Sistema completo de gestión de barbería con reservas online, control de planes y asistencia.

## 🌐 Aplicación Desplegada

**🔗 URL de Producción:** [https://timonttibarberr.web.app](https://timonttibarberr.web.app)

## 🚀 Características

- ✅ **Reservas Online**: Sistema público de reservas por turnos
- 👥 **Gestión de Clientes**: Control completo de datos de clientes
- 💳 **Planes de Membresía**: Gestión de planes y cobros
- 📊 **Reportes**: Estadísticas y análisis de datos
- ✓ **Control de Asistencia**: Registro y seguimiento de turnos
- 📱 **PWA**: Aplicación web progresiva instalable
- 🔐 **Autenticación Segura**: Sistema de login con Firebase Auth
- 💬 **Integración WhatsApp**: Notificaciones automáticas

## 🔐 Acceso de Administrador

**Email:** `Timantti_barber@gmail.com`  
**Contraseña:** `timantti_123#$%jy`

## 🛠️ Tecnologías

- **Frontend**: React + TypeScript + Vite
- **Estilos**: TailwindCSS
- **Base de Datos**: Firebase Firestore
- **Autenticación**: Firebase Auth
- **Hosting**: Firebase Hosting
- **Iconos**: Lucide React
- **Exportación**: XLSX (Excel)
- **Fechas**: date-fns

## 📦 Instalación Local

1. **Clonar el repositorio**
```bash
git clone https://github.com/sebastianJhuliano/Timontti_Barber.git
cd Timontti_Barber
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
El archivo `.env` ya está configurado con las credenciales de Firebase.

4. **Ejecutar en modo desarrollo**
```bash
npm run dev
```

5. **Construir para producción**
```bash
npm run build
```

## 🔥 Firebase

### Proyecto Firebase
- **Project ID**: `timonttibarberr`
- **Console**: [Ver en Firebase](https://console.firebase.google.com/project/timonttibarberr/overview)

### Colecciones de Firestore
- `clientes` - Información de clientes
- `planes` - Planes de membresía
- `cobros` - Registro de pagos
- `jornadasReservas` - Turnos y reservas
- `opcionesCliente` - Servicios y precios configurables

## 🚀 Despliegue

```bash
# Construir y desplegar a Firebase Hosting
npm run build
firebase deploy
```

## 📱 Características PWA

La aplicación puede instalarse como app nativa en dispositivos móviles y de escritorio:
- ✅ Funciona offline
- ✅ Icono en pantalla principal
- ✅ Notificaciones push (próximamente)

## 📝 Scripts Disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Construir para producción
npm run preview      # Vista previa del build
firebase deploy      # Desplegar a Firebase
```

## 🔒 Seguridad

Las reglas de Firestore están configuradas para:
- ✅ Acceso público a reservas (lectura/escritura)
- ✅ Solo admin puede modificar clientes, planes y configuración
- ✅ Cobros protegidos por autenticación

## 👥 Colaboradores

- **Sebastian Jhuliano** - Desarrollador Principal
- **Nelson Sosa** - Colaborador

## 📄 Licencia

Proyecto privado - Todos los derechos reservados

---

**Última actualización:** Noviembre 2026
