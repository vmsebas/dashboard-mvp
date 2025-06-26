# CLAUDE.md

Este archivo proporciona orientación a Claude Code cuando trabaja con este repositorio.

## Proyecto: dashboard-mvp

### Visión General del Proyecto
Panel de control central para gestión del servidor Mac Mini con monitoreo en tiempo real, gestión universal de proyectos y sistema de historial completo.

### Estructura del Proyecto
- **Tipo**: Node.js
- **Ubicación**: /Users/mini-server/server-dashboard-mvp
- **Tecnología**: Node.js/JavaScript (Express + Socket.io)
- **Frontend**: Bootstrap 5 + JavaScript Vanilla
- **Tiempo real**: WebSockets para monitoreo en vivo

### Características Principales
- 📊 Monitoreo en tiempo real del sistema (CPU, RAM, Disco, Uptime)
- 🚀 Gestión universal de proyectos (Iniciar, Deploy, Cerrar)
- 📜 Sistema de historial completo con estadísticas
- 🌐 Gestión de dominios con Cloudflare
- 🗄️ Explorador de bases de datos (PostgreSQL, MySQL)
- 📋 Logs en tiempo real (Sistema, Nginx, PM2, Docker)
- 💾 Sistema de backups automatizado
- 🌓 Modo oscuro/claro
- 📄 Visor de documentación MD de proyectos

### Integración con Scripts Universales
```bash
# Cerrar proyecto con versionado
/Users/mini-server/project-management/scripts/project-close.sh <ruta-proyecto>

# Iniciar proyecto inteligentemente
/Users/mini-server/project-management/scripts/project-start.sh <ruta-proyecto> [dev|prod]

# Deploy de proyecto con dominio
/Users/mini-server/project-management/scripts/project-deploy.sh <ruta-proyecto> [subdominio] [puerto]
```

### Endpoints de API
- `GET /api/system/status` - Estado del sistema
- `GET /api/apps` - Lista de aplicaciones
- `GET /api/projects` - Lista de proyectos
- `POST /api/projects/:id/close` - Cerrar proyecto
- `POST /api/projects/:id/start` - Iniciar proyecto
- `POST /api/projects/:id/deploy` - Deploy proyecto
- `GET /api/projects/history` - Historial completo
- `GET /api/projects/:id/docs` - Archivos MD del proyecto
- `GET /api/domains` - Lista de dominios
- `GET /api/databases` - Lista de bases de datos

### Actualizaciones Recientes (2025-06-25 - Sesión 2)
- ✅ Sistema de historial completamente funcional
- ✅ Integración con GitHub token para push automático
- ✅ Scripts universales mejorados con logging
- ✅ Deploy script ahora muestra URLs de Cloudflare y Tailscale
- ✅ Confirmación interactiva de subdominio en deploy
- ✅ Documentación completa de flujos en `/project-management/docs/`
- ✅ Visor de archivos MD integrado en proyectos
- ✅ Errores de sintaxis en project-deploy.sh corregidos
- ✅ Selección de dominio en modal de deploy (lisbontiles.com/net, vimasero.com)
- ✅ Función eliminar proyectos con confirmación
- ✅ Fix "Command failed" - simplificada detección PM2
- ✅ Autenticación Basic Auth implementada (reemplazó Clerk)
- ✅ Limpieza completa de código Clerk no utilizado

### Autenticación
- **Tipo**: Basic Auth (HTTP Basic Authentication)
- **Usuarios configurados**:
  - Usuario: `admin` / Contraseña: `dashboard2025`
  - Usuario: `mini-server` / Contraseña: `miniserver123`
- **Configuración**: Variables en `.env`

### Comandos de Desarrollo
```bash
# Iniciar servidor de desarrollo
npm run dev  # o node server.js

# Ver logs
pm2 logs dashboard-mvp

# Reiniciar con nuevas variables de entorno
pm2 restart dashboard-mvp --update-env

# Test de autenticación
curl -u admin:dashboard2025 http://localhost:8888/api/auth/check

# Acceder al dashboard
# Local: http://localhost:8888
# Cloudflare: https://dashboard.lisbontiles.com (cuando esté configurado)
# Tailscale: https://mini-server:8888
```




## Project Closure Information

**Closed:** 2025-06-25 21:31:11
**Version:** v0.0.25
**Status:** ✅ Closed via Universal Script

### Closure Summary:
- Project successfully closed via automated script
- Git repository initialized with existing GitHub remote - GitHub connection established
- All changes committed and tagged
- ✅ ✅ Successfully pushed to GitHub - ✅ ✅ Successfully pushed to GitHub

### Repository Status:
- ✅ **GitHub**: [https://github.com/vmsebas/dashboard-mvp](https://github.com/vmsebas/dashboard-mvp)
 - ✅ **Version**: v0.0.25 available on GitHub
 - ✅ **Tags**: All tags pushed successfully
- ⚠️ **GitHub**: Not configured yet
- 📋 **Setup GitHub**:
  1. Create repository: https://github.com/new
  2. Add remote: `git remote add origin https://github.com/username/server-dashboard-mvp.git`
  3. Push: `git push -u origin main --tags`

### Project Details:
- **Type**: Node.js
- **Technology**: JavaScript/Node.js
- **Git Status**: InitializedExisting
- **Changes**: CommittedNone

### Development Notes:
- Last closure: 2025-06-25 21:31:11
- Automated via universal closure script
- Version management: Semantic versioning (major.minor.patch)
- All project files properly versioned and documented


### Funcionalidades Clave Añadidas
1. **Selección de Dominio en Deploy**:
   - Dropdown con 3 dominios disponibles
   - Preview en tiempo real de la URL final
   - Dominio se pasa correctamente al script de deploy

2. **Eliminar Proyectos**:
   - Botón con icono de papelera en cada proyecto
   - Confirmación obligatoria antes de eliminar
   - Elimina de PM2 y del sistema de archivos

3. **Autenticación Basic Auth**:
   - Protege todo el dashboard y las APIs
   - Configuración simple en `.env`
   - Sin dependencias externas complejas


## Project Closure Information

**Closed:** 2025-06-25 23:55:43
**Version:** v0.0.26
**Status:** ✅ Closed via Universal Script

### Closure Summary:
- Project successfully closed via automated script
- Git repository initialized with existing GitHub remote - GitHub connection established
- All changes committed and tagged
- ✅ Successfully pushed to GitHub - ✅ Successfully pushed to GitHub

### Repository Status:
- ✅ **GitHub**: [https://github.com/vmsebas/dashboard-mvp](https://github.com/vmsebas/dashboard-mvp)
 - ✅ **Version**: v0.0.26 available on GitHub
 - ✅ **Tags**: All tags pushed successfully
- ⚠️ **GitHub**: Not configured yet
- 📋 **Setup GitHub**:
  1. Create repository: https://github.com/new
  2. Add remote: `git remote add origin https://github.com/username/server-dashboard-mvp.git`
  3. Push: `git push -u origin main --tags`

### Project Details:
- **Type**: Node.js
- **Technology**: JavaScript/Node.js
- **Git Status**: InitializedExisting
- **Changes**: CommittedNone

### Development Notes:
- Last closure: 2025-06-25 23:55:43
- Automated via universal closure script
- Version management: Semantic versioning (major.minor.patch)
- All project files properly versioned and documented


