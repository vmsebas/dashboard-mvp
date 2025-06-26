# 🌐 Acceso Público con Tailscale Funnel

## ✅ Configuración Completada

**Tailscale Funnel** está ahora configurado y funcionando para acceso público desde cualquier lugar de internet, sin necesidad de VPN.

## 🔗 URLs Públicas Disponibles

### 📊 Dashboard MVP (Principal)
```
https://mac-mini-de-mini-server.taila3381.ts.net/
```
- **Puerto local**: 4200
- **Autenticación**: Basic Auth
  - Usuario: `admin` | Contraseña: `AdminSecure2025$Dashboard`
  - Usuario: `mini-server` | Contraseña: `MiniServer#Secure2025!`
- **Estado**: ✅ Funcionando perfectamente

### 💼 MiGestPro
```
https://mac-mini-de-mini-server.taila3381.ts.net/migestpro
```
- **Puerto local**: 3001
- **Estado**: ✅ Funcionando (HTTP 200)

### 📈 IVA Compensator API
```
https://mac-mini-de-mini-server.taila3381.ts.net/iva
```
- **Puerto local**: 5001
- **Estado**: ⚠️ Disponible (puede requerir rutas específicas)

## 🛠️ Comandos de Gestión

### Ver Estado Actual
```bash
tailscale funnel status
```

### Desactivar Funnel (si necesario)
```bash
tailscale funnel --https=443 off
```

### Reactivar Funnel
```bash
tailscale funnel --bg 4200
tailscale funnel --bg --set-path=/migestpro 3001
tailscale funnel --bg --set-path=/iva 5001
```

### Agregar Nueva Aplicación
```bash
# Ejemplo para puerto 6000 en ruta /nueva-app
tailscale funnel --bg --set-path=/nueva-app 6000
```

## 🔐 Características de Seguridad

- **Cifrado end-to-end**: Todo el tráfico está cifrado via HTTPS
- **Autenticación por aplicación**: Cada app mantiene su propia autenticación
- **No requiere configuración de puertos**: Tailscale maneja toda la configuración de red
- **Acceso controlado**: Solo las aplicaciones específicamente configuradas son accesibles

## 📱 Acceso desde Dispositivos

Las URLs funcionan desde:
- ✅ **Navegadores web** (cualquier dispositivo)
- ✅ **Aplicaciones móviles** (con las URLs)
- ✅ **APIs y scripts** (curl, wget, etc.)
- ✅ **Sin VPN requerida** (acceso directo desde internet)

## 🎯 Ventajas sobre Cloudflare Tunnel

1. **Más estable**: No depende de servicios externos inestables
2. **Configuración más simple**: Un solo comando por aplicación
3. **Múltiples aplicaciones**: Rutas diferentes en la misma URL base
4. **Cero configuración DNS**: Tailscale maneja todo automáticamente
5. **Más seguro**: Red zero-trust de Tailscale

## ⚠️ Importante

- La configuración se ejecuta en **background** y persiste entre reinicios
- Para cambios permanentes, los comandos deben ejecutarse como `mini-server`
- Las URLs son **públicas** pero mantienen la autenticación de cada aplicación
- El hostname `mac-mini-de-mini-server.taila3381.ts.net` es único para esta instalación

---
*Configurado el 26 de junio de 2025*
*Tailscale Funnel - Acceso público sin VPN*