# 💈 Barbería Sistema

Sistema completo de gestión de barbería con reservas online, control de planes y asistencia.

## 🚀 Características

- ✅ **Reservas Online**: Sistema público de reservas por turnos
- 👥 **Gestión de Clientes**: Control completo de datos de clientes
- 💳 **Planes de Membresía**: Gestión de planes y cobros
- 📊 **Reportes**: Estadísticas y análisis de datos
- ✓ **Control de Asistencia**: Registro y seguimiento de turnos
- 📱 **PWA**: Aplicación web progresiva instalable
- 🔐 **Autenticación Segura**: Sistema de login con Firebase Auth
- 💬 **Integración WhatsApp**: Notificaciones automáticas
- 🧑‍💼 **Multi-Barbero**: Soporte para múltiples barberos con agendas independientes

## 🛠️ Tecnologías

- **Frontend**: React 19.1 + TypeScript + Vite
- **Estilos**: TailwindCSS v4
- **Base de Datos**: Firebase Firestore
- **Autenticación**: Firebase Auth
- **Hosting**: Firebase Hosting
- **Iconos**: Lucide React
- **Exportación**: XLSX (Excel)
- **Fechas**: date-fns

## 📦 Instalación

### 1. Clonar el repositorio

```bash
git clone <tu-repositorio>
cd Barberia-Sistema
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar Firebase

#### a) Crear proyecto en Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto
3. Habilita **Authentication** (método Email/Password)
4. Habilita **Firestore Database**
5. Ve a Project Settings > General y copia las credenciales

#### b) Configurar variables de entorno

1. Duplica el archivo `.env.example` y renómbralo a `.env`
2. Completa las variables con tus credenciales de Firebase:

```env
VITE_FIREBASE_API_KEY=tu_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto-id
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
VITE_ADMIN_EMAIL=admin@tudominio.com
```

#### c) Configurar reglas de Firestore

Copia el contenido de `firestore.rules` a las reglas de tu proyecto en Firebase Console.

**IMPORTANTE:** Actualiza el email de administrador en `firestore.rules`:

```javascript
function isAdmin() {
  return request.auth != null && 
    request.auth.token.email.lower() == 'tu-email-admin@ejemplo.com';
}
```

O mejor aún, usa **Custom Claims** (recomendado):

```javascript
function isAdmin() {
  return request.auth != null && request.auth.token.role == 'admin';
}
```

[Guía de Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)

### 4. Crear usuario administrador

Después de configurar Firebase Auth, crea tu usuario administrador:

1. Ve a Firebase Console > Authentication > Users
2. Click en "Add user"
3. Ingresa el email que definiste en `VITE_ADMIN_EMAIL`
4. Establece una contraseña segura
5. (Opcional) Si usas Custom Claims, asigna el rol 'admin' mediante Firebase Admin SDK

### 5. Configurar Firebase Hosting (Opcional)

Si deseas desplegar en Firebase Hosting:

1. Instala Firebase CLI globalmente:
   ```bash
   npm install -g firebase-tools
   ```

2. Autentícate:
   ```bash
   firebase login
   ```

3. Actualiza `.firebaserc` con tu Project ID:
   ```json
   {
     "projects": {
       "default": "tu-proyecto-id"
     }
   }
   ```

## 🚀 Desarrollo

### Ejecutar en modo desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

### Construir para producción

```bash
npm run build
```

Los archivos optimizados se generarán en la carpeta `dist/`

### Vista previa del build

```bash
npm run preview
```

## 🔥 Despliegue en Firebase

```bash
# Construir la aplicación
npm run build

# Desplegar a Firebase Hosting
firebase deploy
```

## 🗂️ Estructura del Proyecto

```
Barberia-Sistema/
├── src/
│   ├── components/        # Componentes reutilizables
│   │   └── ui/           # Componentes de UI básicos
│   ├── context/          # Contextos de React (Auth, Barber)
│   ├── hooks/            # Custom hooks
│   ├── lib/              # Utilidades y configuración
│   │   ├── firebase.ts   # Configuración de Firebase
│   │   ├── api.ts        # Funciones de API
│   │   ├── types.ts      # Tipos TypeScript
│   │   └── ...
│   ├── pages/            # Páginas principales
│   └── main.tsx          # Punto de entrada
├── public/               # Archivos estáticos
├── .env                  # Variables de entorno (NO COMMITEAR)
├── .env.example          # Plantilla de variables de entorno
├── firebase.json         # Configuración Firebase
├── firestore.rules       # Reglas de seguridad Firestore
└── package.json
```

## 🔐 Seguridad

### Variables de Entorno

- **NUNCA** commitees el archivo `.env` al repositorio
- Usa `.env.example` como plantilla para otros desarrolladores
- En producción, configura las variables de entorno en tu plataforma de hosting

### Reglas de Firestore

Las reglas de seguridad están configuradas para:

- ✅ Acceso público a reservas (lectura/escritura para permitir reservas de clientes)
- ✅ Solo admin puede modificar clientes, planes y barberos
- ✅ Cobros protegidos por autenticación
- ✅ Lectura pública de opciones del cliente (servicios y precios)

**Revisa y ajusta** `firestore.rules` según tus necesidades específicas de seguridad.

## 📱 PWA (Progressive Web App)

La aplicación puede instalarse como app nativa en dispositivos móviles y de escritorio:

- ✅ Funciona offline (caché de recursos estáticos)
- ✅ Icono en pantalla principal
- ✅ Experiencia de app nativa
- ✅ Actualizaciones automáticas

Los usuarios verán un banner de instalación al visitar la aplicación desde dispositivos compatibles.

## 📊 Colecciones de Firestore

El sistema utiliza las siguientes colecciones:

- **`clientes`** - Información de clientes registrados
- **`planes`** - Planes de membresía activos
- **`cobros`** - Registro de pagos y transacciones
- **`jornadasReservas`** - Turnos y reservas por día
- **`opcionesCliente`** - Servicios, precios y configuración de redes sociales
- **`barberos`** - Información de los barberos del sistema

## 🎨 Personalización

### Cambiar colores del tema

Edita `src/index.css` y busca las variables CSS:

```css
:root {
  --color-primary: #0f172a;
  /* Otros colores... */
}
```

### Cambiar logo/icono

Reemplaza los siguientes archivos en `public/`:

- `Icono_nuevo.png` - Icono principal
- `icon-192.png` - Icono PWA 192x192
- `icon-512.png` - Icono PWA 512x512
- `favicon.svg` - Favicon

Luego actualiza las referencias en `index.html` y `vite.config.ts`

## 📝 Scripts Disponibles

```bash
npm run dev          # Servidor de desarrollo con hot reload
npm run build        # Construir para producción
npm run preview      # Vista previa del build de producción
firebase deploy      # Desplegar a Firebase Hosting (requiere Firebase CLI)
```

## 🐛 Troubleshooting

### Error: "Firebase not configured"

- Verifica que hayas creado el archivo `.env` con todas las variables necesarias
- Asegúrate de que las credenciales sean correctas

### Error: "Permission denied" en Firestore

- Revisa las reglas de seguridad en `firestore.rules`
- Verifica que el email del admin coincida con el configurado
- Asegúrate de estar autenticado correctamente

### El administrador no puede acceder al panel

- Verifica que `VITE_ADMIN_EMAIL` en `.env` coincida con el email de tu usuario
- Verifica que el email también esté actualizado en `firestore.rules`
- Revisa la consola del navegador para errores de autenticación

## 📄 Licencia

Proyecto privado - Personaliza según tus necesidades

---

**Desarrollado con ❤️ para barberías modernas**

