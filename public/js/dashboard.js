// Configurar autenticación para Socket.io
const socket = io({
    auth: {
        // Las credenciales se enviarán automáticamente desde el navegador
        // ya que estamos en una sesión autenticada
    },
    extraHeaders: {
        // El navegador enviará automáticamente el header Authorization
        // de la sesión Basic Auth actual
    }
});

// Estado global
let currentTheme = localStorage.getItem('theme') || 'light';
let metricsHistory = { cpu: [], memory: [], disk: [] };
let selectedDb = null;
let selectedTable = null;
let tailscaleInfo = null;

// Inicialización del dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
});

// --- Dashboard Initialization ---
function initializeDashboard() {
    applyTheme(currentTheme);
    initializeTime();
    
    // Mostrar skeleton loaders mientras carga
    showSkeletonLoader('apps-table', 3);
    
    loadInitialData();
    setupSocketListeners();
    setupEventListeners();
}

// Función para mostrar skeleton loaders
function showSkeletonLoader(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (containerId === 'apps-table') {
        // Skeleton para tabla de apps
        const skeleton = `
            <tr>
                <td><div class="skeleton-line" style="width: 20px; height: 20px; border-radius: 50%;"></div></td>
                <td><div class="skeleton-line" style="width: 120px;"></div></td>
                <td><div class="skeleton-line" style="width: 60px;"></div></td>
                <td><div class="skeleton-line" style="width: 60px;"></div></td>
                <td><div class="skeleton-line" style="width: 40px;"></div></td>
                <td><div class="skeleton-line" style="width: 80px;"></div></td>
                <td><div class="skeleton-line" style="width: 60px;"></div></td>
                <td><div class="skeleton-line" style="width: 200px; height: 30px;"></div></td>
            </tr>
        `;
        container.innerHTML = skeleton.repeat(count);
    }
}

// Tema oscuro/claro
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(currentTheme);
    localStorage.setItem('theme', currentTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    window.dispatchEvent(new Event('theme-changed'));
    setTimeout(() => {
        document.querySelectorAll('.table td, .table th, .table tr').forEach(el => {
            el.style.removeProperty('background-color');
        });
    }, 100);
}

