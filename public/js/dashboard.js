const socket = io();

// Estado global
let currentTheme = localStorage.getItem('theme') || 'light';
let metricsHistory = { cpu: [], memory: [], disk: [] };
let selectedDb = null;
let selectedTable = null;

// Inicialización del dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
});

// --- Dashboard Initialization ---
function initializeDashboard() {
    applyTheme(currentTheme);
    initializeTime();
    loadInitialData();
    setupSocketListeners();
    setupEventListeners();
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
        showNotification('Error al cargar estado del servidor', 'error');
    }
}

function updateMetric(id, value, suffix = '') {
    const element = document.getElementById(id);
    if (!element) return;
    const oldValue = parseFloat(element.textContent) || 0;
    element.textContent = `${value}${suffix}`;
    
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
        if (!response.ok) throw new Error('Failed to fetch apps');
        const data = await response.json();
        
        const tbody = document.getElementById('apps-table');
        const apps = [...(data.pm2 || []), ...(data.docker || [])];
        
        if (apps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-secondary">No hay aplicaciones en ejecución</td></tr>`;
            return;
        }
        
        tbody.innerHTML = apps.map(app => {
            const isPM2 = app.pm2_env !== undefined;
            const status = isPM2 ? app.pm2_env.status : app.State;
            const statusClass = getStatusClass(status);
            const port = isPM2 ? (app.port || app.pm2_env.env?.PORT || '--') : (app.Ports || '--');
            const url = app.url;
            const name = isPM2 ? app.name : app.Names;
            
            return `
                <tr class="fade-in">
                    <td><span class="app-status ${statusClass}"></span></td>
                    <td>
                        ${name}
                        ${url ? `<a href="${url}" target="_blank" class="ms-2 text-decoration-none" title="Abrir aplicación"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}
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
        if (!response.ok) throw new Error('Failed to fetch databases');
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
        if (!response.ok) throw new Error('Failed to fetch table data');
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
            ${data.rows.length < data.count ? `<p class="text-center text-secondary mt-3">Mostrando ${data.rows.length} de ${data.count} registros</p>` : ''}
        `;
    } catch (error) {
        showNotification('Error al cargar datos de la tabla', 'error');
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