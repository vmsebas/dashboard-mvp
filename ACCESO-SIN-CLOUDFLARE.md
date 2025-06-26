# 🔧 Guía de Acceso Sin Cloudflare

## ❌ Problema Actual
- **Cloudflare Tunnel está caído** (Error 1033)
- El servicio `cloudflared` está en estado de error
- URLs como `iva.lisbontiles.com` no funcionan

## ✅ Soluciones Inmediatas (sin Cloudflare)

### 1. 🏠 Acceso Local Directo
```
http://localhost:5001
```
- **Cuándo usar**: Cuando estés en el Mac Mini
- **Pros**: Siempre funciona, más rápido
- **Contras**: Solo desde el propio servidor

### 2. 🔒 Acceso con Tailscale (RECOMENDADO)
```
https://mac-mini-de-mini-server:5001
```
- **Cuándo usar**: Acceso remoto seguro desde cualquier lugar
- **Pros**: Más seguro que Cloudflare, encriptado, sin dependencias externas
- **Contras**: Requiere Tailscale instalado en el dispositivo cliente

#### Instalar Tailscale en tu dispositivo:
- **Mac/PC**: [https://tailscale.com/download](https://tailscale.com/download)
- **Móvil**: Buscar "Tailscale" en App Store/Play Store
- **Comando**: `tailscale up` después de instalar

### 3. 📱 Acceso en Red Local
```
http://192.168.1.226:5001
```
- **Cuándo usar**: Desde otros dispositivos en la misma red WiFi
- **Pros**: No requiere instalación adicional
- **Contras**: Solo funciona en la misma red

## 🎯 Aplicaciones Disponibles

| Aplicación | Local | Tailscale | Red Local |
|------------|-------|-----------|-----------|
| **IVA Compensator** | `http://localhost:5001` | `https://mac-mini-de-mini-server:5001` | `http://192.168.1.226:5001` |
| **Dashboard MVP** | `http://localhost:4200` | `https://mac-mini-de-mini-server:4200` | `http://192.168.1.226:4200` |
| **MiGestPro** | `http://localhost:3001` | `https://mac-mini-de-mini-server:3001` | `http://192.168.1.226:3001` |

## 🛠️ Diagnóstico y Reparación de Cloudflare (Opcional)

Si quieres intentar arreglar Cloudflare:

### 1. Verificar Estado
```bash
brew services list | grep cloudflared
ps aux | grep cloudflared
```

### 2. Reiniciar Servicio
```bash
brew services restart cloudflared
```

### 3. Verificar Configuración
```bash
cat ~/.cloudflared/config.yml
```

### 4. Logs de Diagnóstico
```bash
brew services restart cloudflared
tail -f ~/Library/Logs/Homebrew/cloudflared/cloudflared.log
```

## 💡 Recomendación Final

**Usa Tailscale como solución principal:**

1. **Más confiable**: No depende de servicios externos
2. **Más seguro**: Conexión encriptada punto a punto
3. **Más rápido**: Conexión directa sin intermediarios
4. **Mejor experiencia**: El dashboard ya muestra las URLs de Tailscale

## 🔗 Enlaces Útiles

- [Tailscale Documentation](https://tailscale.com/kb/)
- [Tailscale Funnel](https://tailscale.com/kb/1223/tailscale-funnel/) - Para acceso público temporal
- [Dashboard Local](http://localhost:4200) - Gestión de proyectos

---
*Documento generado el 26 de junio de 2025 para resolver problemas de acceso con Cloudflare*