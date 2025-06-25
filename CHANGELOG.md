# 📋 Changelog - Mac Mini Server Dashboard

## [2.0.0] - 2025-06-25

### ✨ Nuevas Funcionalidades

#### 🌙 Modo Oscuro Completo
- Botón de cambio entre tema claro/oscuro en la barra superior
- Persistencia del tema seleccionado en localStorage
- CSS optimizado para visibilidad en modo oscuro
- Correcciones específicas para tablas y formularios
- Animaciones suaves de transición entre temas

#### 🌐 Gestión de Dominios y Subdominios
- Vista jerárquica agrupada por dominio principal
- Soporte para múltiples dominios (lisbontiles.com, lisbontiles.net, vimasero.com)
- Integración completa con Cloudflare API
- Diferenciación visual entre subdominios locales y externos
- Lista de subdominios disponibles para cada dominio
- Formulario mejorado con preview en tiempo real
- Validación de dominios activos antes de agregar subdominios
- Configuración automática de Nginx
- Contadores de subdominios (totales, locales, externos)

#### 📊 Mejoras en Base de Datos
- Explorador visual de bases de datos PostgreSQL y SQLite
- Vista árbol: BD → Tablas → Datos
- Exportación de tablas a CSV
- Backup de bases de datos con un click
- Preview de datos con paginación
- Soporte completo para modo oscuro en tablas

#### 🚀 Mejoras en Aplicaciones
- Control unificado de aplicaciones PM2 y Docker
- Logs en tiempo real con Socket.io
- Deploy desde GitHub con formulario visual
- Indicadores de estado mejorados
- Botones de acción agrupados

#### 💾 Sistema de Backups
- Información de backups en tiempo real
- Historial de backups con tamaño y estado
- Creación de backups manuales
- Próximo backup programado
- Restauración con confirmación

### 🔧 Mejoras Técnicas

#### Frontend
- Nuevo archivo `domains.js` para gestión modular
- Helper `dark-mode-helper.js` para correcciones dinámicas
- Eventos personalizados para cambios de tema
- Notificaciones mejoradas con auto-desaparición
- Animaciones fade-in para nuevos elementos
- Mejor manejo de errores con mensajes descriptivos

#### Backend
- API de dominios completamente rediseñada
- Estructura jerárquica en `domains.json`
- Validación mejorada en todos los endpoints
- Logs de error más descriptivos
- Manejo de tokens de Cloudflare

#### Estilos
- CSS Variables para temas
- Override agresivo de Bootstrap para modo oscuro
- Tamaño de fuente aumentado (16px) para mejor legibilidad
- Scrollbars personalizados en modo oscuro
- Hover states mejorados

### 🐛 Correcciones

- ✅ Tablas con fondo blanco en modo oscuro
- ✅ Texto ilegible en formularios oscuros
- ✅ Badges invisibles en modo oscuro
- ✅ Dominios no se mostraban por estructura incorrecta
- ✅ Modal de dominios no actualizaba correctamente
- ✅ Botones sin contraste adecuado

### 📁 Archivos Nuevos/Modificados

- `/public/js/domains.js` - Nueva gestión de dominios
- `/public/js/dark-mode-helper.js` - Correcciones de modo oscuro
- `/public/css/dark-mode-fixes.css` - Estilos específicos modo oscuro
- `/server.js` - APIs mejoradas
- `/public/index.html` - UI actualizada
- `/domains.json` - Nueva estructura con datos reales

### 📊 Estado Actual

- **3 dominios** configurados (1 pendiente)
- **6 subdominios** activos en lisbontiles.com
- **Modo oscuro** 100% funcional
- **Todas las tablas** visibles y legibles
- **Deploy automático** desde GitHub operativo

### 🚀 Próximas Mejoras Planificadas

1. Gráficas de métricas históricas con Chart.js
2. Terminal integrada en el dashboard
3. Editor de archivos de configuración
4. Sistema de alertas y notificaciones push
5. Autenticación básica para seguridad
6. Logs de auditoría de cambios
7. API REST documentada
8. Gestión de certificados SSL

---

## [1.0.0] - 2025-06-24

### 🎉 Release Inicial

- Dashboard básico con métricas del sistema
- Control de aplicaciones PM2
- Vista simple de dominios
- Tema claro únicamente
- Funcionalidades básicas de servidor

---

Dashboard desarrollado para Mac Mini Server M4 🖥️
Última actualización: 2025-06-25 01:30 WEST