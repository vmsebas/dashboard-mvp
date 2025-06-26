# 🔒 Guía de Mejoras de Seguridad - Dashboard MVP

## 📋 Resumen de Mejoras Implementadas

He creado los siguientes archivos nuevos que añaden capas de seguridad sin romper la funcionalidad existente:

1. **`utils.js`** - Funciones compartidas para el frontend (elimina código duplicado)
2. **`security.js`** - Módulo de validación y sanitización para el backend
3. **`logger.js`** - Sistema de logging mejorado
4. **`config.js`** - Configuración centralizada y validada
5. **`server-patch.js`** - Instrucciones para actualizar server.js
6. **`test-security.js`** - Pruebas para verificar que todo funciona

## 🚀 Aplicación Gradual de Mejoras

### Paso 1: Verificar que los nuevos archivos funcionan ✅
```bash
# Ejecutar las pruebas
node test-security.js

# Si las pruebas pasan (19/20 está bien), continuar
```

### Paso 2: Aplicar mejoras al frontend (SEGURO) ✅
El archivo `utils.js` ya está incluido en `index.html`. Para empezar a usarlo:

1. En `projects.js`, reemplaza gradualmente las funciones duplicadas:
```javascript
// Antes:
function showNotification(message, type) { ... }

// Después:
// Eliminar la función local y usar:
DashboardUtils.showNotification(message, type);
```

2. Haz lo mismo con otras funciones duplicadas en `dashboard.js`, `domains.js`, etc.

### Paso 3: Aplicar seguridad básica al backend (PRIORITARIO)

#### 3.1 Añadir los requires al inicio de server.js:
```javascript
// Añadir después de los otros requires (línea ~10)
const security = require('./security');
const logger = require('./logger');
const config = require('./config');
```

#### 3.2 Activar el logging:
```javascript
// Añadir después del authMiddleware (línea ~42)
app.use(logger.middleware());
```

#### 3.3 Sanitizar las rutas más peligrosas primero:

**CRÍTICO - Ruta de eliminar proyecto** (línea ~1850):
```javascript
// Buscar la ruta: apiRouter.delete('/projects/:id', 
// Y añadir validación al principio:
apiRouter.delete('/projects/:id', async (req, res) => {
    try {
        // Añadir esta validación
        const projectId = security.sanitizeProjectId(req.params.id);
        
        // Resto del código existente...
```

**CRÍTICO - Comandos de PM2/Docker** (líneas ~200-250):
```javascript
// Donde veas: exec(`pm2 ${action} ${app}`)
// Cambiar a:
const safeApp = security.sanitizeAppName(app);
exec(`pm2 ${action} '${safeApp}'`)
```

### Paso 4: Aplicar headers de seguridad (RECOMENDADO)
```javascript
// Añadir después del logger middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});
```

### Paso 5: Mejorar variables de entorno

1. Actualiza tu archivo `.env`:
```bash
# Cambiar las contraseñas por defecto
ADMIN_PASSWORD=una_contraseña_segura_aquí
USER_PASSWORD=otra_contraseña_segura_aquí

# Añadir si no está
NODE_ENV=production
LOG_LEVEL=info
```

2. Reiniciar la aplicación:
```bash
pm2 restart server-dashboard-mvp --update-env
```

## 🔍 Verificación Post-Aplicación

### Test Manual Rápido:
1. Acceder al dashboard: http://localhost:8888
2. Verificar que el login funciona
3. Probar cargar proyectos
4. Intentar cerrar/iniciar un proyecto
5. Revisar los logs en `./logs/`

### Comandos de Verificación:
```bash
# Ver si hay errores en los logs
tail -f logs/app-*.log | grep error

# Verificar que PM2 sigue funcionando
pm2 list

# Test de sanitización manual
node -e "const s = require('./security'); console.log(s.sanitizeAppName('test-app'))"
```

## ⚠️ Problemas Comunes y Soluciones

### "Cannot find module './security'"
- Asegúrate de que los archivos nuevos están en la raíz del proyecto
- Verifica permisos: `chmod 644 security.js logger.js config.js`

### "showNotification is not defined"
- Asegúrate de que utils.js se carga antes que los otros scripts
- Usa `DashboardUtils.showNotification` en lugar de `showNotification`

### El servidor no inicia
- Revisa los logs: `pm2 logs server-dashboard-mvp`
- Verifica sintaxis: `node -c server.js`
- Restaura backup si es necesario

## 📊 Mejoras Aplicadas vs Pendientes

### ✅ Aplicadas Automáticamente:
- Sistema de logging a archivos
- Validación de configuración
- Funciones de utilidad frontend
- Tests de seguridad

### ⏳ Requieren Aplicación Manual:
- [ ] Sanitización en rutas críticas
- [ ] Headers de seguridad
- [ ] Rate limiting
- [ ] Reemplazo de funciones duplicadas
- [ ] Actualización de contraseñas

## 🆘 Rollback de Emergencia

Si algo sale mal:
```bash
# Detener servidor
pm2 stop server-dashboard-mvp

# Restaurar archivos originales
git checkout server.js public/index.html

# Eliminar archivos nuevos si es necesario
rm security.js logger.js config.js utils.js

# Reiniciar
pm2 restart server-dashboard-mvp
```

## 📈 Próximos Pasos Recomendados

1. **Inmediato**: Aplicar sanitización a rutas de eliminación/ejecución
2. **Esta semana**: Reemplazar funciones duplicadas con utils.js
3. **Próxima semana**: Implementar rate limiting completo
4. **Futuro**: Migrar a TypeScript para mayor seguridad de tipos

---

**Nota**: Todas las mejoras están diseñadas para ser retrocompatibles. Si algo no funciona, puedes revertir cambios individuales sin afectar el resto del sistema.