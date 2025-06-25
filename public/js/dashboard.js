// Dashboard JavaScript - Mac Mini Server
const socket = io();

// Estado global
let currentTheme = localStorage.getItem('theme') || 'light';
let metricsHistory = { cpu: [], memory: [], disk: [] };
let selectedDb = null;
let selectedTable = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme);
    initializeTime();
    loadInitialData();
    setupSocketListeners();
    setupEventListeners();
});

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
    
    // Emitir evento de cambio de tema
    window.dispatchEvent(new Event('theme-changed'));
    
    // Forzar limpieza de estilos inline después de un momento
    setTimeout(() => {
        document.querySelectorAll('.table td, .table th, .table tr').forEach(el => {
            el.style.removeProperty('background-color');
        });
    }, 100);
}

// Actualizar hora
function initializeTime() {
    const updateTime = () => {
        const now = new Date();
        document.getElementById('time').textContent = now.toLocaleTimeString('es-ES');
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Cargar datos iniciales
async function loadInitialData() {
    await Promise.all([
        loadServerStatus(),
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
        const data = await response.json();
        
        // Actualizar métricas
        updateMetric('cpu', data.cpu, '%');
        updateMetric('memory', data.memory.percent, '%');
        updateMetric('disk', data.disk.percent, '%');
        document.getElementById('uptime').innerHTML = formatUptime(data.uptime);
        
        // Guardar historial para tendencias
        updateMetricsHistory(data);
    } catch (error) {
        console.error('Error loading server status:', error);
        showNotification('Error al cargar estado del servidor', 'error');
    }
}

function updateMetric(id, value, suffix = '') {
    const element = document.getElementById(id);
    const oldValue = parseFloat(element.textContent) || 0;
    element.innerHTML = `${value}${suffix}`;
    
    // Mostrar tendencia
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

// Aplicaciones
async function loadApplications() {
    try {
        const response = await fetch('/api/apps/status');
        const data = await response.json();
        
        const tbody = document.getElementById('apps-table');
        const apps = [...(data.pm2 || []), ...(data.docker || [])];
        
        if (apps.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-secondary">
                        No hay aplicaciones en ejecución
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = apps.map(app => {
            const isPM2 = app.pm2_env !== undefined;
            const status = isPM2 ? app.pm2_env.status : app.State;
            const statusClass = getStatusClass(status);
            // Usar puerto del registro si está disponible
            const port = isPM2 ? (app.port || app.pm2_env.env?.PORT || '--') : (app.Ports || '--');
            const url = app.url;
            
            return `
                <tr class="fade-in">
                    <td><span class="app-status ${statusClass}"></span></td>
                    <td>
                        ${isPM2 ? app.name : app.Names}
                        ${url ? `<a href="${url}" target="_blank" class="ms-2 text-decoration-none" title="Abrir aplicación"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                    </td>
                    <td><span class="badge bg-secondary">${isPM2 ? 'PM2' : 'Docker'}</span></td>
                    <td>${port}</td>
                    <td>${isPM2 ? app.monit.cpu : '--'}%</td>
                    <td>${isPM2 ? formatBytes(app.monit.memory) : '--'}</td>
                    <td>${isPM2 ? formatUptime(Math.floor((Date.now() - app.pm2_env.pm_uptime) / 1000)) : '--'}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-success" onclick="controlApp('${isPM2 ? app.name : app.Names}', 'start', '${isPM2 ? 'pm2' : 'docker'}')">
                                <i class="bi bi-play-fill"></i>
                            </button>
                            <button class="btn btn-warning" onclick="controlApp('${isPM2 ? app.name : app.Names}', 'stop', '${isPM2 ? 'pm2' : 'docker'}')">
                                <i class="bi bi-stop-fill"></i>
                            </button>
                            <button class="btn btn-info" onclick="controlApp('${isPM2 ? app.name : app.Names}', 'restart', '${isPM2 ? 'pm2' : 'docker'}')">
                                <i class="bi bi-arrow-clockwise"></i>
                            </button>
                            <button class="btn btn-secondary" onclick="viewLogs('${isPM2 ? app.name : app.Names}', '${isPM2 ? 'pm2' : 'docker'}')">
                                <i class="bi bi-terminal"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Actualizar opciones de dominio
        updateDomainAppOptions(apps);
    } catch (error) {
        console.error('Error loading applications:', error);
        showNotification('Error al cargar aplicaciones', 'error');
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
            showNotification(`${name}: ${action} ejecutado`, 'success');
            setTimeout(loadApplications, 1000);
        } else {
            throw new Error('Error en la operación');
        }
    } catch (error) {
        showNotification(`Error al ${action} ${name}`, 'error');
    }
}

// Bases de datos
async function loadDatabases() {
    try {
        const response = await fetch('/api/databases/list');
        const data = await response.json();
        
        const dbList = document.getElementById('db-list');
        dbList.innerHTML = `
            ${data.postgresql.map(db => `
                <div class="db-item" onclick="selectDatabase('${db}', 'postgresql')">
                    <i class="bi bi-database text-primary"></i> ${db}
                    <small class="text-secondary d-block">PostgreSQL</small>
                </div>
            `).join('')}
            ${data.sqlite.map(db => `
                <div class="db-item" onclick="selectDatabase('${db}', 'sqlite')">
                    <i class="bi bi-database text-success"></i> ${db.split('/').pop()}
                    <small class="text-secondary d-block">SQLite</small>
                </div>
            `).join('')}
        `;
    } catch (error) {
        console.error('Error loading databases:', error);
        showNotification('Error al cargar bases de datos', 'error');
    }
}

async function selectDatabase(db, type) {
    selectedDb = { name: db, type };
    
    // Actualizar UI
    document.querySelectorAll('.db-item').forEach(item => item.classList.remove('active'));
    event.target.closest('.db-item').classList.add('active');
    
    document.getElementById('db-content-title').textContent = type === 'sqlite' ? db.split('/').pop() : db;
    document.getElementById('db-actions').style.display = 'block';
    
    // Cargar tablas
    try {
        const response = await fetch(`/api/databases/${encodeURIComponent(db)}/tables?type=${type}`);
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
                        <i class="bi bi-table"></i> ${table}
                    </a>
                `).join('')}
            </div>
        `;
    } catch (error) {
        showNotification('Error al cargar tablas', 'error');
    }
}

async function loadTableData(table) {
    selectedTable = table;
    
    try {
        const response = await fetch(`/api/databases/${encodeURIComponent(selectedDb.name)}/table/${encodeURIComponent(table)}?type=${selectedDb.type}`);
        const data = await response.json();
        
        const content = document.getElementById('db-content');
        content.innerHTML = `
            <h6>${table} <small class="text-secondary">(${data.count} registros)</small></h6>
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            ${data.columns.map(col => `<th>${col}</th>`).join('')}
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
            ${data.rows.length < data.count ? `
                <p class="text-center text-secondary mt-3">
                    Mostrando ${data.rows.length} de ${data.count} registros
                </p>
            ` : ''}
        `;
    } catch (error) {
        showNotification('Error al cargar datos de la tabla', 'error');
    }
}

// Dominios
async function loadDomains() {
    try {
        const response = await fetch('/api/domains/list');
        const data = await response.json();
        
        const grid = document.getElementById('domains-grid');
        if (data.domains.length === 0) {
            grid.innerHTML = '<div class="col-12 text-center text-secondary">No hay dominios configurados</div>';
            return;
        }
        
        // Agrupar por dominio principal
        const mainDomains = data.domains.filter(d => d.isMain);
        const subdomains = data.domains.filter(d => !d.isMain);
        
        grid.innerHTML = `
            ${mainDomains.map(domain => `
                <div class="col-12 mb-4">
                    <div class="card">
                        <div class="card-header bg-primary text-white">
                            <h5 class="mb-0">
                                <i class="bi bi-globe"></i> ${domain.name}
                                <span class="badge bg-light text-dark float-end">${domain.plan}</span>
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                ${subdomains.filter(s => s.parentDomain === domain.name).map(subdomain => `
                                    <div class="col-md-6 mb-3">
                                        <div class="border rounded p-3">
                                            <h6 class="mb-2">
                                                <i class="bi bi-diagram-3"></i> ${subdomain.name}
                                                ${subdomain.ssl ? '<i class="bi bi-shield-check text-success" title="SSL activo"></i>' : ''}
                                            </h6>
                                            <small class="text-muted d-block">
                                                <i class="bi bi-app"></i> App: ${subdomain.app}
                                                ${subdomain.port ? `<br><i class="bi bi-ethernet"></i> Puerto: ${subdomain.port}` : ''}
                                                ${subdomain.ip === '85.245.221.221' ? '<br><span class="badge bg-success">Local</span>' : '<br><span class="badge bg-warning">Externo</span>'}
                                            </small>
                                            <div class="mt-2">
                                                <a href="https://${subdomain.name}" target="_blank" class="btn btn-sm btn-outline-primary">
                                                    <i class="bi bi-box-arrow-up-right"></i> Visitar
                                                </a>
                                                ${subdomain.ip === '85.245.221.221' ? `
                                                    <button class="btn btn-sm btn-outline-danger" onclick="removeDomain('${subdomain.name}')">
                                                        <i class="bi bi-trash"></i>
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                                ${subdomains.filter(s => s.parentDomain === domain.name).length === 0 ? `
                                    <div class="col-12">
                                        <p class="text-center text-muted mb-0">No hay subdominios configurados</p>
                                    </div>
                                ` : ''}
                            </div>
                            ${domain.status === 'active' ? `
                                <div class="mt-3">
                                    <h6>Subdominios disponibles:</h6>
                                    <div class="d-flex flex-wrap gap-2">
                                        ${data.availableDomains.find(d => d.name === domain.name)?.available_subdomains.map(sub => `
                                            <span class="badge bg-secondary">${sub}</span>
                                        `).join('') || ''}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
            
            ${data.availableDomains.filter(d => d.status === 'pending').map(domain => `
                <div class="col-12 mb-3">
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle"></i> <strong>${domain.name}</strong> está pendiente de activación.
                        Actualiza los nameservers en tu registrador a:
                        <code>braden.ns.cloudflare.com</code> y <code>mary.ns.cloudflare.com</code>
                    </div>
                </div>
            `).join('')}
        `;
        
        // Actualizar el formulario de agregar dominio con los dominios disponibles
        updateAvailableDomains(data.availableDomains);
    } catch (error) {
        console.error('Error loading domains:', error);
        showNotification('Error al cargar dominios', 'error');
    }
}

function updateAvailableDomains(domains) {
    const domainSelect = document.getElementById('domainSelect');
    if (domainSelect) {
        domainSelect.innerHTML = '<option value="">Seleccionar dominio...</option>' +
            domains.filter(d => d.status === 'active').map(domain => 
                `<option value="${domain.zone_id}" data-domain="${domain.name}">${domain.name}</option>`
            ).join('');
    }
}

function updateDomainSuffix() {
    const domainSelect = document.getElementById('domainSelect');
    const domainSuffix = document.getElementById('domainSuffix');
    if (domainSelect && domainSuffix) {
        const selectedOption = domainSelect.options[domainSelect.selectedIndex];
        const domainName = selectedOption.getAttribute('data-domain');
        domainSuffix.textContent = domainName ? `.${domainName}` : '.lisbontiles.com';
    }
}

// Logs
function changeLogSource() {
    const source = document.getElementById('log-source').value;
    socket.emit('subscribe-logs', { source });
}

function viewLogs(app, type) {
    document.querySelector('[data-bs-target="#logs"]').click();
    document.getElementById('log-source').value = type;
    socket.emit('subscribe-logs', { source: type, app });
}

// Backups
async function loadBackupInfo() {
    try {
        const response = await fetch('/api/backups/info');
        const data = await response.json();
        
        document.getElementById('last-backup').textContent = data.lastBackup 
            ? new Date(data.lastBackup).toLocaleString('es-ES') 
            : 'Nunca';
        document.getElementById('backup-size').textContent = formatBytes(data.totalSize);
        document.getElementById('next-backup').textContent = data.nextBackup 
            ? new Date(data.nextBackup).toLocaleString('es-ES') 
            : 'No programado';
        
        // Historial
        const history = document.getElementById('backup-history');
        if (data.history.length === 0) {
            history.innerHTML = '<tr><td colspan="5" class="text-center">No hay backups</td></tr>';
            return;
        }
        
        history.innerHTML = data.history.map(backup => `
            <tr>
                <td>${new Date(backup.date).toLocaleString('es-ES')}</td>
                <td><span class="badge bg-secondary">${backup.type}</span></td>
                <td>${formatBytes(backup.size)}</td>
                <td><span class="badge bg-${backup.status === 'success' ? 'success' : 'danger'}">${backup.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="restoreBackup('${backup.id}')">
                        <i class="bi bi-arrow-counterclockwise"></i> Restaurar
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading backup info:', error);
    }
}

async function createBackup() {
    if (!confirm('¿Crear backup manual de todo el sistema?')) return;
    
    showNotification('Iniciando backup...', 'info');
    
    try {
        const response = await fetch('/api/backups/create', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showNotification('Backup creado exitosamente', 'success');
            loadBackupInfo();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showNotification('Error al crear backup', 'error');
    }
}

// Deploy desde GitHub
function showDeployModal() {
    const modal = new bootstrap.Modal(document.getElementById('deployModal'));
    modal.show();
}

async function deployApp() {
    const form = document.getElementById('deployForm');
    const data = {
        repoUrl: form.repoUrl.value,
        appName: form.appName.value,
        appPort: form.appPort.value,
        subdomain: form.subdomain.value,
        appType: form.appType.value
    };
    
    showNotification('Iniciando deploy...', 'info');
    bootstrap.Modal.getInstance(document.getElementById('deployModal')).hide();
    
    try {
        const response = await fetch('/api/apps/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification(`Deploy de ${data.appName} completado`, 'success');
            setTimeout(loadApplications, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`Error en deploy: ${error.message}`, 'error');
    }
}

// Dominios
function showAddDomainModal() {
    const modal = new bootstrap.Modal(document.getElementById('domainModal'));
    modal.show();
}

async function addDomain() {
    const form = document.getElementById('domainForm');
    const domainSelect = document.getElementById('domainSelect');
    const selectedOption = domainSelect.options[domainSelect.selectedIndex];
    
    const data = {
        subdomain: form.subdomainName.value,
        app: form.domainApp.value,
        port: form.domainPort.value,
        zoneId: domainSelect.value,
        domainName: selectedOption.getAttribute('data-domain')
    };
    
    if (!data.zoneId) {
        showNotification('Por favor selecciona un dominio principal', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/domains/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification(`Subdominio ${data.subdomain}.${data.domainName} agregado`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('domainModal')).hide();
            form.reset();
            loadDomains();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification(`Error al agregar dominio: ${error.message}`, 'error');
    }
}

function updateDomainAppOptions(apps) {
    const select = document.getElementById('domainApp');
    select.innerHTML = '<option value="">Seleccionar aplicación...</option>' +
        apps.map(app => {
            const name = app.name || app.Names;
            return `<option value="${name}">${name}</option>`;
        }).join('');
}

// WebSocket listeners
function setupSocketListeners() {
    socket.on('server-metrics', (data) => {
        updateMetric('cpu', data.cpu, '%');
        updateMetric('memory', data.memory, '%');
        updateMetric('disk', data.disk, '%');
    });
    
    socket.on('log-data', (data) => {
        const output = document.getElementById('logs-output');
        const shouldScroll = output.scrollTop + output.clientHeight >= output.scrollHeight - 10;
        
        output.innerHTML += data.line + '\n';
        
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
    // Actualización periódica
    setInterval(loadServerStatus, 5000);
    setInterval(loadApplications, 10000);
    
    // Pestañas
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            const target = e.target.getAttribute('href');
            if (target === '#logs') {
                changeLogSource();
            }
        });
    });
}

// Notificaciones
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    const id = Date.now();
    
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[type] || 'alert-info';
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show notification`;
    notification.setAttribute('role', 'alert');
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Exportar funciones globales
window.toggleTheme = toggleTheme;
window.controlApp = controlApp;
window.selectDatabase = selectDatabase;
window.loadTableData = loadTableData;
window.viewLogs = viewLogs;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.showDeployModal = showDeployModal;
window.deployApp = deployApp;
window.showAddDomainModal = showAddDomainModal;
window.addDomain = addDomain;
window.removeDomain = removeDomain;
window.changeLogSource = changeLogSource;
window.exportTable = exportTable;
window.backupDatabase = backupDatabase;
window.updateDomainSuffix = updateDomainSuffix;

// Funciones adicionales
async function exportTable() {
    if (!selectedTable) return;
    
    try {
        const response = await fetch(`/api/databases/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                database: selectedDb.name,
                table: selectedTable,
                type: selectedDb.type
            })
        });
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedTable}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        showNotification('Tabla exportada exitosamente', 'success');
    } catch (error) {
        showNotification('Error al exportar tabla', 'error');
    }
}

async function backupDatabase() {
    if (!selectedDb) return;
    
    if (!confirm(`¿Hacer backup de ${selectedDb.name}?`)) return;
    
    try {
        const response = await fetch(`/api/databases/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                database: selectedDb.name,
                type: selectedDb.type
            })
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification(`Backup de ${selectedDb.name} creado`, 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification('Error al crear backup', 'error');
    }
}

async function removeDomain(domain) {
    if (!confirm(`¿Eliminar ${domain}?`)) return;
    
    try {
        const response = await fetch(`/api/domains/${encodeURIComponent(domain)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification(`Dominio ${domain} eliminado`, 'success');
            loadDomains();
        } else {
            throw new Error('Error al eliminar dominio');
        }
    } catch (error) {
        showNotification('Error al eliminar dominio', 'error');
    }
}

async function restoreBackup(backupId) {
    if (!confirm('¿Restaurar este backup? Esto sobrescribirá los datos actuales.')) return;
    
    try {
        const response = await fetch(`/api/backups/restore/${backupId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification('Backup restaurado exitosamente', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        showNotification('Error al restaurar backup', 'error');
    }
}

function updateMetricsHistory(data) {
    metricsHistory.cpu.push(data.cpu);
    metricsHistory.memory.push(data.memory.percent);
    metricsHistory.disk.push(data.disk.percent);
    
    // Mantener solo los últimos 20 valores
    Object.keys(metricsHistory).forEach(key => {
        if (metricsHistory[key].length > 20) {
            metricsHistory[key].shift();
        }
    });
}