// Actualizar hora
function initializeTime() {
    const updateTime = () => {
        const timeEl = document.getElementById('time');
        if(timeEl) {
            timeEl.textContent = new Date().toLocaleTimeString('es-ES');
        }
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Cargar datos iniciales
async function loadInitialData() {
    await Promise.all([
        loadServerStatus(),
        loadTailscaleInfo(),
        loadApplications(),
        loadDatabases(),
        loadDomains(),
        loadBackupInfo()
    ]);
}

// Estado del servidor
async function loadServerStatus() {
    try {
        const response = await fetch('/api/system/status');
        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        
        updateMetric('cpu', data.cpu, '%');
        updateMetric('memory', data.memory.percent, '%');
        updateMetric('disk', data.disk.percent, '%');
        document.getElementById('uptime').textContent = formatUptime(data.uptime);
        updateMetricsHistory(data);
    } catch (error) {
        console.error('Error loading server status:', error);
        DashboardUtils.showNotification('Error al cargar estado del servidor', 'error');
    }
}

function updateMetric(id, value, suffix = '') {
    const element = document.getElementById(id);
    if (!element) return;
    const oldValue = parseFloat(element.textContent) || 0;
    element.textContent = `${value}${suffix}`;
    
    // Aplicar clases según umbrales para indicadores visuales
    const cardElement = element.closest('.metric-card');
    if (cardElement) {
        const thresholds = {
            cpu: { warning: 70, danger: 90 },
            memory: { warning: 80, danger: 95 },
            disk: { warning: 80, danger: 90 }
        };
        
        const threshold = thresholds[id];
        if (threshold) {
            // Remover clases anteriores
            cardElement.classList.remove('critical', 'warning');
            element.classList.remove('metric-value', 'warning', 'danger');
            
            if (value >= threshold.danger) {
                cardElement.classList.add('critical');
                element.classList.add('metric-value', 'danger');
            } else if (value >= threshold.warning) {
                cardElement.classList.add('warning');
                element.classList.add('metric-value', 'warning');
            }
        }
    }
    
    const trendElement = document.getElementById(`${id}-trend`);
    if (trendElement && oldValue !== 0) {
        const diff = value - oldValue;
        if (Math.abs(diff) > 0.5) {
            trendElement.innerHTML = diff > 0 
                ? `<i class="bi bi-arrow-up-short trend-up"></i> ${diff.toFixed(1)}%`
                : `<i class="bi bi-arrow-down-short trend-down"></i> ${Math.abs(diff).toFixed(1)}%`;
        }
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// Cargar estado de Tailscale
async function loadTailscaleStatus() {
    try {
        const response = await fetch('/api/system/tailscale');
        if (!response.ok) {
            console.warn('Tailscale endpoint not available yet, will retry');
            tailscaleInfo = { installed: false, active: false };
            updateTailscaleUI();
            return;
        }
        tailscaleInfo = await response.json();
        
        // Hacer disponible globalmente
        window.tailscaleInfo = tailscaleInfo;
        
        updateTailscaleUI();
    } catch (error) {
        console.error('Error loading Tailscale status:', error);
        tailscaleInfo = { installed: false, active: false };
        updateTailscaleUI();
    }
}

// Actualizar UI con información de Tailscale
function updateTailscaleUI() {
    // Crear o actualizar indicador de Tailscale en el header
    let tailscaleIndicator = document.getElementById('tailscale-indicator');
    if (!tailscaleIndicator) {
        // Crear el indicador si no existe
        const headerRight = document.querySelector('.d-flex.align-items-center.gap-3');
        if (headerRight) {
            tailscaleIndicator = document.createElement('div');
            tailscaleIndicator.id = 'tailscale-indicator';
            tailscaleIndicator.className = 'tailscale-status';
            
            // Insertar antes del selector de tema
            const themeSelector = headerRight.querySelector('[onclick*="toggleTheme"]');
            headerRight.insertBefore(tailscaleIndicator, themeSelector);
        }
    }
    
    if (tailscaleIndicator) {
        if (!tailscaleInfo.installed) {
            tailscaleIndicator.innerHTML = `
                <span class="badge bg-secondary" data-bs-toggle="tooltip" title="Tailscale no instalado">
                    <i class="bi bi-shield-x"></i> Tailscale
                </span>`;
        } else if (!tailscaleInfo.active) {
            tailscaleIndicator.innerHTML = `
                <span class="badge bg-warning" data-bs-toggle="tooltip" title="Tailscale instalado pero inactivo">
                    <i class="bi bi-shield-exclamation"></i> Tailscale Off
                </span>`;
        } else {
            const hostname = tailscaleInfo.hostname || 'mini-server';
            const tooltipContent = `Tailscale activo\nHostname: ${hostname}\nIP: ${tailscaleInfo.ip || 'N/A'}${tailscaleInfo.funnel ? '\nFunnel: Activo' : ''}`;
            
            tailscaleIndicator.innerHTML = `
                <span class="badge bg-success" data-bs-toggle="tooltip" title="${tooltipContent}">
                    <i class="bi bi-shield-check"></i> ${hostname}
                    ${tailscaleInfo.funnel ? '<i class="bi bi-broadcast ms-1"></i>' : ''}
                </span>`;
        }
        
        // Reinicializar tooltips
        const tooltips = tailscaleIndicator.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltips.forEach(el => new bootstrap.Tooltip(el));
    }
    
    // Actualizar URLs en aplicaciones si Tailscale está activo
    if (tailscaleInfo.active && tailscaleInfo.hostname) {
        window.tailscaleHostname = tailscaleInfo.hostname;
        window.tailscaleSuffix = tailscaleInfo.magicDNSSuffix;
    }
}

// Función para actualizar las opciones de aplicaciones en dominios
function updateDomainAppOptions(apps) {
    // Esta función se usa en domains.js para actualizar las opciones
    if (window.updateDomainAppsCallback) {
        window.updateDomainAppsCallback(apps);
    }
}

// Función para actualizar badges en las pestañas
function updateTabBadges() {
    // Contar elementos que necesitan atención
    const counts = {
        apps: document.querySelectorAll('.app-status.status-stopped, .app-status.status-error').length,
        projects: document.querySelectorAll('.project-warning').length,
        backups: document.querySelectorAll('.backup-pending').length || 0
    };
    
    // Actualizar cada badge
    Object.entries(counts).forEach(([tab, count]) => {
        const tabLink = document.querySelector(`[href="#${tab}"]`);
        if (!tabLink) return;
        
        let badge = tabLink.querySelector('.badge');
        
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'badge bg-danger rounded-pill ms-2';
                tabLink.appendChild(badge);
            }
            badge.textContent = count;
        } else if (badge) {
            badge.remove();
        }
    });
}

// Aplicaciones
async function loadApplications() {
    try {
        const response = await fetch('/api/apps/status');
        if (!response.ok) throw new Error('Failed to fetch apps');
        const data = await response.json();
        
        const tbody = document.getElementById('apps-table');
        const apps = [...(data.pm2 || []), ...(data.docker || [])];
        
        if (apps.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center">
                        <div class="empty-state py-4">
                            <i class="bi bi-app-indicator display-4 text-muted"></i>
                            <h5 class="mt-3">No hay aplicaciones en ejecución</h5>
                            <p class="text-muted">Las aplicaciones que despliegues aparecerán aquí</p>
                            <button class="btn btn-primary" onclick="showDeployFromGitHubModal()">
                                <i class="bi bi-cloud-download"></i> Deploy desde GitHub
                            </button>
                        </div>
                    </td>
                </tr>`;
            return;
        }
        
        tbody.innerHTML = apps.map(app => {
            const isPM2 = app.pm2_env !== undefined;
            const status = isPM2 ? app.pm2_env.status : app.State;
            const statusClass = getStatusClass(status);
            const port = isPM2 ? (app.port || app.pm2_env.env?.PORT || '--') : (app.Ports || '--');
            const url = app.url;
            const name = isPM2 ? app.name : app.Names;
            
            // Construir URLs de acceso
            let accessUrls = '';
            if (port !== '--') {
                // URL local siempre disponible
                accessUrls += `<a href="http://localhost:${port}" target="_blank" class="text-decoration-none me-2" title="Acceso local">
                    <i class="bi bi-house-door"></i> Local
                </a>`;
                
                // URL de Tailscale si está activo
                if (tailscaleInfo && tailscaleInfo.active && tailscaleInfo.hostname) {
                    const tailscaleUrl = tailscaleInfo.magicDNS && tailscaleInfo.magicDNSSuffix
                        ? `https://${tailscaleInfo.hostname}.${tailscaleInfo.magicDNSSuffix}:${port}`
                        : `https://${tailscaleInfo.ip}:${port}`;
                    
                    accessUrls += `<a href="${tailscaleUrl}" target="_blank" class="text-decoration-none me-2" title="Acceso vía Tailscale VPN">
                        <i class="bi bi-shield-check"></i> Tailscale
                    </a>`;
                    
                    // Si hay Funnel activo para este puerto
                    if (tailscaleInfo.funnel && tailscaleInfo.funnelPorts && tailscaleInfo.funnelPorts.includes(parseInt(port))) {
                        accessUrls += `<span class="badge bg-info ms-1" title="Accesible públicamente vía Tailscale Funnel">
                            <i class="bi bi-broadcast"></i> Funnel
                        </span>`;
                    }
                }
                
                // URL de dominio si existe
                if (url) {
                    const isCloudflare = url.includes('lisbontiles.com') || url.includes('vimasero.com');
                    const statusIcon = isCloudflare ? 
                        '<i class="bi bi-exclamation-triangle text-warning" title="Cloudflare Tunnel inestable - puede dar Error 1033"></i>' : 
                        '<i class="bi bi-globe"></i>';
                    
                    accessUrls += `<a href="${url}" target="_blank" class="text-decoration-none" title="Acceso público ${isCloudflare ? '(puede estar inestable)' : ''}">
                        ${statusIcon} ${url.replace('https://', '')}
                    </a>`;
                }
            }
            
            return `
                <tr class="fade-in">
                    <td><span class="app-status ${statusClass}"></span></td>
                    <td>
                        <strong>${name}</strong>
                        ${accessUrls ? `<div class="small mt-1">${accessUrls}</div>` : ''}
                    </td>
                    <td><span class="badge bg-secondary">${isPM2 ? 'PM2' : 'Docker'}</span></td>
                    <td>${port}</td>
                    <td>${isPM2 ? app.monit.cpu : '--'}%</td>
                    <td>${isPM2 ? formatBytes(app.monit.memory) : '--'}</td>
                    <td>${isPM2 ? formatUptime(Math.floor((Date.now() - app.pm2_env.pm_uptime) / 1000)) : '--'}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-success" onclick="controlApp('${name}', 'start', '${isPM2 ? 'pm2' : 'docker'}')"><i class="bi bi-play-fill"></i></button>
                            <button class="btn btn-warning" onclick="controlApp('${name}', 'stop', '${isPM2 ? 'pm2' : 'docker'}')"><i class="bi bi-stop-fill"></i></button>
                            <button class="btn btn-info" onclick="controlApp('${name}', 'restart', '${isPM2 ? 'pm2' : 'docker'}')"><i class="bi bi-arrow-clockwise"></i></button>
                            <button class="btn btn-secondary" onclick="viewLogs('${name}', '${isPM2 ? 'pm2' : 'docker'}')"><i class="bi bi-terminal"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        updateDomainAppOptions(apps);
        
        // Actualizar badges después de cargar apps
        updateTabBadges();
    } catch (error) {
        console.error('Error loading applications:', error);
        DashboardUtils.showNotification('Error al cargar aplicaciones', 'error');
    }
}

function getStatusClass(status) {
    if (['online', 'running'].includes(status?.toLowerCase())) return 'status-online';
    if (['stopped', 'exited'].includes(status?.toLowerCase())) return 'status-stopped';
    return 'status-error';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Control de aplicaciones
async function controlApp(name, action, type) {
    if (!confirm(`¿${action} ${name}?`)) return;
    
    try {
        const response = await fetch(`/api/apps/${encodeURIComponent(name)}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, type })
        });
        
        if (response.ok) {
            DashboardUtils.showNotification(`${DashboardUtils.escapeHtml(name)}: ${action} ejecutado`, 'success');
            setTimeout(loadApplications, 1000);
        } else {
            throw new Error('Error en la operación');
        }
    } catch (error) {
        DashboardUtils.showNotification(`Error al ${action} ${DashboardUtils.escapeHtml(name)}`, 'error');
    }
}

