# 🎯 Mac Mini Server Dashboard

Dashboard web completo para gestionar tu Mac Mini Server con interfaz moderna y modo oscuro.

## ✨ Características

### 🌙 Modo Oscuro
- Cambio instantáneo entre tema claro y oscuro
- Persistencia de preferencia en localStorage
- Diseño optimizado para ambos modos
- Texto aumentado para mejor legibilidad (16px)

### 📊 Métricas del Sistema
- CPU, RAM, Disco en tiempo real
- Tendencias con indicadores visuales
- Uptime del servidor
- Actualización cada 5 segundos

### 🚀 Gestión de Aplicaciones
- Control de aplicaciones PM2 y Docker
- Start/Stop/Restart con confirmación
- Vista de logs en tiempo real
- Deploy desde GitHub con formulario visual

### 🗄️ Bases de Datos
- Explorador visual PostgreSQL y SQLite
- Vista de tablas y datos
- Exportación a CSV
- Backup con un click
- Navegación BD → Tablas → Datos

### 🌐 Dominios
- Gestión de subdominios Cloudflare
- Agregar/eliminar subdominios
- Verificación SSL automática
- Enlaces directos a aplicaciones

### 📜 Logs en Tiempo Real
- Sistema, Nginx, PM2, Docker
- Streaming con Socket.io
- Cambio de fuente de logs dinámico
- Auto-scroll inteligente

### 💾 Sistema de Backups
- Backups manuales y programados
- Historial de backups
- Restauración con confirmación
- Información de tamaño y fechas

### 🔔 Notificaciones
- Alertas visuales de operaciones
- Auto-desaparición después de 5 segundos
- Diferentes tipos: success, error, warning, info

## 🚀 Instalación

```bash
# El dashboard ya está instalado en:
/Users/mini-server/server-dashboard-mvp/

# Para iniciar manualmente:
cd /Users/mini-server/server-dashboard-mvp
pm2 start server.js --name dashboard-mvp
```

## 🎯 Uso

### Opción 1: Ícono en Desktop
Doble click en `Dashboard-Web-Pro.command`

### Opción 2: Navegador
Abrir http://localhost:8888

## 🛠️ Tecnologías

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Bootstrap 5 + JavaScript vanilla
- **Tiempo Real**: Socket.io para logs y métricas
- **Tema**: CSS Variables para modo oscuro
- **Iconos**: Bootstrap Icons

## 📁 Estructura

```
server-dashboard-mvp/
├── server.js           # Backend Express + Socket.io
├── public/
│   ├── index.html     # Dashboard HTML
│   ├── css/
│   │   └── dark-mode-fixes.css  # Correcciones modo oscuro
│   └── js/
│       └── dashboard.js  # Lógica del cliente
├── package.json
└── README.md
```

## 🔧 Configuración

### Variables de Entorno
Crear archivo `.env`:
```
CLOUDFLARE_API_TOKEN=tu-token-aqui
```

### Puertos
- Dashboard: 8888
- Socket.io: mismo puerto (8888)

## 🐛 Solución de Problemas

### El modo oscuro no se ve bien
- Verificar que dark-mode-fixes.css esté cargado
- Limpiar caché del navegador
- Revisar consola por errores CSS

### Las aplicaciones no cargan
- Verificar que PM2 esté corriendo: `pm2 list`
- Verificar Docker: `docker ps`
- Revisar logs: `pm2 logs dashboard-mvp`

### Los logs no se actualizan
- Verificar conexión Socket.io en consola
- Revisar permisos de archivos de log
- Reiniciar dashboard: `pm2 restart dashboard-mvp`

## 📝 Notas

- El dashboard requiere permisos para ejecutar comandos del sistema
- Los backups se guardan en `/Users/mini-server/backups/`
- Las métricas se actualizan cada 5 segundos
- El tema seleccionado se guarda en localStorage

## 🚀 Mejoras Futuras

- [ ] Gráficas históricas con Chart.js
- [ ] Autenticación básica
- [ ] Configuración de alertas
- [ ] Terminal integrada
- [ ] Gestión de usuarios SSH

---
Dashboard creado para Mac Mini Server M4 🖥️