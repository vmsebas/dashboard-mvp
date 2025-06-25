// history.js - Gestión de historial de operaciones

let historyData = {
    all: [],
    stats: {}
};

// Cargar historial al inicializar
document.addEventListener('DOMContentLoaded', function() {
    // Cargar historial cuando se active la pestaña
    const historyTab = document.querySelector('a[href="#history"]');
    if (historyTab) {
        historyTab.addEventListener('shown.bs.tab', function() {
            loadHistory();
            loadStats();
        });
    }
    
    // Event listeners para filtros
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', function() {
            // Actualizar botones activos
            document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Filtrar actividad
            const filter = this.getAttribute('data-filter');
            filterActivity(filter);
        });
    });
});

async function loadHistory() {
    try {
        const response = await fetch('/api/projects/history');
        const data = await response.json();
        
        if (data.success) {
            historyData = data.data;
            renderHistoryTable(historyData.all);
            renderRecentActivity(historyData.all.slice(0, 10));
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
        document.getElementById('history-table').innerHTML = `
            <tr><td colspan="4" class="text-center text-danger">Error cargando historial: ${error.message}</td></tr>
        `;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/projects/stats');
        const data = await response.json();
        
        if (data.success) {
            renderStats(data.stats);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        document.getElementById('history-stats').innerHTML = `
            <div class="text-center text-danger">Error cargando estadísticas</div>
        `;
    }
}

function renderStats(stats) {
    const statsContainer = document.getElementById('history-stats');
    
    statsContainer.innerHTML = `
        <div class="row text-center">
            <div class="col-12 mb-3">
                <h4 class="text-primary">${stats.totalOperations}</h4>
                <small class="text-muted">Operaciones Totales</small>
            </div>
        </div>
        
        <div class="row text-center mb-3">
            <div class="col-4">
                <div class="text-success h5">${stats.operationsByType.start}</div>
                <small class="text-muted">Inicios</small>
            </div>
            <div class="col-4">
                <div class="text-info h5">${stats.operationsByType.deploy}</div>
                <small class="text-muted">Deploys</small>
            </div>
            <div class="col-4">
                <div class="text-warning h5">${stats.operationsByType.close}</div>
                <small class="text-muted">Cierres</small>
            </div>
        </div>
        
        <hr>
        
        <div class="mb-2">
            <small class="text-muted">Proyectos Activos:</small>
            <div class="fw-bold">${stats.totalProjects}</div>
        </div>
        
        <div class="mb-2">
            <small class="text-muted">Última Semana:</small>
            <div class="small">
                <span class="badge bg-success">${stats.lastWeek.start} inicios</span>
                <span class="badge bg-info">${stats.lastWeek.deploy} deploys</span>
                <span class="badge bg-warning">${stats.lastWeek.close} cierres</span>
            </div>
        </div>
        
        ${Object.keys(stats.projectActivity).length > 0 ? `
            <hr>
            <div>
                <small class="text-muted">Proyecto Más Activo:</small>
                <div class="fw-bold small">${getMostActiveProject(stats.projectActivity)}</div>
            </div>
        ` : ''}
    `;
}

function getMostActiveProject(projectActivity) {
    let mostActive = '';
    let maxActivity = 0;
    
    for (const [project, activity] of Object.entries(projectActivity)) {
        if (activity.total > maxActivity) {
            maxActivity = activity.total;
            mostActive = project;
        }
    }
    
    return mostActive ? `${mostActive} (${maxActivity} ops)` : 'N/A';
}

function renderHistoryTable(entries) {
    const tableBody = document.getElementById('history-table');
    
    if (entries.length === 0) {
        tableBody.innerHTML = `
            <tr><td colspan="4" class="text-center text-muted">No hay entradas en el historial</td></tr>
        `;
        return;
    }
    
    tableBody.innerHTML = entries.map(entry => `
        <tr>
            <td>
                <small>${formatDate(entry.date)}</small>
            </td>
            <td>
                <span class="fw-bold">${entry.project}</span>
            </td>
            <td>
                <span class="badge ${getOperationBadge(entry.type)}">${getOperationText(entry.type)}</span>
            </td>
            <td>
                <small class="text-muted">${entry.details}</small>
            </td>
        </tr>
    `).join('');
}

function renderRecentActivity(entries) {
    const activityContainer = document.getElementById('recent-activity');
    
    if (entries.length === 0) {
        activityContainer.innerHTML = `
            <div class="text-center text-muted">No hay actividad reciente</div>
        `;
        return;
    }
    
    activityContainer.innerHTML = entries.map(entry => `
        <div class="d-flex align-items-center mb-2 p-2 bg-light rounded">
            <div class="me-3">
                <i class="bi ${getOperationIcon(entry.type)} text-${getOperationColor(entry.type)}"></i>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold small">${entry.project}</div>
                <div class="text-muted small">${entry.details}</div>
            </div>
            <div class="text-end">
                <small class="text-muted">${formatRelativeTime(entry.date)}</small>
            </div>
        </div>
    `).join('');
}

function filterActivity(filter) {
    const filteredEntries = filter === 'all' ? 
        historyData.all.slice(0, 20) : 
        historyData[filter]?.slice(0, 20) || [];
    
    renderRecentActivity(filteredEntries);
}

function getOperationBadge(type) {
    switch(type) {
        case 'start': return 'bg-success';
        case 'deploy': return 'bg-info';
        case 'close': return 'bg-warning';
        default: return 'bg-secondary';
    }
}

function getOperationText(type) {
    switch(type) {
        case 'start': return 'Inicio';
        case 'deploy': return 'Deploy';
        case 'close': return 'Cierre';
        default: return type;
    }
}

function getOperationIcon(type) {
    switch(type) {
        case 'start': return 'bi-play-circle';
        case 'deploy': return 'bi-rocket';
        case 'close': return 'bi-check-circle';
        default: return 'bi-circle';
    }
}

function getOperationColor(type) {
    switch(type) {
        case 'start': return 'success';
        case 'deploy': return 'info';
        case 'close': return 'warning';
        default: return 'secondary';
    }
}

function formatDate(date) {
    return new Date(date).toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return formatDate(date).split(' ')[0];
}

function refreshHistory() {
    const refreshBtn = document.querySelector('button[onclick="refreshHistory()"]');
    const originalText = refreshBtn.innerHTML;
    
    refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Actualizando...';
    refreshBtn.disabled = true;
    
    Promise.all([loadHistory(), loadStats()]).finally(() => {
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
    });
}

// CSS para animación de carga
(function() {
    const style = document.createElement('style');
style.textContent = `
    .spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
})();