// Bases de datos
async function loadDatabases() {
    try {
        const response = await fetch('/api/databases/list');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        const dbList = document.getElementById('db-list');
        
        // Verificar que data tenga las propiedades esperadas
        const postgresql = data.postgresql || [];
        const sqlite = data.sqlite || [];
        
        if (postgresql.length === 0 && sqlite.length === 0) {
            dbList.innerHTML = '<div class="text-center text-muted p-3">No se encontraron bases de datos</div>';
            return;
        }
        
        dbList.innerHTML = `
            ${postgresql.map(db => `
                <div class="db-item" onclick="selectDatabase('${db}', 'postgresql')">
                    <i class="bi bi-database text-primary"></i> ${db}
                    <small class="text-secondary d-block">PostgreSQL</small>
                </div>
            `).join('')}
            ${sqlite.map(db => `
                <div class="db-item" onclick="selectDatabase('${db}', 'sqlite')">
                    <i class="bi bi-database text-success"></i> ${db.split('/').pop()}
                    <small class="text-secondary d-block">SQLite</small>
                </div>
            `).join('')}
        `;
    } catch (error) {
        console.error('Error loading databases:', error);
        DashboardUtils.showNotification('Error al cargar bases de datos', 'error');
    }
}

async function selectDatabase(db, type) {
    selectedDb = { name: db, type };
    
    document.querySelectorAll('.db-item').forEach(item => item.classList.remove('active'));
    event.target.closest('.db-item').classList.add('active');
    
    document.getElementById('db-content-title').textContent = type === 'sqlite' ? db.split('/').pop() : db;
    document.getElementById('db-actions').style.display = 'block';
    
    try {
        const response = await fetch(`/api/databases/${encodeURIComponent(db)}/tables?type=${type}`);
        if (!response.ok) throw new Error('Failed to fetch tables');
        const data = await response.json();
        
        const content = document.getElementById('db-content');
        if (data.tables.length === 0) {
            content.innerHTML = '<p class="text-center text-secondary">No hay tablas en esta base de datos</p>';
            return;
        }
        
        content.innerHTML = `
            <div class="list-group">
                ${data.tables.map(table => `
                    <a href="#" class="list-group-item list-group-item-action" onclick="loadTableData('${table}')">
                        <i class="bi bi-table"></i> ${DashboardUtils.escapeHtml(table)}
                    </a>
                `).join('')}
            </div>
        `;
    } catch (error) {
        DashboardUtils.showNotification('Error al cargar tablas', 'error');
    }
}

