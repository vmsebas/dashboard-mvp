# 🔧 Solución de Problemas de Enrutamiento Nginx

## 📅 Fecha: 25 Junio 2025

## 🚨 Problema Identificado

### Síntomas:
- `dashboard-mvp.lisbontiles.com` mostraba la aplicación IVA en lugar del dashboard
- `iva.lisbontiles.com` también mostraba la aplicación IVA
- Logs de nginx mostraban warnings de "conflicting server name"

### Causa Raíz:
1. **Configuración duplicada en nginx.conf**:
   ```nginx
   # Archivo: /opt/homebrew/etc/nginx/nginx.conf
   include servers/*.conf;
   include servers/*;  # ⚠️ DUPLICADO - Causaba que cada archivo se cargara 2 veces
   ```

2. **Puerto conflictivo en iva-compensator.conf**:
   ```nginx
   listen 80;
   listen 8080;  # ⚠️ CONFLICTO - No necesario y causaba problemas
   ```

## ✅ Solución Aplicada

### 1. Eliminar include duplicado:
```bash
# En /opt/homebrew/etc/nginx/nginx.conf
# Eliminar la línea: include servers/*;
# Mantener solo: include servers/*.conf;
```

### 2. Remover puerto conflictivo:
```bash
# En /opt/homebrew/etc/nginx/servers/iva-compensator.conf
# Eliminar la línea: listen 8080;
# Mantener solo: listen 80;
```

### 3. Reiniciar nginx:
```bash
brew services restart nginx
```

## 🔍 Verificación

### Comandos para verificar:
```bash
# Verificar configuración nginx
nginx -t

# Ver logs de nginx
tail -f /opt/homebrew/var/log/nginx/error.log

# Verificar procesos PM2
pm2 list

# Probar aplicaciones localmente
curl http://localhost:8888  # Dashboard
curl http://localhost:5001/api/health  # IVA API
```

## 📊 Configuración Final

| Aplicación | Dominio | Puerto Local | Archivo Nginx |
|------------|---------|--------------|---------------|
| Dashboard MVP | dashboard-mvp.lisbontiles.com | 8888 | dashboard-mvp.conf |
| IVA Compensator | iva.lisbontiles.com | 5001 (API) | iva-compensator.conf |
| MiGestPro | gspro.lisbontiles.com | 3001 | MiGestPro.conf |

## 🛡️ Prevención Futura

### Reglas para evitar conflictos:
1. **Un solo include** en nginx.conf principal
2. **Un puerto por aplicación** - No usar múltiples listen
3. **Verificar antes de reload**: `nginx -t`
4. **Nombres únicos** para server_name en cada archivo
5. **Documentar cambios** en este archivo

### Script de verificación:
```bash
# Verificar configuraciones duplicadas
grep -r "server_name" /opt/homebrew/etc/nginx/servers/ | sort | uniq -d

# Verificar puertos en uso
lsof -i -P | grep LISTEN | grep nginx
```

## 🚀 Para Redeploy de Aplicaciones

### Proceso seguro:
1. Verificar puerto disponible
2. Actualizar aplicación con nuevo puerto si es necesario
3. Actualizar configuración nginx correspondiente
4. Probar configuración: `nginx -t`
5. Recargar nginx: `brew services reload nginx`
6. Verificar en logs que no hay conflictos

### Ejemplo de redeploy:
```bash
# 1. Cambiar puerto en PM2
pm2 stop app-name
PORT=NEW_PORT pm2 restart app-name --update-env

# 2. Actualizar nginx config
# Editar /opt/homebrew/etc/nginx/servers/app-name.conf
# Cambiar proxy_pass http://127.0.0.1:NEW_PORT;

# 3. Verificar y recargar
nginx -t && brew services reload nginx
```

## 📝 Notas Importantes

- Los conflictos de nginx pueden hacer que las aplicaciones se mezclen
- Siempre verificar logs después de cambios
- El orden de carga de archivos puede afectar el comportamiento
- Los warnings en logs de nginx indican problemas potenciales

---
Documentado por: Claude
Problema resuelto: ✅