async function loadTableData(table) {
    selectedTable = table;
    
    try {
        const response = await fetch(`/api/databases/${encodeURIComponent(selectedDb.name)}/table/${encodeURIComponent(table)}?type=${selectedDb.type}`);
        if (!response.ok) throw new Error('Failed to fetch table data');
        const data = await response.json();
        
        const content = document.getElementById('db-content');
        content.innerHTML = `
            <h6>${DashboardUtils.escapeHtml(table)} <small class="text-secondary">(${data.count} registros)</small></h6>
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            ${data.columns.map(col => `<th>${DashboardUtils.escapeHtml(col)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.rows.map(row => `
                            <tr>
                                ${data.columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${data.rows.length < data.count ? `<p class="text-center text-secondary mt-3">Mostrando ${data.rows.length} de ${data.count} registros</p>` : ''}
        `;
    } catch (error) {
        DashboardUtils.showNotification('Error al cargar datos de la tabla', 'error');
    }
}

// Dominios
async function loadDomains() {
    // Implementación de carga de dominios
}

// Logs
function changeLogSource() {
    const source = document.getElementById('log-source').value;
    socket.emit('subscribe-logs', { source });
}

function viewLogs(app, type) {
    document.querySelector('[href="#logs"]').click();
    document.getElementById('log-source').value = type;
    socket.emit('subscribe-logs', { source: type, app });
}

// Backups
async function loadBackupInfo() {
    // Implementación de carga de backups
}

// Cargar información de Tailscale
async function loadTailscaleInfo() {
    try {
        const response = await fetch('/api/system/tailscale');
        if (!response.ok) throw new Error('Failed to fetch Tailscale info');
        const data = await response.json();
        
        tailscaleInfo = data;
        updateTailscaleIndicator(data);
        
        // Si Tailscale está activo, actualizar las URLs en las aplicaciones
        if (data.installed && data.active && data.hostname) {
            updateApplicationUrls();
        }
    } catch (error) {
        console.error('Error loading Tailscale info:', error);
        // No mostrar notificación de error ya que Tailscale es opcional
    }
}

// Actualizar indicador de Tailscale en el navbar
function updateTailscaleIndicator(info) {
    const indicator = document.getElementById('tailscale-indicator');
    const badge = indicator.querySelector('.badge');
    
    if (!info.installed) {
        // No mostrar el indicador si Tailscale no está instalado
        indicator.style.display = 'none';
        return;
    }
    
    // Mostrar el indicador
    indicator.style.display = 'block';
    
    // Actualizar color y tooltip según el estado
    badge.classList.remove('bg-secondary', 'bg-warning', 'bg-success', 'bg-danger');
    
    if (!info.active) {
        badge.classList.add('bg-warning');
        badge.setAttribute('data-bs-original-title', 'Tailscale instalado pero inactivo. Ejecuta: tailscale up');
    } else if (info.online) {
        badge.classList.add('bg-success');
        let tooltipText = `Conectado como: ${info.hostname}`;
        if (info.funnel) {
            tooltipText += '\nFunnel activo en puertos: ' + info.funnelPorts.join(', ');
        }
        badge.setAttribute('data-bs-original-title', tooltipText);
        
        // Actualizar el texto del badge con el hostname
        badge.innerHTML = `<i class="bi bi-shield-lock"></i> ${info.hostname}`;
    } else {
        badge.classList.add('bg-danger');
        badge.setAttribute('data-bs-original-title', 'Tailscale activo pero sin conexión');
    }
    
    // Actualizar el tooltip de Bootstrap
    const tooltip = bootstrap.Tooltip.getInstance(badge);
    if (tooltip) {
        tooltip.dispose();
    }
    new bootstrap.Tooltip(badge);
}

// Actualizar URLs de aplicaciones con información de Tailscale
function updateApplicationUrls() {
    // Esta función será llamada después de cargar las aplicaciones
    // para actualizar las URLs con el hostname real de Tailscale
}

// WebSocket listeners
function setupSocketListeners() {
    socket.on('log-data', (data) => {
        const output = document.getElementById('logs-output');
        if (!output) return;
        const shouldScroll = output.scrollTop + output.clientHeight >= output.scrollHeight - 10;
        output.textContent += data.line + '\n';
        if (shouldScroll) {
            output.scrollTop = output.scrollHeight;
        }
    });
    
    socket.on('app-status-change', () => {
        loadApplications();
    });
}

// Event listeners
function setupEventListeners() {
    setInterval(loadServerStatus, 5000);
    setInterval(loadApplications, 10000);
    setInterval(loadTailscaleInfo, 30000); // Actualizar Tailscale cada 30 segundos
    
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            if (e.target.getAttribute('href') === '#logs') {
                changeLogSource();
            }
        });
    });
}

// Notificaciones
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[type] || 'alert-info';
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show notification`;
    notification.setAttribute('role', 'alert');
    notification.textContent = message;
    
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-close';
    closeButton.setAttribute('data-bs-dismiss', 'alert');
    notification.appendChild(closeButton);
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function updateMetricsHistory(data) {
    metricsHistory.cpu.push(data.cpu);
    metricsHistory.memory.push(data.memory.percent);
    metricsHistory.disk.push(data.disk.percent);
    
    Object.keys(metricsHistory).forEach(key => {
        if (metricsHistory[key].length > 20) {
            metricsHistory[key].shift();
        }
    });
}

// Exportar funciones globales para que sean accesibles desde el HTML
window.toggleTheme = toggleTheme;
window.controlApp = controlApp;
window.selectDatabase = selectDatabase;
window.loadTableData = loadTableData;
window.viewLogs = viewLogs;
// ... etc.